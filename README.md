# Monitoreo FEN 26/27

Visor de emergencias e intervenciones preventivas en el Perú.

**[Abrir visor](https://quiash.github.io/monitoreo-fen/)**

## Información disponible

- Emergencias y reportes de COEN–INDECI.
- Puntos críticos e intervenciones de la ANA, con seguimiento de avances.
- Precipitación observada y registros de ríos del SENAMHI.
- Comparación de lluvias con los percentiles históricos PISCOp de 1991–2025.

La consulta por fecha permite revisar el mapa, las fichas y las gráficas de seguimiento. El modo proyección amplía el área de consulta.

## Actualización

Las fuentes se consultan cada tres horas. La fecha de corte y el estado de cada consulta figuran en «Fuentes y notas». Si un servicio no responde, se conserva su última información válida.

Los 94 puntos adicionales y las barreras dinámicas mantienen el último catálogo disponible. La referencia histórica PISCOp permanece fija hasta su próxima revisión.

## Alcance

Las fechas y la cobertura varían según la fuente. Los percentiles de lluvia son una comparación histórica; no constituyen una alerta oficial ni equivalen al SPI.

## Documentación

- [Operación y publicación](docs/OPERACION.md)
- [Comparación de precipitaciones](docs/PISCOP.md)
- [Conector SENAMHI](docs/SENAMHI_BRIDGE.md)

## Verificación local

```sh
python tools/validate_site.py
python -m http.server 8000
```

Abrir `http://localhost:8000`.
