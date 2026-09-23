---
name: repo-lifecycle
description: Orquestador del ciclo de vida completo del repositorio Pokedex.
---

# repo-lifecycle

Esta skill coordina las demás skills para evitar análisis duplicados y convertir hallazgos en cambios verificables.

## Flujo recomendado

```text
repo-context
     |
     v
repo-audit
     |
     +--> repo-security
     +--> repo-dependencies
     +--> repo-architecture
     +--> repo-quality
     +--> repo-testing
     +--> repo-ci
     +--> repo-cleanup
     +--> repo-modernize
     |
     v
repo-metrics / backlog
     |
     v
repo-impact
     |
     v
repo-refactor
     |
     v
repo-testing
     |
     v
repo-pr
     |
     v
repo-release
     |
     v
repo-docs
     |
     v
repo-maintenance
```

## Reglas de orquestación

- No repetir un análisis si existe un resultado vigente y el árbol relevante no cambió.
- Ejecutar primero contexto y luego análisis especializados.
- Priorizar seguridad, dependencias y regresiones antes de modernización.
- No ejecutar cleanup automáticamente.
- No considerar una recomendación implementada hasta que exista evidencia en código/CI.
- Después de cada cambio importante: testing -> PR review -> docs/release según alcance.
- Ningún cambio se considera cerrado si dejó drift de documentación sin resolver: cada skill debe señalar los documentos impactados (paso 8 de su Flujo) y `repo-docs` debe confirmarlos como actualizados o formalmente pendientes antes de `repo-maintenance`.
- Mantener baseline para comparar auditorías futuras.

## Modos

### Full
Ejecuta el ciclo completo.

### Fast
Contexto + audit + security + dependencies + tests.

### Change
`repo-impact` + skills relacionadas con los archivos afectados + tests.

### Release
Security + dependencies + tests + CI + GitOps + release + docs.

### Maintenance
Delta respecto al último baseline.
