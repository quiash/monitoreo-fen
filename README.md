# Monitoreo FEN 26/27

Visor de emergencias e intervenciones preventivas en Perú. Incluye COEN, puntos críticos ANA, barreras, ríos, lluvia observada e intensidad de lluvia respecto del histórico PISCOp.

**Corte incluido:** 9 de noviembre de 2026. La fecha disponible de cada capa se muestra en el visor. La publicación inicial conserva la información existente; todavía no consulta las fuentes automáticamente.

## Publicar la web

1. En este repositorio abre **Settings → Pages**.
2. En **Source**, selecciona **Deploy from a branch**.
3. Selecciona **main** y **/(root)**, y pulsa **Save**.
4. Espera a que termine el despliegue. La dirección será https://quiash.github.io/monitoreo-fen/.

No necesitas instalar programas. GitHub Pages sirve archivos estáticos; esta configuración vuelve a publicar los cambios que se suban a `main`.

## Actualizar desde el navegador

Abre https://quiash.github.io/monitoreo-fen/actualizar.html y selecciona una versión nueva del HTML portable del mapa que ya contenga los datos actualizados. La herramienta prepara un ZIP del sitio: descomprímelo y sube sus archivos y carpetas con **Add file → Upload files** en GitHub. No selecciones el ZIP como si fuera el sitio.

Este procedimiento publica una nueva base ya preparada; no realiza las consultas de ANA, COEN o SENAMHI. La automatización de esas consultas es una etapa posterior y necesita validar el acceso de cada fuente desde la nube.

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
