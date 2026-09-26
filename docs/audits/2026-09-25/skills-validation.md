# 🤖 Auditoría y Validación del Catálogo de Skills Operativas (.agents/skills/)

> **Fecha:** 2026-09-25
> **Estado:** COMPLETADO
> **Alcance:** 17 Skills Operativas y Módulos Compartidos (`.agents/skills/`)
> **Marco Normativo:** `AGENTS.md` (Reglas Operativas para Agentes de IA) y `_shared/change-impact-matrix.md`.

---

## 📑 Resumen Ejecutivo

El catálogo de skills alojado en `.agents/skills/` constituye la base de conocimiento y orquestación procedural de los agentes de IA (Antigravity) que colaboran en el repositorio Pokédex.

Esta auditoría evaluó:

1. **Adherencia a `AGENTS.md`:** Demarcación SSOT actual vs. evidencia histórica (`docs/audits/`), calidad de Markdown y política de idioma español.
2. **Vigencia de Referencias Técnicas:** Ausencia de dependencias de scripts retirados o rutas de secretos legadas.
3. **Alineación con la Matriz de Impacto:** Despacho condicional eficiente para minimizar el costo de validación de CI.

**Resultado de la Auditoría:**
El 100% de las 17 skills cumple de manera estricta con las directivas vigentes. No se encontraron enlaces rotos, comandos obsoletos ni referencias a secretos legados.

---

## 1. Evaluación del Catálogo Canónico de Skills

| Skill | Dominio | Propósito Operativo | Comandos Invocados | Cumplimiento |
| :--- | :--- | :--- | :--- | :--- |
| **`repo-context`** | Core | Reconstrucción de contexto operativo antes de cambios. | `git status`, `git log` | 🟢 100% |
| **`repo-lifecycle`** | Core | Orquestador integral del ciclo de vida y despacho. | Invocación condicional | 🟢 100% |
| **`repo-impact`** | Core | Evaluación de radio de impacto previo a modificaciones. | `git diff --name-only` | 🟢 100% |
| **`repo-audit`** | Core | Coordinador de auditorías de lectura y diagnósticos. | Scripts de inspección | 🟢 100% |
| **`repo-quality`** | Engineering | Calidad de código, modularidad y prevención de God Files. | `npm run lint`, `npm run typecheck` | 🟢 100% |
| **`repo-architecture`** | Engineering | Coherencia del sistema, plataforma e IaC. | Helm lint, Kubeconform | 🟢 100% |
| **`repo-testing`** | Engineering | Estrategia y ejecución de la pirámide de pruebas. | `npm test`, `npm run test:fuzz` | 🟢 100% |
| **`repo-dependencies`** | Engineering | Gobernanza del árbol de dependencias npm y CVEs. | `npm audit`, `npm outdated` | 🟢 100% |
| **`repo-security`** | Delivery & Sec | DevSecOps, secretos, Cilium L7 y supply chain. | `npm run probe:security:egress` | 🟢 100% |
| **`repo-ci`** | Delivery & Sec | Optimización y validación de pipelines de GitHub Actions. | Inspección de `.github/workflows` | 🟢 100% |
| **`repo-pr`** | Delivery & Sec | Preparación y revisión de Pull Requests según gates. | `git diff`, checklists de PR | 🟢 100% |
| **`repo-release`** | Delivery & Sec | Verificación de readiness previo al corte de release. | `npm run gitops:verify-parity` | 🟢 100% |
| **`repo-docs`** | Governance | Coherencia documental, claims verification y enlaces. | `npm run lint:md` | 🟢 100% |
| **`repo-maintenance`** | Governance | Health checks periódicos y backlog accionable. | Inspección de rotación y logs | 🟢 100% |
| **`repo-refactor`** | Governance | Diseño e implementación de refactors incrementales. | Suites unitarias y de integración | 🟢 100% |
| **`repo-modernize`** | Governance | Evaluación costo-riesgo-beneficio de modernización. | Mapeo tecnológico y ADRs | 🟢 100% |
| **`repo-metrics`** | Governance | Telemetría auxiliar y seguimiento de deuda técnica. | Métricas SonarQube / LCOV | 🟢 100% |

---

## 2. Verificación de Reglas Operativas Obligatorias

### 2.1. Demarcación Estricta SSOT vs. Evidencia Histórica

- **Regla:** Ninguna skill debe inferir configuración vigente desde `docs/audits/`.
- **Resultado:** Verificado en `.agents/skills/_shared/methodology.md:53`. Todas las skills extraen la configuración real de `gitops/environments/`, `infra/` y `apps/`.
- **Casos de Referencia Auditados:** Ninguna skill hace uso de la ruta histórica `pokedex/production` o del script retirado `scripts/seal-secret.ts`.

### 2.2. Política Transversal de Idioma

- **Regla:** Toda comunicación humana, reportes, mensajes de commit y descripciones deben redactarse en español ([`_shared/language-policy.md`](../.agents/skills/_shared/language-policy.md)).
- **Resultado:** Cumplimiento total. Todos los artefactos de auditoría y salidas operativas mantienen el idioma español como estándar unificado.

### 2.3. Markdown Quality Gate

- **Regla:** Todo cambio a archivos `.md` debe ser validado con `npm run lint:md -- <archivos>` sin errores `MDxxx` residuales.
- **Resultado:** El script `scripts/lint-markdown.ts` es invocado de manera consistente como Quality Gate antes de finalizar cualquier tarea.

---

## 3. Conclusión de Validación de Skills

El ecosistema de skills de Pokédex se encuentra completamente alineado, saludable y validado. Proporciona una guía operativa deterministicamente consistente para todas las intervenciones de ingeniería en el repositorio.
