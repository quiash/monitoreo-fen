# Actualización SENAMHI mediante tarea de ChatGPT

La tarea **Actualizar SENAMHI del visor** está programada cada tres horas, a partir del 11/11/2026 a las 16:50 (America/Lima). Horarios: 01:50, 04:50, 07:50, 10:50, 13:50, 16:50, 19:50 y 22:50. La primera ejecución programada está pendiente de comprobar; una consulta ejecutada durante el mantenimiento no acredita por sí sola una ejecución futura.

El entorno de nube de esta conversación consiguió descargar SENAMHI. Los runners GitHub probados no consiguieron conectarse y el conector de prueba en Cloudflare tampoco. Por ello la tarea consulta y publica mediante las herramientas de ejecución y el conector GitHub de ChatGPT. Depende de que la tarea permanezca habilitada y esas herramientas/conexiones estén disponibles; no es un cron autónomo alojado en GitHub.

## Qué hace cada ejecución

1. Obtener un checkout nuevo de `main` e instalar `tools/requirements-refresh.txt` si es necesario.
2. Ejecutar `python tools/refresh_data.py --only rain hydro`. Las fuentes se guardan por separado; conservar la última versión válida de una fuente fallida.
3. Ejecutar `python tools/validate_site.py` y `python tools/validate_live.py`; revisar cortes y estados. No atribuir la fecha de ejecución a observaciones antiguas.
4. Preparar una carpeta nueva con `python tools/export_connected_update.py --output /tmp/fen-senamhi-outgoing`. El manifiesto lista bloques y el SHA Git exacto de cada archivo.
5. Leer los bloques individualmente (salidas de hasta 150000 caracteres), concatenarlos en memoria y comprobar JSON/longitud. Crear blobs mediante el conector GitHub y exigir que sus SHA coincidan con `gitBlobSha`. Nunca transferir el JSON grande con una sola salida de terminal: puede truncarse.
6. Publicar sólo `data/live.json` y `data/status.json`, en un solo commit basado en el HEAD vigente, usando `expected_sha`, sin forzar `main`. Si el HEAD cambió, incorporar los cambios SENAMHI sobre la versión más reciente y volver a validar; no sustituir las actualizaciones ANA/COEN.
7. Verificar la publicación Pages y el JSON servido. Informar los cortes y los errores. Si falta acceso o alguna herramienta, reportar el impedimento sin afirmar que se actualizó.

La lluvia conserva estaciones y superficie oficial; los ríos conservan variable, unidad y umbrales de cada serie. No modificar los catálogos 536/94/12, los presupuestos, el diseño ni los fondos cartográficos.

## GitHub Actions

El workflow mantiene ANA y COEN. Las consultas SENAMHI del workflow sólo se ejecutan cuando la variable de repositorio `FEN_SENAMHI_RUNNER` vale `github`; por defecto se omiten para que los intentos fallidos de GitHub no sustituyan el estado de la tarea externa.

Para volver a GitHub cuando se compruebe su conectividad: pausar la tarea en ChatGPT, establecer `FEN_SENAMHI_RUNNER=github` y ejecutar el workflow manualmente. Conservar la última versión válida si falla. Para usar un servidor propio, también existe `FEN_RUNNER`, documentado en el README.

## Seguimiento

Administrar la tarea desde la tarjeta de ChatGPT. El indicador "Última comprobación" del visor no garantiza por sí solo que se haya actualizado SENAMHI: comprobar los estados y cortes individuales de lluvia y ríos. Las interrupciones de SENAMHI o de la tarea conservan el historial ya publicado.
