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
> **Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio.**
> Por ejemplo, referencias pasadas a `pokedex/production` o snapshots de validación previa en auditorías son evidencia histórica. La configuración operativa actual utiliza estrictamente **`pokedex/prod`** y **`pokedex/preprod`**.

---

## 2. Markdown Quality Gate Obligatorio

Cada vez que un agente o skill cree, modifique o actualice cualquier archivo Markdown (`.md`), debe ejecutar:

```bash
npm run lint:md -- <archivos-modificados>
```

No se considerará terminada ninguna tarea que deje errores `MDxxx` pendientes de resolución.

---

## 3. Catálogo Canónico de Skills y Despacho Condicional

Las skills alojadas en `.agents/skills/` se rigen por el principio de **despacho condicional** según la matriz de impacto ([`_shared/change-impact-matrix.md`](.agents/skills/_shared/change-impact-matrix.md)):

- **Core & Lifecycle:** `repo-context`, `repo-lifecycle`, `repo-impact`, `repo-audit` (coordinador).
- **Engineering:** `repo-quality` (calidad de código, modularidad y prevención de God Files), `repo-architecture` (sistema, plataforma y GitOps), `repo-testing` (pirámide de pruebas), `repo-dependencies` (árbol de paquetes npm y librerías huérfanas).
- **Delivery & Security:** `repo-security` (DevSecOps, secretos, Cilium L7 y supply chain), `repo-ci` (pipelines de GitHub Actions), `repo-pr` (preparación, validación y revisión de PRs), `repo-release` (corte y readiness de versión).
- **Governance & Maintenance:** `repo-docs` (integridad documental y claims verification), `repo-maintenance` (salud periódica, higiene y limpieza segura), `repo-refactor` (diseño de cambios incrementales), `repo-modernize` (evaluación de modernización), `repo-metrics` (telemetría auxiliar).

> [!NOTE]
> Todo cambio debe consultar la *Change Impact Matrix* antes de ejecutar suites completas de validación. Los cambios puramente documentales aplican *Fast Track* (`repo-docs` + `npm run lint:md`).

---

## 4. Política Transversal de Idioma

El idioma operativo para toda comunicación humana (Pull Requests, descripciones, títulos, comentarios de revisión, issues, reportes, planes y respuestas) es estrictamente el **español** ([`_shared/language-policy.md`](.agents/skills/_shared/language-policy.md)).

Los identificadores técnicos, nombres de herramientas (GitHub Actions, Helm, pre-commit, ArgoCD), comandos de terminal, código y nombres de archivos se preservan en inglés.
