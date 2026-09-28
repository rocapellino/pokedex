---
name: repo-testing
description: Gobernar la estrategia de pruebas desde unitarias hasta producción simulada.
---

# repo-testing

## Objetivo

Gobernar la estrategia integral de pruebas automatizadas en `rocapellino/pokedex`, asegurando determinismo, aislamiento, cobertura de caminos críticos y gates de calidad confiables desde pruebas unitarias locales hasta simulaciones de producción en clústeres reales.

## Alcance y Verificaciones de Dominio

- **Pirámide de Pruebas y Tipologías:**
  - **Unitarias de Aplicación:** Lógica de negocio, validaciones y transformaciones (`tests/contracts.test.ts`, `tests/frontend/modal_components.test.ts`).
  - **Integración de Servicios:** Endpoints Express, almacenamiento Drizzle/Postgres, middleware y caché Redis con fallback (`tests/api-limits.test.ts`, `tests/concurrency.test.ts`, `tests/storage.test.ts`, `tests/version.test.ts`).
  - **Policy-as-Test & Gobernanza:** Verificación de contratos declarativos de infraestructura, OpenTofu, Ansible, Helm, Vault, Kyverno y GitOps (`tests/security/*`, `tests/gitops/*`, `tests/doc_governance.test.ts`). Deben tratarse como tests de arquitectura y configuración, no como cobertura de código de backend.
  - **Fuzz Testing Diferenciado:**
    - *Nivel PR (Smoke Fuzz):* Iteraciones acotadas sobre parsing de payloads y tokens (`tests/fuzzing.test.ts`).
    - *Nivel Nightly / Scheduled (Deep Mutation Fuzz):* Mutación profunda y payloads caóticos de mayor duración.
  - **E2E & Accesibilidad:** Navegación en navegador mediante Playwright (`tests/e2e/*.spec.ts`) y validación WCAG 2.1 AA (`@axe-core/playwright`).
  - **Rendimiento & Carga:** Pruebas k6 (`tests/performance/k6_stress_test.js`) y auditorías Lighthouse CI (`lhci`).
- **Modelo de Análisis Sistemático de Tests:**
  - **Taxonomía de 12 Estados:**
    - `KEEP`: Válido, atómico, rápido y con alto valor de garantía.
    - `KEEP_IMPROVE`: Aporta valor pero su aserto, tipado o aislamiento puede mejorarse.
    - `DUPLICATE`: Comprueba exactamente la misma invariante que otro test en el mismo nivel.
    - `REDUNDANT`: La garantía ya está dada de forma más económica y determinista en un nivel inferior.
    - `OBSOLETE`: Valida comportamiento o artefactos retirados.
    - `BROKEN`: Falla por problema del test y no por defecto del código bajo prueba.
    - `FLAKY`: Resultado inestable dependiente de concurrencia, red o estado residual.
    - `SLOW`: Valor válido pero tiempo de ejecución desproporcionado (candidato a ejecución condicional).
    - `MOVE`: Ubicación o suite incorrecta (ej. tests monolíticos o mezclas indebidas).
    - `MERGE`: Múltiples asertos fragmentados que ameritan consolidación.
    - `DELETE`: Sin valor funcional o sin asertos reales.
    - `REVIEW`: Evidencia insuficiente para determinar su necesidad automáticamente.
  - **Detección de Antipatrones de Testing:**
    - *God Test Files:* Archivos monolíticos heterogéneos que acumulan responsabilidades dispares (candidatos a modularización temática).
    - *Tests sin Asertos Reales:* Pruebas cosméticas que se limitan a `expect(true).toBe(true)` sin validar invariantes.
    - *Dependencia de Estado Externo / Temporal:* Tests acoplados a fechas u horas del sistema en lugar de mocks deterministas.
    - *Mocks No Herméticos:* Mocks que no limpian su estado residual entre tests.
    - *Fixtures Huérfanos:* Archivos de datos o mocks en `tests/` que ningún test consume.
- **Relación Tests vs. Código Fuente:**
  - Mapeo bidireccional entre módulos en `apps/backend/src/` y sus suites asociadas.
  - Identificación de brechas de cobertura (`TEST_COVERAGE_GAP`) en flujos críticos no testeados.
- **Protocolo de Gobernanza en 7 Fases:**
  `1. DISCOVER` (inventario) → `2. CLASSIFY` (taxonomía) → `3. EVIDENCE` (matriz de consumidores y código cubierto) → `4. PROPOSE` (plan / finding) → `5. APPROVE` (revisión humana) → `6. EXECUTE` (refactor / consolidación) → `7. VALIDATE` (Quality Gates 100% PASS).
  *Regla estricta:* Ningún test se elimina automáticamente en primera pasada ni únicamente porque no se ejecute (primero se investiga si obedece a un pipeline desconfigurado o test abandonado).
- **Validación Canónica en Kind:** Uso de clústeres Kind en CI (`infra.yaml`) para verificar despliegues reales de Helm antes de promover a GitOps.

## Comandos

- `/repo-testing`: Auditoría integral de la suite, taxonomía de 12 estados y pirámide de pruebas.
- `/repo-testing audit`: Inventario exhaustivo y diagnóstico de duplicación, lentitud y antipatrones.
- `/repo-testing coverage`: Análisis de cobertura de líneas, branches y funciones (`coverage/lcov.info`).
- `/repo-testing gaps`: Detección de brechas de cobertura (`TEST_COVERAGE_GAP`) frente a `apps/backend/src`.
- `/repo-testing api`: Ejecución y diagnóstico de tests de integración de API y contratos.
- `/repo-testing e2e`: Evaluación de flujos de usuario completos y accesibilidad en frontend.
- `/repo-testing security`: Ejecución de tests de contratos de seguridad y políticas.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si se requiere reestructurar suites o añadir nuevos frameworks, modelar la propuesta con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (planes de prueba, reportes de cobertura) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
