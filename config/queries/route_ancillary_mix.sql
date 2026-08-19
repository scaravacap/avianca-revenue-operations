-- @param ruta_id STRING
-- Mezcla de ancillary de una ruta en los ultimos 12 meses: revenue por tipo.
SELECT
  tipo_ancillary,
  ROUND(SUM(revenue_usd), 2) AS revenue_usd,
  ROUND(AVG(attach_rate), 4) AS attach_rate
FROM avianca_revenue_operations.gold.ancillaries
WHERE ruta_id = :ruta_id
GROUP BY tipo_ancillary
ORDER BY revenue_usd DESC;
