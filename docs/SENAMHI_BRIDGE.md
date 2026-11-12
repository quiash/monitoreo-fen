# Conector SENAMHI

El conector permite consultar lluvia y ríos desde GitHub Actions.

La credencial se guarda como secreto de Actions con el nombre `SENAMHI_BRIDGE_TOKEN`. No debe incluirse en archivos ni enlaces públicos.

Para comprobar la conexión, ejecutar **Actualizar datos FEN** y revisar los cortes de lluvia y ríos en el visor. Las consultas realizadas por esta vía se identifican con `executor: github_bridge` en `data/status.json`.

Sin el secreto, Actions omite SENAMHI, salvo que `FEN_SENAMHI_RUNNER=github` habilite el acceso directo. Conviene mantener un solo actualizador activo.
