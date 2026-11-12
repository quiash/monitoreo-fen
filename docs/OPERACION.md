# Mantenimiento

## Actualización

**Actions → Actualizar datos FEN → Run workflow** permite iniciar una consulta manual. La ejecución programada es cada tres horas.

El estado de las fuentes se guarda en `data/status.json`. Si una consulta falla, se conserva la última información válida. Los 94 puntos adicionales y las barreras mantienen su catálogo disponible.

Lluvia y ríos utilizan el [conector SENAMHI](SENAMHI_BRIDGE.md). La referencia histórica se describe en [Datos de lluvia](PISCOP.md).

## Publicación

GitHub Pages publica desde `main`, carpeta raíz. Configuración: **Settings → Pages → Deploy from a branch → main → /(root)**.

Para reemplazar la base desde un HTML portable, usar [actualizar.html](https://quiash.github.io/monitoreo-fen/actualizar.html), descomprimir el ZIP y subir su contenido al repositorio. El manifiesto y las partes de la base deben pertenecer a la misma versión.

## Revisión local

```sh
python tools/validate_site.py
python tools/validate_live.py
python -m http.server 8000
```

Abrir `http://localhost:8000`.

## Cartografía

OpenStreetMap, Esri World Imagery y Sentinel-2 cloudless 2024 de EOX. Los fondos satelitales son de referencia; no representan necesariamente la fecha seleccionada.

Mantener las atribuciones y respetar las condiciones de [Esri](https://www.esri.com/en-us/legal/terms/web-site-service) y [EOX](https://eox.at/2025/03/sentinel-2-cloudless-2024/). EOX se ofrece bajo CC BY-NC-SA 4.0.
