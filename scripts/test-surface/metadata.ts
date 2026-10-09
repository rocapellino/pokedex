/**
 * Catálogo canónico de descripciones, dominios semánticos y suites (datos).
 */

// Catálogo canónico de descripciones y dominios semánticos
export const FILE_METADATA_CATALOG: Record<
  string,
  {
    type: string;
    targetDomain: string;
    targetArtifacts: string[];
    description: string;
  }
> = {
  'tests/aas_governance.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza AAS (Agentic Awesome Skills)',
    targetArtifacts: ['.agents/aas/aas-stack.json'],
    description:
      'Valida contratos de gobernanza de skills y agents en aas-stack.json, stacks requeridos y catálogo de herramientas.',
  },
  'tests/integration/api-limits.test.ts': {
    type: 'Integration',
    targetDomain: 'Backend HTTP API / Rate Limiting',
    targetArtifacts: ['apps/backend/src/middleware/rate-limiter.ts', 'apps/backend/server.ts'],
    description:
      'Verifica rate limiting global y por endpoint, manejo de peticiones concurrentes y cabeceras X-RateLimit-* con código 429.',
  },
  'tests/audit_freshness.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza Documental / Auditorías Históricas',
    targetArtifacts: ['docs/audits/'],
    description:
      'Comprueba la política de demarcación de auditorías históricas en docs/audits/ y asegura que no sean interpretadas como SSOT vigente.',
  },
  'tests/ci_impact.test.ts': {
    type: 'Contract / CI Matrix',
    targetDomain: 'Pipeline CI / Detección de Impacto',
    targetArtifacts: ['scripts/detect-change-impact.ts', '.agents/skills/_shared/change-impact-matrix.md'],
    description:
      'Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed.',
  },
  'tests/integration/concurrency.test.ts': {
    type: 'Integration',
    targetDomain: 'Concurrencia y Consistencia de Almacenamiento',
    targetArtifacts: ['apps/backend/src/services/db.ts'],
    description:
      'Evalúa mutaciones concurrentes, aislamiento transaccional y prevención de race conditions en actualizaciones del catálogo Pokémon.',
  },
  'tests/contracts.test.ts': {
    type: 'Contract / Types',
    targetDomain: 'Interoperabilidad Backend-Frontend',
    targetArtifacts: ['apps/backend/src/types.ts', 'apps/frontend/src/types.ts'],
    description: 'Valida compatibilidad estructural estricta entre las interfaces de tipos de backend y frontend.',
  },
  'tests/doc_governance.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza Documental / ADRs',
    targetArtifacts: ['docs/decisions/', '.agents/rules/documentation-governance.md'],
    description:
      'Asegura que los ADRs y especificaciones técnicas cumplan con el formato canónico, encabezados y metadatos obligatorios.',
  },
  'tests/fuzz/fuzzing.test.ts': {
    type: 'Fuzz',
    targetDomain: 'Fuzz Testing / Seguridad de Payloads',
    targetArtifacts: ['apps/backend/src/routes/pokemons.ts', 'apps/backend/src/validation/schemas.ts'],
    description:
      'Ejecuta fuzzing adversarial con mutaciones caóticas de JSON, delimitadores y límites de buffer en endpoints REST.',
  },
  'tests/markdown_gate.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Markdown Quality Gate',
    targetArtifacts: ['scripts/lint-markdown.ts', '.markdownlint.json'],
    description:
      'Verifica el comportamiento del motor de linting de Markdown, reporte de errores MDxxx y mecanismos de auto-fix.',
  },
  'tests/security/app/pentest.test.ts': {
    type: 'Security / Pentest',
    targetDomain: 'Pruebas de Penetración de API',
    targetArtifacts: ['apps/backend/server.ts', 'apps/backend/src/routes/'],
    description:
      'Ejecuta batería exhaustiva de vectores de ataque: SQLi, NoSQLi, path traversal, XSS, HTTP parameter pollution y headers de seguridad.',
  },
  'tests/pr_template_governance.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza de Pull Request Template',
    targetArtifacts: ['.github/pull_request_template.md', 'scripts/validate-pr-body.ts'],
    description:
      'Valida conformidad estricta del cuerpo de PR contra el template físico oficial, impidiendo estructuras arbitrarias o mojibake.',
  },
  'tests/ruleset_contract.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza de GitHub Rulesets',
    targetArtifacts: ['.github/rulesets/main-protection.json'],
    description:
      'Valida la estructura declarativa y restricciones de protección de rama del ruleset main-protection.json contra el esquema de GitHub.',
  },
  'tests/ruleset_parity.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Paridad Declarativa de Rulesets',
    targetArtifacts: ['.github/rulesets/main-protection.json', 'scripts/check-ruleset-parity.ts'],
    description:
      'Verifica la paridad e identifica drift entre el ruleset declarativo local y las reglas activas en la API remota de GitHub.',
  },
  'tests/security/app/security.test.ts': {
    type: 'Security / Application',
    targetDomain: 'Seguridad Integral de Aplicación y Headers',
    targetArtifacts: ['apps/backend/server.ts', 'apps/backend/src/middleware/'],
    description:
      'Valida cabeceras Helmet (HSTS, CSP, X-Frame-Options), CORS restrictivo, prevención de fuga de información y manejo seguro de errores.',
  },
  'tests/integration/storage.test.ts': {
    type: 'Integration',
    targetDomain: 'Capa de Persistencia y Caché',
    targetArtifacts: ['apps/backend/src/services/db.ts', 'apps/backend/src/services/cache.ts'],
    description: 'Valida operaciones CRUD del repositorio, serialización y resiliencia de la capa de datos.',
  },
  'tests/version_consistency.test.ts': {
    type: 'Contract / Release',
    targetDomain: 'Consistencia de Versiones SemVer',
    targetArtifacts: [
      'package.json',
      'apps/backend/package.json',
      'apps/frontend/package.json',
      'infra/helm/pokedex/Chart.yaml',
    ],
    description:
      'Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm).',
  },
  'tests/integration/version.test.ts': {
    type: 'Integration',
    targetDomain: 'Endpoint de Telemetría /version',
    targetArtifacts: ['apps/backend/server.ts'],
    description:
      'Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime.',
  },
  'tests/ci/workflow_run_parity.test.ts': {
    type: 'Contract / CI',
    targetDomain: 'Paridad Estructural de Workflows de CI',
    targetArtifacts: ['.github/workflows/*.yaml'],
    description:
      'Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI.',
  },
  'tests/e2e/backoffice.spec.ts': {
    type: 'E2E',
    targetDomain: 'E2E Backoffice Administrativo',
    targetArtifacts: ['apps/frontend/src/backoffice.ts', 'apps/frontend/backoffice.html'],
    description:
      'Flujos completos de administración en navegador: login con token, CRUD de Pokémon, paginación y modal de confirmación.',
  },
  'tests/e2e/pokedex.spec.ts': {
    type: 'E2E / a11y',
    targetDomain: 'E2E Aplicación Pública y Accesibilidad WCAG',
    targetArtifacts: ['apps/frontend/src/pokedex.ts', 'apps/frontend/index.html'],
    description:
      'Flujos de usuario en navegador: carga de catálogo, filtro con debounce, conmutador de tema oscuro y auditoría Axe-core WCAG 2.1 AA.',
  },
  'tests/frontend/backoffice_controller.test.ts': {
    type: 'Component / Unit',
    targetDomain: 'Controlador DOM de Backoffice',
    targetArtifacts: ['apps/frontend/src/backoffice.ts'],
    description:
      'Valida eventos de DOM, renderizado de tablas, modales interactivos y toasts en el backoffice usando entorno JSDOM.',
  },
  'tests/frontend/backoffice_env.ts': {
    type: 'Helper / Environment',
    targetDomain: 'Entorno de Pruebas Frontend JSDOM',
    targetArtifacts: ['apps/frontend/src/backoffice.ts'],
    description:
      'Módulo de arranque de navegador simulado con JSDOM para ejecución determinista y cobertura estática V8 en pruebas frontend.',
  },
  'tests/frontend/modal_components.test.ts': {
    type: 'Component / Unit',
    targetDomain: 'Componentes Modales y Accesibilidad',
    targetArtifacts: ['apps/frontend/src/components/modal-detail.ts', 'apps/frontend/src/components/modal-crud.ts'],
    description:
      'Valida el ciclo de vida de modales accesibles, trampa de foco para teclado (Tab/Shift+Tab), tecla Escape y cierre por backdrop.',
  },
  'tests/gitops/argocd_pinning.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'GitOps / Inmutabilidad de Despliegues',
    targetArtifacts: ['gitops/values-*.yaml', 'scripts/verify-image-digest-parity.ts'],
    description:
      'Valida pinning estricto por digest SHA-256 en manifiestos de ArgoCD y prohíbe tags mutables (:latest) en dev, preprod y prod.',
  },
  'tests/performance/k6_stress_test.js': {
    type: 'Load / Stress',
    targetDomain: 'Rendimiento y Capacidad bajo Carga',
    targetArtifacts: ['apps/backend/server.ts', 'apps/backend/src/middleware/rate-limiter.ts'],
    description:
      'Prueba de carga k6 que valida umbrales p95/p99 de latencia, tasa de error y respeto de rate limits sin generar 429 espurios.',
  },
  'tests/security/adr_compliance_contracts.test.ts': {
    type: 'Contract / Architecture',
    targetDomain: 'Conformidad con ADRs de Arquitectura',
    targetArtifacts: ['docs/decisions/'],
    description:
      'Comprueba el cumplimiento de decisiones de arquitectura registradas en ADR-001 a ADR-015 (topología, RBAC, ingress y secrets).',
  },
  'tests/security/ansible_baseline_security.test.ts': {
    type: 'Security / Ansible',
    targetDomain: 'Hardening de Host, Redes y Ansible Baseline',
    targetArtifacts: ['infra/ansible/'],
    description:
      'Valida hardening de hosts (UFW, SSH accept-new, usuario devops), inventarios sin colisiones y colecciones fijadas.',
  },
  'tests/security/docs_portal_integrity.test.ts': {
    type: 'Contract / Docs',
    targetDomain: 'Integridad del Portal de Documentación',
    targetArtifacts: ['docs/'],
    description: 'Valida vínculos internos, anclas, sintaxis y consistencia de navegación en el portal documental.',
  },
  'tests/security/dr_backup_security.test.ts': {
    type: 'Security / Backup',
    targetDomain: 'Seguridad y Cifrado de Backups',
    targetArtifacts: ['scripts/dr-drill.ts', 'scripts/dev-backup-gdrive.ts'],
    description:
      'Valida cifrado AES-256-GCM en reposo de snapshots de base de datos, permisos de archivos y aislamiento de claves.',
  },
  'tests/security/dr_e2e_drill.test.ts': {
    type: 'Security / DR',
    targetDomain: 'Simulacro de Recuperación ante Desastres (DR)',
    targetArtifacts: ['scripts/dr-drill.ts'],
    description:
      'Evalúa la ejecución completa del simulacro de desastre automatizado, restauración limpia y verificación de RTO/RPO.',
  },
  'tests/security/egress_anti_ssrf.test.ts': {
    type: 'Security / Network',
    targetDomain: 'Control de Egress y Prevención SSRF',
    targetArtifacts: ['infra/helm/pokedex/templates/cilium-network-policies.yaml', 'scripts/probe-egress-security.ts'],
    description:
      'Valida Network Policies Cilium L7 eBPF, bloqueo de rangos privados (RFC 1918, link-local, cloud metadata) y allowlist estricta.',
  },
  'tests/security/ghcr_retention.test.ts': {
    type: 'Contract / OCI',
    targetDomain: 'Retención y Ciclo de Vida en GHCR',
    targetArtifacts: ['scripts/ghcr-retention.ts', '.github/workflows/ghcr-retention.yaml'],
    description:
      'Verifica la política de retención de imágenes OCI en GHCR, preservación de releases semver y limpieza de imágenes huérfanas.',
  },
  'tests/security/github_security_linear_sync.test.ts': {
    type: 'Contract / SecOps',
    targetDomain: 'Sincronización de Seguridad GitHub-Linear',
    targetArtifacts: ['scripts/github-security-linear-sync.ts', '.github/workflows/github-security-linear-sync.yaml'],
    description:
      'Valida sincronización bidireccional idempotente de vulnerabilidades y alertas de seguridad hacia issues de Linear.',
  },
  'tests/security/gitops_image_parity.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'Paridad de Imágenes en GitOps',
    targetArtifacts: ['scripts/verify-image-digest-parity.ts', 'gitops/'],
    description:
      'Comprueba el script de verificación de paridad de imagen asegurando inmutabilidad entre entornos dev, preprod y prod.',
  },
  'tests/security/grafana_cloud_collection.test.ts': {
    type: 'Contract / Observability',
    targetDomain: 'Recolección de Métricas del Clúster hacia Grafana Cloud',
    targetArtifacts: ['infra/monitoring/grafana-cloud-values.yaml', 'scripts/deploy-grafana-cloud.mjs'],
    description:
      'Renderiza k8s-monitoring con la versión y flags del script: scrapes de clúster, allowlists de las alertas y endpoint OTLP de la API.',
  },
  'tests/security/grafana_portability.test.ts': {
    type: 'Contract / Observability',
    targetDomain: 'Portabilidad de Dashboards Grafana',
    targetArtifacts: ['infra/monitoring/dashboards/'],
    description:
      'Valida esquemas JSON declarativos de dashboards Grafana, portabilidad de datasources y ausencia de UIDs fijos.',
  },
  'tests/security/iac_baseline_security.test.ts': {
    type: 'Security / DevDX',
    targetDomain: 'Gobernanza de Scripts, Tooling y Dev DX',
    targetArtifacts: ['Taskfile.yaml', '.tool-versions', 'infra/k8s/kind-cluster.yaml'],
    description:
      'Suite de gobernanza Dev DX: valida que scripts imperativos estén retirados (ADR-020), delegación en Taskfile y versiones inmutables.',
  },
  'tests/security/ignore_hygiene.test.ts': {
    type: 'Contract / Hygiene',
    targetDomain: 'Higiene de Archivos de Exclusión (.gitignore)',
    targetArtifacts: ['scripts/check-ignore-hygiene.ts', '.gitignore', '.dockerignore'],
    description:
      'Valida el linter de higiene de archivos .ignore, previniendo exclusión indebida, duplicados o fuga de secretos.',
  },
  'tests/security/k8s_workload_hardening.test.ts': {
    type: 'Security / Kubernetes',
    targetDomain: 'Hardening de Workloads Kubernetes',
    targetArtifacts: ['infra/k8s/', 'infra/helm/pokedex/templates/'],
    description:
      'Verifica SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp), límites de recursos y probes de salud.',
  },
  'tests/security/network_policies_security.test.ts': {
    type: 'Security / Network',
    targetDomain: 'Aislamiento de Red Zero-Trust',
    targetArtifacts: [
      'infra/helm/pokedex/templates/network-policies.yaml',
      'infra/helm/pokedex/templates/cilium-network-policies.yaml',
    ],
    description:
      'Verifica aislamiento estricto entre pods de frontend, backend, Redis y PostgreSQL impidiendo accesos laterales no autorizados.',
  },
  'tests/security/opentofu_baseline_security.test.ts': {
    type: 'Security / OpenTofu',
    targetDomain: 'Hardening de OpenTofu, Cloud Design y Estado IaC',
    targetArtifacts: ['infra/opentofu/'],
    description:
      'Valida OpenTofu: cifrado de estado (ADR-012), checksums de imágenes descargadas, ausencia de variables muertas y estructura multi-cloud.',
  },
  'tests/security/operation_dr_benchmarks.test.ts': {
    type: 'Security / DR Benchmarks',
    targetDomain: 'Benchmarks de Recuperación ante Desastres',
    targetArtifacts: ['scripts/dr-drill.ts'],
    description:
      'Valida umbrales cuantitativos de tiempo de backup, compresión y consistencia de restauración contra SLAs operacionales.',
  },
  'tests/security/promote_auto_approve_contracts.test.ts': {
    type: 'Contract / CI-CD',
    targetDomain: 'Promoción Automatizada Segura',
    targetArtifacts: ['.github/workflows/promote-auto-approve.yaml'],
    description:
      'Valida políticas de auto-aprobación de PRs de dependencias patch/minor con suites de seguridad obligatorias.',
  },
  'tests/security/supply_chain_security.test.ts': {
    type: 'Security / Supply Chain',
    targetDomain: 'Seguridad de Cadena de Suministro y SBOM',
    targetArtifacts: ['package.json', 'package-lock.json', '.github/workflows/ci.yaml'],
    description:
      'Comprueba inmutabilidad de dependencias, bloqueo de scripts arbitrarios en npm ci, SBOM y firma de imágenes.',
  },
  'tests/security/vault_redeploy_contract.test.ts': {
    type: 'Security / Secrets',
    targetDomain: 'Gestión y Rotación de Secretos (Vault)',
    targetArtifacts: ['scripts/k8s-rollout-restart.ts'],
    description:
      'Valida el reinicio controlado de workloads y el refresco de secretos inyectados tras rotaciones en HashiCorp Vault.',
  },
  'tests/security/yaml_extension_governance.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza de Extensiones YAML',
    targetArtifacts: ['scripts/check-yaml-extension.ts'],
    description:
      'Verifica cumplimiento estricto del uso exclusivo de la extensión .yaml (prohibiendo .yml) en todo el repositorio.',
  },
  'tests/unit/auth_service.test.ts': {
    type: 'Unit',
    targetDomain: 'Servicio de Autenticación y Sesiones',
    targetArtifacts: ['apps/backend/src/services/auth.ts'],
    description:
      'Valida ciclo de vida de tokens HMAC-SHA256, expiración, verificación de firma, revocación en memoria y fail-closed de secretos.',
  },
  'tests/unit/cache_service.test.ts': {
    type: 'Unit',
    targetDomain: 'Servicio de Caché y Fallback',
    targetArtifacts: ['apps/backend/src/services/cache.ts'],
    description:
      'Valida almacenamiento en caché Redis con fallback transparente a memoria local, TTL y resiliencia ante cortes de red.',
  },
  'tests/unit/pokemon_repository.test.ts': {
    type: 'Unit',
    targetDomain: 'Repositorio de Datos Pokémon',
    targetArtifacts: ['apps/backend/src/services/pokemon.repository.ts'],
    description:
      'Valida operaciones de consulta, filtrado por tipo, búsqueda por nombre, paginación y transformaciones de atributos.',
  },
  'tests/unit/postgres_fail_closed.test.ts': {
    type: 'Unit',
    targetDomain: 'Resiliencia de Conexión a Base de Datos',
    targetArtifacts: ['apps/backend/src/services/postgres.ts', 'apps/backend/server.ts'],
    description:
      'Verifica comportamiento fail-closed ante indisponibilidad de PostgreSQL, reintentos con backoff y aislamiento de errores.',
  },
};

// Definición canónica de suites del repositorio
export const SUITES_DEFINITION: Record<
  string,
  {
    name: string;
    path: string;
    runner: string;
    command: string;
    description: string;
  }
> = {
  unit: {
    name: 'Pruebas Unitarias de Aplicación',
    path: 'tests/unit',
    runner: 'node:test (tsx)',
    command: 'npm run test:unit',
    description:
      'Pruebas de alta velocidad y aislamiento sobre servicios de dominio, autenticación, caché y repositorios.',
  },
  integration: {
    name: 'Pruebas de Integración de API y Servicios',
    path: 'tests/integration',
    runner: 'node:test (tsx)',
    command: 'npm run test:integration',
    description:
      'Pruebas de persistencia PostgreSQL/Drizzle, concurrencia transaccional, rate limits y endpoint de versión.',
  },
  security: {
    name: 'Seguridad, Hardening y DevSecOps',
    path: 'tests/security',
    runner: 'node:test (tsx)',
    command: 'npm run test:security',
    description:
      'Evaluación de políticas de admisión, Network Policies Cilium L7, cifrado DR, secretos Vault y contratos IaC.',
  },
  gitops: {
    name: 'Contratos de GitOps y Despliegue',
    path: 'tests/gitops',
    runner: 'node:test (tsx)',
    command: 'npm run test:gitops',
    description:
      'Inmutabilidad de imágenes por digest SHA-256 en ArgoCD y paridad estricta entre entornos dev/preprod/prod.',
  },
  frontend: {
    name: 'Componentes y Controladores Frontend',
    path: 'tests/frontend',
    runner: 'node:test + JSDOM',
    command: 'npm test',
    description: 'Pruebas sobre controladores DOM de backoffice, toasts interactivos y componentes modales accesibles.',
  },
  e2e: {
    name: 'Pruebas End-to-End y Accesibilidad',
    path: 'tests/e2e',
    runner: 'playwright',
    command: 'npm run test:e2e',
    description:
      'Simulación completa de flujos de usuario en Chromium y auditorías de accesibilidad WCAG 2.1 AA con Axe-core.',
  },
  performance: {
    name: 'Rendimiento y Carga (k6)',
    path: 'tests/performance',
    runner: 'k6',
    command: 'k6 run tests/performance/k6_stress_test.js',
    description:
      'Pruebas de estrés y límites de latencia HTTP bajo concurrencia continua respetando presupuestos de rate limit.',
  },
  ci: {
    name: 'Paridad y Gobernanza de CI/CD',
    path: 'tests/ci',
    runner: 'node:test (tsx)',
    command: 'npm test',
    description:
      'Verificación estructural de consistencia, timeouts y parámetros de ejecución en pipelines de GitHub Actions.',
  },
  fuzz: {
    name: 'API Fuzzing y Pruebas Adversariales',
    path: 'tests/fuzz',
    runner: 'node:test (tsx)',
    command: 'npm run test:fuzz',
    description:
      'Generación caótica y mutacional de payloads HTTP, validación de boundaries y resiliencia ante inputs malformados.',
  },
  governance: {
    name: 'Gobernanza y Contratos de Plataforma (Root)',
    path: 'tests/',
    runner: 'node:test (tsx)',
    command: 'npm test',
    description: 'Contratos de tipos, gobernanza documental, reglas de protección de rama, pentesting e impacto de CI.',
  },
};
