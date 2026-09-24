# Reglas Operativas para Agentes de IA (`AGENTS.md`)

Este archivo contiene instrucciones obligatorias para Antigravity y cualquier agente de IA que interactúe con el repositorio `rocapellino/pokedex`.

---

## 1. Demarcación Estricta: SSOT Actual vs. Evidencia Histórica

Al analizar el repositorio, buscar dependencias, validar configuraciones de infraestructura o inspeccionar secretos:

### A. Fuentes Únicas de Verdad (SSOT Actual)

- `gitops/`: Manifiestos y values de ArgoCD vigentes por entorno.
- `infra/`: Helm charts, templates, Ansible playbooks y OpenTofu.
- `docs/architecture/`: Especificación formal y activa de arquitectura y seguridad.
- `apps/`, `scripts/`, `tests/`: Código fuente ejecutable y suites de pruebas vigentes.

### B. Evidencia Histórica (Solo Lectura / Contexto Pasado)

- `docs/audits/`: Diagnósticos, auditorías fechadas y snapshots de hitos previos.

> [!IMPORTANT]
> **Regla de Oro:** **NUNCA inferir el estado actual, rutas de secretos o configuración vigente desde `docs/audits/`**.
> Por ejemplo, referencias pasadas a `pokedex/production` en auditorías son evidencia histórica. La configuración operativa actual utiliza estrictamente **`pokedex/prod`** y **`pokedex/preprod`**.

---

## 2. Markdown Quality Gate Obligatorio

Cada vez que un agente o skill cree, modifique o actualice cualquier archivo Markdown (`.md`), debe ejecutar:

```bash
npm run lint:md -- <archivos-modificados>
```

No se considerará terminada ninguna tarea que deje errores `MDxxx` pendientes de resolución.
