-- @param ruta_id STRING
-- Curva de reserva: ocupacion promedio por dias a la salida sobre los vuelos
-- programados (aun a la venta). De mas dias a menos: como se llena el vuelo.
SELECT
  dias_a_salida,
  ROUND(AVG(load_factor), 4) AS load_factor
FROM avianca_revenue_operations.gold.flights
WHERE ruta_id = :ruta_id AND estado = 'Programado' AND dias_a_salida >= 0
GROUP BY dias_a_salida
ORDER BY dias_a_salida DESC;
