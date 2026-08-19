import { num, rows, str } from "./appkit.js";
import { sql } from "@databricks/appkit";

//#region server/lib/gold.ts
const CATALOG = "avianca_revenue_operations.gold";
const ROUTE_INPUTS_SQL = `
WITH occ AS (
  SELECT ruta_id, ANY_VALUE(region) AS region,
         AVG(load_factor) AS ocupacion,
         SUM(revenue_total_usd) AS revenue30
  FROM ${CATALOG}.flights
  WHERE estado = 'Volado' AND dias_a_salida >= -30 AND ruta_id = :ruta_id
  GROUP BY ruta_id
),
mine AS (
  SELECT ruta_id, tarifa_actual_usd AS tarifa_propia
  FROM ${CATALOG}.current_fares
  WHERE cabina = 'Economy' AND clase_tarifa = 'Standard' AND ruta_id = :ruta_id
),
comp AS (
  SELECT ruta_id, MEDIAN(tarifa_competidor_usd) AS comp_mediana
  FROM ${CATALOG}.competitor_fares
  WHERE ruta_id = :ruta_id
  GROUP BY ruta_id
),
dem AS (
  SELECT ruta_id, AVG(indice_demanda) AS indice_demanda, AVG(forecast_ocupacion) AS forecast
  FROM ${CATALOG}.route_demand
  WHERE ruta_id = :ruta_id
    AND fecha >= (SELECT MAX(fecha) FROM ${CATALOG}.route_demand WHERE ruta_id = :ruta_id) - INTERVAL 14 DAYS
  GROUP BY ruta_id
)
SELECT o.ruta_id, o.region, o.ocupacion, o.revenue30,
       m.tarifa_propia, c.comp_mediana, d.indice_demanda, d.forecast
FROM occ o
JOIN mine m USING (ruta_id)
JOIN comp c USING (ruta_id)
LEFT JOIN dem d USING (ruta_id)
`;
async function getRouteInputs(appkit, rutaId) {
	const r = rows(await appkit.analytics.query(ROUTE_INPUTS_SQL, { ruta_id: sql.string(rutaId) }))[0];
	if (!r) return null;
	return {
		rutaId: str(r.ruta_id),
		region: str(r.region),
		ocupacion: num(r.ocupacion),
		tarifaPropia: num(r.tarifa_propia),
		compMediana: num(r.comp_mediana),
		indiceDemanda: num(r.indice_demanda),
		forecastOcupacion: num(r.forecast),
		revenue30Usd: num(r.revenue30)
	};
}
const NETWORK_KPIS_SQL = `
WITH cur AS (
  SELECT SUM(revenue_total_usd) AS rev, AVG(load_factor) AS lf,
         SUM(revenue_pasaje_usd) AS revpax, SUM(revenue_ancillary_usd) AS revanc,
         SUM(asientos_vendidos) AS pax, SUM(capacidad * distancia_km) AS ask,
         MAX(fecha_salida) AS ultima_fecha
  FROM ${CATALOG}.flights
  WHERE estado = 'Volado' AND dias_a_salida >= -30
),
prev AS (
  SELECT SUM(revenue_total_usd) AS rev, AVG(load_factor) AS lf
  FROM ${CATALOG}.flights
  WHERE estado = 'Volado' AND dias_a_salida BETWEEN -60 AND -31
)
SELECT cur.rev, cur.lf, cur.revpax, cur.revanc, cur.pax, cur.ask, cur.ultima_fecha,
       prev.rev AS prev_rev, prev.lf AS prev_lf
FROM cur, prev
`;
async function getNetworkKpis(appkit) {
	const r = rows(await appkit.analytics.query(NETWORK_KPIS_SQL))[0];
	if (!r) return null;
	const rev = num(r.rev);
	const prevRev = num(r.prev_rev);
	const lf = num(r.lf);
	const prevLf = num(r.prev_lf);
	const pax = num(r.pax);
	const ask = num(r.ask);
	return {
		revenueTotalUsd: Math.round(rev * 100) / 100,
		revenueDeltaPct: prevRev > 0 ? Math.round((rev - prevRev) / prevRev * 1e3) / 10 : 0,
		loadFactorProm: Math.round(lf * 1e4) / 1e4,
		loadFactorDeltaPts: Number.isFinite(prevLf) ? Math.round((lf - prevLf) * 1e3) / 10 : 0,
		raskProxyUsd: ask > 0 ? Math.round(rev / ask * 1e4) / 1e4 : 0,
		yieldPaxUsd: pax > 0 ? Math.round(num(r.revpax) / pax * 100) / 100 : 0,
		ancillaryPorPaxUsd: pax > 0 ? Math.round(num(r.revanc) / pax * 100) / 100 : 0,
		freshness: str(r.ultima_fecha).slice(0, 10),
		periodoDias: 30
	};
}
const ROUTE_METRICS_SQL = `
WITH occ AS (
  SELECT ruta_id, ANY_VALUE(region) AS region, AVG(load_factor) AS ocupacion
  FROM ${CATALOG}.flights
  WHERE estado = 'Volado' AND dias_a_salida >= -30
  GROUP BY ruta_id
),
mine AS (
  SELECT ruta_id, tarifa_actual_usd AS tarifa_propia
  FROM ${CATALOG}.current_fares
  WHERE cabina = 'Economy' AND clase_tarifa = 'Standard'
),
comp AS (
  SELECT ruta_id, MEDIAN(tarifa_competidor_usd) AS comp_mediana
  FROM ${CATALOG}.competitor_fares
  GROUP BY ruta_id
),
dem AS (
  SELECT ruta_id, AVG(indice_demanda) AS indice_demanda
  FROM ${CATALOG}.route_demand
  WHERE fecha >= (SELECT MAX(fecha) FROM ${CATALOG}.route_demand) - INTERVAL 14 DAYS
  GROUP BY ruta_id
)
SELECT o.ruta_id, o.region, o.ocupacion, m.tarifa_propia, c.comp_mediana,
       ROUND((m.tarifa_propia - c.comp_mediana) / c.comp_mediana * 100, 1) AS brecha_pct,
       d.indice_demanda
FROM occ o
JOIN mine m USING (ruta_id)
JOIN comp c USING (ruta_id)
LEFT JOIN dem d USING (ruta_id)
ORDER BY o.ruta_id
`;
async function getRouteMetrics(appkit) {
	return rows(await appkit.analytics.query(ROUTE_METRICS_SQL)).map((r) => ({
		rutaId: str(r.ruta_id),
		region: str(r.region),
		ocupacion: num(r.ocupacion),
		tarifaPropia: num(r.tarifa_propia),
		compMediana: num(r.comp_mediana),
		brechaPct: num(r.brecha_pct),
		indiceDemanda: num(r.indice_demanda)
	}));
}
async function getRevenueMesUsd(appkit) {
	const r = rows(await appkit.analytics.query(`SELECT SUM(revenue_total_usd) AS rev FROM ${CATALOG}.flights WHERE estado='Volado' AND dias_a_salida >= -30`))[0];
	return r ? Math.round(num(r.rev) * 100) / 100 : null;
}

//#endregion
export { getNetworkKpis, getRevenueMesUsd, getRouteInputs, getRouteMetrics };