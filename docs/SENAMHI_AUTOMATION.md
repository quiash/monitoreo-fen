# Actualización alternativa de SENAMHI

Si se utiliza una tarea externa, el proceso de consulta es:

```sh
python tools/refresh_data.py --only rain hydro
python tools/validate_site.py
python tools/validate_live.py
```

Publicar los archivos de datos generados sobre la versión vigente de `main`, conservando las actualizaciones de otras fuentes. Ante un fallo, mantener la última versión válida.

La programación depende del servicio que ejecute la tarea. Si se utiliza el [conector de GitHub Actions](SENAMHI_BRIDGE.md), desactivar la tarea externa para evitar consultas duplicadas.
