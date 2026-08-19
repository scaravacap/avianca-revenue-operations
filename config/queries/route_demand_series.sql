-- @param ruta_id STRING
-- Serie de demanda diaria de una ruta: indice contra la linea base y reservas.
SELECT
  CAST(fecha AS DATE) AS fecha,
  ROUND(indice_demanda, 3) AS indice_demanda,
  reservas
FROM avianca_revenue_operations.gold.route_demand
WHERE ruta_id = :ruta_id
ORDER BY fecha;
