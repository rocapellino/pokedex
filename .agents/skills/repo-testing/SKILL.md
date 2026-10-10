---
name: repo-testing
description: "Gobernar la estrategia de pruebas: pirámide, taxonomía de 12 estados, test surface y brechas de cobertura. Usar al agregar, mover o eliminar tests, ante tests lentos o inestables, o para encontrar flujos sin cobertura."
---

# repo-testing

## Objetivo

Gobernar la estrategia integral de pruebas automatizadas en `rocapellino/pokedex`, asegurando determinismo, aislamiento, cobertura de caminos críticos y gates de calidad confiables desde pruebas unitarias locales hasta simulaciones de producción en clústeres reales.

## Alcance y Verificaciones de Dominio

- **Pirámide de Pruebas y Tipologías:**
  - **Unitarias de Aplicación:** Lógica de negocio, validaciones y transformaciones (`tests/contracts/app/api_types_compat.test.ts`, `tests/frontend/modal_components.test.ts`).
  - **Integración de Servicios:** Endpoints Express, almacenamiento Drizzle/Postgres, middleware y caché Redis con fallback (`tests/integration/concurrency.test.ts`, `tests/integration/storage.test.ts`, `tests/integration/version_endpoint.test.ts`, `tests/integration/http_middleware.test.ts`).
  - **Integración con PostgreSQL y Redis reales:** `tests/integration/db/` ejecuta migraciones, repositorio Drizzle y caché contra servidores reales. Es opt-in: sin `POKEDEX_TEST_DATABASE_URL` y `POKEDEX_TEST_REDIS_URL` las suites se omiten con el motivo a la vista y `npm test` no necesita Docker. Los jobs `code-quality` y `sonarcloud` de `ci.yaml` definen ambas variables y levantan los servicios con las imágenes por digest de `docker-compose.yaml` (lo exige `tests/ci/db_integration_services.test.ts`). Cada suite crea su propia base PostgreSQL y reserva una base lógica de Redis en `REDIS_SLOTS` (`tests/helpers/services.ts`, que incluye los comandos para correrlas en local con `npm run test:integration:db`).
  - **Policy-as-Test & Gobernanza:** Verificación de contratos declarativos de infraestructura, OpenTofu, Ansible, Helm, Vault, Kyverno y GitOps (`tests/security/*`, `tests/contracts/*`, `tests/gitops/*`, `tests/contracts/governance/doc_governance.test.ts`). `tests/security/` contiene la postura de seguridad (hardening, red, secretos, cadena de suministro) y `tests/contracts/` los contratos de repositorio (ADR, gobernanza documental, entrega, observabilidad). Deben tratarse como tests de arquitectura y configuración, no como cobertura de código de backend.
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
    - *Contrato por Texto (`AUD-TST-CTR-001`, `AUD-TST-CTR-002`):* `includes` o regex sobre el contenido crudo de un YAML, HCL, JSON, workflow, Taskfile o plantilla. Un valor comentado, el nombre de otro paso o la clave equivocada lo satisfacen sin que nada lo aplique. Se verifica la estructura (ver la pauta siguiente).
    - *Test de Constante Local:* Una aserción cuyo valor sale de una constante declarada en el propio test (`const activo = false; assert(!activo)`) no puede fallar. El valor se lee del artefacto.
- **Pauta de Contratos sobre Archivos del Repositorio:**
  - **Configuración y manifiestos: se parsean, no se leen como texto.** Se usan los helpers de `tests/helpers/`:
    - `readYaml` / `readYamlDocs` para YAML y manifiestos multidocumento; `workflowJobs` / `workflowScripts` para workflows (los `run:` llegan sin las líneas de shell comentadas).
    - `renderChart` / `PROFILES` para el chart de Helm: las Sync Waves, anotaciones y sondas se leen del recurso renderizado, no de la plantilla Go.
    - `readHcl` / `blocksOf` para OpenTofu; `readTaskfiles` / `taskCommands` para Task; `playbookTasks` / `taskNamed` / `moduleArgs` para Ansible.
  - **Se ata cada aserción a su campo.** Un umbral se comprueba contra la métrica que lo contiene, un permiso contra el job que lo usa, una condición contra el `if` del paso que protege. Si el campo se repite con el mismo valor en otro sitio (`custom_error_rate` y `http_req_failed`), la aserción debe distinguir ambos. Un localizador de pasos o tareas falla si encuentra cero o varios (`taskNamed`, `stepNamed`).
  - **Scripts y lenguajes sin parser (Bash, k6, River):** se comprueban como texto, pero sin sus líneas de comentario y con expresiones ancladas (`/p\(95\)<200'/`, no `/p\(95\)<200/`, que acepta `p(95)<2000`). Un comando multilínea se une antes de buscar dentro de él.
  - **Documentos Markdown (`AUD-TST-DOC-001`): se comprueban identificadores, no frases.** Un párrafo reescrito sin cambiar ninguna garantía no debe romper un test. Se exige:
    - que el archivo exista y que sus enlaces relativos resuelvan;
    - los encabezados esperados (`## Decisión`, una sección numerada) y los identificadores que lo conectan al resto del repositorio (ID de ADR, nombre de tarea, ruta de archivo, nombre de variable o de flag);
    - los valores de una tabla leída por columnas cuando el documento es la fuente de una cifra (SLA, RPO, RTO).
    No se exigen frases completas ni adjetivos. Si una cifra se comprueba con regex (`/99\.5%\s*mensual/`), debe poder cambiar de redacción sin cambiar de valor. Los gates documentales (`validate-docs-governance`, `lint:docs:refs`, `docs_portal_integrity`) ya cubren enlaces rotos e índices: no se repiten en cada contrato.
  - **Qué se queda como texto aunque sea YAML:** los comentarios que son la garantía (por ejemplo, la mención de `kindnet` en `kind-cluster.yaml` o el tag legible junto al SHA en `.pre-commit-config.yaml`) y los escalares de bloque que embeben otro formato. Un `#` dentro de un escalar de bloque es texto, no comentario: el contenido embebido se parsea con su propio parser.
  - **Prueba de la prueba.** Al crear o reescribir un contrato se aplica cada defecto al artefacto real, se comprueba que el test nuevo falla y se compara con el test anterior (`git show origin/main:<archivo>`). Se incluyen siempre dos tipos de defecto: el valor cambiado con el original conservado en un comentario, y el comando o la opción desactivados con su texto aún presente en otra parte. Un mutante que sobrevive indica una aserción demasiado laxa o una mutación equivalente (se documenta cuál).
- **Relación Tests vs. Código Fuente:**
  - Mapeo bidireccional entre módulos en `apps/backend/src/` y sus suites asociadas.
  - Identificación de brechas de cobertura (`TEST_COVERAGE_GAP`) en flujos críticos no testeados.
- **Protocolo de Depuración:** Toda eliminación, fusión o movimiento de tests sigue el [protocolo único de depuración](../_shared/cleanup-protocol.md) con el vocabulario de 12 estados de esta skill.
  *Regla estricta:* Ningún test se elimina automáticamente en primera pasada ni únicamente porque no se ejecute (primero se investiga si obedece a un pipeline desconfigurado o test abandonado).
- **Gobernanza de Superficie de Testing (Test Surface Inventory):**
  - **Arquitectura Derivada y Reconciliable:** El código en `tests/` y `package.json` es la Fuente Única de Verdad (SSOT). La superficie se documenta y audita mediante dos artefactos gobernados:
    - `docs/testing/test-surface.json`: SSOT machine-readable con tipo, dominio, descripción, artefactos bajo prueba, comandos y trazabilidad CI. Solo datos estables: sin hashes, líneas ni conteos, de modo que editar un test existente no lo modifica (AUD-TST-SRF-001).
    - `docs/testing/test-surface.md`: Catálogo legible para humanos con tablas agrupadas por suite y dominio.
  - **Granularidad Dual (Suites y Casos Internos):** `npm run test:surface` calcula en cada ejecución, sin versionarlos, los casos (`test('...')` / `it('...')`), líneas y tamaño por archivo para diagnosticar God Test Files monolíticos (ej. `iac_baseline_security.test.ts`), suites infladas o pruebas sin aserciones.
  - **Ciclo de Reconciliación Automatizado:**
    `DISCOVER` (escaneo de `tests/`) → `NORMALIZE` (clasificación y extracción) → `COMPARE` (cálculo de drift contra `test-surface.json`) → `RECONCILE` (detección de altas/bajas/cambios) → `DOCUMENT` (actualización de catálogos) → `VALIDATE` (paridad estricta y Markdown Quality Gate).
  - **Taxonomía de Estados de Reconciliación:**
    - *Detectados por `npm run test:surface:check` y documentados en `docs/testing/test-surface.md`:* `NEW_TEST_FILE` (archivo de test no registrado), `REMOVED_TEST_FILE` (archivo eliminado que aún figura en el catálogo), `CHANGED` (metadatos publicados distintos de los del catálogo), `STALE_DOCUMENT` (los documentos no coinciden con lo que se generaría hoy), `BROKEN_TARGET` (artefacto bajo prueba inexistente) y `ORPHAN` (test en disco no cubierto por ningún script ni workflow).
    - *Clasificaciones manuales del agente (no las emite el script):* `RENAMED` (archivo reubicado entre suites), `DESCRIPTION_DRIFT` (desalineación entre el propósito documentado y las aserciones reales), `UNEXECUTED` (test presente en scripts npm pero no integrado en ningún workflow) y `STALE_REFERENCE` (referencia en documentación a un archivo o caso inexistente).
  - **Prevención de Drift en CI:** Ejecución obligatoria de `npm run test:surface:check` como Policy-as-Test contractual en `tests/contracts/governance/test_surface_contract.test.ts` y script `validate`.
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
