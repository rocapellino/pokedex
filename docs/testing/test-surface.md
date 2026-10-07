# Inventario y Gobernanza de Superficie de Testing

> Documento generado automáticamente por `scripts/test-surface.ts`.
> Fuente Única de Verdad machine-readable: [`test-surface.json`](test-surface.json).

---

## 1. Resumen Ejecutivo de la Superficie

Este catálogo proporciona el inventario exhaustivo, auditable y granular de toda la superficie de pruebas en `rocapellino/pokedex`. Cada archivo y caso de prueba está tipificado, vinculado a sus artefactos bajo prueba, runner de ejecución y canal de CI/CD.

| Métrica | Valor Registrado |
| :--- | :--- |
| **Total de Archivos en `tests/`** | **165** |
| **Archivos de Test Automatizados** | 108 |
| **Scripts de Carga / Rendimiento (k6)** | 1 |
| **Archivos de Soporte / Entorno (Fixtures)** | 56 |
| **Total de Casos de Prueba Identificados** | **907** |
| **Líneas de Código de Pruebas** | 24.751 |
| **Tamaño Total de la Suite** | 1050.7 KB |
| **Suites Especializadas Gobernadas** | 10 |
| **Última Sincronización** | 2026-10-07T22:01:41.206Z |

---

## 2. Matriz Canónica de Suites de Testing

| Suite | Nombre | Runner | Comando Principal | Archivos | Casos | Propósito |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **`unit`** | Pruebas Unitarias de Aplicación | `node:test (tsx)` | `npm run test:unit` | 20 | 140 | Pruebas de alta velocidad y aislamiento sobre servicios de dominio, autenticación, caché y repositorios. |
| **`integration`** | Pruebas de Integración de API y Servicios | `node:test (tsx)` | `npm run test:integration` | 4 | 26 | Pruebas de persistencia PostgreSQL/Drizzle, concurrencia transaccional, rate limits y endpoint de versión. |
| **`security`** | Seguridad, Hardening y DevSecOps | `node:test (tsx)` | `npm run test:security` | 29 | 234 | Evaluación de políticas de admisión, Network Policies Cilium L7, cifrado DR, secretos Vault y contratos IaC. |
| **`gitops`** | Contratos de GitOps y Despliegue | `node:test (tsx)` | `npm run test:gitops` | 6 | 41 | Inmutabilidad de imágenes por digest SHA-256 en ArgoCD y paridad estricta entre entornos dev/preprod/prod. |
| **`frontend`** | Componentes y Controladores Frontend | `node:test + JSDOM` | `npm test` | 83 | 252 | Pruebas sobre controladores DOM de backoffice, toasts interactivos y componentes modales accesibles. |
| **`e2e`** | Pruebas End-to-End y Accesibilidad | `playwright` | `npm run test:e2e` | 2 | 21 | Simulación completa de flujos de usuario en Chromium y auditorías de accesibilidad WCAG 2.1 AA con Axe-core. |
| **`performance`** | Rendimiento y Carga (k6) | `k6` | `k6 run tests/performance/k6_stress_test.js` | 1 | 4 | Pruebas de estrés y límites de latencia HTTP bajo concurrencia continua respetando presupuestos de rate limit. |
| **`ci`** | Paridad y Gobernanza de CI/CD | `node:test (tsx)` | `npm test` | 2 | 14 | Verificación estructural de consistencia, timeouts y parámetros de ejecución en pipelines de GitHub Actions. |
| **`fuzz`** | API Fuzzing y Pruebas Adversariales | `node:test (tsx)` | `npm run test:fuzz` | 1 | 7 | Generación caótica y mutacional de payloads HTTP, validación de boundaries y resiliencia ante inputs malformados. |
| **`governance`** | Gobernanza y Contratos de Plataforma (Root) | `node:test (tsx)` | `npm test` | 14 | 168 | Contratos de tipos, gobernanza documental, reglas de protección de rama, pentesting e impacto de CI. |

---

## 3. Catálogo de Archivos de Prueba

A continuación se inventarían todos los archivos que componen la superficie de pruebas, indicando su suite, tipo, runner, casos que contiene y artefactos objetivo.

| Archivo | Suite | Tipo | Runner | Casos | Líneas | Dominio / Qué Verifica | Comandos |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| [`tests/aas_governance.test.ts`](../../tests/aas_governance.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **10** | 150 | Valida contratos de gobernanza de skills y agents en aas-stack.json, stacks requeridos y catálogo de herramientas. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/audit_freshness.test.ts`](../../tests/audit_freshness.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **6** | 91 | Comprueba la política de demarcación de auditorías históricas en docs/audits/ y asegura que no sean interpretadas como SSOT vigente. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ci_impact.test.ts`](../../tests/ci_impact.test.ts) | `governance` | Contract / CI Matrix | `node:test (tsx)` | **36** | 853 | Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ci_workflow_governance.test.ts`](../../tests/ci_workflow_governance.test.ts) | `governance` | Automated Test | `node:test (tsx)` | **23** | 563 | Suite de pruebas governance: ci_workflow_governance.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ci/lighthouse.test.ts`](../../tests/ci/lighthouse.test.ts) | `ci` | Automated Test | `node:test (tsx)` | **10** | 194 | Suite de pruebas ci: lighthouse.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ci/workflow_run_parity.test.ts`](../../tests/ci/workflow_run_parity.test.ts) | `ci` | Contract / CI | `node:test (tsx)` | **4** | 188 | Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/contracts.test.ts`](../../tests/contracts.test.ts) | `governance` | Contract / Types | `node:test (tsx)` | **3** | 100 | Valida compatibilidad estructural estricta entre las interfaces de tipos de backend y frontend. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/doc_governance.test.ts`](../../tests/doc_governance.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **2** | 131 | Asegura que los ADRs y especificaciones técnicas cumplan con el formato canónico, encabezados y metadatos obligatorios. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/e2e/backoffice.spec.ts`](../../tests/e2e/backoffice.spec.ts) | `e2e` | E2E | `playwright` | **6** | 123 | Flujos completos de administración en navegador: login con token, CRUD de Pokémon, paginación y modal de confirmación. | `npm run test:e2e`, `npm run test:a11y` |
| [`tests/e2e/pokedex.spec.ts`](../../tests/e2e/pokedex.spec.ts) | `e2e` | E2E / a11y | `playwright` | **15** | 373 | Flujos de usuario en navegador: carga de catálogo, filtro con debounce, conmutador de tema oscuro y auditoría Axe-core WCAG 2.1 AA. | `npm run test:e2e`, `npm run test:a11y` |
| [`tests/frontend/backoffice_controller.test.ts`](../../tests/frontend/backoffice_controller.test.ts) | `frontend` | Component / Unit | `node:test (tsx)` | **28** | 521 | Valida eventos de DOM, renderizado de tablas, modales interactivos y toasts en el backoffice usando entorno JSDOM. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/backoffice_env.ts`](../../tests/frontend/backoffice_env.ts) | `frontend` | Helper / Environment | `none` | **0** | 99 | Módulo de arranque de navegador simulado con JSDOM para ejecución determinista y cobertura estática V8 en pruebas frontend. | *(Helper)* |
| [`tests/frontend/catalog_ability_controller.test.ts`](../../tests/frontend/catalog_ability_controller.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **10** | 199 | Suite de pruebas frontend: catalog_ability_controller.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/catalog_class_controller.test.ts`](../../tests/frontend/catalog_class_controller.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **10** | 214 | Suite de pruebas frontend: catalog_class_controller.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/catalog_fetch.test.ts`](../../tests/frontend/catalog_fetch.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **3** | 74 | Suite de pruebas frontend: catalog_fetch.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/catalog_filters_controller.test.ts`](../../tests/frontend/catalog_filters_controller.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **24** | 452 | Suite de pruebas frontend: catalog_filters_controller.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/catalog_filters.test.ts`](../../tests/frontend/catalog_filters.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **12** | 141 | Suite de pruebas frontend: catalog_filters.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/catalog_sort.test.ts`](../../tests/frontend/catalog_sort.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **11** | 170 | Suite de pruebas frontend: catalog_sort.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/css_cache_busting.test.ts`](../../tests/frontend/css_cache_busting.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **4** | 47 | Suite de pruebas frontend: css_cache_busting.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/filter_url.test.ts`](../../tests/frontend/filter_url.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **15** | 138 | Suite de pruebas frontend: filter_url.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/filters_panel.test.ts`](../../tests/frontend/filters_panel.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **10** | 169 | Suite de pruebas frontend: filters_panel.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/fonts_selfhosted.test.ts`](../../tests/frontend/fonts_selfhosted.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **4** | 78 | Suite de pruebas frontend: fonts_selfhosted.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/golden/badge-single.html`](../../tests/frontend/golden/badge-single.html) | `frontend` | Helper | `none` | **0** | 2 | Suite de pruebas frontend: badge-single.html. | *(Helper)* |
| [`tests/frontend/golden/badges-fallback.html`](../../tests/frontend/golden/badges-fallback.html) | `frontend` | Helper | `none` | **0** | 2 | Suite de pruebas frontend: badges-fallback.html. | *(Helper)* |
| [`tests/frontend/golden/badges-multi.html`](../../tests/frontend/golden/badges-multi.html) | `frontend` | Helper | `none` | **0** | 2 | Suite de pruebas frontend: badges-multi.html. | *(Helper)* |
| [`tests/frontend/golden/card-charizard.html`](../../tests/frontend/golden/card-charizard.html) | `frontend` | Helper | `none` | **0** | 48 | Suite de pruebas frontend: card-charizard.html. | *(Helper)* |
| [`tests/frontend/golden/card-legendario.html`](../../tests/frontend/golden/card-legendario.html) | `frontend` | Helper | `none` | **0** | 48 | Suite de pruebas frontend: card-legendario.html. | *(Helper)* |
| [`tests/frontend/golden/card-mitico.html`](../../tests/frontend/golden/card-mitico.html) | `frontend` | Helper | `none` | **0** | 48 | Suite de pruebas frontend: card-mitico.html. | *(Helper)* |
| [`tests/frontend/golden/card-pikachu.html`](../../tests/frontend/golden/card-pikachu.html) | `frontend` | Helper | `none` | **0** | 48 | Suite de pruebas frontend: card-pikachu.html. | *(Helper)* |
| [`tests/frontend/golden/card-sparse.html`](../../tests/frontend/golden/card-sparse.html) | `frontend` | Helper | `none` | **0** | 48 | Suite de pruebas frontend: card-sparse.html. | *(Helper)* |
| [`tests/frontend/golden/empty-state-plain.html`](../../tests/frontend/golden/empty-state-plain.html) | `frontend` | Helper | `none` | **0** | 8 | Suite de pruebas frontend: empty-state-plain.html. | *(Helper)* |
| [`tests/frontend/golden/empty-state-retry.html`](../../tests/frontend/golden/empty-state-retry.html) | `frontend` | Helper | `none` | **0** | 8 | Suite de pruebas frontend: empty-state-retry.html. | *(Helper)* |
| [`tests/frontend/golden/modal-base-stats-full.html`](../../tests/frontend/golden/modal-base-stats-full.html) | `frontend` | Helper | `none` | **0** | 36 | Suite de pruebas frontend: modal-base-stats-full.html. | *(Helper)* |
| [`tests/frontend/golden/modal-base-stats-none.html`](../../tests/frontend/golden/modal-base-stats-none.html) | `frontend` | Helper | `none` | **0** | 2 | Suite de pruebas frontend: modal-base-stats-none.html. | *(Helper)* |
| [`tests/frontend/golden/modal-base-stats-partial.html`](../../tests/frontend/golden/modal-base-stats-partial.html) | `frontend` | Helper | `none` | **0** | 32 | Suite de pruebas frontend: modal-base-stats-partial.html. | *(Helper)* |
| [`tests/frontend/golden/modal-connector-method.html`](../../tests/frontend/golden/modal-connector-method.html) | `frontend` | Helper | `none` | **0** | 9 | Suite de pruebas frontend: modal-connector-method.html. | *(Helper)* |
| [`tests/frontend/golden/modal-connector-plain.html`](../../tests/frontend/golden/modal-connector-plain.html) | `frontend` | Helper | `none` | **0** | 2 | Suite de pruebas frontend: modal-connector-plain.html. | *(Helper)* |
| [`tests/frontend/golden/modal-connector-undefined.html`](../../tests/frontend/golden/modal-connector-undefined.html) | `frontend` | Helper | `none` | **0** | 2 | Suite de pruebas frontend: modal-connector-undefined.html. | *(Helper)* |
| [`tests/frontend/golden/modal-detail-charizard-mega.html`](../../tests/frontend/golden/modal-detail-charizard-mega.html) | `frontend` | Helper | `none` | **0** | 339 | Suite de pruebas frontend: modal-detail-charizard-mega.html. | *(Helper)* |
| [`tests/frontend/golden/modal-detail-eevee.html`](../../tests/frontend/golden/modal-detail-eevee.html) | `frontend` | Helper | `none` | **0** | 168 | Suite de pruebas frontend: modal-detail-eevee.html. | *(Helper)* |
| [`tests/frontend/golden/modal-detail-pikachu.html`](../../tests/frontend/golden/modal-detail-pikachu.html) | `frontend` | Helper | `none` | **0** | 162 | Suite de pruebas frontend: modal-detail-pikachu.html. | *(Helper)* |
| [`tests/frontend/golden/modal-detail-sparse.html`](../../tests/frontend/golden/modal-detail-sparse.html) | `frontend` | Helper | `none` | **0** | 86 | Suite de pruebas frontend: modal-detail-sparse.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-branched-leaves.html`](../../tests/frontend/golden/modal-evolution-branched-leaves.html) | `frontend` | Helper | `none` | **0** | 69 | Suite de pruebas frontend: modal-evolution-branched-leaves.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-branched-prefix.html`](../../tests/frontend/golden/modal-evolution-branched-prefix.html) | `frontend` | Helper | `none` | **0** | 79 | Suite de pruebas frontend: modal-evolution-branched-prefix.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-flat-1.html`](../../tests/frontend/golden/modal-evolution-flat-1.html) | `frontend` | Helper | `none` | **0** | 21 | Suite de pruebas frontend: modal-evolution-flat-1.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-flat-3.html`](../../tests/frontend/golden/modal-evolution-flat-3.html) | `frontend` | Helper | `none` | **0** | 63 | Suite de pruebas frontend: modal-evolution-flat-3.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-linear-tree.html`](../../tests/frontend/golden/modal-evolution-linear-tree.html) | `frontend` | Helper | `none` | **0** | 63 | Suite de pruebas frontend: modal-evolution-linear-tree.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-no-tree.html`](../../tests/frontend/golden/modal-evolution-no-tree.html) | `frontend` | Helper | `none` | **0** | 21 | Suite de pruebas frontend: modal-evolution-no-tree.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-single-tree.html`](../../tests/frontend/golden/modal-evolution-single-tree.html) | `frontend` | Helper | `none` | **0** | 21 | Suite de pruebas frontend: modal-evolution-single-tree.html. | *(Helper)* |
| [`tests/frontend/golden/modal-evolution-undefined.html`](../../tests/frontend/golden/modal-evolution-undefined.html) | `frontend` | Helper | `none` | **0** | 21 | Suite de pruebas frontend: modal-evolution-undefined.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-body-none.html`](../../tests/frontend/golden/modal-mega-body-none.html) | `frontend` | Helper | `none` | **0** | 1 | Suite de pruebas frontend: modal-mega-body-none.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-body-two.html`](../../tests/frontend/golden/modal-mega-body-two.html) | `frontend` | Helper | `none` | **0** | 174 | Suite de pruebas frontend: modal-mega-body-two.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-section-one.html`](../../tests/frontend/golden/modal-mega-section-one.html) | `frontend` | Helper | `none` | **0** | 89 | Suite de pruebas frontend: modal-mega-section-one.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-section-two.html`](../../tests/frontend/golden/modal-mega-section-two.html) | `frontend` | Helper | `none` | **0** | 171 | Suite de pruebas frontend: modal-mega-section-two.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-stats-no-base.html`](../../tests/frontend/golden/modal-mega-stats-no-base.html) | `frontend` | Helper | `none` | **0** | 44 | Suite de pruebas frontend: modal-mega-stats-no-base.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-stats-with-base.html`](../../tests/frontend/golden/modal-mega-stats-with-base.html) | `frontend` | Helper | `none` | **0** | 44 | Suite de pruebas frontend: modal-mega-stats-with-base.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-toggle-none.html`](../../tests/frontend/golden/modal-mega-toggle-none.html) | `frontend` | Helper | `none` | **0** | 1 | Suite de pruebas frontend: modal-mega-toggle-none.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-toggle-one.html`](../../tests/frontend/golden/modal-mega-toggle-one.html) | `frontend` | Helper | `none` | **0** | 7 | Suite de pruebas frontend: modal-mega-toggle-one.html. | *(Helper)* |
| [`tests/frontend/golden/modal-mega-toggle-two.html`](../../tests/frontend/golden/modal-mega-toggle-two.html) | `frontend` | Helper | `none` | **0** | 7 | Suite de pruebas frontend: modal-mega-toggle-two.html. | *(Helper)* |
| [`tests/frontend/golden/modal-node-bare.html`](../../tests/frontend/golden/modal-node-bare.html) | `frontend` | Helper | `none` | **0** | 14 | Suite de pruebas frontend: modal-node-bare.html. | *(Helper)* |
| [`tests/frontend/golden/modal-node-catalog-types.html`](../../tests/frontend/golden/modal-node-catalog-types.html) | `frontend` | Helper | `none` | **0** | 14 | Suite de pruebas frontend: modal-node-catalog-types.html. | *(Helper)* |
| [`tests/frontend/golden/modal-node-current.html`](../../tests/frontend/golden/modal-node-current.html) | `frontend` | Helper | `none` | **0** | 14 | Suite de pruebas frontend: modal-node-current.html. | *(Helper)* |
| [`tests/frontend/golden/modal-node-other-method.html`](../../tests/frontend/golden/modal-node-other-method.html) | `frontend` | Helper | `none` | **0** | 14 | Suite de pruebas frontend: modal-node-other-method.html. | *(Helper)* |
| [`tests/frontend/golden/modal-node-special-chars.html`](../../tests/frontend/golden/modal-node-special-chars.html) | `frontend` | Helper | `none` | **0** | 14 | Suite de pruebas frontend: modal-node-special-chars.html. | *(Helper)* |
| [`tests/frontend/golden/rows-admin-empty.html`](../../tests/frontend/golden/rows-admin-empty.html) | `frontend` | Helper | `none` | **0** | 1 | Suite de pruebas frontend: rows-admin-empty.html. | *(Helper)* |
| [`tests/frontend/golden/rows-admin.html`](../../tests/frontend/golden/rows-admin.html) | `frontend` | Helper | `none` | **0** | 151 | Suite de pruebas frontend: rows-admin.html. | *(Helper)* |
| [`tests/frontend/golden/state-no-results.html`](../../tests/frontend/golden/state-no-results.html) | `frontend` | Helper | `none` | **0** | 8 | Suite de pruebas frontend: state-no-results.html. | *(Helper)* |
| [`tests/frontend/golden/state-table-empty.html`](../../tests/frontend/golden/state-table-empty.html) | `frontend` | Helper | `none` | **0** | 7 | Suite de pruebas frontend: state-table-empty.html. | *(Helper)* |
| [`tests/frontend/golden/state-table-error-special.html`](../../tests/frontend/golden/state-table-error-special.html) | `frontend` | Helper | `none` | **0** | 9 | Suite de pruebas frontend: state-table-error-special.html. | *(Helper)* |
| [`tests/frontend/golden/state-table-error.html`](../../tests/frontend/golden/state-table-error.html) | `frontend` | Helper | `none` | **0** | 9 | Suite de pruebas frontend: state-table-error.html. | *(Helper)* |
| [`tests/frontend/golden/state-table-loading.html`](../../tests/frontend/golden/state-table-loading.html) | `frontend` | Helper | `none` | **0** | 8 | Suite de pruebas frontend: state-table-loading.html. | *(Helper)* |
| [`tests/frontend/html_assertions.ts`](../../tests/frontend/html_assertions.ts) | `frontend` | Helper | `none` | **0** | 27 | Suite de pruebas frontend: html_assertions.ts. | *(Helper)* |
| [`tests/frontend/html_fixtures.ts`](../../tests/frontend/html_fixtures.ts) | `frontend` | Helper | `none` | **0** | 164 | Suite de pruebas frontend: html_fixtures.ts. | *(Helper)* |
| [`tests/frontend/html_guard.test.ts`](../../tests/frontend/html_guard.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **5** | 67 | Suite de pruebas frontend: html_guard.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/html_injection_modals.test.ts`](../../tests/frontend/html_injection_modals.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **6** | 125 | Suite de pruebas frontend: html_injection_modals.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/html_injection.test.ts`](../../tests/frontend/html_injection.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **6** | 76 | Suite de pruebas frontend: html_injection.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/html_parity_modals.test.ts`](../../tests/frontend/html_parity_modals.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **1** | 100 | Suite de pruebas frontend: html_parity_modals.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/html_parity_states.test.ts`](../../tests/frontend/html_parity_states.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **1** | 42 | Suite de pruebas frontend: html_parity_states.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/html_parity.test.ts`](../../tests/frontend/html_parity.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **1** | 62 | Suite de pruebas frontend: html_parity.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/html_set.test.ts`](../../tests/frontend/html_set.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **6** | 54 | Suite de pruebas frontend: html_set.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/html_template.test.ts`](../../tests/frontend/html_template.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **7** | 55 | Suite de pruebas frontend: html_template.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/keyboard_access.test.ts`](../../tests/frontend/keyboard_access.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **7** | 98 | Suite de pruebas frontend: keyboard_access.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/keyboard_navigation.test.ts`](../../tests/frontend/keyboard_navigation.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **4** | 107 | Suite de pruebas frontend: keyboard_navigation.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/mega_env.ts`](../../tests/frontend/mega_env.ts) | `frontend` | Helper | `none` | **0** | 18 | Suite de pruebas frontend: mega_env.ts. | *(Helper)* |
| [`tests/frontend/mega_evolution.test.ts`](../../tests/frontend/mega_evolution.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **22** | 266 | Suite de pruebas frontend: mega_evolution.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/modal_components.test.ts`](../../tests/frontend/modal_components.test.ts) | `frontend` | Component / Unit | `node:test (tsx)` | **19** | 341 | Valida el ciclo de vida de modales accesibles, trampa de foco para teclado (Tab/Shift+Tab), tecla Escape y cierre por backdrop. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/modal_dialog.test.ts`](../../tests/frontend/modal_dialog.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **5** | 90 | Suite de pruebas frontend: modal_dialog.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/nginx_config.test.ts`](../../tests/frontend/nginx_config.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **4** | 217 | Suite de pruebas frontend: nginx_config.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/page_focus.test.ts`](../../tests/frontend/page_focus.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **9** | 155 | Suite de pruebas frontend: page_focus.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/seo_compression.test.ts`](../../tests/frontend/seo_compression.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **3** | 58 | Suite de pruebas frontend: seo_compression.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/skip_link_contrast.test.ts`](../../tests/frontend/skip_link_contrast.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **3** | 69 | Suite de pruebas frontend: skip_link_contrast.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/skip_pagination.test.ts`](../../tests/frontend/skip_pagination.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **7** | 134 | Suite de pruebas frontend: skip_pagination.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/type_badge_contrast.test.ts`](../../tests/frontend/type_badge_contrast.test.ts) | `frontend` | Automated Test | `node:test (tsx)` | **5** | 109 | Suite de pruebas frontend: type_badge_contrast.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/fuzzing.test.ts`](../../tests/fuzzing.test.ts) | `fuzz` | Fuzz | `node:test (tsx)` | **7** | 218 | Ejecuta fuzzing adversarial con mutaciones caóticas de JSON, delimitadores y límites de buffer en endpoints REST. | `npm run test:fuzz`, `npm run test:all` |
| [`tests/gitops/argocd_pinning.test.ts`](../../tests/gitops/argocd_pinning.test.ts) | `gitops` | Contract / GitOps | `node:test (tsx)` | **7** | 248 | Valida pinning estricto por digest SHA-256 en manifiestos de ArgoCD y prohíbe tags mutables (:latest) en dev, preprod y prod. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops` |
| [`tests/gitops/environment_http_contract.test.ts`](../../tests/gitops/environment_http_contract.test.ts) | `gitops` | Automated Test | `node:test (tsx)` | **6** | 157 | Suite de pruebas gitops: environment_http_contract.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops` |
| [`tests/gitops/gitops_architecture.test.ts`](../../tests/gitops/gitops_architecture.test.ts) | `gitops` | Automated Test | `node:test (tsx)` | **6** | 551 | Suite de pruebas gitops: gitops_architecture.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops` |
| [`tests/gitops/image_digest_promotion.test.ts`](../../tests/gitops/image_digest_promotion.test.ts) | `gitops` | Automated Test | `node:test (tsx)` | **7** | 138 | Suite de pruebas gitops: image_digest_promotion.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops` |
| [`tests/gitops/platform_bootstrap_contract.test.ts`](../../tests/gitops/platform_bootstrap_contract.test.ts) | `gitops` | Automated Test | `node:test (tsx)` | **12** | 278 | Suite de pruebas gitops: platform_bootstrap_contract.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops` |
| [`tests/gitops/seed_job_contract.test.ts`](../../tests/gitops/seed_job_contract.test.ts) | `gitops` | Automated Test | `node:test (tsx)` | **3** | 76 | Suite de pruebas gitops: seed_job_contract.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops` |
| [`tests/helpers/argocd.ts`](../../tests/helpers/argocd.ts) | `helpers` | Helper | `none` | **0** | 18 | Suite de pruebas helpers: argocd.ts. | *(Helper)* |
| [`tests/helpers/docs-portal.ts`](../../tests/helpers/docs-portal.ts) | `helpers` | Helper | `none` | **0** | 25 | Suite de pruebas helpers: docs-portal.ts. | *(Helper)* |
| [`tests/helpers/taskfile.ts`](../../tests/helpers/taskfile.ts) | `helpers` | Helper | `none` | **0** | 30 | Suite de pruebas helpers: taskfile.ts. | *(Helper)* |
| [`tests/integration/api-limits.test.ts`](../../tests/integration/api-limits.test.ts) | `integration` | Integration | `node:test (tsx)` | **3** | 43 | Verifica rate limiting global y por endpoint, manejo de peticiones concurrentes y cabeceras X-RateLimit-* con código 429. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:integration` |
| [`tests/integration/concurrency.test.ts`](../../tests/integration/concurrency.test.ts) | `integration` | Integration | `node:test (tsx)` | **1** | 24 | Evalúa mutaciones concurrentes, aislamiento transaccional y prevención de race conditions en actualizaciones del catálogo Pokémon. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:integration` |
| [`tests/integration/storage.test.ts`](../../tests/integration/storage.test.ts) | `integration` | Integration | `node:test (tsx)` | **8** | 124 | Valida operaciones CRUD del repositorio, serialización y resiliencia de la capa de datos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:integration` |
| [`tests/integration/version.test.ts`](../../tests/integration/version.test.ts) | `integration` | Integration | `node:test (tsx)` | **14** | 404 | Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:integration` |
| [`tests/markdown_gate.test.ts`](../../tests/markdown_gate.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **7** | 77 | Verifica el comportamiento del motor de linting de Markdown, reporte de errores MDxxx y mecanismos de auto-fix. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/pentest.test.ts`](../../tests/pentest.test.ts) | `governance` | Security / Pentest | `node:test (tsx)` | **28** | 642 | Ejecuta batería exhaustiva de vectores de ataque: SQLi, NoSQLi, path traversal, XSS, HTTP parameter pollution y headers de seguridad. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/performance/k6_stress_test.js`](../../tests/performance/k6_stress_test.js) | `performance` | Load / Stress | `k6` | **4** | 167 | Prueba de carga k6 que valida umbrales p95/p99 de latencia, tasa de error y respeto de rate limits sin generar 429 espurios. | `k6 run tests/performance/k6_stress_test.js` |
| [`tests/pr_template_governance.test.ts`](../../tests/pr_template_governance.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **6** | 247 | Valida conformidad estricta del cuerpo de PR contra el template físico oficial, impidiendo estructuras arbitrarias o mojibake. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ruleset_contract.test.ts`](../../tests/ruleset_contract.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **3** | 98 | Valida la estructura declarativa y restricciones de protección de rama del ruleset main-protection.json contra el esquema de GitHub. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ruleset_parity.test.ts`](../../tests/ruleset_parity.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **11** | 240 | Verifica la paridad e identifica drift entre el ruleset declarativo local y las reglas activas en la API remota de GitHub. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/security.test.ts`](../../tests/security.test.ts) | `governance` | Security / Application | `node:test (tsx)` | **28** | 444 | Valida cabeceras Helmet (HSTS, CSP, X-Frame-Options), CORS restrictivo, prevención de fuga de información y manejo seguro de errores. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/adr_compliance_contracts.test.ts`](../../tests/security/adr_compliance_contracts.test.ts) | `security` | Contract / Architecture | `node:test (tsx)` | **19** | 833 | Comprueba el cumplimiento de decisiones de arquitectura registradas en ADR-001 a ADR-015 (topología, RBAC, ingress y secrets). | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/ansible_baseline_security.test.ts`](../../tests/security/ansible_baseline_security.test.ts) | `security` | Security / Ansible | `node:test (tsx)` | **12** | 424 | Valida hardening de hosts (UFW, SSH accept-new, usuario devops), inventarios sin colisiones y colecciones fijadas. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/backup_hmac.test.ts`](../../tests/security/backup_hmac.test.ts) | `security` | Automated Test | `node:test (tsx)` | **11** | 193 | Suite de pruebas security: backup_hmac.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/cors_rejection.test.ts`](../../tests/security/cors_rejection.test.ts) | `security` | Automated Test | `node:test (tsx)` | **1** | 34 | Suite de pruebas security: cors_rejection.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/csrf_origin.test.ts`](../../tests/security/csrf_origin.test.ts) | `security` | Automated Test | `node:test (tsx)` | **7** | 99 | Suite de pruebas security: csrf_origin.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/docs_governance_gate.test.ts`](../../tests/security/docs_governance_gate.test.ts) | `security` | Automated Test | `node:test (tsx)` | **2** | 56 | Suite de pruebas security: docs_governance_gate.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/docs_portal_integrity.test.ts`](../../tests/security/docs_portal_integrity.test.ts) | `security` | Contract / Docs | `node:test (tsx)` | **3** | 146 | Valida vínculos internos, anclas, sintaxis y consistencia de navegación en el portal documental. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/dr_backup_security.test.ts`](../../tests/security/dr_backup_security.test.ts) | `security` | Security / Backup | `node:test (tsx)` | **11** | 462 | Valida cifrado AES-256-GCM en reposo de snapshots de base de datos, permisos de archivos y aislamiento de claves. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/dr_e2e_drill.test.ts`](../../tests/security/dr_e2e_drill.test.ts) | `security` | Security / DR | `node:test (tsx)` | **6** | 199 | Evalúa la ejecución completa del simulacro de desastre automatizado, restauración limpia y verificación de RTO/RPO. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/egress_anti_ssrf.test.ts`](../../tests/security/egress_anti_ssrf.test.ts) | `security` | Security / Network | `node:test (tsx)` | **4** | 246 | Valida Network Policies Cilium L7 eBPF, bloqueo de rangos privados (RFC 1918, link-local, cloud metadata) y allowlist estricta. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`, `npm run test:security:egress` |
| [`tests/security/ghcr_retention.test.ts`](../../tests/security/ghcr_retention.test.ts) | `security` | Contract / OCI | `node:test (tsx)` | **6** | 252 | Verifica la política de retención de imágenes OCI en GHCR, preservación de releases semver y limpieza de imágenes huérfanas. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/github_security_linear_sync.test.ts`](../../tests/security/github_security_linear_sync.test.ts) | `security` | Contract / SecOps | `node:test (tsx)` | **12** | 318 | Valida sincronización bidireccional idempotente de vulnerabilidades y alertas de seguridad hacia issues de Linear. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/gitops_image_parity.test.ts`](../../tests/security/gitops_image_parity.test.ts) | `security` | Contract / GitOps | `node:test (tsx)` | **10** | 196 | Comprueba el script de verificación de paridad de imagen asegurando inmutabilidad entre entornos dev, preprod y prod. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/grafana_cloud_collection.test.ts`](../../tests/security/grafana_cloud_collection.test.ts) | `security` | Contract / Observability | `node:test (tsx)` | **4** | 172 | Renderiza k8s-monitoring con la versión y flags del script: scrapes de clúster, allowlists de las alertas y endpoint OTLP de la API. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/grafana_portability.test.ts`](../../tests/security/grafana_portability.test.ts) | `security` | Contract / Observability | `node:test (tsx)` | **9** | 432 | Valida esquemas JSON declarativos de dashboards Grafana, portabilidad de datasources y ausencia de UIDs fijos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/http_hardening.test.ts`](../../tests/security/http_hardening.test.ts) | `security` | Automated Test | `node:test (tsx)` | **2** | 58 | Suite de pruebas security: http_hardening.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/iac_baseline_security.test.ts`](../../tests/security/iac_baseline_security.test.ts) | `security` | Security / DevDX | `node:test (tsx)` | **7** | 321 | Suite de gobernanza Dev DX: valida que scripts imperativos estén retirados (ADR-020), delegación en Taskfile y versiones inmutables. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/ignore_hygiene.test.ts`](../../tests/security/ignore_hygiene.test.ts) | `security` | Contract / Hygiene | `node:test (tsx)` | **10** | 219 | Valida el linter de higiene de archivos .ignore, previniendo exclusión indebida, duplicados o fuga de secretos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/image_publication_contract.test.ts`](../../tests/security/image_publication_contract.test.ts) | `security` | Automated Test | `node:test (tsx)` | **4** | 99 | Suite de pruebas security: image_publication_contract.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/k8s_workload_hardening.test.ts`](../../tests/security/k8s_workload_hardening.test.ts) | `security` | Security / Kubernetes | `node:test (tsx)` | **14** | 581 | Verifica SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp), límites de recursos y probes de salud. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/network_policies_security.test.ts`](../../tests/security/network_policies_security.test.ts) | `security` | Security / Network | `node:test (tsx)` | **14** | 438 | Verifica aislamiento estricto entre pods de frontend, backend, Redis y PostgreSQL impidiendo accesos laterales no autorizados. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/nginx_effective_headers.test.ts`](../../tests/security/nginx_effective_headers.test.ts) | `security` | Automated Test | `node:test (tsx)` | **3** | 142 | Suite de pruebas security: nginx_effective_headers.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/opentofu_baseline_security.test.ts`](../../tests/security/opentofu_baseline_security.test.ts) | `security` | Security / OpenTofu | `node:test (tsx)` | **9** | 345 | Valida OpenTofu: cifrado de estado (ADR-012), checksums de imágenes descargadas, ausencia de variables muertas y estructura multi-cloud. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/operation_dr_benchmarks.test.ts`](../../tests/security/operation_dr_benchmarks.test.ts) | `security` | Security / DR Benchmarks | `node:test (tsx)` | **9** | 137 | Valida umbrales cuantitativos de tiempo de backup, compresión y consistencia de restauración contra SLAs operacionales. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/promote_auto_approve_contracts.test.ts`](../../tests/security/promote_auto_approve_contracts.test.ts) | `security` | Contract / CI-CD | `node:test (tsx)` | **2** | 90 | Valida políticas de auto-aprobación de PRs de dependencias patch/minor con suites de seguridad obligatorias. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/renovate_config_contract.test.ts`](../../tests/security/renovate_config_contract.test.ts) | `security` | Automated Test | `node:test (tsx)` | **5** | 210 | Suite de pruebas security: renovate_config_contract.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/supply_chain_security.test.ts`](../../tests/security/supply_chain_security.test.ts) | `security` | Security / Supply Chain | `node:test (tsx)` | **21** | 785 | Comprueba inmutabilidad de dependencias, bloqueo de scripts arbitrarios en npm ci, SBOM y firma de imágenes. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/vault_redeploy_contract.test.ts`](../../tests/security/vault_redeploy_contract.test.ts) | `security` | Security / Secrets | `node:test (tsx)` | **12** | 298 | Valida el reinicio controlado de workloads y el refresco de secretos inyectados tras rotaciones en HashiCorp Vault. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/yaml_extension_governance.test.ts`](../../tests/security/yaml_extension_governance.test.ts) | `security` | Contract / Governance | `node:test (tsx)` | **5** | 124 | Verifica cumplimiento estricto del uso exclusivo de la extensión .yaml (prohibiendo .yml) en todo el repositorio. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/skills_frontmatter.test.ts`](../../tests/skills_frontmatter.test.ts) | `governance` | Automated Test | `node:test (tsx)` | **2** | 39 | Suite de pruebas governance: skills_frontmatter.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/unit/admin_ip_allowlist.test.ts`](../../tests/unit/admin_ip_allowlist.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **7** | 76 | Suite de pruebas unit: admin_ip_allowlist.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/ai_security.test.ts`](../../tests/unit/ai_security.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **11** | 149 | Suite de pruebas unit: ai_security.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/auth_service.test.ts`](../../tests/unit/auth_service.test.ts) | `unit` | Unit | `node:test (tsx)` | **9** | 240 | Valida ciclo de vida de tokens HMAC-SHA256, expiración, verificación de firma, revocación en memoria y fail-closed de secretos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/backend_lifecycle.test.ts`](../../tests/unit/backend_lifecycle.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **1** | 41 | Suite de pruebas unit: backend_lifecycle.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/cache_service.test.ts`](../../tests/unit/cache_service.test.ts) | `unit` | Unit | `node:test (tsx)` | **5** | 81 | Valida almacenamiento en caché Redis con fallback transparente a memoria local, TTL y resiliencia ante cortes de red. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/classification_legendary.test.ts`](../../tests/unit/classification_legendary.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **14** | 182 | Suite de pruebas unit: classification_legendary.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/compose_postgres_tls.test.ts`](../../tests/unit/compose_postgres_tls.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **1** | 39 | Suite de pruebas unit: compose_postgres_tls.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/error_helpers.test.ts`](../../tests/unit/error_helpers.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **3** | 29 | Suite de pruebas unit: error_helpers.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/mega_evolution_catalog.test.ts`](../../tests/unit/mega_evolution_catalog.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **7** | 105 | Suite de pruebas unit: mega_evolution_catalog.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/mega_evolution_generator.test.ts`](../../tests/unit/mega_evolution_generator.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **8** | 249 | Suite de pruebas unit: mega_evolution_generator.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/mega_evolution_mapper.test.ts`](../../tests/unit/mega_evolution_mapper.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **4** | 62 | Suite de pruebas unit: mega_evolution_mapper.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/mega_evolution_seed.test.ts`](../../tests/unit/mega_evolution_seed.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **9** | 110 | Suite de pruebas unit: mega_evolution_seed.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/mega_evolution_validation.test.ts`](../../tests/unit/mega_evolution_validation.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **12** | 126 | Suite de pruebas unit: mega_evolution_validation.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/migrate_baseline.test.ts`](../../tests/unit/migrate_baseline.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **5** | 91 | Suite de pruebas unit: migrate_baseline.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/monolith_guardrails.test.ts`](../../tests/unit/monolith_guardrails.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **4** | 210 | Suite de pruebas unit: monolith_guardrails.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/node_version_consistency.test.ts`](../../tests/unit/node_version_consistency.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **1** | 37 | Suite de pruebas unit: node_version_consistency.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/pokemon_mapper.test.ts`](../../tests/unit/pokemon_mapper.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **6** | 270 | Suite de pruebas unit: pokemon_mapper.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/pokemon_repository.test.ts`](../../tests/unit/pokemon_repository.test.ts) | `unit` | Unit | `node:test (tsx)` | **8** | 191 | Valida operaciones de consulta, filtrado por tipo, búsqueda por nombre, paginación y transformaciones de atributos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/postgres_fail_closed.test.ts`](../../tests/unit/postgres_fail_closed.test.ts) | `unit` | Unit | `node:test (tsx)` | **9** | 242 | Verifica comportamiento fail-closed ante indisponibilidad de PostgreSQL, reintentos con backoff y aislamiento de errores. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/seed_catalog.test.ts`](../../tests/unit/seed_catalog.test.ts) | `unit` | Automated Test | `node:test (tsx)` | **16** | 153 | Suite de pruebas unit: seed_catalog.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/version_consistency.test.ts`](../../tests/version_consistency.test.ts) | `governance` | Contract / Release | `node:test (tsx)` | **3** | 110 | Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm). | `npm test`, `npm run test:all`, `npm run test:coverage` |

---

## 4. Desglose Estructurado por Suite de Pruebas

Para facilitar la inspección humana de la cobertura, las pruebas se agrupan por suite especializada. El catálogo completo y granular con el detalle de cada aserción individual se preserva en [`test-surface.json`](test-surface.json).

### Suite: Pruebas Unitarias de Aplicación (`unit`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:unit` | **Total Casos:** 140
- **Propósito:** Pruebas de alta velocidad y aislamiento sobre servicios de dominio, autenticación, caché y repositorios.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/unit/admin_ip_allowlist.test.ts`](../../tests/unit/admin_ip_allowlist.test.ts) | **7** | 76 | Suite de pruebas unit: admin_ip_allowlist.test.ts. | *(General)* |
| [`tests/unit/ai_security.test.ts`](../../tests/unit/ai_security.test.ts) | **11** | 149 | Suite de pruebas unit: ai_security.test.ts. | *(General)* |
| [`tests/unit/auth_service.test.ts`](../../tests/unit/auth_service.test.ts) | **9** | 240 | Valida ciclo de vida de tokens HMAC-SHA256, expiración, verificación de firma, revocación en memoria y fail-closed de secretos. | `apps/backend/src/services/auth.ts` |
| [`tests/unit/backend_lifecycle.test.ts`](../../tests/unit/backend_lifecycle.test.ts) | **1** | 41 | Suite de pruebas unit: backend_lifecycle.test.ts. | *(General)* |
| [`tests/unit/cache_service.test.ts`](../../tests/unit/cache_service.test.ts) | **5** | 81 | Valida almacenamiento en caché Redis con fallback transparente a memoria local, TTL y resiliencia ante cortes de red. | `apps/backend/src/services/cache.ts` |
| [`tests/unit/classification_legendary.test.ts`](../../tests/unit/classification_legendary.test.ts) | **14** | 182 | Suite de pruebas unit: classification_legendary.test.ts. | *(General)* |
| [`tests/unit/compose_postgres_tls.test.ts`](../../tests/unit/compose_postgres_tls.test.ts) | **1** | 39 | Suite de pruebas unit: compose_postgres_tls.test.ts. | *(General)* |
| [`tests/unit/error_helpers.test.ts`](../../tests/unit/error_helpers.test.ts) | **3** | 29 | Suite de pruebas unit: error_helpers.test.ts. | *(General)* |
| [`tests/unit/mega_evolution_catalog.test.ts`](../../tests/unit/mega_evolution_catalog.test.ts) | **7** | 105 | Suite de pruebas unit: mega_evolution_catalog.test.ts. | *(General)* |
| [`tests/unit/mega_evolution_generator.test.ts`](../../tests/unit/mega_evolution_generator.test.ts) | **8** | 249 | Suite de pruebas unit: mega_evolution_generator.test.ts. | *(General)* |
| [`tests/unit/mega_evolution_mapper.test.ts`](../../tests/unit/mega_evolution_mapper.test.ts) | **4** | 62 | Suite de pruebas unit: mega_evolution_mapper.test.ts. | *(General)* |
| [`tests/unit/mega_evolution_seed.test.ts`](../../tests/unit/mega_evolution_seed.test.ts) | **9** | 110 | Suite de pruebas unit: mega_evolution_seed.test.ts. | *(General)* |
| [`tests/unit/mega_evolution_validation.test.ts`](../../tests/unit/mega_evolution_validation.test.ts) | **12** | 126 | Suite de pruebas unit: mega_evolution_validation.test.ts. | *(General)* |
| [`tests/unit/migrate_baseline.test.ts`](../../tests/unit/migrate_baseline.test.ts) | **5** | 91 | Suite de pruebas unit: migrate_baseline.test.ts. | *(General)* |
| [`tests/unit/monolith_guardrails.test.ts`](../../tests/unit/monolith_guardrails.test.ts) | **4** | 210 | Suite de pruebas unit: monolith_guardrails.test.ts. | *(General)* |
| [`tests/unit/node_version_consistency.test.ts`](../../tests/unit/node_version_consistency.test.ts) | **1** | 37 | Suite de pruebas unit: node_version_consistency.test.ts. | *(General)* |
| [`tests/unit/pokemon_mapper.test.ts`](../../tests/unit/pokemon_mapper.test.ts) | **6** | 270 | Suite de pruebas unit: pokemon_mapper.test.ts. | *(General)* |
| [`tests/unit/pokemon_repository.test.ts`](../../tests/unit/pokemon_repository.test.ts) | **8** | 191 | Valida operaciones de consulta, filtrado por tipo, búsqueda por nombre, paginación y transformaciones de atributos. | `apps/backend/src/services/pokemon.repository.ts` |
| [`tests/unit/postgres_fail_closed.test.ts`](../../tests/unit/postgres_fail_closed.test.ts) | **9** | 242 | Verifica comportamiento fail-closed ante indisponibilidad de PostgreSQL, reintentos con backoff y aislamiento de errores. | `apps/backend/src/services/postgres.ts`, `apps/backend/server.ts` |
| [`tests/unit/seed_catalog.test.ts`](../../tests/unit/seed_catalog.test.ts) | **16** | 153 | Suite de pruebas unit: seed_catalog.test.ts. | *(General)* |

### Suite: Pruebas de Integración de API y Servicios (`integration`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:integration` | **Total Casos:** 26
- **Propósito:** Pruebas de persistencia PostgreSQL/Drizzle, concurrencia transaccional, rate limits y endpoint de versión.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/integration/api-limits.test.ts`](../../tests/integration/api-limits.test.ts) | **3** | 43 | Verifica rate limiting global y por endpoint, manejo de peticiones concurrentes y cabeceras X-RateLimit-* con código 429. | `apps/backend/src/middleware/rate-limiter.ts`, `apps/backend/server.ts` |
| [`tests/integration/concurrency.test.ts`](../../tests/integration/concurrency.test.ts) | **1** | 24 | Evalúa mutaciones concurrentes, aislamiento transaccional y prevención de race conditions en actualizaciones del catálogo Pokémon. | `apps/backend/src/services/db.ts` |
| [`tests/integration/storage.test.ts`](../../tests/integration/storage.test.ts) | **8** | 124 | Valida operaciones CRUD del repositorio, serialización y resiliencia de la capa de datos. | `apps/backend/src/services/db.ts`, `apps/backend/src/services/cache.ts` |
| [`tests/integration/version.test.ts`](../../tests/integration/version.test.ts) | **14** | 404 | Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime. | `apps/backend/server.ts` |

### Suite: Seguridad, Hardening y DevSecOps (`security`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:security` | **Total Casos:** 234
- **Propósito:** Evaluación de políticas de admisión, Network Policies Cilium L7, cifrado DR, secretos Vault y contratos IaC.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/security/adr_compliance_contracts.test.ts`](../../tests/security/adr_compliance_contracts.test.ts) | **19** | 833 | Comprueba el cumplimiento de decisiones de arquitectura registradas en ADR-001 a ADR-015 (topología, RBAC, ingress y secrets). | `docs/decisions/` |
| [`tests/security/ansible_baseline_security.test.ts`](../../tests/security/ansible_baseline_security.test.ts) | **12** | 424 | Valida hardening de hosts (UFW, SSH accept-new, usuario devops), inventarios sin colisiones y colecciones fijadas. | `infra/ansible/` |
| [`tests/security/backup_hmac.test.ts`](../../tests/security/backup_hmac.test.ts) | **11** | 193 | Suite de pruebas security: backup_hmac.test.ts. | *(General)* |
| [`tests/security/cors_rejection.test.ts`](../../tests/security/cors_rejection.test.ts) | **1** | 34 | Suite de pruebas security: cors_rejection.test.ts. | *(General)* |
| [`tests/security/csrf_origin.test.ts`](../../tests/security/csrf_origin.test.ts) | **7** | 99 | Suite de pruebas security: csrf_origin.test.ts. | *(General)* |
| [`tests/security/docs_governance_gate.test.ts`](../../tests/security/docs_governance_gate.test.ts) | **2** | 56 | Suite de pruebas security: docs_governance_gate.test.ts. | *(General)* |
| [`tests/security/docs_portal_integrity.test.ts`](../../tests/security/docs_portal_integrity.test.ts) | **3** | 146 | Valida vínculos internos, anclas, sintaxis y consistencia de navegación en el portal documental. | `docs/` |
| [`tests/security/dr_backup_security.test.ts`](../../tests/security/dr_backup_security.test.ts) | **11** | 462 | Valida cifrado AES-256-GCM en reposo de snapshots de base de datos, permisos de archivos y aislamiento de claves. | `scripts/dr-drill.ts`, `scripts/dev-backup-gdrive.ts` |
| [`tests/security/dr_e2e_drill.test.ts`](../../tests/security/dr_e2e_drill.test.ts) | **6** | 199 | Evalúa la ejecución completa del simulacro de desastre automatizado, restauración limpia y verificación de RTO/RPO. | `scripts/dr-drill.ts` |
| [`tests/security/egress_anti_ssrf.test.ts`](../../tests/security/egress_anti_ssrf.test.ts) | **4** | 246 | Valida Network Policies Cilium L7 eBPF, bloqueo de rangos privados (RFC 1918, link-local, cloud metadata) y allowlist estricta. | `infra/helm/pokedex/templates/cilium-network-policies.yaml`, `scripts/probe-egress-security.ts` |
| [`tests/security/ghcr_retention.test.ts`](../../tests/security/ghcr_retention.test.ts) | **6** | 252 | Verifica la política de retención de imágenes OCI en GHCR, preservación de releases semver y limpieza de imágenes huérfanas. | `scripts/ghcr-retention.ts`, `.github/workflows/ghcr-retention.yaml` |
| [`tests/security/github_security_linear_sync.test.ts`](../../tests/security/github_security_linear_sync.test.ts) | **12** | 318 | Valida sincronización bidireccional idempotente de vulnerabilidades y alertas de seguridad hacia issues de Linear. | `scripts/github-security-linear-sync.ts`, `.github/workflows/github-security-linear-sync.yaml` |
| [`tests/security/gitops_image_parity.test.ts`](../../tests/security/gitops_image_parity.test.ts) | **10** | 196 | Comprueba el script de verificación de paridad de imagen asegurando inmutabilidad entre entornos dev, preprod y prod. | `scripts/verify-image-digest-parity.ts`, `gitops/` |
| [`tests/security/grafana_cloud_collection.test.ts`](../../tests/security/grafana_cloud_collection.test.ts) | **4** | 172 | Renderiza k8s-monitoring con la versión y flags del script: scrapes de clúster, allowlists de las alertas y endpoint OTLP de la API. | `infra/monitoring/grafana-cloud-values.yaml`, `scripts/deploy-grafana-cloud.mjs` |
| [`tests/security/grafana_portability.test.ts`](../../tests/security/grafana_portability.test.ts) | **9** | 432 | Valida esquemas JSON declarativos de dashboards Grafana, portabilidad de datasources y ausencia de UIDs fijos. | `infra/monitoring/dashboards/` |
| [`tests/security/http_hardening.test.ts`](../../tests/security/http_hardening.test.ts) | **2** | 58 | Suite de pruebas security: http_hardening.test.ts. | *(General)* |
| [`tests/security/iac_baseline_security.test.ts`](../../tests/security/iac_baseline_security.test.ts) | **7** | 321 | Suite de gobernanza Dev DX: valida que scripts imperativos estén retirados (ADR-020), delegación en Taskfile y versiones inmutables. | `Taskfile.yaml`, `.tool-versions`, `infra/k8s/kind-cluster.yaml` |
| [`tests/security/ignore_hygiene.test.ts`](../../tests/security/ignore_hygiene.test.ts) | **10** | 219 | Valida el linter de higiene de archivos .ignore, previniendo exclusión indebida, duplicados o fuga de secretos. | `scripts/check-ignore-hygiene.ts`, `.gitignore`, `.dockerignore` |
| [`tests/security/image_publication_contract.test.ts`](../../tests/security/image_publication_contract.test.ts) | **4** | 99 | Suite de pruebas security: image_publication_contract.test.ts. | *(General)* |
| [`tests/security/k8s_workload_hardening.test.ts`](../../tests/security/k8s_workload_hardening.test.ts) | **14** | 581 | Verifica SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp), límites de recursos y probes de salud. | `infra/k8s/`, `infra/helm/pokedex/templates/` |
| [`tests/security/network_policies_security.test.ts`](../../tests/security/network_policies_security.test.ts) | **14** | 438 | Verifica aislamiento estricto entre pods de frontend, backend, Redis y PostgreSQL impidiendo accesos laterales no autorizados. | `infra/helm/pokedex/templates/network-policies.yaml`, `infra/helm/pokedex/templates/cilium-network-policies.yaml` |
| [`tests/security/nginx_effective_headers.test.ts`](../../tests/security/nginx_effective_headers.test.ts) | **3** | 142 | Suite de pruebas security: nginx_effective_headers.test.ts. | *(General)* |
| [`tests/security/opentofu_baseline_security.test.ts`](../../tests/security/opentofu_baseline_security.test.ts) | **9** | 345 | Valida OpenTofu: cifrado de estado (ADR-012), checksums de imágenes descargadas, ausencia de variables muertas y estructura multi-cloud. | `infra/opentofu/` |
| [`tests/security/operation_dr_benchmarks.test.ts`](../../tests/security/operation_dr_benchmarks.test.ts) | **9** | 137 | Valida umbrales cuantitativos de tiempo de backup, compresión y consistencia de restauración contra SLAs operacionales. | `scripts/dr-drill.ts` |
| [`tests/security/promote_auto_approve_contracts.test.ts`](../../tests/security/promote_auto_approve_contracts.test.ts) | **2** | 90 | Valida políticas de auto-aprobación de PRs de dependencias patch/minor con suites de seguridad obligatorias. | `.github/workflows/promote-auto-approve.yaml` |
| [`tests/security/renovate_config_contract.test.ts`](../../tests/security/renovate_config_contract.test.ts) | **5** | 210 | Suite de pruebas security: renovate_config_contract.test.ts. | *(General)* |
| [`tests/security/supply_chain_security.test.ts`](../../tests/security/supply_chain_security.test.ts) | **21** | 785 | Comprueba inmutabilidad de dependencias, bloqueo de scripts arbitrarios en npm ci, SBOM y firma de imágenes. | `package.json`, `package-lock.json`, `.github/workflows/ci.yaml` |
| [`tests/security/vault_redeploy_contract.test.ts`](../../tests/security/vault_redeploy_contract.test.ts) | **12** | 298 | Valida el reinicio controlado de workloads y el refresco de secretos inyectados tras rotaciones en HashiCorp Vault. | `scripts/k8s-rollout-restart.ts` |
| [`tests/security/yaml_extension_governance.test.ts`](../../tests/security/yaml_extension_governance.test.ts) | **5** | 124 | Verifica cumplimiento estricto del uso exclusivo de la extensión .yaml (prohibiendo .yml) en todo el repositorio. | `scripts/check-yaml-extension.ts` |

### Suite: Contratos de GitOps y Despliegue (`gitops`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:gitops` | **Total Casos:** 41
- **Propósito:** Inmutabilidad de imágenes por digest SHA-256 en ArgoCD y paridad estricta entre entornos dev/preprod/prod.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/gitops/argocd_pinning.test.ts`](../../tests/gitops/argocd_pinning.test.ts) | **7** | 248 | Valida pinning estricto por digest SHA-256 en manifiestos de ArgoCD y prohíbe tags mutables (:latest) en dev, preprod y prod. | `gitops/values-*.yaml`, `scripts/verify-image-digest-parity.ts` |
| [`tests/gitops/environment_http_contract.test.ts`](../../tests/gitops/environment_http_contract.test.ts) | **6** | 157 | Suite de pruebas gitops: environment_http_contract.test.ts. | *(General)* |
| [`tests/gitops/gitops_architecture.test.ts`](../../tests/gitops/gitops_architecture.test.ts) | **6** | 551 | Suite de pruebas gitops: gitops_architecture.test.ts. | *(General)* |
| [`tests/gitops/image_digest_promotion.test.ts`](../../tests/gitops/image_digest_promotion.test.ts) | **7** | 138 | Suite de pruebas gitops: image_digest_promotion.test.ts. | *(General)* |
| [`tests/gitops/platform_bootstrap_contract.test.ts`](../../tests/gitops/platform_bootstrap_contract.test.ts) | **12** | 278 | Suite de pruebas gitops: platform_bootstrap_contract.test.ts. | *(General)* |
| [`tests/gitops/seed_job_contract.test.ts`](../../tests/gitops/seed_job_contract.test.ts) | **3** | 76 | Suite de pruebas gitops: seed_job_contract.test.ts. | *(General)* |

### Suite: Componentes y Controladores Frontend (`frontend`)

- **Runner:** `node:test + JSDOM` | **Comando:** `npm test` | **Total Casos:** 252
- **Propósito:** Pruebas sobre controladores DOM de backoffice, toasts interactivos y componentes modales accesibles.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/frontend/backoffice_controller.test.ts`](../../tests/frontend/backoffice_controller.test.ts) | **28** | 521 | Valida eventos de DOM, renderizado de tablas, modales interactivos y toasts en el backoffice usando entorno JSDOM. | `apps/frontend/src/backoffice.ts` |
| [`tests/frontend/backoffice_env.ts`](../../tests/frontend/backoffice_env.ts) | **0** | 99 | Módulo de arranque de navegador simulado con JSDOM para ejecución determinista y cobertura estática V8 en pruebas frontend. | `apps/frontend/src/backoffice.ts` |
| [`tests/frontend/catalog_ability_controller.test.ts`](../../tests/frontend/catalog_ability_controller.test.ts) | **10** | 199 | Suite de pruebas frontend: catalog_ability_controller.test.ts. | *(General)* |
| [`tests/frontend/catalog_class_controller.test.ts`](../../tests/frontend/catalog_class_controller.test.ts) | **10** | 214 | Suite de pruebas frontend: catalog_class_controller.test.ts. | *(General)* |
| [`tests/frontend/catalog_fetch.test.ts`](../../tests/frontend/catalog_fetch.test.ts) | **3** | 74 | Suite de pruebas frontend: catalog_fetch.test.ts. | *(General)* |
| [`tests/frontend/catalog_filters_controller.test.ts`](../../tests/frontend/catalog_filters_controller.test.ts) | **24** | 452 | Suite de pruebas frontend: catalog_filters_controller.test.ts. | *(General)* |
| [`tests/frontend/catalog_filters.test.ts`](../../tests/frontend/catalog_filters.test.ts) | **12** | 141 | Suite de pruebas frontend: catalog_filters.test.ts. | *(General)* |
| [`tests/frontend/catalog_sort.test.ts`](../../tests/frontend/catalog_sort.test.ts) | **11** | 170 | Suite de pruebas frontend: catalog_sort.test.ts. | *(General)* |
| [`tests/frontend/css_cache_busting.test.ts`](../../tests/frontend/css_cache_busting.test.ts) | **4** | 47 | Suite de pruebas frontend: css_cache_busting.test.ts. | *(General)* |
| [`tests/frontend/filter_url.test.ts`](../../tests/frontend/filter_url.test.ts) | **15** | 138 | Suite de pruebas frontend: filter_url.test.ts. | *(General)* |
| [`tests/frontend/filters_panel.test.ts`](../../tests/frontend/filters_panel.test.ts) | **10** | 169 | Suite de pruebas frontend: filters_panel.test.ts. | *(General)* |
| [`tests/frontend/fonts_selfhosted.test.ts`](../../tests/frontend/fonts_selfhosted.test.ts) | **4** | 78 | Suite de pruebas frontend: fonts_selfhosted.test.ts. | *(General)* |
| [`tests/frontend/golden/badge-single.html`](../../tests/frontend/golden/badge-single.html) | **0** | 2 | Suite de pruebas frontend: badge-single.html. | *(General)* |
| [`tests/frontend/golden/badges-fallback.html`](../../tests/frontend/golden/badges-fallback.html) | **0** | 2 | Suite de pruebas frontend: badges-fallback.html. | *(General)* |
| [`tests/frontend/golden/badges-multi.html`](../../tests/frontend/golden/badges-multi.html) | **0** | 2 | Suite de pruebas frontend: badges-multi.html. | *(General)* |
| [`tests/frontend/golden/card-charizard.html`](../../tests/frontend/golden/card-charizard.html) | **0** | 48 | Suite de pruebas frontend: card-charizard.html. | *(General)* |
| [`tests/frontend/golden/card-legendario.html`](../../tests/frontend/golden/card-legendario.html) | **0** | 48 | Suite de pruebas frontend: card-legendario.html. | *(General)* |
| [`tests/frontend/golden/card-mitico.html`](../../tests/frontend/golden/card-mitico.html) | **0** | 48 | Suite de pruebas frontend: card-mitico.html. | *(General)* |
| [`tests/frontend/golden/card-pikachu.html`](../../tests/frontend/golden/card-pikachu.html) | **0** | 48 | Suite de pruebas frontend: card-pikachu.html. | *(General)* |
| [`tests/frontend/golden/card-sparse.html`](../../tests/frontend/golden/card-sparse.html) | **0** | 48 | Suite de pruebas frontend: card-sparse.html. | *(General)* |
| [`tests/frontend/golden/empty-state-plain.html`](../../tests/frontend/golden/empty-state-plain.html) | **0** | 8 | Suite de pruebas frontend: empty-state-plain.html. | *(General)* |
| [`tests/frontend/golden/empty-state-retry.html`](../../tests/frontend/golden/empty-state-retry.html) | **0** | 8 | Suite de pruebas frontend: empty-state-retry.html. | *(General)* |
| [`tests/frontend/golden/modal-base-stats-full.html`](../../tests/frontend/golden/modal-base-stats-full.html) | **0** | 36 | Suite de pruebas frontend: modal-base-stats-full.html. | *(General)* |
| [`tests/frontend/golden/modal-base-stats-none.html`](../../tests/frontend/golden/modal-base-stats-none.html) | **0** | 2 | Suite de pruebas frontend: modal-base-stats-none.html. | *(General)* |
| [`tests/frontend/golden/modal-base-stats-partial.html`](../../tests/frontend/golden/modal-base-stats-partial.html) | **0** | 32 | Suite de pruebas frontend: modal-base-stats-partial.html. | *(General)* |
| [`tests/frontend/golden/modal-connector-method.html`](../../tests/frontend/golden/modal-connector-method.html) | **0** | 9 | Suite de pruebas frontend: modal-connector-method.html. | *(General)* |
| [`tests/frontend/golden/modal-connector-plain.html`](../../tests/frontend/golden/modal-connector-plain.html) | **0** | 2 | Suite de pruebas frontend: modal-connector-plain.html. | *(General)* |
| [`tests/frontend/golden/modal-connector-undefined.html`](../../tests/frontend/golden/modal-connector-undefined.html) | **0** | 2 | Suite de pruebas frontend: modal-connector-undefined.html. | *(General)* |
| [`tests/frontend/golden/modal-detail-charizard-mega.html`](../../tests/frontend/golden/modal-detail-charizard-mega.html) | **0** | 339 | Suite de pruebas frontend: modal-detail-charizard-mega.html. | *(General)* |
| [`tests/frontend/golden/modal-detail-eevee.html`](../../tests/frontend/golden/modal-detail-eevee.html) | **0** | 168 | Suite de pruebas frontend: modal-detail-eevee.html. | *(General)* |
| [`tests/frontend/golden/modal-detail-pikachu.html`](../../tests/frontend/golden/modal-detail-pikachu.html) | **0** | 162 | Suite de pruebas frontend: modal-detail-pikachu.html. | *(General)* |
| [`tests/frontend/golden/modal-detail-sparse.html`](../../tests/frontend/golden/modal-detail-sparse.html) | **0** | 86 | Suite de pruebas frontend: modal-detail-sparse.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-branched-leaves.html`](../../tests/frontend/golden/modal-evolution-branched-leaves.html) | **0** | 69 | Suite de pruebas frontend: modal-evolution-branched-leaves.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-branched-prefix.html`](../../tests/frontend/golden/modal-evolution-branched-prefix.html) | **0** | 79 | Suite de pruebas frontend: modal-evolution-branched-prefix.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-flat-1.html`](../../tests/frontend/golden/modal-evolution-flat-1.html) | **0** | 21 | Suite de pruebas frontend: modal-evolution-flat-1.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-flat-3.html`](../../tests/frontend/golden/modal-evolution-flat-3.html) | **0** | 63 | Suite de pruebas frontend: modal-evolution-flat-3.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-linear-tree.html`](../../tests/frontend/golden/modal-evolution-linear-tree.html) | **0** | 63 | Suite de pruebas frontend: modal-evolution-linear-tree.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-no-tree.html`](../../tests/frontend/golden/modal-evolution-no-tree.html) | **0** | 21 | Suite de pruebas frontend: modal-evolution-no-tree.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-single-tree.html`](../../tests/frontend/golden/modal-evolution-single-tree.html) | **0** | 21 | Suite de pruebas frontend: modal-evolution-single-tree.html. | *(General)* |
| [`tests/frontend/golden/modal-evolution-undefined.html`](../../tests/frontend/golden/modal-evolution-undefined.html) | **0** | 21 | Suite de pruebas frontend: modal-evolution-undefined.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-body-none.html`](../../tests/frontend/golden/modal-mega-body-none.html) | **0** | 1 | Suite de pruebas frontend: modal-mega-body-none.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-body-two.html`](../../tests/frontend/golden/modal-mega-body-two.html) | **0** | 174 | Suite de pruebas frontend: modal-mega-body-two.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-section-one.html`](../../tests/frontend/golden/modal-mega-section-one.html) | **0** | 89 | Suite de pruebas frontend: modal-mega-section-one.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-section-two.html`](../../tests/frontend/golden/modal-mega-section-two.html) | **0** | 171 | Suite de pruebas frontend: modal-mega-section-two.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-stats-no-base.html`](../../tests/frontend/golden/modal-mega-stats-no-base.html) | **0** | 44 | Suite de pruebas frontend: modal-mega-stats-no-base.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-stats-with-base.html`](../../tests/frontend/golden/modal-mega-stats-with-base.html) | **0** | 44 | Suite de pruebas frontend: modal-mega-stats-with-base.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-toggle-none.html`](../../tests/frontend/golden/modal-mega-toggle-none.html) | **0** | 1 | Suite de pruebas frontend: modal-mega-toggle-none.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-toggle-one.html`](../../tests/frontend/golden/modal-mega-toggle-one.html) | **0** | 7 | Suite de pruebas frontend: modal-mega-toggle-one.html. | *(General)* |
| [`tests/frontend/golden/modal-mega-toggle-two.html`](../../tests/frontend/golden/modal-mega-toggle-two.html) | **0** | 7 | Suite de pruebas frontend: modal-mega-toggle-two.html. | *(General)* |
| [`tests/frontend/golden/modal-node-bare.html`](../../tests/frontend/golden/modal-node-bare.html) | **0** | 14 | Suite de pruebas frontend: modal-node-bare.html. | *(General)* |
| [`tests/frontend/golden/modal-node-catalog-types.html`](../../tests/frontend/golden/modal-node-catalog-types.html) | **0** | 14 | Suite de pruebas frontend: modal-node-catalog-types.html. | *(General)* |
| [`tests/frontend/golden/modal-node-current.html`](../../tests/frontend/golden/modal-node-current.html) | **0** | 14 | Suite de pruebas frontend: modal-node-current.html. | *(General)* |
| [`tests/frontend/golden/modal-node-other-method.html`](../../tests/frontend/golden/modal-node-other-method.html) | **0** | 14 | Suite de pruebas frontend: modal-node-other-method.html. | *(General)* |
| [`tests/frontend/golden/modal-node-special-chars.html`](../../tests/frontend/golden/modal-node-special-chars.html) | **0** | 14 | Suite de pruebas frontend: modal-node-special-chars.html. | *(General)* |
| [`tests/frontend/golden/rows-admin-empty.html`](../../tests/frontend/golden/rows-admin-empty.html) | **0** | 1 | Suite de pruebas frontend: rows-admin-empty.html. | *(General)* |
| [`tests/frontend/golden/rows-admin.html`](../../tests/frontend/golden/rows-admin.html) | **0** | 151 | Suite de pruebas frontend: rows-admin.html. | *(General)* |
| [`tests/frontend/golden/state-no-results.html`](../../tests/frontend/golden/state-no-results.html) | **0** | 8 | Suite de pruebas frontend: state-no-results.html. | *(General)* |
| [`tests/frontend/golden/state-table-empty.html`](../../tests/frontend/golden/state-table-empty.html) | **0** | 7 | Suite de pruebas frontend: state-table-empty.html. | *(General)* |
| [`tests/frontend/golden/state-table-error-special.html`](../../tests/frontend/golden/state-table-error-special.html) | **0** | 9 | Suite de pruebas frontend: state-table-error-special.html. | *(General)* |
| [`tests/frontend/golden/state-table-error.html`](../../tests/frontend/golden/state-table-error.html) | **0** | 9 | Suite de pruebas frontend: state-table-error.html. | *(General)* |
| [`tests/frontend/golden/state-table-loading.html`](../../tests/frontend/golden/state-table-loading.html) | **0** | 8 | Suite de pruebas frontend: state-table-loading.html. | *(General)* |
| [`tests/frontend/html_assertions.ts`](../../tests/frontend/html_assertions.ts) | **0** | 27 | Suite de pruebas frontend: html_assertions.ts. | *(General)* |
| [`tests/frontend/html_fixtures.ts`](../../tests/frontend/html_fixtures.ts) | **0** | 164 | Suite de pruebas frontend: html_fixtures.ts. | *(General)* |
| [`tests/frontend/html_guard.test.ts`](../../tests/frontend/html_guard.test.ts) | **5** | 67 | Suite de pruebas frontend: html_guard.test.ts. | *(General)* |
| [`tests/frontend/html_injection_modals.test.ts`](../../tests/frontend/html_injection_modals.test.ts) | **6** | 125 | Suite de pruebas frontend: html_injection_modals.test.ts. | *(General)* |
| [`tests/frontend/html_injection.test.ts`](../../tests/frontend/html_injection.test.ts) | **6** | 76 | Suite de pruebas frontend: html_injection.test.ts. | *(General)* |
| [`tests/frontend/html_parity_modals.test.ts`](../../tests/frontend/html_parity_modals.test.ts) | **1** | 100 | Suite de pruebas frontend: html_parity_modals.test.ts. | *(General)* |
| [`tests/frontend/html_parity_states.test.ts`](../../tests/frontend/html_parity_states.test.ts) | **1** | 42 | Suite de pruebas frontend: html_parity_states.test.ts. | *(General)* |
| [`tests/frontend/html_parity.test.ts`](../../tests/frontend/html_parity.test.ts) | **1** | 62 | Suite de pruebas frontend: html_parity.test.ts. | *(General)* |
| [`tests/frontend/html_set.test.ts`](../../tests/frontend/html_set.test.ts) | **6** | 54 | Suite de pruebas frontend: html_set.test.ts. | *(General)* |
| [`tests/frontend/html_template.test.ts`](../../tests/frontend/html_template.test.ts) | **7** | 55 | Suite de pruebas frontend: html_template.test.ts. | *(General)* |
| [`tests/frontend/keyboard_access.test.ts`](../../tests/frontend/keyboard_access.test.ts) | **7** | 98 | Suite de pruebas frontend: keyboard_access.test.ts. | *(General)* |
| [`tests/frontend/keyboard_navigation.test.ts`](../../tests/frontend/keyboard_navigation.test.ts) | **4** | 107 | Suite de pruebas frontend: keyboard_navigation.test.ts. | *(General)* |
| [`tests/frontend/mega_env.ts`](../../tests/frontend/mega_env.ts) | **0** | 18 | Suite de pruebas frontend: mega_env.ts. | *(General)* |
| [`tests/frontend/mega_evolution.test.ts`](../../tests/frontend/mega_evolution.test.ts) | **22** | 266 | Suite de pruebas frontend: mega_evolution.test.ts. | *(General)* |
| [`tests/frontend/modal_components.test.ts`](../../tests/frontend/modal_components.test.ts) | **19** | 341 | Valida el ciclo de vida de modales accesibles, trampa de foco para teclado (Tab/Shift+Tab), tecla Escape y cierre por backdrop. | `apps/frontend/src/components/modal-detail.ts`, `apps/frontend/src/components/modal-crud.ts` |
| [`tests/frontend/modal_dialog.test.ts`](../../tests/frontend/modal_dialog.test.ts) | **5** | 90 | Suite de pruebas frontend: modal_dialog.test.ts. | *(General)* |
| [`tests/frontend/nginx_config.test.ts`](../../tests/frontend/nginx_config.test.ts) | **4** | 217 | Suite de pruebas frontend: nginx_config.test.ts. | *(General)* |
| [`tests/frontend/page_focus.test.ts`](../../tests/frontend/page_focus.test.ts) | **9** | 155 | Suite de pruebas frontend: page_focus.test.ts. | *(General)* |
| [`tests/frontend/seo_compression.test.ts`](../../tests/frontend/seo_compression.test.ts) | **3** | 58 | Suite de pruebas frontend: seo_compression.test.ts. | *(General)* |
| [`tests/frontend/skip_link_contrast.test.ts`](../../tests/frontend/skip_link_contrast.test.ts) | **3** | 69 | Suite de pruebas frontend: skip_link_contrast.test.ts. | *(General)* |
| [`tests/frontend/skip_pagination.test.ts`](../../tests/frontend/skip_pagination.test.ts) | **7** | 134 | Suite de pruebas frontend: skip_pagination.test.ts. | *(General)* |
| [`tests/frontend/type_badge_contrast.test.ts`](../../tests/frontend/type_badge_contrast.test.ts) | **5** | 109 | Suite de pruebas frontend: type_badge_contrast.test.ts. | *(General)* |

### Suite: Pruebas End-to-End y Accesibilidad (`e2e`)

- **Runner:** `playwright` | **Comando:** `npm run test:e2e` | **Total Casos:** 21
- **Propósito:** Simulación completa de flujos de usuario en Chromium y auditorías de accesibilidad WCAG 2.1 AA con Axe-core.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/e2e/backoffice.spec.ts`](../../tests/e2e/backoffice.spec.ts) | **6** | 123 | Flujos completos de administración en navegador: login con token, CRUD de Pokémon, paginación y modal de confirmación. | `apps/frontend/src/backoffice.ts`, `apps/frontend/backoffice.html` |
| [`tests/e2e/pokedex.spec.ts`](../../tests/e2e/pokedex.spec.ts) | **15** | 373 | Flujos de usuario en navegador: carga de catálogo, filtro con debounce, conmutador de tema oscuro y auditoría Axe-core WCAG 2.1 AA. | `apps/frontend/src/pokedex.ts`, `apps/frontend/index.html` |

### Suite: Rendimiento y Carga (k6) (`performance`)

- **Runner:** `k6` | **Comando:** `k6 run tests/performance/k6_stress_test.js` | **Total Casos:** 4
- **Propósito:** Pruebas de estrés y límites de latencia HTTP bajo concurrencia continua respetando presupuestos de rate limit.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/performance/k6_stress_test.js`](../../tests/performance/k6_stress_test.js) | **4** | 167 | Prueba de carga k6 que valida umbrales p95/p99 de latencia, tasa de error y respeto de rate limits sin generar 429 espurios. | `apps/backend/server.ts`, `apps/backend/src/middleware/rate-limiter.ts` |

### Suite: Paridad y Gobernanza de CI/CD (`ci`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm test` | **Total Casos:** 14
- **Propósito:** Verificación estructural de consistencia, timeouts y parámetros de ejecución en pipelines de GitHub Actions.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/ci/lighthouse.test.ts`](../../tests/ci/lighthouse.test.ts) | **10** | 194 | Suite de pruebas ci: lighthouse.test.ts. | *(General)* |
| [`tests/ci/workflow_run_parity.test.ts`](../../tests/ci/workflow_run_parity.test.ts) | **4** | 188 | Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI. | `.github/workflows/*.yaml` |

### Suite: API Fuzzing y Pruebas Adversariales (`fuzz`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:fuzz` | **Total Casos:** 7
- **Propósito:** Generación caótica y mutacional de payloads HTTP, validación de boundaries y resiliencia ante inputs malformados.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/fuzzing.test.ts`](../../tests/fuzzing.test.ts) | **7** | 218 | Ejecuta fuzzing adversarial con mutaciones caóticas de JSON, delimitadores y límites de buffer en endpoints REST. | `apps/backend/src/routes/pokemons.ts`, `apps/backend/src/validation/schemas.ts` |

### Suite: Gobernanza y Contratos de Plataforma (Root) (`governance`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm test` | **Total Casos:** 168
- **Propósito:** Contratos de tipos, gobernanza documental, reglas de protección de rama, pentesting e impacto de CI.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/aas_governance.test.ts`](../../tests/aas_governance.test.ts) | **10** | 150 | Valida contratos de gobernanza de skills y agents en aas-stack.json, stacks requeridos y catálogo de herramientas. | `.agents/aas/aas-stack.json` |
| [`tests/audit_freshness.test.ts`](../../tests/audit_freshness.test.ts) | **6** | 91 | Comprueba la política de demarcación de auditorías históricas en docs/audits/ y asegura que no sean interpretadas como SSOT vigente. | `docs/audits/` |
| [`tests/ci_impact.test.ts`](../../tests/ci_impact.test.ts) | **36** | 853 | Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed. | `scripts/detect-change-impact.ts`, `.agents/skills/_shared/change-impact-matrix.md` |
| [`tests/ci_workflow_governance.test.ts`](../../tests/ci_workflow_governance.test.ts) | **23** | 563 | Suite de pruebas governance: ci_workflow_governance.test.ts. | *(General)* |
| [`tests/contracts.test.ts`](../../tests/contracts.test.ts) | **3** | 100 | Valida compatibilidad estructural estricta entre las interfaces de tipos de backend y frontend. | `apps/backend/src/types.ts`, `apps/frontend/src/types.ts` |
| [`tests/doc_governance.test.ts`](../../tests/doc_governance.test.ts) | **2** | 131 | Asegura que los ADRs y especificaciones técnicas cumplan con el formato canónico, encabezados y metadatos obligatorios. | `docs/decisions/`, `.agents/rules/documentation-governance.md` |
| [`tests/markdown_gate.test.ts`](../../tests/markdown_gate.test.ts) | **7** | 77 | Verifica el comportamiento del motor de linting de Markdown, reporte de errores MDxxx y mecanismos de auto-fix. | `scripts/lint-markdown.ts`, `.markdownlint.json` |
| [`tests/pentest.test.ts`](../../tests/pentest.test.ts) | **28** | 642 | Ejecuta batería exhaustiva de vectores de ataque: SQLi, NoSQLi, path traversal, XSS, HTTP parameter pollution y headers de seguridad. | `apps/backend/server.ts`, `apps/backend/src/routes/` |
| [`tests/pr_template_governance.test.ts`](../../tests/pr_template_governance.test.ts) | **6** | 247 | Valida conformidad estricta del cuerpo de PR contra el template físico oficial, impidiendo estructuras arbitrarias o mojibake. | `.github/pull_request_template.md`, `scripts/validate-pr-body.ts` |
| [`tests/ruleset_contract.test.ts`](../../tests/ruleset_contract.test.ts) | **3** | 98 | Valida la estructura declarativa y restricciones de protección de rama del ruleset main-protection.json contra el esquema de GitHub. | `.github/rulesets/main-protection.json` |
| [`tests/ruleset_parity.test.ts`](../../tests/ruleset_parity.test.ts) | **11** | 240 | Verifica la paridad e identifica drift entre el ruleset declarativo local y las reglas activas en la API remota de GitHub. | `.github/rulesets/main-protection.json`, `scripts/check-ruleset-parity.ts` |
| [`tests/security.test.ts`](../../tests/security.test.ts) | **28** | 444 | Valida cabeceras Helmet (HSTS, CSP, X-Frame-Options), CORS restrictivo, prevención de fuga de información y manejo seguro de errores. | `apps/backend/server.ts`, `apps/backend/src/middleware/` |
| [`tests/skills_frontmatter.test.ts`](../../tests/skills_frontmatter.test.ts) | **2** | 39 | Suite de pruebas governance: skills_frontmatter.test.ts. | *(General)* |
| [`tests/version_consistency.test.ts`](../../tests/version_consistency.test.ts) | **3** | 110 | Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm). | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, `infra/helm/pokedex/Chart.yaml` |

---

## 5. Gobernanza y Detección de Drift

Este inventario no es estático ni manual. Se rige por el protocolo de gobernanza automatizado de `repo-testing`:

1. **Código como Fuente de Verdad:** Si se agrega, renombra o elimina un test, el inventario debe reconciliarse mediante `npm run test:surface:update`.
2. **Quality Gate en CI:** El comando `npm run test:surface:check` valida que no exista drift entre los archivos de prueba en disco y los catálogos `test-surface.json` y `test-surface.md`.
3. **Taxonomía de Cambios:**
   - `NEW_TEST_FILE`: Archivo de test no registrado.
   - `REMOVED_TEST_FILE`: Archivo eliminado del repositorio que aún figura en el catálogo.
   - `COUNT_CHANGED`: Variación en la cantidad de pruebas de un archivo existente.
   - `MODIFIED`: Cambio en el hash SHA-256 del archivo que requiere reconciliación de metadatos.
   - `ORPHAN`: Test en disco no cubierto por ningún script ni workflow.

```bash
# Comandos de gestión de la superficie
npm run test:surface         # Inspeccionar superficie y drift
npm run test:surface:check   # Validar paridad estricta (CI)
npm run test:surface:update  # Reconciliar catálogo automáticamente
```
