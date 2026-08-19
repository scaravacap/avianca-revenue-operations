-- @param dias INT
-- Revenue diario de la red sobre los vuelos ya volados en la ventana pedida.
-- La comparacion temporal vive en el eje: cada punto es un dia de salida.
SELECT
  CAST(fecha_salida AS DATE) AS fecha,
  ROUND(SUM(revenue_total_usd), 2) AS revenue_usd
FROM avianca_revenue_operations.gold.flights
WHERE estado = 'Volado' AND dias_a_salida >= (0 - :dias)
GROUP BY CAST(fecha_salida AS DATE)
ORDER BY fecha;
