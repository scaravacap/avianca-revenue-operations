-- @param limit INT
-- @param offset INT
-- @param sort_key STRING
-- @param sort_dir STRING
-- Una fila por ruta con las metricas que mueven la decision de pricing.
-- La paginacion y el orden se resuelven en el warehouse (LIMIT/OFFSET/ORDER BY),
-- no en el navegador. total_rutas viaja en cada fila para armar el paginador.
WITH occ AS (
  SELECT ruta_id, region,
         AVG(load_factor) AS ocupacion,
         SUM(revenue_total_usd) AS revenue_usd
  FROM avianca_revenue_operations.gold.flights
  WHERE estado = 'Volado' AND dias_a_salida >= -30
  GROUP BY ruta_id, region
),
mine AS (
  SELECT ruta_id, tarifa_actual_usd AS tarifa_propia
  FROM avianca_revenue_operations.gold.current_fares
  WHERE cabina = 'Economy' AND clase_tarifa = 'Standard'
),
comp AS (
  SELECT ruta_id, MEDIAN(tarifa_competidor_usd) AS comp_mediana
  FROM avianca_revenue_operations.gold.competitor_fares
  GROUP BY ruta_id
),
dem AS (
  SELECT ruta_id, AVG(indice_demanda) AS indice_demanda
  FROM avianca_revenue_operations.gold.route_demand
  WHERE fecha >= (SELECT MAX(fecha) FROM avianca_revenue_operations.gold.route_demand) - INTERVAL 14 DAYS
  GROUP BY ruta_id
),
joined AS (
  SELECT
    o.ruta_id,
    o.region,
    o.ocupacion,
    o.revenue_usd,
    m.tarifa_propia,
    c.comp_mediana,
    ROUND((m.tarifa_propia - c.comp_mediana) / c.comp_mediana * 100, 1) AS brecha_pct,
    d.indice_demanda,
    CASE
      WHEN o.ocupacion >= 0.85 AND (m.tarifa_propia - c.comp_mediana) / c.comp_mediana * 100 <= -5 THEN 'SUBIR'
      WHEN o.ocupacion <= 0.65 AND (m.tarifa_propia - c.comp_mediana) / c.comp_mediana * 100 >= 5 THEN 'BAJAR'
      ELSE 'MANTENER'
    END AS accion
  FROM occ o
  JOIN mine m USING (ruta_id)
  JOIN comp c USING (ruta_id)
  LEFT JOIN dem d USING (ruta_id)
)
SELECT
  ruta_id,
  region,
  ROUND(ocupacion, 4) AS ocupacion,
  ROUND(revenue_usd, 2) AS revenue_usd,
  ROUND(tarifa_propia, 2) AS tarifa_propia,
  ROUND(comp_mediana, 2) AS comp_mediana,
  brecha_pct,
  ROUND(indice_demanda, 3) AS indice_demanda,
  accion,
  COUNT(*) OVER () AS total_rutas
FROM joined
ORDER BY
  (CASE WHEN :sort_key = 'ruta_id' AND :sort_dir = 'asc' THEN ruta_id END) ASC NULLS LAST,
  (CASE WHEN :sort_key = 'ruta_id' AND :sort_dir = 'desc' THEN ruta_id END) DESC NULLS LAST,
  (CASE WHEN :sort_key = 'ocupacion' AND :sort_dir = 'asc' THEN ocupacion END) ASC NULLS LAST,
  (CASE WHEN :sort_key = 'ocupacion' AND :sort_dir = 'desc' THEN ocupacion END) DESC NULLS LAST,
  (CASE WHEN :sort_key = 'revenue_usd' AND :sort_dir = 'asc' THEN revenue_usd END) ASC NULLS LAST,
  (CASE WHEN :sort_key = 'revenue_usd' AND :sort_dir = 'desc' THEN revenue_usd END) DESC NULLS LAST,
  (CASE WHEN :sort_key = 'brecha_pct' AND :sort_dir = 'asc' THEN brecha_pct END) ASC NULLS LAST,
  (CASE WHEN :sort_key = 'brecha_pct' AND :sort_dir = 'desc' THEN brecha_pct END) DESC NULLS LAST,
  (CASE WHEN :sort_key = 'indice_demanda' AND :sort_dir = 'asc' THEN indice_demanda END) ASC NULLS LAST,
  (CASE WHEN :sort_key = 'indice_demanda' AND :sort_dir = 'desc' THEN indice_demanda END) DESC NULLS LAST,
  ruta_id ASC
LIMIT :limit OFFSET :offset;
