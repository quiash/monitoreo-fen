# Monitoreo FEN 26/27

Visor de emergencias e intervenciones preventivas en Perú. Incluye COEN, puntos críticos ANA, barreras, ríos, lluvia observada e intensidad de lluvia respecto del histórico PISCOp.

El visor carga una base histórica y una actualización incremental por fuente. OpenStreetMap es el fondo predeterminado y no requiere clave. El fondo satelital MapTiler es opcional.

## Actualización automática

El workflow **Actualizar datos FEN** consulta las fuentes cada tres horas (minuto 23; GitHub puede retrasar las ejecuciones). También puede iniciarse en **Actions → Actualizar datos FEN → Run workflow**.

- **ANA:** consulta reporte general y diario. Vincula fichas de manera única, conserva la jerarquía del inventario, separa normas/periodos y excluye fechas futuras. Los presupuestos existentes se conservan cuando el reporte no los incluye.
- **COEN:** consulta los últimos 30 días, incorpora registros y conserva el archivo histórico. Nuevos documentos quedan pendientes de revisión; no se extraen cifras de daños automáticamente.
- **Lluvia:** descarga estaciones y superficie oficial SENAMHI; la fecha proviene de la publicación, con acumulados 07:00–07:00 hora Perú. Recupera días faltantes disponibles y conserva los anteriores. Los percentiles se calculan con la referencia PISCOp existente, cuya cobertura sigue limitada a octubre y noviembre.
- **Ríos:** consulta hidrogramas diarios de las estaciones/variables del inventario. Conserva fechas, unidades y umbrales; una estación fallida retiene su última serie. El promedio diario no es una alerta oficial en tiempo real.
- **94 adicionales y barreras:** conservan su catálogo original. No se declara actualización de avance cuando no existe una consulta automática validada.

Cada fuente se guarda y publica al terminar, sin esperar a las demás. Las consultas tienen tiempo máximo; una interrupción conserva las fuentes que ya terminaron.

Los errores se muestran en **Fuentes y notas → Estado de actualización**. Un intento fallido no cambia el corte de esa fuente. `data/status.json` registra intentos y últimos éxitos; `data/live.json` contiene las diferencias comprimidas respecto de la base. No mezclar partes de diferentes bases.

El workflow solicita explícitamente una publicación Pages después de guardar los datos, porque los commits hechos con `GITHUB_TOKEN` no activan por sí solos una nueva publicación. Mantener **Settings → Pages → Deploy from a branch → main → /(root)**.

OpenStreetMap se usa sólo para visualización interactiva, con atribución y caché normal del navegador; no se descargan teselas en los procesos automáticos ni se permite descarga masiva para uso offline.

## Publicar la web

1. En este repositorio abre **Settings → Pages**.
2. En **Source**, selecciona **Deploy from a branch**.
3. Selecciona **main** y **/(root)**, y pulsa **Save**.
4. Espera a que termine el despliegue. La dirección será https://quiash.github.io/monitoreo-fen/.

No necesitas instalar programas. GitHub Pages sirve archivos estáticos; esta configuración vuelve a publicar los cambios que se suban a `main`.

## Actualizar desde el navegador

Abre https://quiash.github.io/monitoreo-fen/actualizar.html y selecciona una versión nueva del HTML portable del mapa que ya contenga los datos actualizados. La herramienta prepara un ZIP del sitio: descomprímelo y sube sus archivos y carpetas con **Add file → Upload files** en GitHub. No selecciones el ZIP como si fuera el sitio.

Este procedimiento publica una nueva base ya preparada; no realiza las consultas de ANA, COEN o SENAMHI. La consulta periódica se ejecuta mediante el workflow descrito arriba. Una nueva base portable debe corresponder al corte correcto de cada fuente.

## Archivos

- `index.html`: estructura del visor.
- `assets/`: estilos, motor cartográfico y aplicación.
- `data/manifest.json`: fecha, referencia y lista de archivos de la base.
- `data/base-*.txt`: partes de la base comprimida, sin pérdida de información.
- `data/reference.json`: referencia histórica PISCOp.
- `actualizar.html`: preparación local de una actualización para subir desde el navegador.
- `tools/build_site.py`: alternativa opcional para reconstruir el sitio con Python estándar.

No edites ni combines manualmente partes de distintas versiones de `data/base-*.txt`. El manifiesto y todas las partes deben corresponder a la misma actualización.

## Datos y método

Se conserva la base y el historial del HTML original. PISCOp v3.0 cubre 1981–2025; la referencia del visor utiliza octubre y noviembre de 1991–2020. La referencia incluida corresponde al cálculo inicial sobre días húmedos; el cálculo adicional de todos los días para zonas secas sigue pendiente de incorporarse. No es SPI ni una alerta oficial. Las fuentes y limitaciones completas figuran en el visor.

## Comprobación local opcional

```sh
python3 tools/validate_site.py
python3 -m http.server 8000
```

Después abre http://localhost:8000. La web carga sus datos mediante HTTP; no debe abrirse haciendo doble clic en `index.html`. Para compartir un único archivo utiliza la copia portable generada por el visor.
