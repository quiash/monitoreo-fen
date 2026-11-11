# Conector privado SENAMHI para GitHub Actions

Se validó la descarga desde Cloudflare de publicación de lluvia, 554 estaciones, TIFF oficial de 12,583,392 bytes y un hidrograma diario. El conector conserva las respuestas originales. La actualización y validación de los datos siguen ejecutándose en Python dentro de GitHub Actions.

Origen: https://fen-senamhi-bridge.cierna-estocastico.chatgpt.site

El servicio es privado. Usa el acceso de servicio de la plataforma mediante `OAI-Sites-Authorization: Bearer …`. No se publica el token en código, mensajes, archivos ni URLs. El conector acepta exclusivamente las rutas y parámetros SENAMHI previstos; no permite elegir otro servidor. Los clientes tampoco siguen redirecciones que puedan reenviar el token.

## Activación pendiente

1. Guardar la credencial privada del conector como secreto de Actions **SENAMHI_BRIDGE_TOKEN** en este repositorio. Es una credencial de lectura del conector; no concede acceso de escritura a GitHub.
2. Iniciar **Actions → Actualizar datos FEN → Run workflow**.
3. Verificar que lluvia y ríos terminan, que sus registros en `data/status.json` contienen `executor: github_bridge` y que los cortes se muestran correctamente en la web.
4. Sólo después de esa verificación, pausar la tarea **Actualizar SENAMHI del visor** de ChatGPT para evitar consultas duplicadas.

Sin el secreto, GitHub omite SENAMHI y la tarea de ChatGPT configurada continúa como alternativa. Con `FEN_SENAMHI_RUNNER=github` y sin secreto se prueba acceso directo desde el runner, que no funcionó en los entornos previamente evaluados.

La frecuencia del workflow sigue siendo cada tres horas. Cada fuente conserva su última versión válida si el servicio falla; el fondo del mapa no interviene en la descarga de observaciones.
