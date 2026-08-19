# Databricks notebook source
# MAGIC %md
# MAGIC # Refresco medallion bronze -> silver -> gold - Avianca Revenue Operations
# MAGIC
# MAGIC Segunda etapa de la orquestacion. El generador `01_generate_revenue_data.py` deja
# MAGIC copias crudas en `bronze.*_raw` (con duplicados y nulos plantados) y una primera
# MAGIC version de `gold`. Este notebook materializa la capa `silver` limpia a partir de
# MAGIC `bronze` y vuelve a publicar `gold` desde `silver`, de modo que gold quede aguas
# MAGIC abajo de una capa curada y trazable.
# MAGIC
# MAGIC Limpieza por tabla:
# MAGIC - Quita las columnas de ingesta (`ingest_ts`, `source_file`).
# MAGIC - Elimina duplicados exactos (el generador duplica ~1% de las filas).
# MAGIC - Descarta filas con nulo en la metrica critica de cada tabla.
# MAGIC
# MAGIC Idempotente (usa `overwrite`). Serverless, compatible con Free Edition. No escribe
# MAGIC datos transaccionales: `pricing_actions`, `alerts` y `audit_events` viven en Lakebase
# MAGIC y los administra la app.

# COMMAND ----------

from pyspark.sql import functions as F

CATALOG = "avianca_revenue_operations"
BRONZE = "bronze"
SILVER = "silver"
GOLD = "gold"

# Tabla gold -> (tabla bronze cruda, columna critica que no admite nulos en silver)
TABLES = {
    "flights": ("flights_raw", "load_factor"),
    "route_demand": ("route_demand_raw", "indice_demanda"),
    "current_fares": ("current_fares_raw", "tarifa_actual_usd"),
    "competitor_fares": ("competitor_fares_raw", "tarifa_competidor_usd"),
    "ancillaries": ("ancillaries_raw", "attach_rate"),
}

META_COLS = ["ingest_ts", "source_file"]

for sch in (SILVER, GOLD):
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{sch}")

print(f"Refresco medallion en {CATALOG}: {len(TABLES)} entidades")
print("-" * 70)

# COMMAND ----------

# MAGIC %md
# MAGIC ## bronze -> silver (limpieza y tipado)

# COMMAND ----------

silver_counts = {}
for gold_name, (bronze_name, critical) in TABLES.items():
    raw = spark.table(f"{CATALOG}.{BRONZE}.{bronze_name}")
    drop_cols = [c for c in META_COLS if c in raw.columns]
    clean = raw.drop(*drop_cols) if drop_cols else raw
    clean = clean.dropDuplicates()
    if critical in clean.columns:
        clean = clean.filter(F.col(critical).isNotNull())
    clean.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(
        f"{CATALOG}.{SILVER}.{gold_name}"
    )
    cnt = spark.table(f"{CATALOG}.{SILVER}.{gold_name}").count()
    silver_counts[gold_name] = cnt
    print(f"OK {CATALOG}.{SILVER}.{gold_name}: {cnt:,} filas limpias")

# COMMAND ----------

# MAGIC %md
# MAGIC ## silver -> gold (publicacion analitica)

# COMMAND ----------

for gold_name in TABLES:
    src = spark.table(f"{CATALOG}.{SILVER}.{gold_name}")
    src.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(
        f"{CATALOG}.{GOLD}.{gold_name}"
    )
    cnt = spark.table(f"{CATALOG}.{GOLD}.{gold_name}").count()
    print(f"OK {CATALOG}.{GOLD}.{gold_name}: {cnt:,} filas publicadas")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Validacion

# COMMAND ----------

print("=" * 70)
print("RESUMEN DEL REFRESCO MEDALLION")
print("=" * 70)
for gold_name in TABLES:
    b = spark.table(f"{CATALOG}.{BRONZE}.{TABLES[gold_name][0]}").count()
    s = spark.table(f"{CATALOG}.{SILVER}.{gold_name}").count()
    g = spark.table(f"{CATALOG}.{GOLD}.{gold_name}").count()
    print(f"  {gold_name:18s}  bronze={b:>8,}  silver={s:>8,}  gold={g:>8,}")
print("=" * 70)
print("OK Refresco medallion completo.")
