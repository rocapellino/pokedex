---
name: repo-testing
description: "Gobernar la estrategia de pruebas: pirámide, taxonomía de 12 estados, test surface y brechas de cobertura. Usar al agregar, mover o eliminar tests, ante tests lentos o inestables, o para encontrar flujos sin cobertura."
---

# repo-testing

## Objetivo

Gobernar la estrategia integral de pruebas automatizadas en `rocapellino/pokedex`, asegurando determinismo, aislamiento, cobertura de caminos críticos y gates de calidad confiables desde pruebas unitarias locales hasta simulaciones de producción en clústeres reales.

## Alcance y Verificaciones de Dominio

- **Pirámide de Pruebas y Tipologías:**
  - **Unitarias de Aplicación:** Lógica de negocio, validaciones y transformaciones (`tests/contracts.test.ts`, `tests/frontend/modal_components.test.ts`).
  - **Integración de Servicios:** Endpoints Express, almacenamiento Drizzle/Postgres, middleware y caché Redis con fallback (`tests/integration/concurrency.test.ts`, `tests/integration/storage.test.ts`, `tests/integration/version_endpoint.test.ts`, `tests/integration/http_middleware.test.ts`).
  - **Policy-as-Test & Gobernanza:** Verificación de contratos declarativos de infraestructura, OpenTofu, Ansible, Helm, Vault, Kyverno y GitOps (`tests/security/*`, `tests/gitops/*`, `tests/doc_governance.test.ts`). Deben tratarse como tests de arquitectura y configuración, no como cobertura de código de backend.
  - **Fuzz Testing (Smoke Fuzz):** Iteraciones acotadas sobre parsing de payloads y tokens (`tests/fuzz/fuzzing.test.ts`), ejecutadas en CI con `npm run test:fuzz`. No existe fuzz programado ni de mutación profunda; si se necesitara, sería una propuesta nueva con su workflow y un parámetro de iteraciones.
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
- **Protocolo de Depuración:** Toda eliminación, fusión o movimiento de tests sigue el [protocolo único de depuración](../_shared/cleanup-protocol.md) con el vocabulario de 12 estados de esta skill.
  *Regla estricta:* Ningún test se elimina automáticamente en primera pasada ni únicamente porque no se ejecute (primero se investiga si obedece a un pipeline desconfigurado o test abandonado).
- **Gobernanza de Superficie de Testing (Test Surface Inventory):**
  - **Arquitectura Derivada y Reconciliable:** El código en `tests/` y `package.json` es la Fuente Única de Verdad (SSOT). La superficie se documenta y audita mediante dos artefactos gobernados:
    - `docs/testing/test-surface.json`: SSOT machine-readable con metadatos, SHA-256, conteo de casos y trazabilidad CI.
    - `docs/testing/test-surface.md`: Catálogo legible para humanos con tablas agrupadas por suite, dominio y desglose granular de casos.
  - **Granularidad Dual (Suites y Casos Internos):** El inventario no se limita al archivo; desglosa cada bloque `test('...')` o `it('...')` para diagnosticar God Test Files monolíticos (ej. `iac_baseline_security.test.ts`), suites infladas o pruebas sin aserciones.
  - **Ciclo de Reconciliación Automatizado:**
    `DISCOVER` (escaneo de `tests/`) → `NORMALIZE` (clasificación y extracción) → `COMPARE` (cálculo de drift contra `test-surface.json`) → `RECONCILE` (detección de altas/bajas/cambios) → `DOCUMENT` (actualización de catálogos) → `VALIDATE` (paridad estricta y Markdown Quality Gate).
  - **Taxonomía de Estados de Reconciliación:**
    - *Detectados por `npm run test:surface:check` y documentados en `docs/testing/test-surface.md`:* `NEW_TEST_FILE` (archivo de test no registrado), `REMOVED_TEST_FILE` (archivo eliminado que aún figura en el catálogo), `COUNT_CHANGED` (variación en la cantidad de casos), `MODIFIED` (cambio en el hash SHA-256) y `ORPHAN` (test en disco no cubierto por ningún script ni workflow).
    - *Clasificaciones manuales del agente (no las emite el script):* `RENAMED` (archivo reubicado entre suites), `DESCRIPTION_DRIFT` (desalineación entre el propósito documentado y las aserciones reales), `UNEXECUTED` (test presente en scripts npm pero no integrado en ningún workflow) y `STALE_REFERENCE` (referencia en documentación a un archivo o caso inexistente).
  - **Prevención de Drift en CI:** Ejecución obligatoria de `npm run test:surface:check` como Policy-as-Test contractual en `tests/contracts.test.ts` y script `validate`.
- **Validación Canónica en Kind:** Uso de clústeres Kind en CI (`infra.yaml`) para verificar despliegues reales de Helm antes de promover a GitOps.

## Comandos

- `/repo-testing`: Auditoría integral de la suite, taxonomía de 12 estados y pirámide de pruebas.
- `/repo-testing surface`: Diagnóstico y visualización del inventario de superficie y drift actual.
- `/repo-testing surface check`: Verificación estricta de paridad (`npm run test:surface:check`); falla con exit 1 ante drift.
- `/repo-testing surface update`: Regeneración y reconciliación automática de `test-surface.json` y `test-surface.md`.
- `/repo-testing audit`: Inventario exhaustivo y diagnóstico de duplicación, lentitud y antipatrones.
- `/repo-testing coverage`: Análisis de cobertura de líneas, branches y funciones (`coverage/lcov.info`).
- `/repo-testing gaps`: Detección de brechas de cobertura (`TEST_COVERAGE_GAP`) frente a `apps/backend/src`.
- `/repo-testing api`: Ejecución y diagnóstico de tests de integración de API y contratos.
- `/repo-testing e2e`: Evaluación de flujos de usuario completos y accesibilidad en frontend.
- `/repo-testing security`: Ejecución de tests de contratos de seguridad y políticas.

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Si se requiere reestructurar suites o añadir nuevos frameworks, modelar la propuesta con [change-plan.md](../_shared/change-plan.md).
