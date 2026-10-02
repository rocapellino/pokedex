# Inventario y Gobernanza de Superficie de Testing

> Documento generado automáticamente por `scripts/test-surface.ts`.
> Fuente Única de Verdad machine-readable: [`test-surface.json`](test-surface.json).

---

## 1. Resumen Ejecutivo de la Superficie

Este catálogo proporciona el inventario exhaustivo, auditable y granular de toda la superficie de pruebas en `rocapellino/pokedex`. Cada archivo y caso de prueba está tipificado, vinculado a sus artefactos bajo prueba, runner de ejecución y canal de CI/CD.

| Métrica | Valor Registrado |
| :--- | :--- |
| **Total de Archivos en `tests/`** | **48** |
| **Archivos de Test Automatizados** | 46 |
| **Scripts de Carga / Rendimiento (k6)** | 1 |
| **Archivos de Soporte / Entorno (Fixtures)** | 1 |
| **Total de Casos de Prueba Identificados** | **448** |
| **Líneas de Código de Pruebas** | 12.692 |
| **Tamaño Total de la Suite** | 579.2 KB |
| **Suites Especializadas Gobernadas** | 9 |
| **Última Sincronización** | 2026-10-02T15:59:17.305Z |

---

## 2. Matriz Canónica de Suites de Testing

| Suite | Nombre | Runner | Comando Principal | Archivos | Casos | Propósito |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **`unit`** | Pruebas Unitarias de Aplicación | `node:test (tsx)` | `npm run test:unit` | 4 | 31 | Pruebas de alta velocidad y aislamiento sobre servicios de dominio, autenticación, caché y repositorios. |
| **`security`** | Seguridad, Hardening y DevSecOps | `node:test (tsx)` | `npm run test:security` | 19 | 185 | Evaluación de políticas de admisión, Network Policies Cilium L7, cifrado DR, secretos Vault y contratos IaC. |
| **`gitops`** | Contratos de GitOps y Despliegue | `node:test (tsx)` | `npm run test:gitops` | 1 | 6 | Inmutabilidad de imágenes por digest SHA-256 en ArgoCD y paridad estricta entre entornos dev/preprod/prod. |
| **`frontend`** | Componentes y Controladores Frontend | `node:test + JSDOM` | `npm test` | 3 | 26 | Pruebas sobre controladores DOM de backoffice, toasts interactivos y componentes modales accesibles. |
| **`e2e`** | Pruebas End-to-End y Accesibilidad | `playwright` | `npm run test:e2e` | 2 | 10 | Simulación completa de flujos de usuario en Chromium y auditorías de accesibilidad WCAG 2.1 AA con Axe-core. |
| **`performance`** | Rendimiento y Carga (k6) | `k6` | `k6 run tests/performance/k6_stress_test.js` | 1 | 4 | Pruebas de estrés y límites de latencia HTTP bajo concurrencia continua respetando presupuestos de rate limit. |
| **`ci`** | Paridad y Gobernanza de CI/CD | `node:test (tsx)` | `npm test` | 1 | 4 | Verificación estructural de consistencia, timeouts y parámetros de ejecución en pipelines de GitHub Actions. |
| **`fuzz`** | API Fuzzing y Pruebas Adversariales | `node:test (tsx)` | `npm run test:fuzz` | 1 | 7 | Generación caótica y mutacional de payloads HTTP, validación de boundaries y resiliencia ante inputs malformados. |
| **`governance`** | Gobernanza y Contratos de Plataforma (Root) | `node:test (tsx)` | `npm test` | 16 | 175 | Contratos de tipos, gobernanza documental, reglas de protección de rama, pentesting e impacto de CI. |

---

## 3. Catálogo de Archivos de Prueba

A continuación se inventarían todos los archivos que componen la superficie de pruebas, indicando su suite, tipo, runner, casos que contiene y artefactos objetivo.

| Archivo | Suite | Tipo | Runner | Casos | Líneas | Dominio / Qué Verifica | Comandos |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| [`tests/aas_governance.test.ts`](../../tests/aas_governance.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **8** | 92 | Valida contratos de gobernanza de skills y agents en aas-stack.json, stacks requeridos y catálogo de herramientas. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/api-limits.test.ts`](../../tests/api-limits.test.ts) | `governance` | Integration | `node:test (tsx)` | **3** | 43 | Verifica rate limiting global y por endpoint, manejo de peticiones concurrentes y cabeceras X-RateLimit-* con código 429. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/audit_freshness.test.ts`](../../tests/audit_freshness.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **4** | 60 | Comprueba la política de demarcación de auditorías históricas en docs/audits/ y asegura que no sean interpretadas como SSOT vigente. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ci_impact.test.ts`](../../tests/ci_impact.test.ts) | `governance` | Contract / CI Matrix | `node:test (tsx)` | **47** | 1192 | Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ci/workflow_run_parity.test.ts`](../../tests/ci/workflow_run_parity.test.ts) | `ci` | Contract / CI | `node:test (tsx)` | **4** | 186 | Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/concurrency.test.ts`](../../tests/concurrency.test.ts) | `governance` | Integration | `node:test (tsx)` | **1** | 24 | Evalúa mutaciones concurrentes, aislamiento transaccional y prevención de race conditions en actualizaciones del catálogo Pokémon. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/contracts.test.ts`](../../tests/contracts.test.ts) | `governance` | Contract / Types | `node:test (tsx)` | **3** | 101 | Valida compatibilidad estructural estricta entre las interfaces de tipos de backend y frontend. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/doc_governance.test.ts`](../../tests/doc_governance.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **2** | 126 | Asegura que los ADRs y especificaciones técnicas cumplan con el formato canónico, encabezados y metadatos obligatorios. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/e2e/backoffice.spec.ts`](../../tests/e2e/backoffice.spec.ts) | `e2e` | E2E | `playwright` | **5** | 108 | Flujos completos de administración en navegador: login con token, CRUD de Pokémon, paginación y modal de confirmación. | `npm run test:e2e`, `npm run test:a11y` |
| [`tests/e2e/pokedex.spec.ts`](../../tests/e2e/pokedex.spec.ts) | `e2e` | E2E / a11y | `playwright` | **5** | 90 | Flujos de usuario en navegador: carga de catálogo, filtro con debounce, conmutador de tema oscuro y auditoría Axe-core WCAG 2.1 AA. | `npm run test:e2e`, `npm run test:a11y` |
| [`tests/frontend/backoffice_controller.test.ts`](../../tests/frontend/backoffice_controller.test.ts) | `frontend` | Component / Unit | `node:test (tsx)` | **18** | 282 | Valida eventos de DOM, renderizado de tablas, modales interactivos y toasts en el backoffice usando entorno JSDOM. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/frontend/backoffice_env.ts`](../../tests/frontend/backoffice_env.ts) | `frontend` | Helper / Environment | `none` | **0** | 94 | Módulo de arranque de navegador simulado con JSDOM para ejecución determinista y cobertura estática V8 en pruebas frontend. | *(Helper)* |
| [`tests/frontend/modal_components.test.ts`](../../tests/frontend/modal_components.test.ts) | `frontend` | Component / Unit | `node:test (tsx)` | **8** | 142 | Valida el ciclo de vida de modales accesibles, trampa de foco para teclado (Tab/Shift+Tab), tecla Escape y cierre por backdrop. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/fuzzing.test.ts`](../../tests/fuzzing.test.ts) | `fuzz` | Fuzz | `node:test (tsx)` | **7** | 220 | Ejecuta fuzzing adversarial con mutaciones caóticas de JSON, delimitadores y límites de buffer en endpoints REST. | `npm run test:fuzz`, `npm run test:all` |
| [`tests/gitops/argocd_pinning.test.ts`](../../tests/gitops/argocd_pinning.test.ts) | `gitops` | Contract / GitOps | `node:test (tsx)` | **6** | 237 | Valida pinning estricto por digest SHA-256 en manifiestos de ArgoCD y prohíbe tags mutables (:latest) en dev, preprod y prod. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops` |
| [`tests/markdown_gate.test.ts`](../../tests/markdown_gate.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **7** | 78 | Verifica el comportamiento del motor de linting de Markdown, reporte de errores MDxxx y mecanismos de auto-fix. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/pentest.test.ts`](../../tests/pentest.test.ts) | `governance` | Security / Pentest | `node:test (tsx)` | **28** | 627 | Ejecuta batería exhaustiva de vectores de ataque: SQLi, NoSQLi, path traversal, XSS, HTTP parameter pollution y headers de seguridad. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/performance/k6_stress_test.js`](../../tests/performance/k6_stress_test.js) | `performance` | Load / Stress | `k6` | **4** | 167 | Prueba de carga k6 que valida umbrales p95/p99 de latencia, tasa de error y respeto de rate limits sin generar 429 espurios. | `k6 run tests/performance/k6_stress_test.js` |
| [`tests/pr_template_governance.test.ts`](../../tests/pr_template_governance.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **6** | 267 | Valida conformidad estricta del cuerpo de PR contra el template físico oficial, impidiendo estructuras arbitrarias o mojibake. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ruleset_contract.test.ts`](../../tests/ruleset_contract.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **3** | 108 | Valida la estructura declarativa y restricciones de protección de rama del ruleset main-protection.json contra el esquema de GitHub. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ruleset_parity.test.ts`](../../tests/ruleset_parity.test.ts) | `governance` | Contract / Governance | `node:test (tsx)` | **10** | 254 | Verifica la paridad e identifica drift entre el ruleset declarativo local y las reglas activas en la API remota de GitHub. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/security.test.ts`](../../tests/security.test.ts) | `governance` | Security / Application | `node:test (tsx)` | **28** | 448 | Valida cabeceras Helmet (HSTS, CSP, X-Frame-Options), CORS restrictivo, prevención de fuga de información y manejo seguro de errores. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/adr_compliance_contracts.test.ts`](../../tests/security/adr_compliance_contracts.test.ts) | `security` | Contract / Architecture | `node:test (tsx)` | **19** | 759 | Comprueba el cumplimiento de decisiones de arquitectura registradas en ADR-001 a ADR-015 (topología, RBAC, ingress y secrets). | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/docs_governance_gate.test.ts`](../../tests/security/docs_governance_gate.test.ts) | `security` | Automated Test | `node:test (tsx)` | **1** | 28 | Suite de pruebas security: docs_governance_gate.test.ts. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/docs_portal_integrity.test.ts`](../../tests/security/docs_portal_integrity.test.ts) | `security` | Contract / Docs | `node:test (tsx)` | **3** | 152 | Valida vínculos internos, anclas, sintaxis y consistencia de navegación en el portal documental. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/dr_backup_security.test.ts`](../../tests/security/dr_backup_security.test.ts) | `security` | Security / Backup | `node:test (tsx)` | **9** | 318 | Valida cifrado AES-256-GCM en reposo de snapshots de base de datos, permisos de archivos y aislamiento de claves. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/dr_e2e_drill.test.ts`](../../tests/security/dr_e2e_drill.test.ts) | `security` | Security / DR | `node:test (tsx)` | **5** | 155 | Evalúa la ejecución completa del simulacro de desastre automatizado, restauración limpia y verificación de RTO/RPO. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/egress_anti_ssrf.test.ts`](../../tests/security/egress_anti_ssrf.test.ts) | `security` | Security / Network | `node:test (tsx)` | **4** | 226 | Valida Network Policies Cilium L7 eBPF, bloqueo de rangos privados (RFC 1918, link-local, cloud metadata) y allowlist estricta. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`, `npm run test:security:egress` |
| [`tests/security/ghcr_retention.test.ts`](../../tests/security/ghcr_retention.test.ts) | `security` | Contract / OCI | `node:test (tsx)` | **3** | 187 | Verifica la política de retención de imágenes OCI en GHCR, preservación de releases semver y limpieza de imágenes huérfanas. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/github_security_linear_sync.test.ts`](../../tests/security/github_security_linear_sync.test.ts) | `security` | Contract / SecOps | `node:test (tsx)` | **12** | 321 | Valida sincronización bidireccional idempotente de vulnerabilidades y alertas de seguridad hacia issues de Linear. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/gitops_image_parity.test.ts`](../../tests/security/gitops_image_parity.test.ts) | `security` | Contract / GitOps | `node:test (tsx)` | **8** | 141 | Comprueba el script de verificación de paridad de imagen asegurando inmutabilidad entre entornos dev, preprod y prod. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/grafana_portability.test.ts`](../../tests/security/grafana_portability.test.ts) | `security` | Contract / Observability | `node:test (tsx)` | **5** | 241 | Valida esquemas JSON declarativos de dashboards Grafana, portabilidad de datasources y ausencia de UIDs fijos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/iac_baseline_security.test.ts`](../../tests/security/iac_baseline_security.test.ts) | `security` | Security / IaC | `node:test (tsx)` | **31** | 1190 | Suite integral de seguridad IaC: valida que ningún manifiesto K8s o chart viole políticas CIS, contraseñas hardcodeadas o permisos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/ignore_hygiene.test.ts`](../../tests/security/ignore_hygiene.test.ts) | `security` | Contract / Hygiene | `node:test (tsx)` | **10** | 195 | Valida el linter de higiene de archivos .ignore, previniendo exclusión indebida, duplicados o fuga de secretos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/k8s_workload_hardening.test.ts`](../../tests/security/k8s_workload_hardening.test.ts) | `security` | Security / Kubernetes | `node:test (tsx)` | **20** | 963 | Verifica SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp), límites de recursos y probes de salud. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/network_policies_security.test.ts`](../../tests/security/network_policies_security.test.ts) | `security` | Security / Network | `node:test (tsx)` | **14** | 412 | Verifica aislamiento estricto entre pods de frontend, backend, Redis y PostgreSQL impidiendo accesos laterales no autorizados. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/operation_dr_benchmarks.test.ts`](../../tests/security/operation_dr_benchmarks.test.ts) | `security` | Security / DR Benchmarks | `node:test (tsx)` | **9** | 125 | Valida umbrales cuantitativos de tiempo de backup, compresión y consistencia de restauración contra SLAs operacionales. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/promote_auto_approve_contracts.test.ts`](../../tests/security/promote_auto_approve_contracts.test.ts) | `security` | Contract / CI-CD | `node:test (tsx)` | **1** | 64 | Valida políticas de auto-aprobación de PRs de dependencias patch/minor con suites de seguridad obligatorias. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/supply_chain_security.test.ts`](../../tests/security/supply_chain_security.test.ts) | `security` | Security / Supply Chain | `node:test (tsx)` | **16** | 544 | Comprueba inmutabilidad de dependencias, bloqueo de scripts arbitrarios en npm ci, SBOM y firma de imágenes. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/vault_redeploy_contract.test.ts`](../../tests/security/vault_redeploy_contract.test.ts) | `security` | Security / Secrets | `node:test (tsx)` | **10** | 179 | Valida el reinicio controlado de workloads y el refresco de secretos inyectados tras rotaciones en HashiCorp Vault. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/security/yaml_extension_governance.test.ts`](../../tests/security/yaml_extension_governance.test.ts) | `security` | Contract / Governance | `node:test (tsx)` | **5** | 130 | Verifica cumplimiento estricto del uso exclusivo de la extensión .yaml (prohibiendo .yml) en todo el repositorio. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security` |
| [`tests/storage.test.ts`](../../tests/storage.test.ts) | `governance` | Integration | `node:test (tsx)` | **8** | 121 | Valida operaciones CRUD del repositorio, serialización y resiliencia de la capa de datos. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/unit/auth_service.test.ts`](../../tests/unit/auth_service.test.ts) | `unit` | Unit | `node:test (tsx)` | **9** | 262 | Valida ciclo de vida de tokens HMAC-SHA256, expiración, verificación de firma, revocación en memoria y fail-closed de secretos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/cache_service.test.ts`](../../tests/unit/cache_service.test.ts) | `unit` | Unit | `node:test (tsx)` | **5** | 81 | Valida almacenamiento en caché Redis con fallback transparente a memoria local, TTL y resiliencia ante cortes de red. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/pokemon_repository.test.ts`](../../tests/unit/pokemon_repository.test.ts) | `unit` | Unit | `node:test (tsx)` | **8** | 196 | Valida operaciones de consulta, filtrado por tipo, búsqueda por nombre, paginación y transformaciones de atributos. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/unit/postgres_fail_closed.test.ts`](../../tests/unit/postgres_fail_closed.test.ts) | `unit` | Unit | `node:test (tsx)` | **9** | 242 | Verifica comportamiento fail-closed ante indisponibilidad de PostgreSQL, reintentos con backoff y aislamiento de errores. | `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit` |
| [`tests/version_consistency.test.ts`](../../tests/version_consistency.test.ts) | `governance` | Contract / Release | `node:test (tsx)` | **3** | 100 | Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm). | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/version.test.ts`](../../tests/version.test.ts) | `governance` | Integration | `node:test (tsx)` | **14** | 414 | Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime. | `npm test`, `npm run test:all`, `npm run test:coverage` |

---

## 4. Desglose Estructurado por Suite de Pruebas

Para facilitar la inspección humana de la cobertura, las pruebas se agrupan por suite especializada. El catálogo completo y granular con el detalle de cada aserción individual se preserva en [`test-surface.json`](test-surface.json).

### Suite: Pruebas Unitarias de Aplicación (`unit`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:unit` | **Total Casos:** 31
- **Propósito:** Pruebas de alta velocidad y aislamiento sobre servicios de dominio, autenticación, caché y repositorios.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/unit/auth_service.test.ts`](../../tests/unit/auth_service.test.ts) | **9** | 262 | Valida ciclo de vida de tokens HMAC-SHA256, expiración, verificación de firma, revocación en memoria y fail-closed de secretos. | `apps/backend/src/services/auth.ts` |
| [`tests/unit/cache_service.test.ts`](../../tests/unit/cache_service.test.ts) | **5** | 81 | Valida almacenamiento en caché Redis con fallback transparente a memoria local, TTL y resiliencia ante cortes de red. | `apps/backend/src/services/cache.ts` |
| [`tests/unit/pokemon_repository.test.ts`](../../tests/unit/pokemon_repository.test.ts) | **8** | 196 | Valida operaciones de consulta, filtrado por tipo, búsqueda por nombre, paginación y transformaciones de atributos. | `apps/backend/src/services/pokemon.repository.ts` |
| [`tests/unit/postgres_fail_closed.test.ts`](../../tests/unit/postgres_fail_closed.test.ts) | **9** | 242 | Verifica comportamiento fail-closed ante indisponibilidad de PostgreSQL, reintentos con backoff y aislamiento de errores. | `apps/backend/src/services/postgres.ts`, `apps/backend/server.ts` |

### Suite: Seguridad, Hardening y DevSecOps (`security`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:security` | **Total Casos:** 185
- **Propósito:** Evaluación de políticas de admisión, Network Policies Cilium L7, cifrado DR, secretos Vault y contratos IaC.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/security/adr_compliance_contracts.test.ts`](../../tests/security/adr_compliance_contracts.test.ts) | **19** | 759 | Comprueba el cumplimiento de decisiones de arquitectura registradas en ADR-001 a ADR-015 (topología, RBAC, ingress y secrets). | `docs/decisions/` |
| [`tests/security/docs_governance_gate.test.ts`](../../tests/security/docs_governance_gate.test.ts) | **1** | 28 | Suite de pruebas security: docs_governance_gate.test.ts. | *(General)* |
| [`tests/security/docs_portal_integrity.test.ts`](../../tests/security/docs_portal_integrity.test.ts) | **3** | 152 | Valida vínculos internos, anclas, sintaxis y consistencia de navegación en el portal documental. | `docs/` |
| [`tests/security/dr_backup_security.test.ts`](../../tests/security/dr_backup_security.test.ts) | **9** | 318 | Valida cifrado AES-256-GCM en reposo de snapshots de base de datos, permisos de archivos y aislamiento de claves. | `scripts/dr-drill.ts`, `scripts/dev-backup-gdrive.ts` |
| [`tests/security/dr_e2e_drill.test.ts`](../../tests/security/dr_e2e_drill.test.ts) | **5** | 155 | Evalúa la ejecución completa del simulacro de desastre automatizado, restauración limpia y verificación de RTO/RPO. | `scripts/dr-drill.ts` |
| [`tests/security/egress_anti_ssrf.test.ts`](../../tests/security/egress_anti_ssrf.test.ts) | **4** | 226 | Valida Network Policies Cilium L7 eBPF, bloqueo de rangos privados (RFC 1918, link-local, cloud metadata) y allowlist estricta. | `infra/helm/pokedex/templates/cilium-network-policies.yaml`, `scripts/probe-egress-security.ts` |
| [`tests/security/ghcr_retention.test.ts`](../../tests/security/ghcr_retention.test.ts) | **3** | 187 | Verifica la política de retención de imágenes OCI en GHCR, preservación de releases semver y limpieza de imágenes huérfanas. | `scripts/ghcr-retention.ts`, `.github/workflows/ghcr-retention.yaml` |
| [`tests/security/github_security_linear_sync.test.ts`](../../tests/security/github_security_linear_sync.test.ts) | **12** | 321 | Valida sincronización bidireccional idempotente de vulnerabilidades y alertas de seguridad hacia issues de Linear. | `scripts/github-security-linear-sync.ts`, `.github/workflows/github-security-linear-sync.yaml` |
| [`tests/security/gitops_image_parity.test.ts`](../../tests/security/gitops_image_parity.test.ts) | **8** | 141 | Comprueba el script de verificación de paridad de imagen asegurando inmutabilidad entre entornos dev, preprod y prod. | `scripts/verify-image-digest-parity.ts`, `gitops/` |
| [`tests/security/grafana_portability.test.ts`](../../tests/security/grafana_portability.test.ts) | **5** | 241 | Valida esquemas JSON declarativos de dashboards Grafana, portabilidad de datasources y ausencia de UIDs fijos. | `infra/monitoring/dashboards/` |
| [`tests/security/iac_baseline_security.test.ts`](../../tests/security/iac_baseline_security.test.ts) | **31** | 1190 | Suite integral de seguridad IaC: valida que ningún manifiesto K8s o chart viole políticas CIS, contraseñas hardcodeadas o permisos. | `infra/k8s/`, `infra/helm/pokedex/` |
| [`tests/security/ignore_hygiene.test.ts`](../../tests/security/ignore_hygiene.test.ts) | **10** | 195 | Valida el linter de higiene de archivos .ignore, previniendo exclusión indebida, duplicados o fuga de secretos. | `scripts/check-ignore-hygiene.ts`, `.gitignore`, `.dockerignore` |
| [`tests/security/k8s_workload_hardening.test.ts`](../../tests/security/k8s_workload_hardening.test.ts) | **20** | 963 | Verifica SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp), límites de recursos y probes de salud. | `infra/k8s/`, `infra/helm/pokedex/templates/` |
| [`tests/security/network_policies_security.test.ts`](../../tests/security/network_policies_security.test.ts) | **14** | 412 | Verifica aislamiento estricto entre pods de frontend, backend, Redis y PostgreSQL impidiendo accesos laterales no autorizados. | `infra/helm/pokedex/templates/network-policies.yaml`, `infra/helm/pokedex/templates/cilium-network-policies.yaml` |
| [`tests/security/operation_dr_benchmarks.test.ts`](../../tests/security/operation_dr_benchmarks.test.ts) | **9** | 125 | Valida umbrales cuantitativos de tiempo de backup, compresión y consistencia de restauración contra SLAs operacionales. | `scripts/dr-drill.ts` |
| [`tests/security/promote_auto_approve_contracts.test.ts`](../../tests/security/promote_auto_approve_contracts.test.ts) | **1** | 64 | Valida políticas de auto-aprobación de PRs de dependencias patch/minor con suites de seguridad obligatorias. | `.github/workflows/promote-auto-approve.yaml` |
| [`tests/security/supply_chain_security.test.ts`](../../tests/security/supply_chain_security.test.ts) | **16** | 544 | Comprueba inmutabilidad de dependencias, bloqueo de scripts arbitrarios en npm ci, SBOM y firma de imágenes. | `package.json`, `package-lock.json`, `.github/workflows/ci.yaml` |
| [`tests/security/vault_redeploy_contract.test.ts`](../../tests/security/vault_redeploy_contract.test.ts) | **10** | 179 | Valida el reinicio controlado de workloads y el refresco de secretos inyectados tras rotaciones en HashiCorp Vault. | `scripts/k8s-rollout-restart.ts` |
| [`tests/security/yaml_extension_governance.test.ts`](../../tests/security/yaml_extension_governance.test.ts) | **5** | 130 | Verifica cumplimiento estricto del uso exclusivo de la extensión .yaml (prohibiendo .yml) en todo el repositorio. | `scripts/check-yaml-extension.ts` |

### Suite: Contratos de GitOps y Despliegue (`gitops`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:gitops` | **Total Casos:** 6
- **Propósito:** Inmutabilidad de imágenes por digest SHA-256 en ArgoCD y paridad estricta entre entornos dev/preprod/prod.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/gitops/argocd_pinning.test.ts`](../../tests/gitops/argocd_pinning.test.ts) | **6** | 237 | Valida pinning estricto por digest SHA-256 en manifiestos de ArgoCD y prohíbe tags mutables (:latest) en dev, preprod y prod. | `gitops/values-*.yaml`, `scripts/verify-image-digest-parity.ts` |

### Suite: Componentes y Controladores Frontend (`frontend`)

- **Runner:** `node:test + JSDOM` | **Comando:** `npm test` | **Total Casos:** 26
- **Propósito:** Pruebas sobre controladores DOM de backoffice, toasts interactivos y componentes modales accesibles.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/frontend/backoffice_controller.test.ts`](../../tests/frontend/backoffice_controller.test.ts) | **18** | 282 | Valida eventos de DOM, renderizado de tablas, modales interactivos y toasts en el backoffice usando entorno JSDOM. | `apps/frontend/src/backoffice.ts` |
| [`tests/frontend/backoffice_env.ts`](../../tests/frontend/backoffice_env.ts) | **0** | 94 | Módulo de arranque de navegador simulado con JSDOM para ejecución determinista y cobertura estática V8 en pruebas frontend. | `apps/frontend/src/backoffice.ts` |
| [`tests/frontend/modal_components.test.ts`](../../tests/frontend/modal_components.test.ts) | **8** | 142 | Valida el ciclo de vida de modales accesibles, trampa de foco para teclado (Tab/Shift+Tab), tecla Escape y cierre por backdrop. | `apps/frontend/src/components/modal-detail.ts`, `apps/frontend/src/components/modal-crud.ts` |

### Suite: Pruebas End-to-End y Accesibilidad (`e2e`)

- **Runner:** `playwright` | **Comando:** `npm run test:e2e` | **Total Casos:** 10
- **Propósito:** Simulación completa de flujos de usuario en Chromium y auditorías de accesibilidad WCAG 2.1 AA con Axe-core.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/e2e/backoffice.spec.ts`](../../tests/e2e/backoffice.spec.ts) | **5** | 108 | Flujos completos de administración en navegador: login con token, CRUD de Pokémon, paginación y modal de confirmación. | `apps/frontend/src/backoffice.ts`, `apps/frontend/backoffice.html` |
| [`tests/e2e/pokedex.spec.ts`](../../tests/e2e/pokedex.spec.ts) | **5** | 90 | Flujos de usuario en navegador: carga de catálogo, filtro con debounce, conmutador de tema oscuro y auditoría Axe-core WCAG 2.1 AA. | `apps/frontend/src/pokedex.ts`, `apps/frontend/index.html` |

### Suite: Rendimiento y Carga (k6) (`performance`)

- **Runner:** `k6` | **Comando:** `k6 run tests/performance/k6_stress_test.js` | **Total Casos:** 4
- **Propósito:** Pruebas de estrés y límites de latencia HTTP bajo concurrencia continua respetando presupuestos de rate limit.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/performance/k6_stress_test.js`](../../tests/performance/k6_stress_test.js) | **4** | 167 | Prueba de carga k6 que valida umbrales p95/p99 de latencia, tasa de error y respeto de rate limits sin generar 429 espurios. | `apps/backend/server.ts`, `apps/backend/src/middleware/rate-limiter.ts` |

### Suite: Paridad y Gobernanza de CI/CD (`ci`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm test` | **Total Casos:** 4
- **Propósito:** Verificación estructural de consistencia, timeouts y parámetros de ejecución en pipelines de GitHub Actions.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/ci/workflow_run_parity.test.ts`](../../tests/ci/workflow_run_parity.test.ts) | **4** | 186 | Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI. | `.github/workflows/*.yaml` |

### Suite: API Fuzzing y Pruebas Adversariales (`fuzz`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm run test:fuzz` | **Total Casos:** 7
- **Propósito:** Generación caótica y mutacional de payloads HTTP, validación de boundaries y resiliencia ante inputs malformados.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/fuzzing.test.ts`](../../tests/fuzzing.test.ts) | **7** | 220 | Ejecuta fuzzing adversarial con mutaciones caóticas de JSON, delimitadores y límites de buffer en endpoints REST. | `apps/backend/src/routes/pokemons.ts`, `apps/backend/src/validation/schemas.ts` |

### Suite: Gobernanza y Contratos de Plataforma (Root) (`governance`)

- **Runner:** `node:test (tsx)` | **Comando:** `npm test` | **Total Casos:** 175
- **Propósito:** Contratos de tipos, gobernanza documental, reglas de protección de rama, pentesting e impacto de CI.

| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |
| :--- | :---: | :---: | :--- | :--- |
| [`tests/aas_governance.test.ts`](../../tests/aas_governance.test.ts) | **8** | 92 | Valida contratos de gobernanza de skills y agents en aas-stack.json, stacks requeridos y catálogo de herramientas. | `.agents/aas/aas-stack.json` |
| [`tests/api-limits.test.ts`](../../tests/api-limits.test.ts) | **3** | 43 | Verifica rate limiting global y por endpoint, manejo de peticiones concurrentes y cabeceras X-RateLimit-* con código 429. | `apps/backend/src/middleware/rate-limiter.ts`, `apps/backend/server.ts` |
| [`tests/audit_freshness.test.ts`](../../tests/audit_freshness.test.ts) | **4** | 60 | Comprueba la política de demarcación de auditorías históricas en docs/audits/ y asegura que no sean interpretadas como SSOT vigente. | `docs/audits/` |
| [`tests/ci_impact.test.ts`](../../tests/ci_impact.test.ts) | **47** | 1192 | Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed. | `scripts/detect-change-impact.ts`, `.agents/skills/_shared/change-impact-matrix.md` |
| [`tests/concurrency.test.ts`](../../tests/concurrency.test.ts) | **1** | 24 | Evalúa mutaciones concurrentes, aislamiento transaccional y prevención de race conditions en actualizaciones del catálogo Pokémon. | `apps/backend/src/services/db.ts` |
| [`tests/contracts.test.ts`](../../tests/contracts.test.ts) | **3** | 101 | Valida compatibilidad estructural estricta entre las interfaces de tipos de backend y frontend. | `apps/backend/src/types.ts`, `apps/frontend/src/types.ts` |
| [`tests/doc_governance.test.ts`](../../tests/doc_governance.test.ts) | **2** | 126 | Asegura que los ADRs y especificaciones técnicas cumplan con el formato canónico, encabezados y metadatos obligatorios. | `docs/decisions/`, `.agents/rules/documentation-governance.md` |
| [`tests/markdown_gate.test.ts`](../../tests/markdown_gate.test.ts) | **7** | 78 | Verifica el comportamiento del motor de linting de Markdown, reporte de errores MDxxx y mecanismos de auto-fix. | `scripts/lint-markdown.ts`, `.markdownlint.json` |
| [`tests/pentest.test.ts`](../../tests/pentest.test.ts) | **28** | 627 | Ejecuta batería exhaustiva de vectores de ataque: SQLi, NoSQLi, path traversal, XSS, HTTP parameter pollution y headers de seguridad. | `apps/backend/server.ts`, `apps/backend/src/routes/` |
| [`tests/pr_template_governance.test.ts`](../../tests/pr_template_governance.test.ts) | **6** | 267 | Valida conformidad estricta del cuerpo de PR contra el template físico oficial, impidiendo estructuras arbitrarias o mojibake. | `.github/pull_request_template.md`, `scripts/validate-pr-body.ts` |
| [`tests/ruleset_contract.test.ts`](../../tests/ruleset_contract.test.ts) | **3** | 108 | Valida la estructura declarativa y restricciones de protección de rama del ruleset main-protection.json contra el esquema de GitHub. | `.github/rulesets/main-protection.json` |
| [`tests/ruleset_parity.test.ts`](../../tests/ruleset_parity.test.ts) | **10** | 254 | Verifica la paridad e identifica drift entre el ruleset declarativo local y las reglas activas en la API remota de GitHub. | `.github/rulesets/main-protection.json`, `scripts/check-ruleset-parity.ts` |
| [`tests/security.test.ts`](../../tests/security.test.ts) | **28** | 448 | Valida cabeceras Helmet (HSTS, CSP, X-Frame-Options), CORS restrictivo, prevención de fuga de información y manejo seguro de errores. | `apps/backend/server.ts`, `apps/backend/src/middleware/` |
| [`tests/storage.test.ts`](../../tests/storage.test.ts) | **8** | 121 | Valida operaciones CRUD del repositorio, serialización y resiliencia de la capa de datos. | `apps/backend/src/services/db.ts`, `apps/backend/src/services/cache.ts` |
| [`tests/version_consistency.test.ts`](../../tests/version_consistency.test.ts) | **3** | 100 | Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm). | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, `infra/helm/pokedex/Chart.yaml` |
| [`tests/version.test.ts`](../../tests/version.test.ts) | **14** | 414 | Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime. | `apps/backend/server.ts` |

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
