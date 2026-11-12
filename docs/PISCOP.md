# Comparación diaria de precipitación

La referencia suministrada usa PISCOp v3.0, 1991–2025, los doce meses y percentiles P90/P95/P99 de todos los días válidos de cada mes. Cobertura mínima: 80 %. Se conservan también las estadísticas de días húmedos del archivo original.

`data/reference.json` enumera los fragmentos de la referencia comprimida. El cargador los reúne; el visor verifica las coordenadas, los conteos y los umbrales de los doce meses.

Cada acumulado SENAMHI conserva su grilla numérica, sin deducir cantidades desde intervalos de colores. `gridFile` identifica el archivo diario; sólo se descarga al seleccionar la fecha. El mes de comparación es el de inicio del acumulado de 07:00 a 07:00, hora Perú. Se recuperaron los quince acumulados finalizados entre el 29/10 y el 12/11/2026. Las fechas anteriores conservan su precipitación observada; sin grilla numérica no generan una superficie relativa.

La máscara exige al menos 0,1 mm en la celda diaria. Los valores ausentes, las celdas secas y las celdas sin cobertura histórica no reciben relleno. La interpolación de presentación sólo usa vecinos húmedos y no cambia la máscara seca. La superficie mantiene cobertura nacional al filtrar estaciones.

La actualización automática conserva la grilla de cada nuevo día y recupera hasta siete fechas pendientes por ejecución. El script de publicación incluye estos archivos. Las descargas de HTML incorporan las grillas disponibles para conservar la consulta portable.

Comprobaciones:

```sh
node tests/test_rain_climate.cjs
python -m unittest discover -s tests -v
python tools/validate_site.py
python tools/validate_live.py
```

Los percentiles expresan posición respecto al histórico local. No son SPI ni alertas oficiales. La referencia 1991–2025 permanece fija hasta que se regenere con un nuevo periodo; la observación diaria sí se actualiza automáticamente.
