# Databricks notebook source
# MAGIC %md
# MAGIC # Revenue Operations Data Generator - Avianca
# MAGIC
# MAGIC Genera el catalogo `avianca_revenue_operations` que alimenta la app de Revenue
# MAGIC Management. Modelo medallion en tres capas:
# MAGIC
# MAGIC - **`bronze`** - copias crudas con defectos plantados (fuente de la pipeline de refresco).
# MAGIC - **`silver`** - se materializa en la pipeline / job de orquestacion (bronze limpio y tipado).
# MAGIC - **`gold`** - las 5 tablas analiticas que la app consulta via SQL Warehouse.
# MAGIC
# MAGIC **Tablas gold (las que lee la app):**
# MAGIC - `flights` - una fila por salida: ocupacion, curva de reserva por dias a la salida, revenue.
# MAGIC - `route_demand` - demanda diaria por ruta: indice, busquedas, reservas, pace vs ano anterior.
# MAGIC - `current_fares` - tarifas propias por ruta, cabina y clase (actual, base, min, max).
# MAGIC - `competitor_fares` - tarifas sinteticas de competidores por ruta (ultimos 30 dias).
# MAGIC - `ancillaries` - venta de ancillary por ruta y tipo (attach rate, revenue por pax).
# MAGIC
# MAGIC **Tablas transaccionales que NO viven aqui:** `pricing_actions`, `alerts` y
# MAGIC `audit_events` las crea y siembra la app en Lakebase Postgres (el Service Principal
# MAGIC no puede tocar schemas que no creo), no este generador.
# MAGIC
# MAGIC **Escenarios sembrados (semilla fija, reproducibles):** rutas casi llenas con precio
# MAGIC por debajo del mercado (subir), rutas flojas con precio por encima (bajar), brechas
# MAGIC contra competidores, curva de demanda por dias a la salida e historia temporal
# MAGIC suficiente para series de tiempo.
# MAGIC
# MAGIC **Idempotente** (usa `mode("overwrite")`). Compatible con Databricks Free Edition
# MAGIC (serverless).

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

from datetime import date, timedelta

CATALOG = "avianca_revenue_operations"
GOLD = "gold"
BRONZE = "bronze"
SILVER = "silver"

# Fecha de referencia del tablero. Los vuelos con dias_a_salida < 0 ya volaron;
# >= 0 estan abiertos a la venta (la palanca de pricing vive ahi).
ASOF = date(2026, 8, 19)

HIST_DAYS = 180   # historia hacia atras para series de tiempo
FUT_DAYS = 90     # ventana futura a la venta
DEMAND_FUT = 30   # la demanda diaria se proyecta 30 dias hacia adelante
COMP_DAYS = 30    # snapshot de competidores: ultimos 30 dias
ANC_MONTHS = 12   # ancillary: ultimos 12 meses

# --- Red de rutas con escenarios explicitos ---
# Cada tupla: (ruta, origen, destino, region, dist_km, dep_por_dia, lf, tarifa_econ_usd,
#              comp_ratio, indice_demanda, escenario)
# comp_ratio = mediana_competidor / tarifa_propia. > 1 => estamos baratos (subir);
#              < 1 => estamos caros (bajar). El motor de reglas de la app usa esta brecha.
ROUTES_RAW = [
    ("BOG-MIA", "BOG", "MIA", "Norteamerica",      2470, 3, 0.93, 340, 1.15, 1.35, "infravalorada_llena"),
    ("BOG-MDE", "BOG", "MDE", "Domestico Colombia",  240, 4, 0.91,  95, 1.12, 1.28, "infravalorada_llena"),
    ("BOG-CTG", "BOG", "CTG", "Domestico Colombia",  660, 3, 0.88, 120, 1.09, 1.18, "infravalorada_llena"),
    ("BOG-LIM", "BOG", "LIM", "Sudamerica",         1890, 2, 0.84, 250, 1.11, 1.15, "brecha_bajo_mercado"),
    ("MDE-MIA", "MDE", "MIA", "Norteamerica",       2320, 2, 0.87, 350, 1.08, 1.15, "brecha_bajo_mercado"),
    ("BOG-JFK", "BOG", "JFK", "Norteamerica",       3990, 2, 0.86, 430, 1.06, 1.12, "brecha_bajo_mercado"),
    ("BOG-SCL", "BOG", "SCL", "Sudamerica",         4270, 1, 0.54, 520, 0.84, 0.68, "sobrevalorada_floja"),
    ("BOG-GRU", "BOG", "GRU", "Sudamerica",         4320, 1, 0.57, 540, 0.86, 0.71, "sobrevalorada_floja"),
    ("BOG-EZE", "BOG", "EZE", "Sudamerica",         4670, 1, 0.60, 560, 0.90, 0.74, "sobrevalorada_floja"),
    ("BOG-CUN", "BOG", "CUN", "Centroamerica y Caribe", 2010, 2, 0.72, 300, 0.83, 0.90, "brecha_sobre_mercado"),
    ("BOG-CLO", "BOG", "CLO", "Domestico Colombia",  300, 4, 0.70, 105, 0.82, 0.85, "brecha_sobre_mercado"),
    ("BOG-MAD", "BOG", "MAD", "Europa",             8030, 1, 0.82, 720, 1.02, 1.05, "equilibrada"),
    ("BOG-LAX", "BOG", "LAX", "Norteamerica",       5620, 1, 0.78, 470, 0.98, 0.95, "equilibrada"),
    ("BOG-MEX", "BOG", "MEX", "Norteamerica",       3160, 2, 0.80, 330, 1.00, 1.00, "equilibrada"),
    ("BOG-PTY", "BOG", "PTY", "Centroamerica y Caribe",  760, 3, 0.83, 190, 1.03, 1.02, "equilibrada"),
    ("BOG-SJO", "BOG", "SJO", "Centroamerica y Caribe", 1160, 2, 0.79, 210, 0.99, 0.98, "equilibrada"),
]

CITY = {
    "BOG": "Bogota", "MDE": "Medellin", "CLO": "Cali", "CTG": "Cartagena",
    "MIA": "Miami", "JFK": "Nueva York", "LAX": "Los Angeles", "MEX": "Ciudad de Mexico",
    "CUN": "Cancun", "LIM": "Lima", "SCL": "Santiago", "GRU": "Sao Paulo",
    "EZE": "Buenos Aires", "MAD": "Madrid", "PTY": "Ciudad de Panama", "SJO": "San Jose",
}

# Competidores sinteticos por region (marca visible, precios inventados).
COMPETITORS = {
    "Domestico Colombia":       ["LATAM", "Wingo", "Clic"],
    "Centroamerica y Caribe":   ["Copa", "Wingo", "Arajet"],
    "Sudamerica":               ["LATAM", "JetSMART", "Gol"],
    "Norteamerica":             ["LATAM", "American", "Copa"],
    "Europa":                   ["Iberia", "Air Europa", "LATAM"],
}

ANCILLARY_SPEC = {
    "Equipaje adicional":   {"attach": 0.35, "rpp": 35.0},
    "Seleccion de asiento": {"attach": 0.28, "rpp": 14.0},
    "Prioridad":            {"attach": 0.12, "rpp": 22.0},
    "Compras a bordo":      {"attach": 0.40, "rpp": 9.0},
}

# Estacionalidad (indice por mes 1..12) y dia de semana (lun..dom).
MONTH_FACTOR = [1.06, 0.90, 0.96, 0.98, 0.97, 1.02, 1.10, 1.05, 0.92, 0.98, 1.00, 1.12]
DOW_FACTOR = [0.98, 0.95, 0.96, 1.00, 1.08, 1.02, 1.06]

SEED = 2026

print(f"Target: {CATALOG} (gold={GOLD}, bronze={BRONZE}, silver={SILVER})")
print(f"ASOF: {ASOF} | ventana vuelos: {ASOF - timedelta(days=HIST_DAYS)} -> {ASOF + timedelta(days=FUT_DAYS)}")
print(f"Rutas: {len(ROUTES_RAW)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Catalog & Schemas

# COMMAND ----------

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
for sch in (BRONZE, SILVER, GOLD):
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{sch}")
print(f"OK schemas {BRONZE}, {SILVER}, {GOLD} ready in {CATALOG}")
print(f"   silver queda vacio a proposito: lo materializa la pipeline de orquestacion (bronze -> silver -> gold).")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Helpers

# COMMAND ----------

import numpy as np
import pandas as pd

rng = np.random.default_rng(SEED)


def aircraft_for(dist_km):
    """Tipo y capacidad por distancia (config unica de cabina)."""
    if dist_km < 1000:
        return "A320", 150
    if dist_km < 2600:
        return "A320neo", 162
    if dist_km < 4200:
        return "A321", 194
    return "B787-8", 250


def month_factor(dts):
    return np.array([MONTH_FACTOR[d.month - 1] for d in dts])


def dow_factor(dts):
    return np.array([DOW_FACTOR[d.weekday()] for d in dts])


def write_gold(df, name):
    spark.createDataFrame(df).write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{CATALOG}.{GOLD}.{name}")
    print(f"OK {CATALOG}.{GOLD}.{name}: {len(df):,} rows")


def write_bronze(df, name, dirty_col=None):
    """Copia cruda con defectos ligeros: duplica ~1% de filas, mete algunos nulos y
    agrega ingest_ts como string. Es la fuente que la pipeline limpia hacia silver."""
    raw = df.copy()
    n = len(raw)
    if n > 20:
        dup = raw.sample(max(3, n // 100), random_state=SEED)
        raw = pd.concat([raw, dup], ignore_index=True)
    if dirty_col and dirty_col in raw.columns:
        k = max(2, len(raw) // 80)
        idx = rng.choice(len(raw), k, replace=False)
        raw.loc[idx, dirty_col] = None
    raw["ingest_ts"] = ASOF.isoformat() + "T00:00:00Z"
    raw["source_file"] = f"{name}.csv"
    spark.createDataFrame(raw).write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{CATALOG}.{BRONZE}.{name}_raw")
    print(f"OK {CATALOG}.{BRONZE}.{name}_raw: {len(raw):,} rows (crudo)")


# Arrays base por ruta
R_ID = [r[0] for r in ROUTES_RAW]
R_ORI = {r[0]: r[1] for r in ROUTES_RAW}
R_DES = {r[0]: r[2] for r in ROUTES_RAW}
R_REG = {r[0]: r[3] for r in ROUTES_RAW}
R_DIST = {r[0]: r[4] for r in ROUTES_RAW}
R_DEP = {r[0]: r[5] for r in ROUTES_RAW}
R_LF = {r[0]: r[6] for r in ROUTES_RAW}
R_FARE = {r[0]: float(r[7]) for r in ROUTES_RAW}
R_COMP = {r[0]: r[8] for r in ROUTES_RAW}
R_DEM = {r[0]: r[9] for r in ROUTES_RAW}
R_SCEN = {r[0]: r[10] for r in ROUTES_RAW}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 1: gold.flights
# MAGIC
# MAGIC Una fila por salida. Los vuelos pasados llevan su load factor final; los futuros
# MAGIC muestran cuanto llevan vendido segun los dias a la salida (curva de reserva
# MAGIC `f(dias) = exp(-dias/45)`). Agregando los futuros por `dias_a_salida` sale la curva.

# COMMAND ----------

flight_rows = []
fseq = 0
for rid in R_ID:
    ac, cap = aircraft_for(R_DIST[rid])
    dep = R_DEP[rid]
    lf0 = R_LF[rid]
    fare0 = R_FARE[rid]
    dates = [ASOF - timedelta(days=HIST_DAYS) + timedelta(days=i) for i in range(HIST_DAYS + FUT_DAYS + 1)]
    dts = np.array(dates, dtype=object)
    mf = month_factor(dts)
    dw = dow_factor(dts)
    ndays = len(dts)
    for _ in range(dep):
        noise = rng.normal(1.0, 0.06, ndays)
        final_lf = np.clip(lf0 * mf * dw * noise, 0.30, 0.99)
        dias = np.array([(d - ASOF).days for d in dts])
        # Curva de reserva: futuros llenan al acercarse la salida.
        frac = np.clip(np.exp(-np.maximum(dias, 0) / 45.0), 0.06, 0.99)
        current_lf = np.where(dias < 0, final_lf, final_lf * frac)
        vendidos = np.round(cap * current_lf).astype(int)
        fare_season = 1.0 + (mf - 1.0) * 0.6
        tarifa = np.round(fare0 * fare_season * rng.normal(1.0, 0.08, ndays), 2)
        tarifa = np.clip(tarifa, 20.0, None)
        rev_pasaje = np.round(vendidos * tarifa, 2)
        anc_pp = rng.uniform(14.0, 40.0, ndays)
        rev_anc = np.round(vendidos * anc_pp, 2)
        for i in range(ndays):
            fseq += 1
            flight_rows.append({
                "flight_id": f"FL-{fseq:07d}",
                "ruta_id": rid,
                "origen": R_ORI[rid],
                "destino": R_DES[rid],
                "region": R_REG[rid],
                "distancia_km": int(R_DIST[rid]),
                "fecha_salida": dates[i],
                "dias_a_salida": int(dias[i]),
                "aeronave_tipo": ac,
                "capacidad": int(cap),
                "asientos_vendidos": int(vendidos[i]),
                "load_factor": round(float(current_lf[i]), 4),
                "tarifa_promedio_usd": float(tarifa[i]),
                "revenue_pasaje_usd": float(rev_pasaje[i]),
                "revenue_ancillary_usd": float(rev_anc[i]),
                "revenue_total_usd": round(float(rev_pasaje[i] + rev_anc[i]), 2),
                "estado": "Volado" if dias[i] < 0 else "Programado",
                "moneda": "USD",
            })

df_flights = pd.DataFrame(flight_rows)
write_gold(df_flights, "flights")
write_bronze(df_flights, "flights", dirty_col="load_factor")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 2: gold.route_demand
# MAGIC
# MAGIC Demanda diaria por ruta: indice contra la linea base, busquedas, reservas y pace vs
# MAGIC ano anterior. Las rutas fuertes tienen indice > 1 y pace positivo; las flojas < 1.

# COMMAND ----------

demand_rows = []
dseq = 0
for rid in R_ID:
    dem0 = R_DEM[rid]
    cap = aircraft_for(R_DIST[rid])[1]
    dep = R_DEP[rid]
    base_search = cap * dep * 18  # escala de busquedas diarias
    dates = [ASOF - timedelta(days=HIST_DAYS) + timedelta(days=i) for i in range(HIST_DAYS + DEMAND_FUT + 1)]
    for d in dates:
        mf = MONTH_FACTOR[d.month - 1]
        idx = float(np.clip(dem0 * mf * rng.normal(1.0, 0.08), 0.2, 2.2))
        busq = int(base_search * idx * rng.uniform(0.9, 1.1))
        conv = rng.uniform(0.03, 0.08)
        res = int(busq * conv)
        pace = round(float((dem0 - 1.0) * 100 + rng.normal(0, 4)), 1)
        fcast = round(float(np.clip(R_LF[rid] * (1 + (idx - 1) * 0.30), 0.35, 0.99)), 4)
        dseq += 1
        demand_rows.append({
            "ruta_id": rid,
            "region": R_REG[rid],
            "fecha": d,
            "busquedas": busq,
            "reservas": res,
            "indice_demanda": round(idx, 4),
            "pace_vs_ano_anterior_pct": pace,
            "forecast_ocupacion": fcast,
        })

df_demand = pd.DataFrame(demand_rows)
write_gold(df_demand, "route_demand")
write_bronze(df_demand, "route_demand", dirty_col="indice_demanda")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 3: gold.current_fares
# MAGIC
# MAGIC Tarifa propia por ruta, cabina y clase. La Economy Standard es la que el motor de
# MAGIC reglas compara contra la mediana de competidores.

# COMMAND ----------

CLASES = {
    "Economy": [("Promo", 0.80), ("Standard", 1.00), ("Flex", 1.35)],
    "Business": [("Standard", 2.80), ("Flex", 3.40)],
}

fare_rows = []
for rid in R_ID:
    base = R_FARE[rid]
    for cabina, clases in CLASES.items():
        for clase, mult in clases:
            actual = round(base * mult, 2)
            fare_rows.append({
                "ruta_id": rid,
                "cabina": cabina,
                "clase_tarifa": clase,
                "tarifa_actual_usd": actual,
                "tarifa_base_usd": round(base * mult, 2),
                "tarifa_min_usd": round(actual * 0.60, 2),
                "tarifa_max_usd": round(actual * 1.80, 2),
                "fecha_vigencia": ASOF,
                "moneda": "USD",
            })

df_fares = pd.DataFrame(fare_rows)
write_gold(df_fares, "current_fares")
# Sin dirty_col a proposito. current_fares es una lista de precios de 80 filas, no una
# tabla de hechos: si el refresco medallion descarta una fila con nulo, la ruta pierde su
# tarifa de referencia Economy Standard y desaparece del explorador y del motor de reglas.
# Los defectos de calidad se demuestran en las tablas de hechos, donde perder 1% no borra
# una entidad del negocio.
write_bronze(df_fares, "current_fares")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 4: gold.competitor_fares
# MAGIC
# MAGIC Tarifas sinteticas de competidores (Economy) por ruta en los ultimos 30 dias. La
# MAGIC mediana por ruta queda en `tarifa_propia * comp_ratio`, que produce las brechas.

# COMMAND ----------

comp_rows = []
for rid in R_ID:
    base = R_FARE[rid]
    target = base * R_COMP[rid]
    comps = COMPETITORS[R_REG[rid]]
    comp_jit = {c: rng.uniform(0.94, 1.07) for c in comps}
    for k in range(COMP_DAYS):
        fobs = ASOF - timedelta(days=COMP_DAYS - 1 - k)
        for c in comps:
            fare = round(float(target * comp_jit[c] * rng.normal(1.0, 0.02)), 2)
            comp_rows.append({
                "ruta_id": rid,
                "competidor": c,
                "cabina": "Economy",
                "fecha_observacion": fobs,
                "tarifa_competidor_usd": max(15.0, fare),
                "moneda": "USD",
                "fuente": "Sintetico",
            })

df_comp = pd.DataFrame(comp_rows)
write_gold(df_comp, "competitor_fares")
write_bronze(df_comp, "competitor_fares", dirty_col="tarifa_competidor_usd")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 5: gold.ancillaries
# MAGIC
# MAGIC Venta de ancillary por ruta y tipo, mensual, ultimos 12 meses: unidades, revenue,
# MAGIC attach rate y revenue por pasajero.

# COMMAND ----------

def month_starts(asof, n):
    y, m = asof.year, asof.month
    out = []
    for _ in range(n):
        out.append(date(y, m, 1))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(out))


anc_rows = []
months = month_starts(ASOF, ANC_MONTHS)
for rid in R_ID:
    cap = aircraft_for(R_DIST[rid])[1]
    dep = R_DEP[rid]
    lf = R_LF[rid]
    for mstart in months:
        mf = MONTH_FACTOR[mstart.month - 1]
        pax_mes = int(cap * dep * 30 * lf * mf)
        for tipo, spec in ANCILLARY_SPEC.items():
            attach = float(np.clip(spec["attach"] * rng.normal(1.0, 0.10), 0.02, 0.95))
            unidades = int(pax_mes * attach)
            rpp = round(float(spec["rpp"] * rng.normal(1.0, 0.06)), 2)
            anc_rows.append({
                "ruta_id": rid,
                "tipo_ancillary": tipo,
                "mes": mstart,
                "unidades_vendidas": unidades,
                "revenue_usd": round(unidades * rpp, 2),
                "attach_rate": round(attach, 4),
                "revenue_por_pax_usd": rpp,
                "moneda": "USD",
            })

df_anc = pd.DataFrame(anc_rows)
write_gold(df_anc, "ancillaries")
write_bronze(df_anc, "ancillaries", dirty_col="attach_rate")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validation Summary + prueba del motor de reglas
# MAGIC
# MAGIC Reproduce la logica del motor de reglas de la app para confirmar que la semilla
# MAGIC produce las recomendaciones esperadas (subir / bajar / mantener) por ruta.

# COMMAND ----------

print("=" * 78)
print("AVIANCA - REVENUE OPERATIONS - DATA GENERATION SUMMARY")
print("=" * 78)

for name in ("flights", "route_demand", "current_fares", "competitor_fares", "ancillaries"):
    cnt = spark.sql(f"SELECT COUNT(*) c FROM {CATALOG}.{GOLD}.{name}").collect()[0]["c"]
    print(f"  {CATALOG}.{GOLD}.{name}: {cnt:,} rows")

print()
print("Chequeo de escenarios (ocupacion ultimos 30 dias volados, tarifa Economy Standard,")
print("mediana de competidor, brecha y accion que aplicaria el motor de reglas):")
print("-" * 78)

check = spark.sql(f"""
WITH occ AS (
  SELECT ruta_id, AVG(load_factor) AS lf30
  FROM {CATALOG}.{GOLD}.flights
  WHERE estado = 'Volado' AND dias_a_salida >= -30
  GROUP BY ruta_id
),
mine AS (
  SELECT ruta_id, tarifa_actual_usd AS mia
  FROM {CATALOG}.{GOLD}.current_fares
  WHERE cabina = 'Economy' AND clase_tarifa = 'Standard'
),
comp AS (
  SELECT ruta_id, MEDIAN(tarifa_competidor_usd) AS comp_med
  FROM {CATALOG}.{GOLD}.competitor_fares
  GROUP BY ruta_id
)
SELECT o.ruta_id,
       ROUND(o.lf30, 3) AS ocupacion,
       ROUND(m.mia, 0) AS tarifa_propia,
       ROUND(c.comp_med, 0) AS comp_mediana,
       ROUND((m.mia - c.comp_med) / c.comp_med * 100, 1) AS brecha_pct
FROM occ o JOIN mine m USING (ruta_id) JOIN comp c USING (ruta_id)
ORDER BY o.ruta_id
""").toPandas()


def accion(row):
    if row.ocupacion >= 0.85 and row.brecha_pct <= -5:
        return "SUBIR"
    if row.ocupacion <= 0.65 and row.brecha_pct >= 5:
        return "BAJAR"
    return "MANTENER"


check["accion"] = check.apply(accion, axis=1)
print(check.to_string(index=False))

print()
print("Distribucion de acciones sembradas:")
print(check["accion"].value_counts().to_string())
print("=" * 78)
print("OK Data generation complete. Catalogo avianca_revenue_operations listo.")
