# Inventario y Gobernanza de Superficie de Testing

> Documento generado automáticamente por `scripts/test-surface.ts`.
> Fuente Única de Verdad machine-readable: [`test-surface.json`](test-surface.json).

---

## 1. Resumen Ejecutivo de la Superficie

Este catálogo proporciona el inventario exhaustivo, auditable y granular de toda la superficie de pruebas en `rocapellino/pokedex`. Cada archivo y caso de prueba está tipificado, vinculado a sus artefactos bajo prueba, runner de ejecución y canal de CI/CD.

| Métrica | Valor Registrado |
| :--- | :--- |
| **Total de Archivos en `tests/`** | **47** |
| **Archivos de Test Automatizados** | 45 |
| **Scripts de Carga / Rendimiento (k6)** | 1 |
| **Archivos de Soporte / Entorno (Fixtures)** | 1 |
| **Total de Casos de Prueba Identificados** | **447** |
| **Líneas de Código de Pruebas** | 12.664 |
| **Tamaño Total de la Suite** | 578.0 KB |
| **Suites Especializadas Gobernadas** | 9 |
| **Última Sincronización** | 2026-10-02T14:26:59.780Z |

---

## 2. Matriz Canónica de Suites de Testing

| Suite | Nombre | Runner | Comando Principal | Archivos | Casos | Propósito |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **`unit`** | Pruebas Unitarias de Aplicación | `node:test (tsx)` | `npm run test:unit` | 4 | 31 | Pruebas de alta velocidad y aislamiento sobre servicios de dominio, autenticación, caché y repositorios. |
| **`security`** | Seguridad, Hardening y DevSecOps | `node:test (tsx)` | `npm run test:security` | 18 | 184 | Evaluación de políticas de admisión, Network Policies Cilium L7, cifrado DR, secretos Vault y contratos IaC. |
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
| [`tests/ci/workflow_run_parity.test.ts`](../../tests/ci/workflow_run_parity.test.ts) | `ci` | Contract / CI | `node:test (tsx)` | **4** | 186 | Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/ci_impact.test.ts`](../../tests/ci_impact.test.ts) | `governance` | Contract / CI Matrix | `node:test (tsx)` | **47** | 1192 | Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed. | `npm test`, `npm run test:all`, `npm run test:coverage` |
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
| [`tests/version.test.ts`](../../tests/version.test.ts) | `governance` | Integration | `node:test (tsx)` | **14** | 414 | Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime. | `npm test`, `npm run test:all`, `npm run test:coverage` |
| [`tests/version_consistency.test.ts`](../../tests/version_consistency.test.ts) | `governance` | Contract / Release | `node:test (tsx)` | **3** | 100 | Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm). | `npm test`, `npm run test:all`, `npm run test:coverage` |

---

## 4. Desglose Granular de Casos de Prueba por Archivo

Para asegurar trazabilidad completa frente a suites monolíticas y cambios internos, este desglose lista cada caso de prueba individualmente.

### Suite: Pruebas Unitarias de Aplicación (`unit`)

#### [`tests/unit/auth_service.test.ts`](../../tests/unit/auth_service.test.ts)

- **Dominio:** Servicio de Autenticación y Sesiones
- **Tipo:** Unit | **Runner:** `node:test (tsx)` | **Casos:** 9 | **Líneas:** 262 (10.3 KB)
- **Descripción:** Valida ciclo de vida de tokens HMAC-SHA256, expiración, verificación de firma, revocación en memoria y fail-closed de secretos.
- **Artefactos Bajo Prueba:** `apps/backend/src/services/auth.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L16](../../tests/unit/auth_service.test.ts#L16) | 🔐 AuthService [Unit]: getSessionSecret opera con clave efímera en desarrollo y falla en producción |
| 2 | [L48](../../tests/unit/auth_service.test.ts#L48) | 🔐 AuthService [Unit]: verifyTokenSignature valida formato estructural y delimitadores |
| 3 | [L63](../../tests/unit/auth_service.test.ts#L63) | 🔐 AuthService [Unit]: verifyTokenSignature rechaza firmas HMAC manipuladas con timingSafeEqual |
| 4 | [L93](../../tests/unit/auth_service.test.ts#L93) | 🔐 AuthService [Unit]: verifyTokenSignature rechaza payloads JSON corruptos o no conformes |
| 5 | [L145](../../tests/unit/auth_service.test.ts#L145) | 🔐 AuthService [Unit]: generateSessionToken genera tokens válidos con jti de 32 caracteres hex |
| 6 | [L162](../../tests/unit/auth_service.test.ts#L162) | 🔐 AuthService [Unit]: verifySessionToken detecta expiración cronológica |
| 7 | [L179](../../tests/unit/auth_service.test.ts#L179) | 🔐 AuthService [Unit]: ciclo completo de revocación local de sesión |
| 8 | [L214](../../tests/unit/auth_service.test.ts#L214) | 🔐 AuthService [Unit]: revokeSessionToken rechaza tokens apócrifos y optimiza tokens ya expirados |
| 9 | [L230](../../tests/unit/auth_service.test.ts#L230) | 🔐 AuthService [Unit]: Fail-Closed ante REDIS_URL configurado pero Redis inaccesible |

#### [`tests/unit/cache_service.test.ts`](../../tests/unit/cache_service.test.ts)

- **Dominio:** Servicio de Caché y Fallback
- **Tipo:** Unit | **Runner:** `node:test (tsx)` | **Casos:** 5 | **Líneas:** 81 (2.6 KB)
- **Descripción:** Valida almacenamiento en caché Redis con fallback transparente a memoria local, TTL y resiliencia ante cortes de red.
- **Artefactos Bajo Prueba:** `apps/backend/src/services/cache.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L14](../../tests/unit/cache_service.test.ts#L14) | ⚡ CacheService [Unit]: estado desconectado por defecto y no-op seguro |
| 2 | [L28](../../tests/unit/cache_service.test.ts#L28) | ⚡ CacheService [Unit]: rate limiter distribuido retorna null (fallback) sin Redis |
| 3 | [L35](../../tests/unit/cache_service.test.ts#L35) | ⚡ CacheService [Unit]: operaciones de revocación de JTI retornan falsy/null sin conexión |
| 4 | [L55](../../tests/unit/cache_service.test.ts#L55) | ⚡ CacheService [Unit]: connectRedis sin variables de entorno retorna false inmediatamente |
| 5 | [L72](../../tests/unit/cache_service.test.ts#L72) | ⚡ CacheService [Unit]: closeRedis es idempotente y seguro ante invocaciones repetidas |

#### [`tests/unit/pokemon_repository.test.ts`](../../tests/unit/pokemon_repository.test.ts)

- **Dominio:** Repositorio de Datos Pokémon
- **Tipo:** Unit | **Runner:** `node:test (tsx)` | **Casos:** 8 | **Líneas:** 196 (6.6 KB)
- **Descripción:** Valida operaciones de consulta, filtrado por tipo, búsqueda por nombre, paginación y transformaciones de atributos.
- **Artefactos Bajo Prueba:** `apps/backend/src/services/pokemon.repository.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L15](../../tests/unit/pokemon_repository.test.ts#L15) | 🐾 PokemonRepository [Unit]: inicialización de catálogo y reporte de memoria |
| 2 | [L20](../../tests/unit/pokemon_repository.test.ts#L20) | 🐾 PokemonRepository [Unit]: isWritableStorageAvailable aplica Fail-Closed cuando PG está configurado pero inactivo |
| 3 | [L40](../../tests/unit/pokemon_repository.test.ts#L40) | 🐾 PokemonRepository [Unit]: getAllPokemons paginación y ordenamiento ascendente |
| 4 | [L56](../../tests/unit/pokemon_repository.test.ts#L56) | 🐾 PokemonRepository [Unit]: getAllPokemons filtrado insensible por tipo y búsqueda de texto |
| 5 | [L79](../../tests/unit/pokemon_repository.test.ts#L79) | 🐾 PokemonRepository [Unit]: getPokemonById retorna entidad exacta o null |
| 6 | [L91](../../tests/unit/pokemon_repository.test.ts#L91) | 🐾 PokemonRepository [Unit]: ciclo completo de savePokemon y deletePokemon en memoria |
| 7 | [L147](../../tests/unit/pokemon_repository.test.ts#L147) | 🐾 PokemonRepository [Unit]: savePokemon y deletePokemon fallan cerrado si PG está configurado pero caído |
| 8 | [L187](../../tests/unit/pokemon_repository.test.ts#L187) | 🐾 PokemonRepository [Unit]: getNextPokemonId genera IDs secuenciales continuos mayores a 1008 |

#### [`tests/unit/postgres_fail_closed.test.ts`](../../tests/unit/postgres_fail_closed.test.ts)

- **Dominio:** Resiliencia de Conexión a Base de Datos
- **Tipo:** Unit | **Runner:** `node:test (tsx)` | **Casos:** 9 | **Líneas:** 242 (7.7 KB)
- **Descripción:** Verifica comportamiento fail-closed ante indisponibilidad de PostgreSQL, reintentos con backoff y aislamiento de errores.
- **Artefactos Bajo Prueba:** `apps/backend/src/services/postgres.ts`, `apps/backend/server.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:unit`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L27](../../tests/unit/postgres_fail_closed.test.ts#L27) | MigrationFailedError modela la excepción con y sin cause |
| 2 | [L40](../../tests/unit/postgres_fail_closed.test.ts#L40) | isProductionEnv discrimina correctamente producción vs desarrollo/test |
| 3 | [L51](../../tests/unit/postgres_fail_closed.test.ts#L51) | getDatabaseUrl resuelve URL directa o combina parámetros POSTGRES_* |
| 4 | [L68](../../tests/unit/postgres_fail_closed.test.ts#L68) | connectPg retorna false si no hay URL de base de datos configurada |
| 5 | [L76](../../tests/unit/postgres_fail_closed.test.ts#L76) | connectPg en producción lanza MigrationFailedError si runMigrations falla (fail-closed) |
| 6 | [L113](../../tests/unit/postgres_fail_closed.test.ts#L113) | connectPg en desarrollo tolera fallo de migraciones y no lanza MigrationFailedError |
| 7 | [L148](../../tests/unit/postgres_fail_closed.test.ts#L148) | handleStartupError registra el error y llama a exitFn(1) |
| 8 | [L164](../../tests/unit/postgres_fail_closed.test.ts#L164) | APPS-002: connectPg en producción con tabla vacía NO ejecuta auto-seed si AUTO_SEED está inactivo |
| 9 | [L203](../../tests/unit/postgres_fail_closed.test.ts#L203) | APPS-002: connectPg en producción ejecuta auto-seed si AUTO_SEED=true |

### Suite: Seguridad, Hardening y DevSecOps (`security`)

#### [`tests/security/adr_compliance_contracts.test.ts`](../../tests/security/adr_compliance_contracts.test.ts)

- **Dominio:** Conformidad con ADRs de Arquitectura
- **Tipo:** Contract / Architecture | **Runner:** `node:test (tsx)` | **Casos:** 19 | **Líneas:** 759 (44.3 KB)
- **Descripción:** Comprueba el cumplimiento de decisiones de arquitectura registradas en ADR-001 a ADR-015 (topología, RBAC, ingress y secrets).
- **Artefactos Bajo Prueba:** `docs/decisions/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L17](../../tests/security/adr_compliance_contracts.test.ts#L17) | 🛡️ CI SAST Security: ci.yaml ejecuta Semgrep sobre scripts privilegiados (sin --exclude scripts) |
| 2 | [L28](../../tests/security/adr_compliance_contracts.test.ts#L28) | 🛡️ Tooling Governance: scripts/seal-secret.ts retirado en favor de ESO y Vault (CLN-002) |
| 3 | [L33](../../tests/security/adr_compliance_contracts.test.ts#L33) | 🛡️ AI Contracts: apps/backend/src/services/ai.ts fuerza salida estructurada JSON en Gemini |
| 4 | [L52](../../tests/security/adr_compliance_contracts.test.ts#L52) | 🛡️ Web Performance & Accesibilidad: lighthouserc.json define presupuestos estrictos para Core Web Vitals |
| 5 | [L69](../../tests/security/adr_compliance_contracts.test.ts#L69) | 🛡️ Observabilidad & Prometheus: apps/backend expone métricas coherentes con infra/monitoring/alerts.yaml |
| 6 | [L134](../../tests/security/adr_compliance_contracts.test.ts#L134) | 🛡️ Helm & Gobernanza: ServiceMonitor existe en Helm y ADR-007 documenta arquitectura de observabilidad |
| 7 | [L158](../../tests/security/adr_compliance_contracts.test.ts#L158) | 🛡️ CI Tooling Parity: infra.yaml y ci.yaml mantienen paridad estricta de versión de Helm en todos sus jobs |
| 8 | [L193](../../tests/security/adr_compliance_contracts.test.ts#L193) | 🛡️ Excelencia Operacional: docs/operations/observability-alerts.md cubre todas las alertas de alerts.yaml |
| 9 | [L215](../../tests/security/adr_compliance_contracts.test.ts#L215) | 🛡️ Gobernanza & Documentación: README.md y docs/README.md documentan Matriz de Estado y enlazan Runbooks y ADRs |
| 10 | [L243](../../tests/security/adr_compliance_contracts.test.ts#L243) | 🛡️ Supply Chain Security: ADR-008 formaliza inmutabilidad, Cosign Keyless, SLSA L3 y Kyverno |
| 11 | [L266](../../tests/security/adr_compliance_contracts.test.ts#L266) | 🛡️ AI Resilience & Contratos: ADR-009 formaliza Gemini 2.5 Flash, Circuit Breaker y fallback determinista |
| 12 | [L300](../../tests/security/adr_compliance_contracts.test.ts#L300) | 🛡️ Autenticación & Sesiones: ADR-010 formaliza doble capa, timingSafeEqual y revocación fail-closed |
| 13 | [L332](../../tests/security/adr_compliance_contracts.test.ts#L332) | 🛡️ Persistencia & Migraciones: ADR-011 formaliza Drizzle ORM, PgBouncer y secuencias atómicas |
| 14 | [L364](../../tests/security/adr_compliance_contracts.test.ts#L364) | 🛡️ Excelencia Operacional & Gobernanza: docs/operations/ contiene 7 SOPs estandarizados e indexados en docs/README.md |
| 15 | [L410](../../tests/security/adr_compliance_contracts.test.ts#L410) | 🛡️ Portabilidad de Documentación: ningún archivo markdown (.md) contiene enlaces absolutos locales file://[slash] |
| 16 | [L450](../../tests/security/adr_compliance_contracts.test.ts#L450) | 🛡️ Observabilidad Distribuida: ADR-018 formaliza OpenTelemetry, W3C Trace Context y correlación con Loki |
| 17 | [L544](../../tests/security/adr_compliance_contracts.test.ts#L544) | 🛡️ Orquestación de Monorepo: ADR-019 formaliza optimización de build, grafo de dependencias y caché con Turborepo |
| 18 | [L603](../../tests/security/adr_compliance_contracts.test.ts#L603) | 🛡️ Gobernanza de Despliegue: ADR-020 formaliza CLI canónico con Taskfile, retiro de scripts legados y lista blanca |
| 19 | [L689](../../tests/security/adr_compliance_contracts.test.ts#L689) | 🛡️ Resiliencia & Deuda de Código: ADR-027 formaliza convergencia en frontend y contratos Fail-Open vs Fail-Closed |

#### [`tests/security/docs_portal_integrity.test.ts`](../../tests/security/docs_portal_integrity.test.ts)

- **Dominio:** Integridad del Portal de Documentación
- **Tipo:** Contract / Docs | **Runner:** `node:test (tsx)` | **Casos:** 3 | **Líneas:** 152 (5.9 KB)
- **Descripción:** Valida vínculos internos, anclas, sintaxis y consistencia de navegación en el portal documental.
- **Artefactos Bajo Prueba:** `docs/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L77](../../tests/security/docs_portal_integrity.test.ts#L77) | 📚 DOC-011: todo documento de las categorias indexadas esta enlazado en docs/README.md |
| 2 | [L105](../../tests/security/docs_portal_integrity.test.ts#L105) | 📚 DOC-011: las categorias del portal coinciden con las carpetas reales de docs/ |
| 3 | [L126](../../tests/security/docs_portal_integrity.test.ts#L126) | 📚 DOC-011: toda ruta docs/... citada por la politica existe en disco |

#### [`tests/security/dr_backup_security.test.ts`](../../tests/security/dr_backup_security.test.ts)

- **Dominio:** Seguridad y Cifrado de Backups
- **Tipo:** Security / Backup | **Runner:** `node:test (tsx)` | **Casos:** 9 | **Líneas:** 318 (20.9 KB)
- **Descripción:** Valida cifrado AES-256-GCM en reposo de snapshots de base de datos, permisos de archivos y aislamiento de claves.
- **Artefactos Bajo Prueba:** `scripts/dr-drill.ts`, `scripts/dev-backup-gdrive.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L9](../../tests/security/dr_backup_security.test.ts#L9) | 🛡️ Disaster Recovery: backup-cronjob.yaml implementa cifrado AES-256, checksum y hardening de pod |
| 2 | [L42](../../tests/security/dr_backup_security.test.ts#L42) | 🛡️ Disaster Recovery: dr_verify_restore.sh implementa protocolo automatizado, clave efímera dinámica y restauración real |
| 3 | [L70](../../tests/security/dr_backup_security.test.ts#L70) | 🛡️ Disaster Recovery: values.yaml y Runbook oficial definen arquitectura 3-2-1 y SLAs RPO < 24h / RTO < 2h |
| 4 | [L88](../../tests/security/dr_backup_security.test.ts#L88) | 🛡️ Disaster Recovery: backup-restore-verify-cronjob.yaml implementa verificación periódica de restauración en K8s |
| 5 | [L103](../../tests/security/dr_backup_security.test.ts#L103) | 🛡️ Disaster Recovery Blueprints: Esqueletos Off-site (S3-compatible agnóstico y PBS Remote Sync) formalizados como inactivos |
| 6 | [L132](../../tests/security/dr_backup_security.test.ts#L132) | 🛡️ Disaster Recovery: Backup y Restore Verification renderizan PersistentVolumeClaim real y evitan almacenamiento efímero (Anti-emptyDir) |
| 7 | [L165](../../tests/security/dr_backup_security.test.ts#L165) | 🛡️ Disaster Recovery: Google Drive Off-site (Alternativa A Docker Compose & Alternativa B Proxmox VE) |
| 8 | [L206](../../tests/security/dr_backup_security.test.ts#L206) | 🛡️ Disaster Recovery: backup-gdrive-cronjob.yaml implementa puente K8s-Native a Google Drive con Rclone y readOnly PVC |
| 9 | [L273](../../tests/security/dr_backup_security.test.ts#L273) | 🛡️ Disaster Recovery: backup-gdrive-cronjob falla de forma estricta (fail-closed) si GDRIVE_TOKEN está ausente o vacío |

#### [`tests/security/dr_e2e_drill.test.ts`](../../tests/security/dr_e2e_drill.test.ts)

- **Dominio:** Simulacro de Recuperación ante Desastres (DR)
- **Tipo:** Security / DR | **Runner:** `node:test (tsx)` | **Casos:** 5 | **Líneas:** 155 (6.6 KB)
- **Descripción:** Evalúa la ejecución completa del simulacro de desastre automatizado, restauración limpia y verificación de RTO/RPO.
- **Artefactos Bajo Prueba:** `scripts/dr-drill.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L5](../../tests/security/dr_e2e_drill.test.ts#L5) | 🛡️ DR End-to-End Drill: Ejecuta la cadena operacional completa y certifica las 11 métricas contractuales |
| 2 | [L57](../../tests/security/dr_e2e_drill.test.ts#L57) | 🛡️ DR Cryptographic Engine: encryptAes256Cbc y decryptAes256Cbc mantienen interoperabilidad OpenSSL PBKDF2 |
| 3 | [L78](../../tests/security/dr_e2e_drill.test.ts#L78) | 🛡️ DR End-to-End Drill: Detección estricta de corrupción de checksum SHA-256 en descarga remota |
| 4 | [L96](../../tests/security/dr_e2e_drill.test.ts#L96) | 🛡️ DR End-to-End Drill [Live Engine]: Ejecuta restauración real en contenedor PostgreSQL 16 si Docker está activo |
| 5 | [L141](../../tests/security/dr_e2e_drill.test.ts#L141) | 🛡️ DR Security: runDrDrill rechaza claves con entropía insuficiente (< 32 caracteres) |

#### [`tests/security/egress_anti_ssrf.test.ts`](../../tests/security/egress_anti_ssrf.test.ts)

- **Dominio:** Control de Egress y Prevención SSRF
- **Tipo:** Security / Network | **Runner:** `node:test (tsx)` | **Casos:** 4 | **Líneas:** 226 (8.0 KB)
- **Descripción:** Valida Network Policies Cilium L7 eBPF, bloqueo de rangos privados (RFC 1918, link-local, cloud metadata) y allowlist estricta.
- **Artefactos Bajo Prueba:** `infra/helm/pokedex/templates/cilium-network-policies.yaml`, `scripts/probe-egress-security.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`, `npm run test:security:egress`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L131](../../tests/security/egress_anti_ssrf.test.ts#L131) | 🛡️ Egress Matrix: Verificación formal de los 6 destinos requeridos bajo Cilium L7 vs Flannel L4 |
| 2 | [L167](../../tests/security/egress_anti_ssrf.test.ts#L167) | 🛡️ Helm Rendering: CiliumNetworkPolicy emite allowlist estricta L7 eBPF en producción y Proxmox |
| 3 | [L200](../../tests/security/egress_anti_ssrf.test.ts#L200) | 🛡️ GitOps Configuration: Proxmox values.yaml habilita Cilium L7 Zero-Trust para cumplir con el test de salida |
| 4 | [L218](../../tests/security/egress_anti_ssrf.test.ts#L218) | 🛡️ Security Probe Egress: probe-egress-security.ts en modo --simulate certifica perfil Cilium L7 |

#### [`tests/security/ghcr_retention.test.ts`](../../tests/security/ghcr_retention.test.ts)

- **Dominio:** Retención y Ciclo de Vida en GHCR
- **Tipo:** Contract / OCI | **Runner:** `node:test (tsx)` | **Casos:** 3 | **Líneas:** 187 (7.2 KB)
- **Descripción:** Verifica la política de retención de imágenes OCI en GHCR, preservación de releases semver y limpieza de imágenes huérfanas.
- **Artefactos Bajo Prueba:** `scripts/ghcr-retention.ts`, `.github/workflows/ghcr-retention.yaml`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L32](../../tests/security/ghcr_retention.test.ts#L32) | 📦 GHCR Retention: calculateVersionsToPrune conserva estrictamente los últimos N y marca el resto para purga |
| 2 | [L99](../../tests/security/ghcr_retention.test.ts#L99) | 📦 GHCR Retention: applyGhcrRetention ejecuta correctamente en modo simulación |
| 3 | [L129](../../tests/security/ghcr_retention.test.ts#L129) | 🔒 GHCR Retention Workflow: Configuración de seguridad, permisos y parámetros de retención |

#### [`tests/security/github_security_linear_sync.test.ts`](../../tests/security/github_security_linear_sync.test.ts)

- **Dominio:** Sincronización de Seguridad GitHub-Linear
- **Tipo:** Contract / SecOps | **Runner:** `node:test (tsx)` | **Casos:** 12 | **Líneas:** 321 (11.6 KB)
- **Descripción:** Valida sincronización bidireccional idempotente de vulnerabilidades y alertas de seguridad hacia issues de Linear.
- **Artefactos Bajo Prueba:** `scripts/github-security-linear-sync.ts`, `.github/workflows/github-security-linear-sync.yaml`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L20](../../tests/security/github_security_linear_sync.test.ts#L20) | 🛡️ GitHub Security Linear Sync: mapSeverityToPriority mapea severidades a prioridades de Linear |
| 2 | [L38](../../tests/security/github_security_linear_sync.test.ts#L38) | 🛡️ GitHub Security Linear Sync: formatCodeScanningTitle genera título descriptivo y consistente |
| 3 | [L59](../../tests/security/github_security_linear_sync.test.ts#L59) | 🛡️ GitHub Security Linear Sync: formatDependabotTitle formatea paquete, advisory y resumen |
| 4 | [L83](../../tests/security/github_security_linear_sync.test.ts#L83) | 🛡️ GitHub Security Linear Sync: formatSecretScanningTitle formatea el tipo de secreto expuesto |
| 5 | [L97](../../tests/security/github_security_linear_sync.test.ts#L97) | 🛡️ GitHub Security Linear Sync: extractAlertKeyFromTitle extrae herramienta y número de alerta |
| 6 | [L126](../../tests/security/github_security_linear_sync.test.ts#L126) | 🛡️ GitHub Security Linear Sync: sanitize neutraliza saltos de línea y limita longitud |
| 7 | [L135](../../tests/security/github_security_linear_sync.test.ts#L135) | 🛡️ GitHub Security Linear Sync: syncAlertLifecycle maneja ciclo de vida en DRY-RUN sin errores |
| 8 | [L236](../../tests/security/github_security_linear_sync.test.ts#L236) | 🚨 WF-002: los triggers workflow_run referencian workflows que existen |
| 9 | [L253](../../tests/security/github_security_linear_sync.test.ts#L253) | 🚨 WF-002: se cubren los productores de alertas de seguridad |
| 10 | [L280](../../tests/security/github_security_linear_sync.test.ts#L280) | 🛡️ GitHub Security Linear Sync: workflow YAML existe y define permisos de menor privilegio |
| 11 | [L294](../../tests/security/github_security_linear_sync.test.ts#L294) | 🛡️ GitHub Security Linear Sync: syncGitHubSecurityToLinear se degrada elegantemente sin LINEAR_API_KEY |
| 12 | [L308](../../tests/security/github_security_linear_sync.test.ts#L308) | 🛡️ GitHub Code Scanning SAST: workflow YAML de njsscan, hadolint y Trivy IaC existe y está configurado |

#### [`tests/security/gitops_image_parity.test.ts`](../../tests/security/gitops_image_parity.test.ts)

- **Dominio:** Paridad de Imágenes en GitOps
- **Tipo:** Contract / GitOps | **Runner:** `node:test (tsx)` | **Casos:** 8 | **Líneas:** 141 (6.5 KB)
- **Descripción:** Comprueba el script de verificación de paridad de imagen asegurando inmutabilidad entre entornos dev, preprod y prod.
- **Artefactos Bajo Prueba:** `scripts/verify-image-digest-parity.ts`, `gitops/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L17](../../tests/security/gitops_image_parity.test.ts#L17) | 🔒 GitOps Parity: extractRenderedApiImage compila el Deployment mediante Helm y extrae la imagen del contenedor api |
| 2 | [L35](../../tests/security/gitops_image_parity.test.ts#L35) | 🔒 GitOps Parity: parseImmutableDigest valida formato SHA256 y rechaza etiquetas mutables |
| 3 | [L55](../../tests/security/gitops_image_parity.test.ts#L55) | 🔒 GitOps Parity: verifyImageDigestParity certifica paridad 1:1 entre AWS, Proxmox, Preprod y Helm Prod |
| 4 | [L67](../../tests/security/gitops_image_parity.test.ts#L67) | 🔒 GitOps Parity: el gate estricto incluye Proxmox Pre-prod en el conjunto de paridad |
| 5 | [L81](../../tests/security/gitops_image_parity.test.ts#L81) | 🔒 GitOps Parity: verifyImageDigestParity detecta discrepancias con digest publicado esperado |
| 6 | [L91](../../tests/security/gitops_image_parity.test.ts#L91) | 🔒 Supply Chain: .github/workflows/ci.yaml utiliza validación determinista por Helm AST en lugar de grep/awk |
| 7 | [L108](../../tests/security/gitops_image_parity.test.ts#L108) | 🔒 Supply Chain: extractRenderedApiImage en modo estricto (strict: true) falla sin fallback ante errores de Helm |
| 8 | [L123](../../tests/security/gitops_image_parity.test.ts#L123) | 🔒 GitOps Parity: la caché de renderizado acelera llamadas consecutivas e invalida con clearRenderCache |

#### [`tests/security/grafana_portability.test.ts`](../../tests/security/grafana_portability.test.ts)

- **Dominio:** Portabilidad de Dashboards Grafana
- **Tipo:** Contract / Observability | **Runner:** `node:test (tsx)` | **Casos:** 5 | **Líneas:** 241 (9.8 KB)
- **Descripción:** Valida esquemas JSON declarativos de dashboards Grafana, portabilidad de datasources y ausencia de UIDs fijos.
- **Artefactos Bajo Prueba:** `infra/monitoring/dashboards/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L89](../../tests/security/grafana_portability.test.ts#L89) | 🧹 INFRA-006: no debe haber values de Grafana huérfanos en infra/monitoring |
| 2 | [L160](../../tests/security/grafana_portability.test.ts#L160) | 🔀 PORT-001: el despliegue de Grafana Cloud es multiplataforma (sin PowerShell) |
| 3 | [L194](../../tests/security/grafana_portability.test.ts#L194) | 🔀 PORT-001: el script Node preserva la mitigacion de exposicion del token |
| 4 | [L215](../../tests/security/grafana_portability.test.ts#L215) | 🔀 PORT-001: los flags de Helm son equivalentes a los del script PowerShell retirado |
| 5 | [L231](../../tests/security/grafana_portability.test.ts#L231) | 🔀 PORT-001: Taskfile y VS Code invocan el mismo script de Grafana Cloud |

#### [`tests/security/iac_baseline_security.test.ts`](../../tests/security/iac_baseline_security.test.ts)

- **Dominio:** Hardening de Infraestructura como Código (IaC)
- **Tipo:** Security / IaC | **Runner:** `node:test (tsx)` | **Casos:** 31 | **Líneas:** 1190 (64.2 KB)
- **Descripción:** Suite integral de seguridad IaC: valida que ningún manifiesto K8s o chart viole políticas CIS, contraseñas hardcodeadas o permisos.
- **Artefactos Bajo Prueba:** `infra/k8s/`, `infra/helm/pokedex/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L117](../../tests/security/iac_baseline_security.test.ts#L117) | 🚨 WF-001: el scan de Trivy cubre exactamente las imágenes que el Chart despliega |
| 2 | [L150](../../tests/security/iac_baseline_security.test.ts#L150) | 🚨 WF-001: las imágenes escaneadas están fijadas por digest inmutable |
| 3 | [L176](../../tests/security/iac_baseline_security.test.ts#L176) | 🛡️ Deploy Security: infra/ansible/deploy_excludes.txt existe y excluye .env y .env.* |
| 4 | [L184](../../tests/security/iac_baseline_security.test.ts#L184) | 🛡️ Deploy Security: scripts/proxmox_deploy.sh está retirado en favor de IaC declarativa |
| 5 | [L189](../../tests/security/iac_baseline_security.test.ts#L189) | 🛡️ Deploy Security: Ansible host_baseline.yaml existe y configura hardening de host sin errores ignorados |
| 6 | [L212](../../tests/security/iac_baseline_security.test.ts#L212) | 🛡️ Deploy Security: Playbooks legacy de Compose y docker-compose.prod.yml retirados de producción |
| 7 | [L225](../../tests/security/iac_baseline_security.test.ts#L225) | 🛡️ Infra Security: OpenTofu Proxmox variables.tf no tiene default hardcodeado en ssh_public_key |
| 8 | [L237](../../tests/security/iac_baseline_security.test.ts#L237) | 🛡️ Infra Multi-Cloud: OpenTofu entornos aws y proxmox estructurados correctamente |
| 9 | [L248](../../tests/security/iac_baseline_security.test.ts#L248) | 🛡️ Architecture Policy: CLOUD_INFRASTRUCTURE_DESIGN.md formaliza runtime universal y multi-backend |
| 10 | [L260](../../tests/security/iac_baseline_security.test.ts#L260) | 🛡️ Runbook Policy: PROXMOX_DEPLOYMENT_GUIDE.md alineado con Kubernetes, GitOps y Ansible baseline |
| 11 | [L271](../../tests/security/iac_baseline_security.test.ts#L271) | 🛡️ Disaster Recovery Tooling: Taskfile.yaml define tareas dr:drill (simulación/mecanismo) y dr:verify (certificación real) |
| 12 | [L280](../../tests/security/iac_baseline_security.test.ts#L280) | 🛡️ Ansible Security: security_hardening.yaml restringe SSH (22) y puertos K8s/etcd con subredes (src) |
| 13 | [L306](../../tests/security/iac_baseline_security.test.ts#L306) | 🛡️ INFRA-009: la red del cluster debe ser una variable explicita y distinta de la de gestion |
| 14 | [L372](../../tests/security/iac_baseline_security.test.ts#L372) | 🛡️ INFRA-002: la politica SSH debe ser unica y explicita, sin directivas contradictorias |
| 15 | [L415](../../tests/security/iac_baseline_security.test.ts#L415) | 🛡️ INFRA-003: el usuario SSH de Ansible debe coincidir con el que crea OpenTofu en cada host |
| 16 | [L474](../../tests/security/iac_baseline_security.test.ts#L474) | 🛡️ INFRA-012: el inventario de proxmox no debe declarar hosts fantasma ni IPs colisionadas |
| 17 | [L534](../../tests/security/iac_baseline_security.test.ts#L534) | 🛡️ INFRA-007: toda imagen descargada por OpenTofu debe verificar checksum y URL inmutable |
| 18 | [L600](../../tests/security/iac_baseline_security.test.ts#L600) | 🛡️ INFRA-007: el checksum por defecto debe tener la longitud del algoritmo declarado |
| 19 | [L660](../../tests/security/iac_baseline_security.test.ts#L660) | 🧹 INFRA-008: ninguna variable de OpenTofu puede quedar sin consumidor |
| 20 | [L694](../../tests/security/iac_baseline_security.test.ts#L694) | 🛡️ INFRA-001: las collections de Ansible deben estar fijadas a una version exacta |
| 21 | [L753](../../tests/security/iac_baseline_security.test.ts#L753) | 🛡️ Local K8s: infra/k8s/kind-cluster.yaml existe y expone puertos Ingress correctamente |
| 22 | [L765](../../tests/security/iac_baseline_security.test.ts#L765) | 🛡️ Dev DX: Taskfile.yaml define perfil rápido (dev:compose) y perfil Kubernetes (dev:k8s:*) |
| 23 | [L789](../../tests/security/iac_baseline_security.test.ts#L789) | 🛡️ Dev DX: .vscode/tasks.json delega en Taskfile.yaml y no implementa logica operativa |
| 24 | [L857](../../tests/security/iac_baseline_security.test.ts#L857) | 🛡️ IaC Architecture: OpenTofu módulos, entorno lab y roles de Ansible estructurados correctamente |
| 25 | [L937](../../tests/security/iac_baseline_security.test.ts#L937) | 🛡️ DevSecOps Tooling: .tool-versions define versiones inmutables del stack de desarrollo e IaC |
| 26 | [L960](../../tests/security/iac_baseline_security.test.ts#L960) | 🛡️ Dev DX & Resiliencia: Taskfile.yaml define observabilidad unificada (Grafana Cloud / Dev Alloy) sin deuda legacy |
| 27 | [L972](../../tests/security/iac_baseline_security.test.ts#L972) | 🛡️ Ansible Idempotencia: container_runtime valida el estado activo del servicio sin falsos positivos |
| 28 | [L982](../../tests/security/iac_baseline_security.test.ts#L982) | 🛡️ IaC State Security: ADR-012 formaliza backend remoto, bloqueo de concurrencia y cifrado nativo |
| 29 | [L1019](../../tests/security/iac_baseline_security.test.ts#L1019) | 🛡️ Taskfile CLI: ADR-026 formaliza ciclo de vida en 4 fases para aliases y task --list como interfaz soportada |
| 30 | [L1126](../../tests/security/iac_baseline_security.test.ts#L1126) | 🔍 Coherencia Operacional E2E: Auditoría de 8 eslabones, alineación de red 10.10.13.0/24 y setup_k3s.yaml |
| 31 | [L1176](../../tests/security/iac_baseline_security.test.ts#L1176) | 🛡️ Tooling Governance: scripts/governance-audit-scripts.ts valida lista blanca de scripts shell y rechaza imperativos |

#### [`tests/security/ignore_hygiene.test.ts`](../../tests/security/ignore_hygiene.test.ts)

- **Dominio:** Higiene de Archivos de Exclusión (.gitignore)
- **Tipo:** Contract / Hygiene | **Runner:** `node:test (tsx)` | **Casos:** 10 | **Líneas:** 195 (10.1 KB)
- **Descripción:** Valida el linter de higiene de archivos .ignore, previniendo exclusión indebida, duplicados o fuga de secretos.
- **Artefactos Bajo Prueba:** `scripts/check-ignore-hygiene.ts`, `.gitignore`, `.dockerignore`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L9](../../tests/security/ignore_hygiene.test.ts#L9) | 🧹 Configuration Hygiene: check-ignore-hygiene.ts existe y está registrado en package.json |
| 2 | [L20](../../tests/security/ignore_hygiene.test.ts#L20) | 🧹 Configuration Hygiene: descubrimiento dinámico y auditoría estricta de todos los archivos .ignore |
| 3 | [L40](../../tests/security/ignore_hygiene.test.ts#L40) | 📐 Extension Governance: la regla de extensión YAML está incorporada en la suite de skills |
| 4 | [L67](../../tests/security/ignore_hygiene.test.ts#L67) | 📐 Extension Governance: las skills no citan workflows con la extensión .yml obsoleta |
| 5 | [L102](../../tests/security/ignore_hygiene.test.ts#L102) | 📚 YAML Reference Integrity (DOC-002): no hay referencias a archivos .yml obsoletas |
| 6 | [L120](../../tests/security/ignore_hygiene.test.ts#L120) | 📚 YAML Reference Integrity: el scanner esta registrado y declara sus excepciones |
| 7 | [L142](../../tests/security/ignore_hygiene.test.ts#L142) | 🛡️ Configuration Hygiene: workflow de CI integra el paso de auditoría de archivos .ignore |
| 8 | [L150](../../tests/security/ignore_hygiene.test.ts#L150) | 🧹 Repository Hygiene: regla /tmp/ presente en .gitignore y patrón no sobre-extensivo |
| 9 | [L159](../../tests/security/ignore_hygiene.test.ts#L159) | 🧹 Repository Hygiene: la regla /tmp/ ignora efectivamente archivos en tmp/ y no fuera de tmp/ |
| 10 | [L178](../../tests/security/ignore_hygiene.test.ts#L178) | 🧹 Repository Hygiene: la regla transversal repository-hygiene.md existe y rige AGENTS.md y skills |

#### [`tests/security/k8s_workload_hardening.test.ts`](../../tests/security/k8s_workload_hardening.test.ts)

- **Dominio:** Hardening de Workloads Kubernetes
- **Tipo:** Security / Kubernetes | **Runner:** `node:test (tsx)` | **Casos:** 20 | **Líneas:** 963 (55.6 KB)
- **Descripción:** Verifica SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp), límites de recursos y probes de salud.
- **Artefactos Bajo Prueba:** `infra/k8s/`, `infra/helm/pokedex/templates/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L17](../../tests/security/k8s_workload_hardening.test.ts#L17) | 🛡️ Helm Security: PostgreSQL y PgBouncer configuran readOnlyRootFilesystem y montajes emptyDir |
| 2 | [L34](../../tests/security/k8s_workload_hardening.test.ts#L34) | 🛡️ Helm Security: Workloads K8s deshabilitan automountServiceAccountToken (Least Privilege) |
| 3 | [L56](../../tests/security/k8s_workload_hardening.test.ts#L56) | 🛡️ Helm Security: seed-job.yaml declara requests y limits de ephemeral-storage |
| 4 | [L64](../../tests/security/k8s_workload_hardening.test.ts#L64) | 🛡️ K8s Quality & High Availability: api y web deployments implementan topologySpreadConstraints |
| 5 | [L92](../../tests/security/k8s_workload_hardening.test.ts#L92) | 🛡️ K8s Quality Gates: infra.yaml integra kubeconform, kube-linter y kyverno test |
| 6 | [L112](../../tests/security/k8s_workload_hardening.test.ts#L112) | 🛡️ Kyverno Security: ClusterPolicy pod-security-standards define perfil Restricted en tiempo de admisión |
| 7 | [L129](../../tests/security/k8s_workload_hardening.test.ts#L129) | 🛡️ Dockerfile SSOT: apps/backend/Dockerfile es la definición canónica del backend y /Dockerfile no existe |
| 8 | [L147](../../tests/security/k8s_workload_hardening.test.ts#L147) | 🛡️ Cloud-Native Secrets: infra/k8s/eso define arquitectura declarativa de External Secrets Operator |
| 9 | [L173](../../tests/security/k8s_workload_hardening.test.ts#L173) | 🗂️ GITOPS-003: el árbol GitOps está documentado y sus afirmaciones son ciertas |
| 10 | [L244](../../tests/security/k8s_workload_hardening.test.ts#L244) | 🛡️ Helm Resiliencia & Gobernanza: el perfil de referencia y los templates configuran PDB, ResourceQuota y LimitRange |
| 11 | [L272](../../tests/security/k8s_workload_hardening.test.ts#L272) | 🛡️ Autoescalado & Resiliencia: ADR-014 formaliza HPA v2, PodDisruptionBudget y TopologySpreadConstraints |
| 12 | [L303](../../tests/security/k8s_workload_hardening.test.ts#L303) | 🛡️ Ciclo de Vida & Resiliencia: ADR-015 formaliza Graceful Shutdown, closeStorage y sondas /healthz y /readyz |
| 13 | [L335](../../tests/security/k8s_workload_hardening.test.ts#L335) | 🛡️ GITOPS-005: todo entorno GitOps activo debe renderizarse en CI |
| 14 | [L420](../../tests/security/k8s_workload_hardening.test.ts#L420) | 🛡️ Backend Lifecycle: closeStorage y setShuttingDownForTest gestionan el estado de apagado grácil |
| 15 | [L451](../../tests/security/k8s_workload_hardening.test.ts#L451) | 🛡️ Admission Control: ADR-017 formaliza Kyverno ClusterPolicies, PSS Restricted y seccomp RuntimeDefault |
| 16 | [L538](../../tests/security/k8s_workload_hardening.test.ts#L538) | 🔒 GITOPS-001: la referencia inactiva de Cloud queda excluida del App-of-Apps |
| 17 | [L593](../../tests/security/k8s_workload_hardening.test.ts#L593) | 🛡️ Orquestación GitOps Avanzada: ADR-021 formaliza Sync Waves, PreSync Hooks, Health Checks y App-of-Apps |
| 18 | [L784](../../tests/security/k8s_workload_hardening.test.ts#L784) | 🛡️ Rotación de Secretos: ADR-022 formaliza Stakater Reloader, refreshInterval acotado y auditoría |
| 19 | [L849](../../tests/security/k8s_workload_hardening.test.ts#L849) | 🛡️ Helm Chart: values.yaml es Secure by Default y values.dev.yaml proporciona overrides explícitos de desarrollo |
| 20 | [L885](../../tests/security/k8s_workload_hardening.test.ts#L885) | 🏷️ Kubernetes Taxonomy: Namespace único canónico pokemon-app y segregación formal de Vault |

#### [`tests/security/network_policies_security.test.ts`](../../tests/security/network_policies_security.test.ts)

- **Dominio:** Aislamiento de Red Zero-Trust
- **Tipo:** Security / Network | **Runner:** `node:test (tsx)` | **Casos:** 14 | **Líneas:** 412 (21.6 KB)
- **Descripción:** Verifica aislamiento estricto entre pods de frontend, backend, Redis y PostgreSQL impidiendo accesos laterales no autorizados.
- **Artefactos Bajo Prueba:** `infra/helm/pokedex/templates/network-policies.yaml`, `infra/helm/pokedex/templates/cilium-network-policies.yaml`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L33](../../tests/security/network_policies_security.test.ts#L33) | 🛡️ Nginx APPS-001: nginx.conf esta sincronizado con el template (SSOT unico) |
| 2 | [L48](../../tests/security/network_policies_security.test.ts#L48) | 🛡️ Nginx Security: apps/frontend/nginx.conf no contiene allowlists masivas RFC 1918 en /metrics ni /admin |
| 3 | [L59](../../tests/security/network_policies_security.test.ts#L59) | 🛡️ Nginx Security: CSP en nginx.conf y nginx.conf.template no permite unsafe-inline en style-src |
| 4 | [L73](../../tests/security/network_policies_security.test.ts#L73) | 🛡️ Helm Security: NetworkPolicies de PostgreSQL y Redis implementan Zero-Trust Egress (default-deny) |
| 5 | [L92](../../tests/security/network_policies_security.test.ts#L92) | 🛡️ Helm Security: CiliumNetworkPolicy implementa aislamiento L7 FQDN con allowlist estricta |
| 6 | [L117](../../tests/security/network_policies_security.test.ts#L117) | 🛡️ Helm Security: CiliumNetworkPolicy implementa filtrado L7 FQDN eBPF (Gemini, PokeAPI, GitHub) |
| 7 | [L130](../../tests/security/network_policies_security.test.ts#L130) | 🛡️ Helm Security: network-policies.yaml consolida egress directo L4 con Anti-SSRF estricto |
| 8 | [L141](../../tests/security/network_policies_security.test.ts#L141) | 🛡️ Nginx Security: nginx.conf y template inyectan Cross-Origin-Opener-Policy y Cross-Origin-Resource-Policy |
| 9 | [L175](../../tests/security/network_policies_security.test.ts#L175) | 🗂️ INFRA-011: ninguna Application de ArgoCD consume el perfil de referencia |
| 10 | [L215](../../tests/security/network_policies_security.test.ts#L215) | 🗂️ INFRA-011: el perfil de referencia declara en su cabecera que no despliega |
| 11 | [L244](../../tests/security/network_policies_security.test.ts#L244) | 🛡️ Helm Security: el perfil de referencia exige Zero-Trust L7 (Cilium FQDN o Egress Gateway) sin fallback permisivo |
| 12 | [L258](../../tests/security/network_policies_security.test.ts#L258) | 🛡️ GITOPS-002: los entornos desplegables no deben declarar reglas de Ingress sin host |
| 13 | [L316](../../tests/security/network_policies_security.test.ts#L316) | 🛡️ Zero-Trust Network: ADR-013 formaliza microsegmentación 4 capas, default-deny y anti-SSRF |
| 14 | [L352](../../tests/security/network_policies_security.test.ts#L352) | 🛡️ Ingress L7 & TLS: ADR-016 formaliza Ingress Controller, Terminación TLS y Hardening de Cabeceras HTTP |

#### [`tests/security/operation_dr_benchmarks.test.ts`](../../tests/security/operation_dr_benchmarks.test.ts)

- **Dominio:** Benchmarks de Recuperación ante Desastres
- **Tipo:** Security / DR Benchmarks | **Runner:** `node:test (tsx)` | **Casos:** 9 | **Líneas:** 125 (7.2 KB)
- **Descripción:** Valida umbrales cuantitativos de tiempo de backup, compresión y consistencia de restauración contra SLAs operacionales.
- **Artefactos Bajo Prueba:** `scripts/dr-drill.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L11](../../tests/security/operation_dr_benchmarks.test.ts#L11) | 🛡️ Operación: Kind clúster declarativo existe y define puertos e ingress-ready |
| 2 | [L23](../../tests/security/operation_dr_benchmarks.test.ts#L23) | 🛡️ Operación: infra.yaml integra Kind como prueba canónica de integración |
| 3 | [L33](../../tests/security/operation_dr_benchmarks.test.ts#L33) | 🛡️ Operación: security-dast-zap.yaml configura escaneo dinámico con OWASP ZAP |
| 4 | [L46](../../tests/security/operation_dr_benchmarks.test.ts#L46) | 🛡️ Operación: k6_stress_test.js y performance-k6.yaml definen y validan umbrales de SLA |
| 5 | [L57](../../tests/security/operation_dr_benchmarks.test.ts#L57) | 🛡️ Operación: DISASTER_RECOVERY_PLAN.md documenta RPO y RTO medidos experimentalmente |
| 6 | [L66](../../tests/security/operation_dr_benchmarks.test.ts#L66) | 🛡️ Operación: dr-simulation.yaml automatiza simulacros periódicos de recuperación ante desastres |
| 7 | [L76](../../tests/security/operation_dr_benchmarks.test.ts#L76) | 🛡️ Disaster Recovery: dr_verify_restore.sh implementa validación estricta de checksum y aislamiento de BD |
| 8 | [L89](../../tests/security/operation_dr_benchmarks.test.ts#L89) | 🛡️ Gobernanza & Arquitectura: Suite formal de ADRs existe en docs/decisions/ |
| 9 | [L108](../../tests/security/operation_dr_benchmarks.test.ts#L108) | 🛡️ Excelencia Operacional: Runbooks formales estructurados en docs/operations/ |

#### [`tests/security/promote_auto_approve_contracts.test.ts`](../../tests/security/promote_auto_approve_contracts.test.ts)

- **Dominio:** Promoción Automatizada Segura
- **Tipo:** Contract / CI-CD | **Runner:** `node:test (tsx)` | **Casos:** 1 | **Líneas:** 64 (2.5 KB)
- **Descripción:** Valida políticas de auto-aprobación de PRs de dependencias patch/minor con suites de seguridad obligatorias.
- **Artefactos Bajo Prueba:** `.github/workflows/promote-auto-approve.yaml`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L11](../../tests/security/promote_auto_approve_contracts.test.ts#L11) | 🚀 Release Promote Auto-Approve: Contrato de auto-aprobación de checks para PRs de release |

#### [`tests/security/supply_chain_security.test.ts`](../../tests/security/supply_chain_security.test.ts)

- **Dominio:** Seguridad de Cadena de Suministro y SBOM
- **Tipo:** Security / Supply Chain | **Runner:** `node:test (tsx)` | **Casos:** 16 | **Líneas:** 544 (26.8 KB)
- **Descripción:** Comprueba inmutabilidad de dependencias, bloqueo de scripts arbitrarios en npm ci, SBOM y firma de imágenes.
- **Artefactos Bajo Prueba:** `package.json`, `package-lock.json`, `.github/workflows/ci.yaml`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L20](../../tests/security/supply_chain_security.test.ts#L20) | 🔒 Supply Chain: las actions del release no usan runtimes de Node retirados |
| 2 | [L54](../../tests/security/supply_chain_security.test.ts#L54) | 🏷️ Release Tag: el header de la API de GitHub tiene el quoting balanceado |
| 3 | [L68](../../tests/security/supply_chain_security.test.ts#L68) | 🔤 Workflows: los archivos usan fin de línea LF (relacionado con REL-002) |
| 4 | [L81](../../tests/security/supply_chain_security.test.ts#L81) | 🔤 Workflows: .gitattributes fuerza LF en los workflows |
| 5 | [L92](../../tests/security/supply_chain_security.test.ts#L92) | 🔒 INFRA-005: toda imagen del Chart debe soportar fijacion por digest |
| 6 | [L145](../../tests/security/supply_chain_security.test.ts#L145) | 🐚 Workflows: ningun reusable workflow se invoca con la extension .yml obsoleta |
| 7 | [L155](../../tests/security/supply_chain_security.test.ts#L155) | 🛡️ Supply Chain Security: Dockerfile declara etiquetas OCI y argumentos de trazabilidad de build |
| 8 | [L175](../../tests/security/supply_chain_security.test.ts#L175) | 🛡️ Supply Chain Security: CI inyecta APP_VERSION y GIT_SHA como build-args independientes (VER-002) |
| 9 | [L191](../../tests/security/supply_chain_security.test.ts#L191) | 🛡️ SEC-001: el binario de Gitsign se verifica antes de instalarse y ejecutarse |
| 10 | [L348](../../tests/security/supply_chain_security.test.ts#L348) | 🛡️ Supply Chain Security: CI Workflow configura trazabilidad OCI y build-args en build-docker |
| 11 | [L364](../../tests/security/supply_chain_security.test.ts#L364) | 🛡️ Supply Chain Security: SBOM CycloneDX es obligatorio y validado en CI |
| 12 | [L377](../../tests/security/supply_chain_security.test.ts#L377) | 🛡️ Supply Chain Security: Publish job implementa firma Cosign, atestación de SBOM y SLSA Provenance |
| 13 | [L403](../../tests/security/supply_chain_security.test.ts#L403) | 🛡️ Supply Chain Security: Política Kyverno verify-image-signature existe y define reglas estrictas |
| 14 | [L416](../../tests/security/supply_chain_security.test.ts#L416) | 🛡️ Supply Chain Security: los manifiestos de GitOps y el perfil de referencia aplican OCI digest pinning inmutable (sha256) |
| 15 | [L441](../../tests/security/supply_chain_security.test.ts#L441) | 🛡️ Supply Chain Security: Manifiestos de GitOps mantienen paridad estricta inter-entornos y modelan imágenes como digest inmutable único (SSOT) |
| 16 | [L537](../../tests/security/supply_chain_security.test.ts#L537) | 🛡️ Supply Chain Security: CI Workflow valida consistencia de digests (CI Published == GitOps Pinning == Cosign Signed) |

#### [`tests/security/vault_redeploy_contract.test.ts`](../../tests/security/vault_redeploy_contract.test.ts)

- **Dominio:** Gestión y Rotación de Secretos (Vault)
- **Tipo:** Security / Secrets | **Runner:** `node:test (tsx)` | **Casos:** 10 | **Líneas:** 179 (12.5 KB)
- **Descripción:** Valida el reinicio controlado de workloads y el refresco de secretos inyectados tras rotaciones en HashiCorp Vault.
- **Artefactos Bajo Prueba:** `scripts/k8s-rollout-restart.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L9](../../tests/security/vault_redeploy_contract.test.ts#L9) | 🔒 Proxmox Secret Architecture: Validación contractual de Vault CE, ESO y ausencia de Reloader |
| 2 | [L14](../../tests/security/vault_redeploy_contract.test.ts#L14) | 🔒 ESO Security: manifiestos activos prohíben SecretStore fake y credenciales placeholder |
| 3 | [L34](../../tests/security/vault_redeploy_contract.test.ts#L34) | 🔒 Proxmox GitOps Values: ExternalSecrets apunta al ClusterSecretStore vault-backend y clave pokedex/prod |
| 4 | [L44](../../tests/security/vault_redeploy_contract.test.ts#L44) | 🔒 Proxmox Pre-prod GitOps Values: ExternalSecrets apunta a vault-backend-preprod y clave pokedex/preprod |
| 5 | [L55](../../tests/security/vault_redeploy_contract.test.ts#L55) | 🔒 Vault ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox y rol pokedex-prod-role |
| 6 | [L66](../../tests/security/vault_redeploy_contract.test.ts#L66) | 🔒 Vault Pre-prod ClusterSecretStore: Apunta a endpoint HTTPS del LXC Proxmox y rol pokedex-preprod-role |
| 7 | [L78](../../tests/security/vault_redeploy_contract.test.ts#L78) | 🔒 Redeploy Invariant: Mutaciones en Secretos de ESO requieren rollout restart en ausencia de Reloader |
| 8 | [L93](../../tests/security/vault_redeploy_contract.test.ts#L93) | 🔒 Vault Multi-Env Separation: Políticas y roles segregados para Pre-prod y Prod (Zero-Trust Least Privilege) |
| 9 | [L107](../../tests/security/vault_redeploy_contract.test.ts#L107) | 🛡️ Bastion Break-Glass & Audit: Captura obligatoria de comandos y políticas operativas |
| 10 | [L155](../../tests/security/vault_redeploy_contract.test.ts#L155) | 📊 DR & SLA Canonical Contract: Unificación de SLA (99.5%), RPO (< 24h) y RTO (< 2h) en SSOT arquitectural |

#### [`tests/security/yaml_extension_governance.test.ts`](../../tests/security/yaml_extension_governance.test.ts)

- **Dominio:** Gobernanza de Extensiones YAML
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 5 | **Líneas:** 130 (5.1 KB)
- **Descripción:** Verifica cumplimiento estricto del uso exclusivo de la extensión .yaml (prohibiendo .yml) en todo el repositorio.
- **Artefactos Bajo Prueba:** `scripts/check-yaml-extension.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L11](../../tests/security/yaml_extension_governance.test.ts#L11) | 📐 Extension Governance: check-yaml-extension.ts existe y está registrado en package.json |
| 2 | [L21](../../tests/security/yaml_extension_governance.test.ts#L21) | 📐 Extension Governance: el gate pasa en modo normal y estricto sin violaciones |
| 3 | [L45](../../tests/security/yaml_extension_governance.test.ts#L45) | 📐 Extension Governance: toda la deuda .yml del repositorio está declarada y esSubset del disco |
| 4 | [L79](../../tests/security/yaml_extension_governance.test.ts#L79) | 📐 Extension Governance: el gate es fail-closed ante un .yml trackeado no declarado |
| 5 | [L118](../../tests/security/yaml_extension_governance.test.ts#L118) | 📐 Extension Governance: CI y el contrato de impacto integran el gate de extensión |

### Suite: Contratos de GitOps y Despliegue (`gitops`)

#### [`tests/gitops/argocd_pinning.test.ts`](../../tests/gitops/argocd_pinning.test.ts)

- **Dominio:** GitOps / Inmutabilidad de Despliegues
- **Tipo:** Contract / GitOps | **Runner:** `node:test (tsx)` | **Casos:** 6 | **Líneas:** 237 (10.2 KB)
- **Descripción:** Valida pinning estricto por digest SHA-256 en manifiestos de ArgoCD y prohíbe tags mutables (:latest) en dev, preprod y prod.
- **Artefactos Bajo Prueba:** `gitops/values-*.yaml`, `scripts/verify-image-digest-parity.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:gitops`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L19](../../tests/gitops/argocd_pinning.test.ts#L19) | 🔒 ArgoCD Pinning: validateSemVerTag valida estrictamente tags semánticos inmutables |
| 2 | [L32](../../tests/gitops/argocd_pinning.test.ts#L32) | 🔒 ArgoCD Pinning: extractTargetRevision y replaceTargetRevision manipulan YAML limpiamente |
| 3 | [L57](../../tests/gitops/argocd_pinning.test.ts#L57) | 🔒 ArgoCD Pinning: Manifiestos de GitOps mantienen paridad estricta 1:1 en targetRevision |
| 4 | [L78](../../tests/gitops/argocd_pinning.test.ts#L78) | 🔒 ArgoCD Pinning: applyGitOpsPin ejecuta de forma determinista en dryRun |
| 5 | [L95](../../tests/gitops/argocd_pinning.test.ts#L95) | 🚀 ArgoCD Pinning Automation: Workflow release-tag.yaml, package.json y Taskfile.yaml configuran el pipeline de promoción |
| 6 | [L197](../../tests/gitops/argocd_pinning.test.ts#L197) | 🔒 Release Tagging (REL-003): el changelog corresponde al tag publicado, no al dry-run |

### Suite: Componentes y Controladores Frontend (`frontend`)

#### [`tests/frontend/backoffice_controller.test.ts`](../../tests/frontend/backoffice_controller.test.ts)

- **Dominio:** Controlador DOM de Backoffice
- **Tipo:** Component / Unit | **Runner:** `node:test (tsx)` | **Casos:** 18 | **Líneas:** 282 (10.6 KB)
- **Descripción:** Valida eventos de DOM, renderizado de tablas, modales interactivos y toasts en el backoffice usando entorno JSDOM.
- **Artefactos Bajo Prueba:** `apps/frontend/src/backoffice.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L88](../../tests/frontend/backoffice_controller.test.ts#L88) | Backoffice: checkHealthStatus reporta backend saludable |
| 2 | [L97](../../tests/frontend/backoffice_controller.test.ts#L97) | Backoffice: checkHealthStatus marca rojo ante respuesta no-ok |
| 3 | [L108](../../tests/frontend/backoffice_controller.test.ts#L108) | Backoffice: checkHealthStatus captura un rechazo de red |
| 4 | [L119](../../tests/frontend/backoffice_controller.test.ts#L119) | Backoffice: checkHealthStatus retorna pronto sin elementos de estado |
| 5 | [L128](../../tests/frontend/backoffice_controller.test.ts#L128) | Backoffice: loadAdminData completa el camino de exito |
| 6 | [L135](../../tests/frontend/backoffice_controller.test.ts#L135) | Backoffice: loadAdminData muestra el estado de error sin lanzar |
| 7 | [L146](../../tests/frontend/backoffice_controller.test.ts#L146) | Backoffice: handlePageSizeChange aplica el valor seleccionado |
| 8 | [L155](../../tests/frontend/backoffice_controller.test.ts#L155) | Backoffice: handleAdminSearch programa el debounce |
| 9 | [L164](../../tests/frontend/backoffice_controller.test.ts#L164) | Backoffice: changeAdminPage navega dentro del rango y rechaza el exterior |
| 10 | [L185](../../tests/frontend/backoffice_controller.test.ts#L185) | Backoffice: handleFormSubmit exige sesion activa |
| 11 | [L196](../../tests/frontend/backoffice_controller.test.ts#L196) | Backoffice: los modales delegan sin lanzar |
| 12 | [L207](../../tests/frontend/backoffice_controller.test.ts#L207) | Backoffice: executeDelete exige sesion activa |
| 13 | [L213](../../tests/frontend/backoffice_controller.test.ts#L213) | Backoffice: invalidateCache sincroniza tras recargar |
| 14 | [L219](../../tests/frontend/backoffice_controller.test.ts#L219) | Backoffice: initEventListeners enlaza sin lanzar |
| 15 | [L224](../../tests/frontend/backoffice_controller.test.ts#L224) | Backoffice: la superficie publica permanece exportada |
| 16 | [L253](../../tests/frontend/backoffice_controller.test.ts#L253) | Backoffice: handleFormSubmit con sesion activa rehabilita el boton |
| 17 | [L266](../../tests/frontend/backoffice_controller.test.ts#L266) | Backoffice: applyAdminFilters recarga los datos |
| 18 | [L274](../../tests/frontend/backoffice_controller.test.ts#L274) | Backoffice: handleAdminTypeFilter lee el valor del selector |

#### [`tests/frontend/backoffice_env.ts`](../../tests/frontend/backoffice_env.ts)

- **Dominio:** Entorno de Pruebas Frontend JSDOM
- **Tipo:** Helper / Environment | **Runner:** `none` | **Casos:** 0 | **Líneas:** 94 (3.8 KB)
- **Descripción:** Módulo de arranque de navegador simulado con JSDOM para ejecución determinista y cobertura estática V8 en pruebas frontend.
- **Artefactos Bajo Prueba:** `apps/frontend/src/backoffice.ts`
- **Comandos de Ejecución:** Ninguno (módulo auxiliar o fixture)

*Módulo auxiliar o fixture sin bloques de prueba independientes.*

#### [`tests/frontend/modal_components.test.ts`](../../tests/frontend/modal_components.test.ts)

- **Dominio:** Componentes Modales y Accesibilidad
- **Tipo:** Component / Unit | **Runner:** `node:test (tsx)` | **Casos:** 8 | **Líneas:** 142 (4.8 KB)
- **Descripción:** Valida el ciclo de vida de modales accesibles, trampa de foco para teclado (Tab/Shift+Tab), tecla Escape y cierre por backdrop.
- **Artefactos Bajo Prueba:** `apps/frontend/src/components/modal-detail.ts`, `apps/frontend/src/components/modal-crud.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L61](../../tests/frontend/modal_components.test.ts#L61) | 🧩 Modal Detail: calculateWeaknesses calcula debilidades elementales correctamente |
| 2 | [L73](../../tests/frontend/modal_components.test.ts#L73) | 🧩 Modal Detail: renderStatEqualizer genera columnas y segmentos proporcionales |
| 3 | [L82](../../tests/frontend/modal_components.test.ts#L82) | 🧩 Modal Detail: getTriggerIcon devuelve iconos representativos según método |
| 4 | [L90](../../tests/frontend/modal_components.test.ts#L90) | 🧩 Modal Detail: renderDetailModalContent genera markup semántico y sanitizado |
| 5 | [L103](../../tests/frontend/modal_components.test.ts#L103) | 🧩 Pokemon Card: renderPokemonCard genera article semántico con identificadores seguros |
| 6 | [L114](../../tests/frontend/modal_components.test.ts#L114) | 🧩 Admin Table: renderTableRows genera celdas y botones de acción data-attributes |
| 7 | [L126](../../tests/frontend/modal_components.test.ts#L126) | 🧩 Admin Table: computeKPIs agrega métricas de catálogo deterministamente |
| 8 | [L135](../../tests/frontend/modal_components.test.ts#L135) | 🧩 Modal CRUD: gestión de estado de borrado pendiente |

### Suite: Pruebas End-to-End y Accesibilidad (`e2e`)

#### [`tests/e2e/backoffice.spec.ts`](../../tests/e2e/backoffice.spec.ts)

- **Dominio:** E2E Backoffice Administrativo
- **Tipo:** E2E | **Runner:** `playwright` | **Casos:** 5 | **Líneas:** 108 (4.5 KB)
- **Descripción:** Flujos completos de administración en navegador: login con token, CRUD de Pokémon, paginación y modal de confirmación.
- **Artefactos Bajo Prueba:** `apps/frontend/src/backoffice.ts`, `apps/frontend/backoffice.html`
- **Comandos de Ejecución:** `npm run test:e2e`, `npm run test:a11y`
- **Workflows en CI:** `.github/workflows/web.yaml (e2e)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L11](../../tests/e2e/backoffice.spec.ts#L11) | La interfaz del Backoffice carga con KPIs, branding y tabla administrativa |
| 2 | [L31](../../tests/e2e/backoffice.spec.ts#L31) | El buscador administrativo filtra registros en la tabla por nombre |
| 3 | [L47](../../tests/e2e/backoffice.spec.ts#L47) | El modal de creación de Pokémon se abre y cierra correctamente |
| 4 | [L64](../../tests/e2e/backoffice.spec.ts#L64) | El flujo de autenticación administrativa valida credenciales y actualiza la UI |
| 5 | [L93](../../tests/e2e/backoffice.spec.ts#L93) | @a11y Auditoría de accesibilidad WCAG en Backoffice |

#### [`tests/e2e/pokedex.spec.ts`](../../tests/e2e/pokedex.spec.ts)

- **Dominio:** E2E Aplicación Pública y Accesibilidad WCAG
- **Tipo:** E2E / a11y | **Runner:** `playwright` | **Casos:** 5 | **Líneas:** 90 (3.8 KB)
- **Descripción:** Flujos de usuario en navegador: carga de catálogo, filtro con debounce, conmutador de tema oscuro y auditoría Axe-core WCAG 2.1 AA.
- **Artefactos Bajo Prueba:** `apps/frontend/src/pokedex.ts`, `apps/frontend/index.html`
- **Comandos de Ejecución:** `npm run test:e2e`, `npm run test:a11y`
- **Workflows en CI:** `.github/workflows/web.yaml (e2e)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L9](../../tests/e2e/pokedex.spec.ts#L9) | La interfaz principal carga con branding y catálogo de Pokémon |
| 2 | [L24](../../tests/e2e/pokedex.spec.ts#L24) | El buscador en tiempo real filtra los Pokémon por nombre |
| 3 | [L40](../../tests/e2e/pokedex.spec.ts#L40) | El alternador de tema modifica data-theme en el documento |
| 4 | [L50](../../tests/e2e/pokedex.spec.ts#L50) | @a11y Auditoría de accesibilidad WCAG con Axe-core |
| 5 | [L67](../../tests/e2e/pokedex.spec.ts#L67) | @coep Las imágenes de Pokémon cargan efectivamente (COEP require-corp) |

### Suite: Rendimiento y Carga (k6) (`performance`)

#### [`tests/performance/k6_stress_test.js`](../../tests/performance/k6_stress_test.js)

- **Dominio:** Rendimiento y Capacidad bajo Carga
- **Tipo:** Load / Stress | **Runner:** `k6` | **Casos:** 4 | **Líneas:** 167 (6.8 KB)
- **Descripción:** Prueba de carga k6 que valida umbrales p95/p99 de latencia, tasa de error y respeto de rate limits sin generar 429 espurios.
- **Artefactos Bajo Prueba:** `apps/backend/server.ts`, `apps/backend/src/middleware/rate-limiter.ts`
- **Comandos de Ejecución:** `k6 run tests/performance/k6_stress_test.js`
- **Workflows en CI:** `.github/workflows/performance-k6.yaml (k6-load-test)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L101](../../tests/performance/k6_stress_test.js#L101) | group: 01_Healthcheck |
| 2 | [L113](../../tests/performance/k6_stress_test.js#L113) | group: 02_Get_Pokemons_List |
| 3 | [L128](../../tests/performance/k6_stress_test.js#L128) | group: 03_Filter_Pokemons_By_Type |
| 4 | [L153](../../tests/performance/k6_stress_test.js#L153) | group: 04_Get_Pokemon_Detail |

### Suite: Paridad y Gobernanza de CI/CD (`ci`)

#### [`tests/ci/workflow_run_parity.test.ts`](../../tests/ci/workflow_run_parity.test.ts)

- **Dominio:** Paridad Estructural de Workflows de CI
- **Tipo:** Contract / CI | **Runner:** `node:test (tsx)` | **Casos:** 4 | **Líneas:** 186 (7.5 KB)
- **Descripción:** Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI.
- **Artefactos Bajo Prueba:** `.github/workflows/*.yaml`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L101](../../tests/ci/workflow_run_parity.test.ts#L101) | 🚨 WF-004: ningun producer de workflow_run es un reusable sin ejecucion propia |
| 2 | [L133](../../tests/ci/workflow_run_parity.test.ts#L133) | 🚨 WF-002: ningun trigger workflow_run referencia un workflow inexistente |
| 3 | [L155](../../tests/ci/workflow_run_parity.test.ts#L155) | 🚨 WF-002: la paridad cubre mas de un workflow (evita regresion de alcance) |
| 4 | [L166](../../tests/ci/workflow_run_parity.test.ts#L166) | 🚨 WF-002: cada consumidor de workflow_run mantiene un red de seguridad |

### Suite: API Fuzzing y Pruebas Adversariales (`fuzz`)

#### [`tests/fuzzing.test.ts`](../../tests/fuzzing.test.ts)

- **Dominio:** Fuzz Testing / Seguridad de Payloads
- **Tipo:** Fuzz | **Runner:** `node:test (tsx)` | **Casos:** 7 | **Líneas:** 220 (7.4 KB)
- **Descripción:** Ejecuta fuzzing adversarial con mutaciones caóticas de JSON, delimitadores y límites de buffer en endpoints REST.
- **Artefactos Bajo Prueba:** `apps/backend/src/routes/pokemons.ts`, `apps/backend/src/validation/schemas.ts`
- **Comandos de Ejecución:** `npm run test:fuzz`, `npm run test:all`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`, `.github/workflows/ci.yaml (code-quality)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L20](../../tests/fuzzing.test.ts#L20) | 🧪 Fuzzing [Payloads Primitivos]: validatePokemonPayload rechaza tipos no estructurados |
| 2 | [L48](../../tests/fuzzing.test.ts#L48) | 🧪 Fuzzing [Números Extremos]: validatePokemonPayload rechaza floats descomunales, Infinity y NaN en stats |
| 3 | [L76](../../tests/fuzzing.test.ts#L76) | 🧪 Fuzzing [Mass Assignment / Object Pollution]: validatePokemonPayload rechaza payloads con 1000 propiedades espurias |
| 4 | [L119](../../tests/fuzzing.test.ts#L119) | 🧪 Fuzzing [Unicode & Caracteres de Control]: validatePokemonPayload maneja secuencias extremas sin crashear |
| 5 | [L144](../../tests/fuzzing.test.ts#L144) | 🧪 Fuzzing [Evoluciones Circulares y Profundidad Extrema]: validatePokemonPayload previene recursión destructiva |
| 6 | [L165](../../tests/fuzzing.test.ts#L165) | 🧪 Fuzzing [Pagination Limits]: parsePagination maneja valores absurdos con gracia |
| 7 | [L188](../../tests/fuzzing.test.ts#L188) | 🧪 Fuzzing [Auth Session Tokens]: verifyTokenSignature resiste payloads malformados masivos |

### Suite: Gobernanza y Contratos de Plataforma (Root) (`governance`)

#### [`tests/aas_governance.test.ts`](../../tests/aas_governance.test.ts)

- **Dominio:** Gobernanza AAS (Agentic Awesome Skills)
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 8 | **Líneas:** 92 (3.9 KB)
- **Descripción:** Valida contratos de gobernanza de skills y agents en aas-stack.json, stacks requeridos y catálogo de herramientas.
- **Artefactos Bajo Prueba:** `.agents/aas/aas-stack.json`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`, `.github/workflows/ci.yaml (aas-governance)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L32](../../tests/aas_governance.test.ts#L32) | la selección AAS cumple el contrato local |
| 2 | [L36](../../tests/aas_governance.test.ts#L36) | AAS está fijado por versión y digest |
| 3 | [L41](../../tests/aas_governance.test.ts#L41) | rechaza sustituir coordinadamente una skill en manifest y revisión |
| 4 | [L49](../../tests/aas_governance.test.ts#L49) | rechaza riesgo, responsables y razón divergentes |
| 5 | [L60](../../tests/aas_governance.test.ts#L60) | rechaza una novena skill y metadata ausente |
| 6 | [L71](../../tests/aas_governance.test.ts#L71) | reporta JSON inválido como error gobernado |
| 7 | [L79](../../tests/aas_governance.test.ts#L79) | los scripts no exponen apply, recover ni install |
| 8 | [L88](../../tests/aas_governance.test.ts#L88) | la configuración MCP del editor permanece fuera del alcance |

#### [`tests/api-limits.test.ts`](../../tests/api-limits.test.ts)

- **Dominio:** Backend HTTP API / Rate Limiting
- **Tipo:** Integration | **Runner:** `node:test (tsx)` | **Casos:** 3 | **Líneas:** 43 (1.7 KB)
- **Descripción:** Verifica rate limiting global y por endpoint, manejo de peticiones concurrentes y cabeceras X-RateLimit-* con código 429.
- **Artefactos Bajo Prueba:** `apps/backend/src/middleware/rate-limiter.ts`, `apps/backend/server.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L11](../../tests/api-limits.test.ts#L11) | 🛡️ API Limits: parsePaginationLimit limita estrictamente al MAX_PAGE_SIZE de 100 |
| 2 | [L24](../../tests/api-limits.test.ts#L24) | 🛡️ API Limits: parsePaginationOffset limita estrictamente al MAX_OFFSET de 10000 |
| 3 | [L36](../../tests/api-limits.test.ts#L36) | 🛡️ API Limits: parsePagination combina limit y offset correctamente |

#### [`tests/audit_freshness.test.ts`](../../tests/audit_freshness.test.ts)

- **Dominio:** Gobernanza Documental / Auditorías Históricas
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 4 | **Líneas:** 60 (2.3 KB)
- **Descripción:** Comprueba la política de demarcación de auditorías históricas en docs/audits/ y asegura que no sean interpretadas como SSOT vigente.
- **Artefactos Bajo Prueba:** `docs/audits/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L20](../../tests/audit_freshness.test.ts#L20) | Audit lifecycle: baseline idéntico al repositorio queda CURRENT |
| 2 | [L34](../../tests/audit_freshness.test.ts#L34) | Audit lifecycle: commit divergente produce AUDIT_STALE no bloqueante |
| 3 | [L41](../../tests/audit_freshness.test.ts#L41) | Audit lifecycle: metadatos ausentes se reportan explícitamente |
| 4 | [L52](../../tests/audit_freshness.test.ts#L52) | Audit lifecycle: eleva evidencia por versión, Chart y GitOps divergentes |

#### [`tests/ci_impact.test.ts`](../../tests/ci_impact.test.ts)

- **Dominio:** Pipeline CI / Detección de Impacto
- **Tipo:** Contract / CI Matrix | **Runner:** `node:test (tsx)` | **Casos:** 47 | **Líneas:** 1192 (51.2 KB)
- **Descripción:** Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed.
- **Artefactos Bajo Prueba:** `scripts/detect-change-impact.ts`, `.agents/skills/_shared/change-impact-matrix.md`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L31](../../tests/ci_impact.test.ts#L31) | 🎯 Change Impact: la tabla generada cita workflows con la extensión .yaml vigente |
| 2 | [L57](../../tests/ci_impact.test.ts#L57) | 🎯 Change Impact: el template del PR no reintroduce la nomenclatura .yml |
| 3 | [L71](../../tests/ci_impact.test.ts#L71) | 🎯 Change Impact: Contrato declarativo ci-impact.yaml existe y es válido |
| 4 | [L90](../../tests/ci_impact.test.ts#L90) | 🎯 Change Impact: Cambio puramente documental activa solo Fast Track de docs |
| 5 | [L110](../../tests/ci_impact.test.ts#L110) | 🤖 Change Impact: manifest AAS activa gobierno de agentes sin fuga a aplicación o infraestructura |
| 6 | [L123](../../tests/ci_impact.test.ts#L123) | 🤖 Change Impact: validador y tests AAS activan el dominio canónico |
| 7 | [L148](../../tests/ci_impact.test.ts#L148) | 🎯 CI-001: Taskfile.yaml está clasificado y no dispara fail-closed |
| 8 | [L202](../../tests/ci_impact.test.ts#L202) | 🎯 CI-001: la configuración del motor es global, igual que el motor |
| 9 | [L219](../../tests/ci_impact.test.ts#L219) | 🎯 CI-001: la matriz de impacto identifica correctamente el perfil de AWS |
| 10 | [L236](../../tests/ci_impact.test.ts#L236) | 🎯 Change Impact: Cambio en backend activa backend, tests, security granular (sast, sca, container) y docker |
| 11 | [L259](../../tests/ci_impact.test.ts#L259) | 🎯 Change Impact: Cambio en GitOps activa kubernetes, security_iac y supply_chain pero omite sast/sca/container |
| 12 | [L278](../../tests/ci_impact.test.ts#L278) | 🎯 Change Impact: Cambio en Helm activa helm, kubernetes, security_iac y supply_chain |
| 13 | [L296](../../tests/ci_impact.test.ts#L296) | 🎯 Change Impact: Cambio en OpenTofu activa solo opentofu, security_secrets y security_iac |
| 14 | [L313](../../tests/ci_impact.test.ts#L313) | 🎯 Change Impact: Cambio en Ansible activa solo ansible, security_secrets y security_iac |
| 15 | [L328](../../tests/ci_impact.test.ts#L328) | 🎯 Change Impact: Archivo global transversal (package.json y detect-change-impact.ts) activa Full CI |
| 16 | [L354](../../tests/ci_impact.test.ts#L354) | 🎯 Change Impact: Script documental (scripts/lint-markdown.ts) activa únicamente documentation Fast Track |
| 17 | [L371](../../tests/ci_impact.test.ts#L371) | 🎯 Change Impact: Script de plataforma (scripts/k8s-rollout-restart.ts) activa kubernetes y security_iac pero omite backend/frontend |
| 18 | [L387](../../tests/ci_impact.test.ts#L387) | 🎯 Change Impact: Tests unitarios (tests/unit/**) activan tests y backend sin Docker ni Kubernetes |
| 19 | [L403](../../tests/ci_impact.test.ts#L403) | 🎯 Change Impact: Tests de frontend/e2e (tests/e2e/**) activan tests y frontend sin backend |
| 20 | [L418](../../tests/ci_impact.test.ts#L418) | 🎯 Change Impact: Tests de seguridad (tests/security/**) activan tests y security_iac |
| 21 | [L434](../../tests/ci_impact.test.ts#L434) | 🎯 Change Impact: Tests de GitOps (tests/gitops/**) activan tests, kubernetes y supply_chain |
| 22 | [L449](../../tests/ci_impact.test.ts#L449) | 🎯 Change Impact: Test genérico nuevo en tests/** activa tests base sin activar Fail-Closed (unknown) |
| 23 | [L464](../../tests/ci_impact.test.ts#L464) | 🎯 Change Impact: Archivo desconocido activa política Fail-Closed (Unknown -> Full CI) |
| 24 | [L484](../../tests/ci_impact.test.ts#L484) | 🎯 Change Impact: Markdown format genera tabla limpia con iconos de estado |
| 25 | [L503](../../tests/ci_impact.test.ts#L503) | 🔒 Change Impact Always: PR documental sigue activando security_secrets y pr_governance |
| 26 | [L530](../../tests/ci_impact.test.ts#L530) | 🔒 Change Impact Always: los controles se aplican en los 4 caminos de retorno |
| 27 | [L552](../../tests/ci_impact.test.ts#L552) | 🔒 Change Impact Always: applyAlwaysTriggers es funcional y fail-closed ante ids desconocidos |
| 28 | [L595](../../tests/ci_impact.test.ts#L595) | 🎯 CI topology: workflows condicionales delegan la decisión a change-impact.yaml |
| 29 | [L605](../../tests/ci_impact.test.ts#L605) | ⚙️ CI topology (REGRESIÓN): los reusable workflows no deben declarar concurrency |
| 30 | [L631](../../tests/ci_impact.test.ts#L631) | ⚙️ CI topology: el orquestador conserva la serialización por PR |
| 31 | [L637](../../tests/ci_impact.test.ts#L637) | 🤖 CI topology: agent_governance se propaga hasta un job AAS dedicado |
| 32 | [L647](../../tests/ci_impact.test.ts#L647) | 🌐 Nginx SSOT (DOC-003/CI-004): CI valida contra la imagen del Dockerfile, sin version hardcodeada |
| 33 | [L723](../../tests/ci_impact.test.ts#L723) | 📦 OCI-001: los labels de imagen usan la version y revision reales |
| 34 | [L764](../../tests/ci_impact.test.ts#L764) | ⚡ CI-002: MegaLinter no es un Quality Gate propio; el unico es el agregador |
| 35 | [L805](../../tests/ci_impact.test.ts#L805) | 🛡️ El ruleset declarativo debe registrar los tres required checks |
| 36 | [L849](../../tests/ci_impact.test.ts#L849) | 🧭 SKILL-001: repo-lifecycle declara tantas etapas como enumera |
| 37 | [L885](../../tests/ci_impact.test.ts#L885) | 📚 SKILL-001: las skills no citan workflows con la extensión .yml obsoleta |
| 38 | [L906](../../tests/ci_impact.test.ts#L906) | 🔒 SEC-001: los hooks de pre-commit se fijan por SHA, no por tag mutable |
| 39 | [L927](../../tests/ci_impact.test.ts#L927) | 🧹 CLEAN-001: las allowlist de Terraform historico quedan justificadas |
| 40 | [L949](../../tests/ci_impact.test.ts#L949) | 🔒 SEC-002: la exclusion de Semgrep sobre infra/ esta justificada |
| 41 | [L966](../../tests/ci_impact.test.ts#L966) | 🚦 Quality Gate: el agregador existe y es fail-closed con if: always() |
| 42 | [L969](../../tests/ci_impact.test.ts#L969) | 🌐 Nginx SSOT: el renderizador sustituye las variables y falla si faltan |
| 43 | [L1072](../../tests/ci_impact.test.ts#L1072) | 🚦 Quality Gate: el check del gate tiene el nombre que espera el ruleset |
| 44 | [L1083](../../tests/ci_impact.test.ts#L1083) | ⚙️ CI topology: change-impact.yaml es el único propietario de Trivy para imágenes de aplicación |
| 45 | [L1093](../../tests/ci_impact.test.ts#L1093) | 📊 CI topology: SonarQube Cloud tiene un único propietario de análisis real |
| 46 | [L1174](../../tests/ci_impact.test.ts#L1174) | 🔒 CI topology: Gitleaks conserva el Required Check independiente y sin filtros |
| 47 | [L1181](../../tests/ci_impact.test.ts#L1181) | 🎯 Change Impact: el contrato declara always con ids mapeados en el motor |

#### [`tests/concurrency.test.ts`](../../tests/concurrency.test.ts)

- **Dominio:** Concurrencia y Consistencia de Almacenamiento
- **Tipo:** Integration | **Runner:** `node:test (tsx)` | **Casos:** 1 | **Líneas:** 24 (0.8 KB)
- **Descripción:** Evalúa mutaciones concurrentes, aislamiento transaccional y prevención de race conditions en actualizaciones del catálogo Pokémon.
- **Artefactos Bajo Prueba:** `apps/backend/src/services/db.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L5](../../tests/concurrency.test.ts#L5) | ⚡ Concurrencia: llamadas paralelas a getNextPokemonId generan IDs estrictamente únicos |

#### [`tests/contracts.test.ts`](../../tests/contracts.test.ts)

- **Dominio:** Interoperabilidad Backend-Frontend
- **Tipo:** Contract / Types | **Runner:** `node:test (tsx)` | **Casos:** 3 | **Líneas:** 101 (4.2 KB)
- **Descripción:** Valida compatibilidad estructural estricta entre las interfaces de tipos de backend y frontend.
- **Artefactos Bajo Prueba:** `apps/backend/src/types.ts`, `apps/frontend/src/types.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L9](../../tests/contracts.test.ts#L9) | 🛡️ Contratos de Tipos: compatibilidad estructural e interoperabilidad entre Backend y Frontend |
| 2 | [L42](../../tests/contracts.test.ts#L42) | 🛡️ Contrato de Superficie de Pruebas: el inventario test-surface.json y test-surface.md están sincronizados sin drift |
| 3 | [L65](../../tests/contracts.test.ts#L65) | 🛡️ Contrato de Commits: commitlint.config.js y .pre-commit-config.yaml mantienen paridad estricta en sus tipos |

#### [`tests/doc_governance.test.ts`](../../tests/doc_governance.test.ts)

- **Dominio:** Gobernanza Documental / ADRs
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 2 | **Líneas:** 126 (5.9 KB)
- **Descripción:** Asegura que los ADRs y especificaciones técnicas cumplan con el formato canónico, encabezados y metadatos obligatorios.
- **Artefactos Bajo Prueba:** `docs/decisions/`, `.agents/rules/documentation-governance.md`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L17](../../tests/doc_governance.test.ts#L17) | 🔖 Gobernanza de Hallazgos: la convención de IDs con namespace está declarada y es coherente |
| 2 | [L83](../../tests/doc_governance.test.ts#L83) | 📚 Gobernanza Documental: validación contractual de la regla transversal y políticas normativas en repo-docs |

#### [`tests/markdown_gate.test.ts`](../../tests/markdown_gate.test.ts)

- **Dominio:** Markdown Quality Gate
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 7 | **Líneas:** 78 (3.6 KB)
- **Descripción:** Verifica el comportamiento del motor de linting de Markdown, reporte de errores MDxxx y mecanismos de auto-fix.
- **Artefactos Bajo Prueba:** `scripts/lint-markdown.ts`, `.markdownlint.json`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L12](../../tests/markdown_gate.test.ts#L12) | 📚 Markdown Gate: una ruta explícita inexistente debe fallar (fail-closed, CI-006) |
| 2 | [L23](../../tests/markdown_gate.test.ts#L23) | 📚 Markdown Gate: falla aunque solo una de varias rutas sea inexistente |
| 3 | [L31](../../tests/markdown_gate.test.ts#L31) | 📚 Markdown Gate: valida un archivo existente real y reporta 0 errores |
| 4 | [L39](../../tests/markdown_gate.test.ts#L39) | 📚 Markdown Gate: un directorio existente se expande recursivamente |
| 5 | [L47](../../tests/markdown_gate.test.ts#L47) | 📚 Markdown Gate: sin archivos explícitos valida el repositorio completo |
| 6 | [L55](../../tests/markdown_gate.test.ts#L55) | 📚 Markdown Gate: parseIgnorePatterns ignora comentarios y líneas vacías |
| 7 | [L64](../../tests/markdown_gate.test.ts#L64) | 📚 Markdown Gate: findMarkdownFiles respeta el directorio .markdownlintignore |

#### [`tests/pentest.test.ts`](../../tests/pentest.test.ts)

- **Dominio:** Pruebas de Penetración de API
- **Tipo:** Security / Pentest | **Runner:** `node:test (tsx)` | **Casos:** 28 | **Líneas:** 627 (25.3 KB)
- **Descripción:** Ejecuta batería exhaustiva de vectores de ataque: SQLi, NoSQLi, path traversal, XSS, HTTP parameter pollution y headers de seguridad.
- **Artefactos Bajo Prueba:** `apps/backend/server.ts`, `apps/backend/src/routes/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L37](../../tests/pentest.test.ts#L37) | 🔥 Pentest [Auth]: Falsificación de firma HMAC (Forged Signature Bypass) |
| 2 | [L52](../../tests/pentest.test.ts#L52) | 🔥 Pentest [Auth]: Ataque de Algoritmo None / Firma Vacía |
| 3 | [L62](../../tests/pentest.test.ts#L62) | 🔥 Pentest [Auth]: Escalación de privilegios modificando payload (Privilege Escalation) |
| 4 | [L79](../../tests/pentest.test.ts#L79) | 🔥 Pentest [Auth]: Replay Attack con Token Revocado |
| 5 | [L94](../../tests/pentest.test.ts#L94) | 🔥 Pentest [Auth]: Fail-Closed de Autenticación ante Caída de Redis |
| 6 | [L113](../../tests/pentest.test.ts#L113) | 🔥 Pentest [Auth]: Fail-Closed de Logout cuando Redis está inaccesible |
| 7 | [L133](../../tests/pentest.test.ts#L133) | 🔥 Pentest [Auth]: Logout rechaza tokens con firmas HMAC apócrifas y previene polución en Redis |
| 8 | [L156](../../tests/pentest.test.ts#L156) | 🔥 Pentest [Auth]: Logout con token expirado no produce I/O innecesario en Redis |
| 9 | [L169](../../tests/pentest.test.ts#L169) | 🔥 Pentest [RateLimiting]: Endpoints de IA fallan cerrado con 503 ante caída de Redis en multi-pod |
| 10 | [L207](../../tests/pentest.test.ts#L207) | 🔥 Pentest [RateLimiting]: Endpoints públicos mantienen fallback resiliente a memoria local si Redis está offline |
| 11 | [L232](../../tests/pentest.test.ts#L232) | 🔥 Pentest [RateLimiting]: Cuota diaria de IA bloquea con 429 tras superar el umbral diario por IP |
| 12 | [L266](../../tests/pentest.test.ts#L266) | 🔥 Pentest [AI Resiliency]: withTimeout aborta llamadas lentas de IA y activa fallback seguro |
| 13 | [L284](../../tests/pentest.test.ts#L284) | 🔥 Pentest [AI Resiliency]: AICircuitBreaker entra en estado OPEN tras fallos reiterados y se recupera con éxito |
| 14 | [L306](../../tests/pentest.test.ts#L306) | 🔥 Pentest [AI Security]: sanitizePrompt neutraliza jailbreaks, roles falsificados y delimita longitud |
| 15 | [L323](../../tests/pentest.test.ts#L323) | ⚡ Cache Semántico [AI]: getSemanticCacheKey normaliza espacios, mayúsculas y produce hash determinista |
| 16 | [L333](../../tests/pentest.test.ts#L333) | 🧩 Functional [Result]: ok, err, tryCatch y transformaciones algebraicas |
| 17 | [L367](../../tests/pentest.test.ts#L367) | 🔥 Pentest [Input]: Intento de Prototype Pollution vía JSON en Pokémon |
| 18 | [L392](../../tests/pentest.test.ts#L392) | 🔥 Pentest [Input]: Mass Assignment intentando inyectar roles en características |
| 19 | [L413](../../tests/pentest.test.ts#L413) | 🔥 Pentest [XSS]: Payloads políglotas complejos en campos de texto |
| 20 | [L432](../../tests/pentest.test.ts#L432) | 🔥 Pentest [SSRF/XSS]: Evasiones de protocolo y caracteres nulos en imágenes |
| 21 | [L447](../../tests/pentest.test.ts#L447) | 🔥 Pentest [SSRF]: Localhost HTTP bloqueado estrictamente en entorno de producción |
| 22 | [L468](../../tests/pentest.test.ts#L468) | 🔥 Pentest [DoS]: Árbol de evolución recursivo con profundidad extrema (>5) |
| 23 | [L486](../../tests/pentest.test.ts#L486) | 🔥 Pentest [DoS]: Flood masivo de nodos en evoluciones (>20 nodos totales) |
| 24 | [L503](../../tests/pentest.test.ts#L503) | 🔥 Pentest [DoS]: Abuso de paginación masiva con valores descomunales |
| 25 | [L517](../../tests/pentest.test.ts#L517) | 🔥 Pentest [Resilience]: Mutaciones fallan cerrado cuando PostgreSQL está configurado pero offline |
| 26 | [L561](../../tests/pentest.test.ts#L561) | 🔥 Pentest [Observability]: Métricas desglosan PostgreSQL y Memoria sin ambigüedad |
| 27 | [L570](../../tests/pentest.test.ts#L570) | 🔥 Pentest [Attack Surface]: Endpoint de descarga de repositorio retirado permanentemente (SEC-002) |
| 28 | [L583](../../tests/pentest.test.ts#L583) | 🔥 Pentest [Redis Resilience]: Revocación en memoria persiste en proceso actual tras FLUSHALL simulado |

#### [`tests/pr_template_governance.test.ts`](../../tests/pr_template_governance.test.ts)

- **Dominio:** Gobernanza de Pull Request Template
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 6 | **Líneas:** 267 (8.6 KB)
- **Descripción:** Valida conformidad estricta del cuerpo de PR contra el template físico oficial, impidiendo estructuras arbitrarias o mojibake.
- **Artefactos Bajo Prueba:** `.github/pull_request_template.md`, `scripts/validate-pr-body.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L25](../../tests/pr_template_governance.test.ts#L25) | 🛡️ Contrato de PR Template: el archivo físico existe en ruta SSOT y contiene secciones obligatorias |
| 2 | [L52](../../tests/pr_template_governance.test.ts#L52) | 🛡️ Contrato de PR Template: validate-pr-body aprueba un PR body completo y fiel al template |
| 3 | [L124](../../tests/pr_template_governance.test.ts#L124) | 🛡️ Contrato de PR Template: validate-pr-body RECHAZA la estructura no conforme observada en PR #438 |
| 4 | [L156](../../tests/pr_template_governance.test.ts#L156) | 🛡️ Contrato de PR Template: validate-pr-body detecta tablas de CI Impact no resueltas o incompletas |
| 5 | [L199](../../tests/pr_template_governance.test.ts#L199) | 🛡️ Contrato de PR Template: validate-pr-body detecta corrupción UTF-8 y mojibake |
| 6 | [L236](../../tests/pr_template_governance.test.ts#L236) | 🛡️ Contrato de Gobernanza en Skills: repo-pr y repo-lifecycle no albergan templates sintéticos y declaran el validador |

#### [`tests/ruleset_contract.test.ts`](../../tests/ruleset_contract.test.ts)

- **Dominio:** Gobernanza de GitHub Rulesets
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 3 | **Líneas:** 108 (4.3 KB)
- **Descripción:** Valida la estructura declarativa y restricciones de protección de rama del ruleset main-protection.json contra el esquema de GitHub.
- **Artefactos Bajo Prueba:** `.github/rulesets/main-protection.json`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L69](../../tests/ruleset_contract.test.ts#L69) | 🔤 RULESET-001: los required checks del ruleset no deben estar corruptos |
| 2 | [L79](../../tests/ruleset_contract.test.ts#L79) | 🔤 RULESET-001: los contexts del ruleset coinciden con los checks reales |
| 3 | [L94](../../tests/ruleset_contract.test.ts#L94) | 🔤 RULESET-001: el archivo de reglas se serializa en UTF-8 real |

#### [`tests/ruleset_parity.test.ts`](../../tests/ruleset_parity.test.ts)

- **Dominio:** Paridad Declarativa de Rulesets
- **Tipo:** Contract / Governance | **Runner:** `node:test (tsx)` | **Casos:** 10 | **Líneas:** 254 (10.6 KB)
- **Descripción:** Verifica la paridad e identifica drift entre el ruleset declarativo local y las reglas activas en la API remota de GitHub.
- **Artefactos Bajo Prueba:** `.github/rulesets/main-protection.json`, `scripts/check-ruleset-parity.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`, `.github/workflows/governance-ruleset-parity.yaml`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L47](../../tests/ruleset_parity.test.ts#L47) | 🔒 RULESET-001: el mapeo de actor_id de RepositoryRole esta blindado |
| 2 | [L65](../../tests/ruleset_parity.test.ts#L65) | 🔒 RULESET-001: los bypass_mode conocidos excluyen el valor legacy |
| 3 | [L91](../../tests/ruleset_parity.test.ts#L91) | 🔒 RULESET-001: la politica de aprobaciones refleja el estado de maintainer unico |
| 4 | [L105](../../tests/ruleset_parity.test.ts#L105) | 🔒 RULESET-001: el modo maintainer unico NO relaja el resto de las protecciones |
| 5 | [L132](../../tests/ruleset_parity.test.ts#L132) | 🚨 RULESET-001: detecta un bypass actor anadido en live sin declarar |
| 6 | [L148](../../tests/ruleset_parity.test.ts#L148) | 🚨 RULESET-001: detecta la relajacion de thread resolution y de aprobaciones |
| 7 | [L169](../../tests/ruleset_parity.test.ts#L169) | 🧪 RULESET-001: el motor de drift detecta drift de contexts y de enforcement |
| 8 | [L182](../../tests/ruleset_parity.test.ts#L182) | 🧪 RULESET-001: no hay drift cuando el live solo agrega metadatos de solo lectura |
| 9 | [L203](../../tests/ruleset_parity.test.ts#L203) | 🧪 RULESET-001: el orden de claves y de listas no genera drift |
| 10 | [L242](../../tests/ruleset_parity.test.ts#L242) | 🔌 RULESET-001: el gate esta cableado en package.json y en un workflow programado |

#### [`tests/security.test.ts`](../../tests/security.test.ts)

- **Dominio:** Seguridad Integral de Aplicación y Headers
- **Tipo:** Security / Application | **Runner:** `node:test (tsx)` | **Casos:** 28 | **Líneas:** 448 (17.2 KB)
- **Descripción:** Valida cabeceras Helmet (HSTS, CSP, X-Frame-Options), CORS restrictivo, prevención de fuga de información y manejo seguro de errores.
- **Artefactos Bajo Prueba:** `apps/backend/server.ts`, `apps/backend/src/middleware/`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`, `npm run test:security`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L17](../../tests/security.test.ts#L17) | 🛡️ Seguridad: validatePokemonPayload rechaza inyecciones XSS en nombre |
| 2 | [L26](../../tests/security.test.ts#L26) | 🛡️ Seguridad: validatePokemonPayload rechaza inyecciones XSS con onerror en descripción |
| 3 | [L38](../../tests/security.test.ts#L38) | 🛡️ Seguridad: validatePokemonPayload rechaza javascript: pseudo-protocolo en tipos |
| 4 | [L48](../../tests/security.test.ts#L48) | 🛡️ Seguridad: validateImageUrl rechaza URLs inseguras o pseudo-protocolos |
| 5 | [L75](../../tests/security.test.ts#L75) | 🛡️ Seguridad: validateImageUrl rechaza IPs privadas RFC 1918, IMDS e IPv6 restringidas (Anti-SSRF) |
| 6 | [L91](../../tests/security.test.ts#L91) | 🛡️ Seguridad: validatePokemonPayload rechaza valores numéricos corruptos con sufijos de texto |
| 7 | [L111](../../tests/security.test.ts#L111) | 🛡️ Seguridad: validatePokemonPayload rechaza URL maliciosa en campo imagen |
| 8 | [L121](../../tests/security.test.ts#L121) | 🛡️ Seguridad: validatePokemonPayload rechaza campos desconocidos en stats (anti-inyección/mass assignment) |
| 9 | [L139](../../tests/security.test.ts#L139) | 🛡️ Seguridad: validatePokemonPayload rechaza campos desconocidos en caracteristicas (anti mass-assignment) |
| 10 | [L154](../../tests/security.test.ts#L154) | 🛡️ Validación: rechaza payloads no válidos (null, strings, arrays) |
| 11 | [L160](../../tests/security.test.ts#L160) | 🛡️ Validación: rechaza pesos y alturas físicas desmedidas o negativas |
| 12 | [L176](../../tests/security.test.ts#L176) | 🛡️ Validación: rechaza stats fuera del rango 0-1000 |
| 13 | [L186](../../tests/security.test.ts#L186) | 🛡️ Seguridad: validatePokemonPayload acepta payloads legítimos completos |
| 14 | [L205](../../tests/security.test.ts#L205) | ⚡ Escalabilidad: cálculo de nextId con reduce soporta grandes colecciones sin stack overflow |
| 15 | [L211](../../tests/security.test.ts#L211) | 🔐 Auth Session: extractSessionTokenFromRequest lee token de cookie HttpOnly |
| 16 | [L221](../../tests/security.test.ts#L221) | 🔐 Auth Session: buildSessionCookie emite cookie segura con flags HttpOnly, Secure y SameSite |
| 17 | [L236](../../tests/security.test.ts#L236) | 🔐 Auth Session: generateSessionToken genera token HMAC válido y estructurado |
| 18 | [L244](../../tests/security.test.ts#L244) | 🔐 Auth Session: verifySessionToken rechaza tokens expirados |
| 19 | [L251](../../tests/security.test.ts#L251) | 🔐 Auth Session: verifySessionToken rechaza firmas alteradas o datos modificados |
| 20 | [L264](../../tests/security.test.ts#L264) | 🔐 Auth Session: verifySessionToken rechaza tokens malformados, vacíos o nulos |
| 21 | [L272](../../tests/security.test.ts#L272) | 🔐 Auth Session: verifyTokenSignature rechaza límites y tipos anómalos en payload (exp, jti, role) |
| 22 | [L318](../../tests/security.test.ts#L318) | 🔐 Auth Session: getSessionSecret falla cerrado en producción si no hay secretos configurados |
| 23 | [L338](../../tests/security.test.ts#L338) | 🔐 Auth Session: getSessionSecret en producción exige ADMIN_SESSION_SECRET y no acepta ADMIN_API_KEY como fallback |
| 24 | [L358](../../tests/security.test.ts#L358) | 🔐 Auth Session: extractSessionTokenFromRequest lee token de cookie HttpOnly |
| 25 | [L368](../../tests/security.test.ts#L368) | 🔐 Auth Session: getSessionSecret genera clave efímera segura en modo desarrollo/test |
| 26 | [L392](../../tests/security.test.ts#L392) | 🔐 Auth Session: revokeSessionToken revoca el token por jti y verifySessionToken lo rechaza inmediatamente |
| 27 | [L401](../../tests/security.test.ts#L401) | 🔐 Auth Session: revokeSessionToken con token de corta duración expira y se autolimpia |
| 28 | [L415](../../tests/security.test.ts#L415) | 🛡️ Seguridad: validatePokemonPayload valida estructura y límites en evoluciones |

#### [`tests/storage.test.ts`](../../tests/storage.test.ts)

- **Dominio:** Capa de Persistencia y Caché
- **Tipo:** Integration | **Runner:** `node:test (tsx)` | **Casos:** 8 | **Líneas:** 121 (4.5 KB)
- **Descripción:** Valida operaciones CRUD del repositorio, serialización y resiliencia de la capa de datos.
- **Artefactos Bajo Prueba:** `apps/backend/src/services/db.ts`, `apps/backend/src/services/cache.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L17](../../tests/storage.test.ts#L17) | 📦 Storage Layer: getStorageHealth reporta estado por defecto |
| 2 | [L25](../../tests/storage.test.ts#L25) | 📦 Storage Layer: getAllPokemons pagina y filtra correctamente |
| 3 | [L36](../../tests/storage.test.ts#L36) | 📦 Storage Layer: getPokemonById retorna pokemon existente y null para inexistente |
| 4 | [L45](../../tests/storage.test.ts#L45) | 📦 Storage Layer: savePokemon guarda y actualiza un registro |
| 5 | [L72](../../tests/storage.test.ts#L72) | 📦 Storage Layer: getNextPokemonId genera IDs continuos |
| 6 | [L77](../../tests/storage.test.ts#L77) | 📦 Drizzle ORM: Esquema pokedexEntries y pokedexIdSeq definidos correctamente |
| 7 | [L94](../../tests/storage.test.ts#L94) | 📦 Drizzle ORM: Migraciones declarativas generadas y consistentes en disco |
| 8 | [L111](../../tests/storage.test.ts#L111) | 📦 Drizzle ORM: drizzle.config.ts implementa política fail-closed en producción |

#### [`tests/version.test.ts`](../../tests/version.test.ts)

- **Dominio:** Endpoint de Telemetría /version
- **Tipo:** Integration | **Runner:** `node:test (tsx)` | **Casos:** 14 | **Líneas:** 414 (16.3 KB)
- **Descripción:** Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime.
- **Artefactos Bajo Prueba:** `apps/backend/server.ts`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L14](../../tests/version.test.ts#L14) | 🛡️ APPS-002: el sentinel MigrationFailedError se exporta y conserva la causa |
| 2 | [L35](../../tests/version.test.ts#L35) | 🛡️ APPS-002: produccion aborta ante fallo de migracion, no degrada a memoria |
| 3 | [L71](../../tests/version.test.ts#L71) | 🛡️ APPS-002: el arranque aborta el proceso si initStorage falla |
| 4 | [L86](../../tests/version.test.ts#L86) | 🛡️ APPS-008: produccion exige PostgreSQL y acepta la alternativa POSTGRES_* |
| 5 | [L190](../../tests/version.test.ts#L190) | 📦 Endpoint /version expone metadata segura de la aplicación y base de datos |
| 6 | [L220](../../tests/version.test.ts#L220) | 🏷️ VER-002: /version expone la versión semántica real de la SSOT, no un SHA |
| 7 | [L259](../../tests/version.test.ts#L259) | 🏷️ VER-002: /version degrada a "unknown" en lugar de anunciar una versión ficticia |
| 8 | [L288](../../tests/version.test.ts#L288) | 🛡️ Startup Env Check: bypass transparente en entorno de tests |
| 9 | [L294](../../tests/version.test.ts#L294) | 🛡️ Startup Env Check: detecta variables requeridas faltantes en producción |
| 10 | [L317](../../tests/version.test.ts#L317) | 🛡️ Startup Env Check: pasa exitosamente en producción si variables críticas existen |
| 11 | [L334](../../tests/version.test.ts#L334) | 🛡️ Startup Env Check: SKIP_ENV_CHECK=true NO bypasses validación en producción |
| 12 | [L352](../../tests/version.test.ts#L352) | 🛡️ Startup Env Check: SKIP_ENV_CHECK=true sí permite bypass en entornos no productivos |
| 13 | [L369](../../tests/version.test.ts#L369) | 🛡️ Seguridad Express: Middleware inyecta cabeceras CSP, Permissions-Policy, nosniff y Referrer-Policy |
| 14 | [L391](../../tests/version.test.ts#L391) | 🔍 Observabilidad: requestTracer genera y propaga X-Request-Id para correlación de trazas |

#### [`tests/version_consistency.test.ts`](../../tests/version_consistency.test.ts)

- **Dominio:** Consistencia de Versiones SemVer
- **Tipo:** Contract / Release | **Runner:** `node:test (tsx)` | **Casos:** 3 | **Líneas:** 100 (4.5 KB)
- **Descripción:** Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm).
- **Artefactos Bajo Prueba:** `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, `infra/helm/pokedex/Chart.yaml`
- **Comandos de Ejecución:** `npm test`, `npm run test:all`, `npm run test:coverage`
- **Workflows en CI:** `.github/workflows/ci.yaml (code-quality, sonarcloud)`

| # | Línea | Nombre del Caso de Prueba |
| :---: | :---: | :--- |
| 1 | [L23](../../tests/version_consistency.test.ts#L23) | VER-001 🔒 Contrato de versión: package.json == package-lock.json == Chart.yaml == GitOps |
| 2 | [L56](../../tests/version_consistency.test.ts#L56) | VER-002 🔒 /version expone versión y commit como metadatos independientes |
| 3 | [L76](../../tests/version_consistency.test.ts#L76) | VER-001 🔒 Fase promote del workflow sincroniza package-lock.json junto a package.json |

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
