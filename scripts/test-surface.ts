/**
 * ==============================================================================
 * scripts/test-surface.ts
 * ==============================================================================
 * Motor de descubrimiento, inventario y gobernanza de la superficie de testing.
 *
 * Funcionalidades:
 *   - Descubre recursivamente todos los artefactos en `tests/`.
 *   - Clasifica suites, tipos de runner (node:test, playwright, k6), roles y dominios.
 *   - Extrae granularmente casos de prueba individuales (`test`, `it`, `group`).
 *   - Asocia comandos npm (`package.json`) y workflows de GitHub Actions.
 *   - Calcula hashes SHA-256 para control estricto de drift e inmutabilidad.
 *   - Genera la SSOT machine-readable `docs/testing/test-surface.json`.
 *   - Genera la vista humana y navegable `docs/testing/test-surface.md`.
 *   - Valida paridad exacta sin drift con `--check`.
 *
 * Modos de ejecución:
 *   npx tsx scripts/test-surface.ts           # Diagnóstico y estado de drift
 *   npx tsx scripts/test-surface.ts --check   # Falla (exit 1) si hay drift
 *   npx tsx scripts/test-surface.ts --update  # Reconcilia y actualiza docs/testing/
 *   npx tsx scripts/test-surface.ts --json    # Salida en JSON estándar
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface TestCaseRecord {
  name: string;
  line: number;
}

export interface TestFileRecord {
  path: string;
  suite: string;
  type: string;
  role: 'TEST_FILE' | 'HELPER_OR_FIXTURE' | 'PERFORMANCE_SCRIPT';
  runner: string;
  testCount: number;
  describeCount: number;
  assertionCountEst: number;
  sizeBytes: number;
  lineCount: number;
  sha256: string;
  targetDomain: string;
  targetArtifacts: string[];
  npmCommands: string[];
  ciWorkflows: string[];
  description: string;
  status: 'ACTIVE' | 'SPECIALIZED' | 'HELPER';
  testCases: TestCaseRecord[];
}

export interface SuiteSummary {
  id: string;
  name: string;
  path: string;
  runner: string;
  command: string;
  files: number;
  testCases: number;
  description: string;
}

export interface TestSurfaceCatalog {
  schemaVersion: number;
  generatedAt: string;
  summary: {
    totalFiles: number;
    testFiles: number;
    helperFiles: number;
    performanceScripts: number;
    totalTestCases: number;
    totalLines: number;
    totalSizeBytes: number;
    suitesCount: number;
  };
  suites: SuiteSummary[];
  files: TestFileRecord[];
}

export interface DriftReport {
  hasDrift: boolean;
  newFiles: string[];
  removedFiles: string[];
  modifiedFiles: string[];
  countChangedFiles: { path: string; old: number; current: number }[];
  orphanFiles: string[];
  brokenTargetArtifacts: { testFile: string; artifact: string }[];
}

const ROOT_DIR = process.cwd();
const TESTS_DIR = path.join(ROOT_DIR, 'tests');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'testing');
const JSON_FILE = path.join(OUTPUT_DIR, 'test-surface.json');
const MD_FILE = path.join(OUTPUT_DIR, 'test-surface.md');

// Catálogo canónico de descripciones y dominios semánticos
const FILE_METADATA_CATALOG: Record<string, {
  type: string;
  targetDomain: string;
  targetArtifacts: string[];
  description: string;
}> = {
  'tests/aas_governance.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza AAS (Agentic Awesome Skills)',
    targetArtifacts: ['.agents/aas/aas-stack.json'],
    description: 'Valida contratos de gobernanza de skills y agents en aas-stack.json, stacks requeridos y catálogo de herramientas.',
  },
  'tests/api-limits.test.ts': {
    type: 'Integration',
    targetDomain: 'Backend HTTP API / Rate Limiting',
    targetArtifacts: ['apps/backend/src/middleware/rate-limiter.ts', 'apps/backend/server.ts'],
    description: 'Verifica rate limiting global y por endpoint, manejo de peticiones concurrentes y cabeceras X-RateLimit-* con código 429.',
  },
  'tests/audit_freshness.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza Documental / Auditorías Históricas',
    targetArtifacts: ['docs/audits/'],
    description: 'Comprueba la política de demarcación de auditorías históricas en docs/audits/ y asegura que no sean interpretadas como SSOT vigente.',
  },
  'tests/ci_impact.test.ts': {
    type: 'Contract / CI Matrix',
    targetDomain: 'Pipeline CI / Detección de Impacto',
    targetArtifacts: ['scripts/detect-change-impact.ts', '.agents/skills/_shared/change-impact-matrix.md'],
    description: 'Verifica la matriz de cambio y despacho condicional en CI para PRs, asegurando cobertura por tipo de archivo y modo fail-closed.',
  },
  'tests/concurrency.test.ts': {
    type: 'Integration',
    targetDomain: 'Concurrencia y Consistencia de Almacenamiento',
    targetArtifacts: ['apps/backend/src/services/db.ts'],
    description: 'Evalúa mutaciones concurrentes, aislamiento transaccional y prevención de race conditions en actualizaciones del catálogo Pokémon.',
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
    description: 'Asegura que los ADRs y especificaciones técnicas cumplan con el formato canónico, encabezados y metadatos obligatorios.',
  },
  'tests/fuzzing.test.ts': {
    type: 'Fuzz',
    targetDomain: 'Fuzz Testing / Seguridad de Payloads',
    targetArtifacts: ['apps/backend/src/routes/pokemons.ts', 'apps/backend/src/validation/schemas.ts'],
    description: 'Ejecuta fuzzing adversarial con mutaciones caóticas de JSON, delimitadores y límites de buffer en endpoints REST.',
  },
  'tests/markdown_gate.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Markdown Quality Gate',
    targetArtifacts: ['scripts/lint-markdown.ts', '.markdownlint.json'],
    description: 'Verifica el comportamiento del motor de linting de Markdown, reporte de errores MDxxx y mecanismos de auto-fix.',
  },
  'tests/pentest.test.ts': {
    type: 'Security / Pentest',
    targetDomain: 'Pruebas de Penetración de API',
    targetArtifacts: ['apps/backend/server.ts', 'apps/backend/src/routes/'],
    description: 'Ejecuta batería exhaustiva de vectores de ataque: SQLi, NoSQLi, path traversal, XSS, HTTP parameter pollution y headers de seguridad.',
  },
  'tests/pr_template_governance.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza de Pull Request Template',
    targetArtifacts: ['.github/pull_request_template.md', 'scripts/validate-pr-body.ts'],
    description: 'Valida conformidad estricta del cuerpo de PR contra el template físico oficial, impidiendo estructuras arbitrarias o mojibake.',
  },
  'tests/ruleset_contract.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza de GitHub Rulesets',
    targetArtifacts: ['.github/rulesets/main-protection.json'],
    description: 'Valida la estructura declarativa y restricciones de protección de rama del ruleset main-protection.json contra el esquema de GitHub.',
  },
  'tests/ruleset_parity.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Paridad Declarativa de Rulesets',
    targetArtifacts: ['.github/rulesets/main-protection.json', 'scripts/check-ruleset-parity.ts'],
    description: 'Verifica la paridad e identifica drift entre el ruleset declarativo local y las reglas activas en la API remota de GitHub.',
  },
  'tests/security.test.ts': {
    type: 'Security / Application',
    targetDomain: 'Seguridad Integral de Aplicación y Headers',
    targetArtifacts: ['apps/backend/server.ts', 'apps/backend/src/middleware/'],
    description: 'Valida cabeceras Helmet (HSTS, CSP, X-Frame-Options), CORS restrictivo, prevención de fuga de información y manejo seguro de errores.',
  },
  'tests/storage.test.ts': {
    type: 'Integration',
    targetDomain: 'Capa de Persistencia y Caché',
    targetArtifacts: ['apps/backend/src/services/db.ts', 'apps/backend/src/services/cache.ts'],
    description: 'Valida operaciones CRUD del repositorio, serialización y resiliencia de la capa de datos.',
  },
  'tests/version_consistency.test.ts': {
    type: 'Contract / Release',
    targetDomain: 'Consistencia de Versiones SemVer',
    targetArtifacts: ['package.json', 'apps/backend/package.json', 'apps/frontend/package.json', 'infra/helm/pokedex/Chart.yaml'],
    description: 'Asegura paridad estricta de versiones SemVer en todo el monorepo (root, workspaces de apps y chart Helm).',
  },
  'tests/version.test.ts': {
    type: 'Integration',
    targetDomain: 'Endpoint de Telemetría /version',
    targetArtifacts: ['apps/backend/server.ts'],
    description: 'Valida que el endpoint /version retorne deterministamente metadatos de build, commit SHA, entorno y uptime.',
  },
  'tests/ci/workflow_run_parity.test.ts': {
    type: 'Contract / CI',
    targetDomain: 'Paridad Estructural de Workflows de CI',
    targetArtifacts: ['.github/workflows/*.yaml'],
    description: 'Verifica la consistencia estructural de steps, versiones de acciones, timeouts y flags de Node en todos los workflows de CI.',
  },
  'tests/e2e/backoffice.spec.ts': {
    type: 'E2E',
    targetDomain: 'E2E Backoffice Administrativo',
    targetArtifacts: ['apps/frontend/src/backoffice.ts', 'apps/frontend/backoffice.html'],
    description: 'Flujos completos de administración en navegador: login con token, CRUD de Pokémon, paginación y modal de confirmación.',
  },
  'tests/e2e/pokedex.spec.ts': {
    type: 'E2E / a11y',
    targetDomain: 'E2E Aplicación Pública y Accesibilidad WCAG',
    targetArtifacts: ['apps/frontend/src/pokedex.ts', 'apps/frontend/index.html'],
    description: 'Flujos de usuario en navegador: carga de catálogo, filtro con debounce, conmutador de tema oscuro y auditoría Axe-core WCAG 2.1 AA.',
  },
  'tests/frontend/backoffice_controller.test.ts': {
    type: 'Component / Unit',
    targetDomain: 'Controlador DOM de Backoffice',
    targetArtifacts: ['apps/frontend/src/backoffice.ts'],
    description: 'Valida eventos de DOM, renderizado de tablas, modales interactivos y toasts en el backoffice usando entorno JSDOM.',
  },
  'tests/frontend/backoffice_env.ts': {
    type: 'Helper / Environment',
    targetDomain: 'Entorno de Pruebas Frontend JSDOM',
    targetArtifacts: ['apps/frontend/src/backoffice.ts'],
    description: 'Módulo de arranque de navegador simulado con JSDOM para ejecución determinista y cobertura estática V8 en pruebas frontend.',
  },
  'tests/frontend/modal_components.test.ts': {
    type: 'Component / Unit',
    targetDomain: 'Componentes Modales y Accesibilidad',
    targetArtifacts: ['apps/frontend/src/components/modal-detail.ts', 'apps/frontend/src/components/modal-crud.ts'],
    description: 'Valida el ciclo de vida de modales accesibles, trampa de foco para teclado (Tab/Shift+Tab), tecla Escape y cierre por backdrop.',
  },
  'tests/gitops/argocd_pinning.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'GitOps / Inmutabilidad de Despliegues',
    targetArtifacts: ['gitops/values-*.yaml', 'scripts/verify-image-digest-parity.ts'],
    description: 'Valida pinning estricto por digest SHA-256 en manifiestos de ArgoCD y prohíbe tags mutables (:latest) en dev, preprod y prod.',
  },
  'tests/performance/k6_stress_test.js': {
    type: 'Load / Stress',
    targetDomain: 'Rendimiento y Capacidad bajo Carga',
    targetArtifacts: ['apps/backend/server.ts', 'apps/backend/src/middleware/rate-limiter.ts'],
    description: 'Prueba de carga k6 que valida umbrales p95/p99 de latencia, tasa de error y respeto de rate limits sin generar 429 espurios.',
  },
  'tests/security/adr_compliance_contracts.test.ts': {
    type: 'Contract / Architecture',
    targetDomain: 'Conformidad con ADRs de Arquitectura',
    targetArtifacts: ['docs/decisions/'],
    description: 'Comprueba el cumplimiento de decisiones de arquitectura registradas en ADR-001 a ADR-015 (topología, RBAC, ingress y secrets).',
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
    description: 'Valida cifrado AES-256-GCM en reposo de snapshots de base de datos, permisos de archivos y aislamiento de claves.',
  },
  'tests/security/dr_e2e_drill.test.ts': {
    type: 'Security / DR',
    targetDomain: 'Simulacro de Recuperación ante Desastres (DR)',
    targetArtifacts: ['scripts/dr-drill.ts'],
    description: 'Evalúa la ejecución completa del simulacro de desastre automatizado, restauración limpia y verificación de RTO/RPO.',
  },
  'tests/security/egress_anti_ssrf.test.ts': {
    type: 'Security / Network',
    targetDomain: 'Control de Egress y Prevención SSRF',
    targetArtifacts: ['infra/helm/pokedex/templates/cilium-network-policies.yaml', 'scripts/probe-egress-security.ts'],
    description: 'Valida Network Policies Cilium L7 eBPF, bloqueo de rangos privados (RFC 1918, link-local, cloud metadata) y allowlist estricta.',
  },
  'tests/security/ghcr_retention.test.ts': {
    type: 'Contract / OCI',
    targetDomain: 'Retención y Ciclo de Vida en GHCR',
    targetArtifacts: ['scripts/ghcr-retention.ts', '.github/workflows/ghcr-retention.yaml'],
    description: 'Verifica la política de retención de imágenes OCI en GHCR, preservación de releases semver y limpieza de imágenes huérfanas.',
  },
  'tests/security/github_security_linear_sync.test.ts': {
    type: 'Contract / SecOps',
    targetDomain: 'Sincronización de Seguridad GitHub-Linear',
    targetArtifacts: ['scripts/github-security-linear-sync.ts', '.github/workflows/github-security-linear-sync.yaml'],
    description: 'Valida sincronización bidireccional idempotente de vulnerabilidades y alertas de seguridad hacia issues de Linear.',
  },
  'tests/security/gitops_image_parity.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'Paridad de Imágenes en GitOps',
    targetArtifacts: ['scripts/verify-image-digest-parity.ts', 'gitops/'],
    description: 'Comprueba el script de verificación de paridad de imagen asegurando inmutabilidad entre entornos dev, preprod y prod.',
  },
  'tests/security/grafana_portability.test.ts': {
    type: 'Contract / Observability',
    targetDomain: 'Portabilidad de Dashboards Grafana',
    targetArtifacts: ['infra/monitoring/dashboards/'],
    description: 'Valida esquemas JSON declarativos de dashboards Grafana, portabilidad de datasources y ausencia de UIDs fijos.',
  },
  'tests/security/iac_baseline_security.test.ts': {
    type: 'Security / IaC',
    targetDomain: 'Hardening de Infraestructura como Código (IaC)',
    targetArtifacts: ['infra/k8s/', 'infra/helm/pokedex/'],
    description: 'Suite integral de seguridad IaC: valida que ningún manifiesto K8s o chart viole políticas CIS, contraseñas hardcodeadas o permisos.',
  },
  'tests/security/ignore_hygiene.test.ts': {
    type: 'Contract / Hygiene',
    targetDomain: 'Higiene de Archivos de Exclusión (.gitignore)',
    targetArtifacts: ['scripts/check-ignore-hygiene.ts', '.gitignore', '.dockerignore'],
    description: 'Valida el linter de higiene de archivos .ignore, previniendo exclusión indebida, duplicados o fuga de secretos.',
  },
  'tests/security/k8s_workload_hardening.test.ts': {
    type: 'Security / Kubernetes',
    targetDomain: 'Hardening de Workloads Kubernetes',
    targetArtifacts: ['infra/k8s/', 'infra/helm/pokedex/templates/'],
    description: 'Verifica SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp), límites de recursos y probes de salud.',
  },
  'tests/security/network_policies_security.test.ts': {
    type: 'Security / Network',
    targetDomain: 'Aislamiento de Red Zero-Trust',
    targetArtifacts: ['infra/helm/pokedex/templates/network-policies.yaml', 'infra/helm/pokedex/templates/cilium-network-policies.yaml'],
    description: 'Verifica aislamiento estricto entre pods de frontend, backend, Redis y PostgreSQL impidiendo accesos laterales no autorizados.',
  },
  'tests/security/operation_dr_benchmarks.test.ts': {
    type: 'Security / DR Benchmarks',
    targetDomain: 'Benchmarks de Recuperación ante Desastres',
    targetArtifacts: ['scripts/dr-drill.ts'],
    description: 'Valida umbrales cuantitativos de tiempo de backup, compresión y consistencia de restauración contra SLAs operacionales.',
  },
  'tests/security/promote_auto_approve_contracts.test.ts': {
    type: 'Contract / CI-CD',
    targetDomain: 'Promoción Automatizada Segura',
    targetArtifacts: ['.github/workflows/promote-auto-approve.yaml'],
    description: 'Valida políticas de auto-aprobación de PRs de dependencias patch/minor con suites de seguridad obligatorias.',
  },
  'tests/security/supply_chain_security.test.ts': {
    type: 'Security / Supply Chain',
    targetDomain: 'Seguridad de Cadena de Suministro y SBOM',
    targetArtifacts: ['package.json', 'package-lock.json', '.github/workflows/ci.yaml'],
    description: 'Comprueba inmutabilidad de dependencias, bloqueo de scripts arbitrarios en npm ci, SBOM y firma de imágenes.',
  },
  'tests/security/vault_redeploy_contract.test.ts': {
    type: 'Security / Secrets',
    targetDomain: 'Gestión y Rotación de Secretos (Vault)',
    targetArtifacts: ['scripts/k8s-rollout-restart.ts'],
    description: 'Valida el reinicio controlado de workloads y el refresco de secretos inyectados tras rotaciones en HashiCorp Vault.',
  },
  'tests/security/yaml_extension_governance.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza de Extensiones YAML',
    targetArtifacts: ['scripts/check-yaml-extension.ts'],
    description: 'Verifica cumplimiento estricto del uso exclusivo de la extensión .yaml (prohibiendo .yml) en todo el repositorio.',
  },
  'tests/unit/auth_service.test.ts': {
    type: 'Unit',
    targetDomain: 'Servicio de Autenticación y Sesiones',
    targetArtifacts: ['apps/backend/src/services/auth.ts'],
    description: 'Valida ciclo de vida de tokens HMAC-SHA256, expiración, verificación de firma, revocación en memoria y fail-closed de secretos.',
  },
  'tests/unit/cache_service.test.ts': {
    type: 'Unit',
    targetDomain: 'Servicio de Caché y Fallback',
    targetArtifacts: ['apps/backend/src/services/cache.ts'],
    description: 'Valida almacenamiento en caché Redis con fallback transparente a memoria local, TTL y resiliencia ante cortes de red.',
  },
  'tests/unit/pokemon_repository.test.ts': {
    type: 'Unit',
    targetDomain: 'Repositorio de Datos Pokémon',
    targetArtifacts: ['apps/backend/src/services/pokemon.repository.ts'],
    description: 'Valida operaciones de consulta, filtrado por tipo, búsqueda por nombre, paginación y transformaciones de atributos.',
  },
  'tests/unit/postgres_fail_closed.test.ts': {
    type: 'Unit',
    targetDomain: 'Resiliencia de Conexión a Base de Datos',
    targetArtifacts: ['apps/backend/src/services/postgres.ts', 'apps/backend/server.ts'],
    description: 'Verifica comportamiento fail-closed ante indisponibilidad de PostgreSQL, reintentos con backoff y aislamiento de errores.',
  },
};

// Definición canónica de suites del repositorio
const SUITES_DEFINITION: Record<string, {
  name: string;
  path: string;
  runner: string;
  command: string;
  description: string;
}> = {
  unit: {
    name: 'Pruebas Unitarias de Aplicación',
    path: 'tests/unit',
    runner: 'node:test (tsx)',
    command: 'npm run test:unit',
    description: 'Pruebas de alta velocidad y aislamiento sobre servicios de dominio, autenticación, caché y repositorios.',
  },
  security: {
    name: 'Seguridad, Hardening y DevSecOps',
    path: 'tests/security',
    runner: 'node:test (tsx)',
    command: 'npm run test:security',
    description: 'Evaluación de políticas de admisión, Network Policies Cilium L7, cifrado DR, secretos Vault y contratos IaC.',
  },
  gitops: {
    name: 'Contratos de GitOps y Despliegue',
    path: 'tests/gitops',
    runner: 'node:test (tsx)',
    command: 'npm run test:gitops',
    description: 'Inmutabilidad de imágenes por digest SHA-256 en ArgoCD y paridad estricta entre entornos dev/preprod/prod.',
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
    description: 'Simulación completa de flujos de usuario en Chromium y auditorías de accesibilidad WCAG 2.1 AA con Axe-core.',
  },
  performance: {
    name: 'Rendimiento y Carga (k6)',
    path: 'tests/performance',
    runner: 'k6',
    command: 'k6 run tests/performance/k6_stress_test.js',
    description: 'Pruebas de estrés y límites de latencia HTTP bajo concurrencia continua respetando presupuestos de rate limit.',
  },
  ci: {
    name: 'Paridad y Gobernanza de CI/CD',
    path: 'tests/ci',
    runner: 'node:test (tsx)',
    command: 'npm test',
    description: 'Verificación estructural de consistencia, timeouts y parámetros de ejecución en pipelines de GitHub Actions.',
  },
  fuzz: {
    name: 'API Fuzzing y Pruebas Adversariales',
    path: 'tests/fuzzing.test.ts',
    runner: 'node:test (tsx)',
    command: 'npm run test:fuzz',
    description: 'Generación caótica y mutacional de payloads HTTP, validación de boundaries y resiliencia ante inputs malformados.',
  },
  governance: {
    name: 'Gobernanza y Contratos de Plataforma (Root)',
    path: 'tests/',
    runner: 'node:test (tsx)',
    command: 'npm test',
    description: 'Contratos de tipos, gobernanza documental, reglas de protección de rama, pentesting e impacto de CI.',
  },
};

function getFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function parseTestFile(fullPath: string): TestFileRecord {
  const relativePath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
  const content = fs.readFileSync(fullPath, 'utf8');
  // Normalizar CRLF -> LF para cálculo determinista e idéntico de SHA-256 en Windows y Linux (CI)
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');
  const sizeBytes = Buffer.byteLength(normalizedContent, 'utf8');
  const lineCount = lines.length;
  const sha256 = crypto.createHash('sha256').update(normalizedContent, 'utf8').digest('hex');

  let suite = 'governance';
  const parts = relativePath.split('/');
  if (parts.length > 2) {
    suite = parts[1];
  } else if (relativePath.includes('fuzzing')) {
    suite = 'fuzz';
  }

  let role: 'TEST_FILE' | 'HELPER_OR_FIXTURE' | 'PERFORMANCE_SCRIPT' = 'TEST_FILE';
  let runner = 'node:test (tsx)';
  let status: 'ACTIVE' | 'SPECIALIZED' | 'HELPER' = 'ACTIVE';

  if (relativePath.endsWith('.js') && relativePath.includes('performance')) {
    role = 'PERFORMANCE_SCRIPT';
    runner = 'k6';
    status = 'SPECIALIZED';
  } else if (!relativePath.endsWith('.test.ts') && !relativePath.endsWith('.spec.ts')) {
    role = 'HELPER_OR_FIXTURE';
    runner = 'none';
    status = 'HELPER';
  } else if (relativePath.endsWith('.spec.ts') || content.includes('@playwright/test')) {
    runner = 'playwright';
    status = 'SPECIALIZED';
  } else if (relativePath.includes('fuzzing')) {
    status = 'SPECIALIZED';
  }

  const testCases: TestCaseRecord[] = [];
  let describeCount = 0;
  let assertionCountEst = 0;

  if (role === 'TEST_FILE') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(?:describe|test\.describe)\s*\(\s*(['"`])(.*?)\1/.test(line)) {
        describeCount++;
      }
      const testMatch = line.match(/^\s*(?:test|it)\s*\(\s*(['"`])(.*?)\1/);
      if (testMatch) {
        testCases.push({
          name: testMatch[2].trim(),
          line: i + 1,
        });
      }
      // Contar aserciones estimadas
      if (line.includes('assert.') || line.includes('expect(')) {
        assertionCountEst++;
      }
    }
  } else if (role === 'PERFORMANCE_SCRIPT') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const groupMatch = line.match(/group\s*\(\s*(['"`])(.*?)\1/);
      if (groupMatch) {
        testCases.push({
          name: `group: ${groupMatch[2].trim()}`,
          line: i + 1,
        });
      }
      if (line.includes('check(') || line.includes('Trend(') || line.includes('Rate(')) {
        assertionCountEst++;
      }
    }
  }

  // Comandos npm asociados
  const npmCommands: string[] = [];
  if (role === 'TEST_FILE') {
    if (relativePath === 'tests/fuzzing.test.ts') {
      npmCommands.push('npm run test:fuzz', 'npm run test:all');
    } else if (runner === 'playwright') {
      npmCommands.push('npm run test:e2e');
      if (content.includes('@a11y')) {
        npmCommands.push('npm run test:a11y');
      }
    } else {
      npmCommands.push('npm test', 'npm run test:all', 'npm run test:coverage');
      if (relativePath.startsWith('tests/unit/')) {
        npmCommands.push('npm run test:unit');
      }
      if (relativePath.startsWith('tests/security/') || relativePath === 'tests/security.test.ts' || relativePath === 'tests/pentest.test.ts') {
        npmCommands.push('npm run test:security');
        if (relativePath === 'tests/security/egress_anti_ssrf.test.ts') {
          npmCommands.push('npm run test:security:egress');
        }
      }
      if (relativePath.startsWith('tests/gitops/')) {
        npmCommands.push('npm run test:gitops');
      }
    }
  } else if (role === 'PERFORMANCE_SCRIPT') {
    npmCommands.push('k6 run tests/performance/k6_stress_test.js');
  }

  // Workflows de CI asociados
  const ciWorkflows: string[] = [];
  if (npmCommands.some((c) => c.includes('npm test') || c.includes('test:all'))) {
    ciWorkflows.push('.github/workflows/ci.yaml (code-quality, sonarcloud)');
  }
  if (npmCommands.some((c) => c.includes('test:fuzz'))) {
    ciWorkflows.push('.github/workflows/ci.yaml (code-quality)');
  }
  if (runner === 'playwright') {
    ciWorkflows.push('.github/workflows/web.yaml (e2e)');
  }
  if (relativePath.includes('k6_stress_test')) {
    ciWorkflows.push('.github/workflows/performance-k6.yaml (k6-load-test)');
  }
  if (relativePath === 'tests/aas_governance.test.ts') {
    ciWorkflows.push('.github/workflows/ci.yaml (aas-governance)');
  }
  if (relativePath === 'tests/ruleset_parity.test.ts') {
    ciWorkflows.push('.github/workflows/governance-ruleset-parity.yaml');
  }

  const meta = FILE_METADATA_CATALOG[relativePath] || {
    type: role === 'TEST_FILE' ? 'Automated Test' : 'Helper',
    targetDomain: `Suite ${suite}`,
    targetArtifacts: [],
    description: `Suite de pruebas ${suite}: ${path.basename(relativePath)}.`,
  };

  return {
    path: relativePath,
    suite,
    type: meta.type,
    role,
    runner,
    testCount: testCases.length,
    describeCount,
    assertionCountEst,
    sizeBytes,
    lineCount,
    sha256,
    targetDomain: meta.targetDomain,
    targetArtifacts: meta.targetArtifacts,
    npmCommands,
    ciWorkflows,
    description: meta.description,
    status,
    testCases,
  };
}

export function buildCatalog(): TestSurfaceCatalog {
  const allFiles = getFilesRecursively(TESTS_DIR).sort((a, b) => a.localeCompare(b));
  const fileRecords = allFiles.map(parseTestFile);

  const suiteMap = new Map<string, { files: number; testCases: number }>();
  for (const f of fileRecords) {
    const cur = suiteMap.get(f.suite) || { files: 0, testCases: 0 };
    cur.files++;
    cur.testCases += f.testCount;
    suiteMap.set(f.suite, cur);
  }

  const suites: SuiteSummary[] = Object.entries(SUITES_DEFINITION).map(([id, def]) => {
    const stats = suiteMap.get(id) || { files: 0, testCases: 0 };
    return {
      id,
      name: def.name,
      path: def.path,
      runner: def.runner,
      command: def.command,
      files: stats.files,
      testCases: stats.testCases,
      description: def.description,
    };
  });

  const totalTestCases = fileRecords.reduce((acc, f) => acc + f.testCount, 0);
  const totalLines = fileRecords.reduce((acc, f) => acc + f.lineCount, 0);
  const totalSizeBytes = fileRecords.reduce((acc, f) => acc + f.sizeBytes, 0);
  const testFiles = fileRecords.filter((f) => f.role === 'TEST_FILE').length;
  const helperFiles = fileRecords.filter((f) => f.role === 'HELPER_OR_FIXTURE').length;
  const performanceScripts = fileRecords.filter((f) => f.role === 'PERFORMANCE_SCRIPT').length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: fileRecords.length,
      testFiles,
      helperFiles,
      performanceScripts,
      totalTestCases,
      totalLines,
      totalSizeBytes,
      suitesCount: suites.length,
    },
    suites,
    files: fileRecords,
  };
}

export function generateMarkdownReport(catalog: TestSurfaceCatalog): string {
  const lines: string[] = [];

  lines.push('# Inventario y Gobernanza de Superficie de Testing');
  lines.push('');
  lines.push('> Documento generado automáticamente por `scripts/test-surface.ts`.');
  lines.push('> Fuente Única de Verdad machine-readable: [`test-surface.json`](test-surface.json).');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Resumen Ejecutivo de la Superficie');
  lines.push('');
  lines.push('Este catálogo proporciona el inventario exhaustivo, auditable y granular de toda la superficie de pruebas en `rocapellino/pokedex`. Cada archivo y caso de prueba está tipificado, vinculado a sus artefactos bajo prueba, runner de ejecución y canal de CI/CD.');
  lines.push('');
  lines.push('| Métrica | Valor Registrado |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Total de Archivos en ` + '`tests/`' + `** | **${catalog.summary.totalFiles}** |`);
  lines.push(`| **Archivos de Test Automatizados** | ${catalog.summary.testFiles} |`);
  lines.push(`| **Scripts de Carga / Rendimiento (k6)** | ${catalog.summary.performanceScripts} |`);
  lines.push(`| **Archivos de Soporte / Entorno (Fixtures)** | ${catalog.summary.helperFiles} |`);
  lines.push(`| **Total de Casos de Prueba Identificados** | **${catalog.summary.totalTestCases}** |`);
  lines.push(`| **Líneas de Código de Pruebas** | ${catalog.summary.totalLines.toLocaleString('es-ES')} |`);
  lines.push(`| **Tamaño Total de la Suite** | ${(catalog.summary.totalSizeBytes / 1024).toFixed(1)} KB |`);
  lines.push(`| **Suites Especializadas Gobernadas** | ${catalog.summary.suitesCount} |`);
  lines.push(`| **Última Sincronización** | ${catalog.generatedAt} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. Matriz Canónica de Suites de Testing');
  lines.push('');
  lines.push('| Suite | Nombre | Runner | Comando Principal | Archivos | Casos | Propósito |');
  lines.push('| :--- | :--- | :--- | :--- | :---: | :---: | :--- |');

  for (const s of catalog.suites) {
    lines.push(`| **\`${s.id}\`** | ${s.name} | \`${s.runner}\` | \`${s.command}\` | ${s.files} | ${s.testCases} | ${s.description} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. Catálogo de Archivos de Prueba');
  lines.push('');
  lines.push('A continuación se inventarían todos los archivos que componen la superficie de pruebas, indicando su suite, tipo, runner, casos que contiene y artefactos objetivo.');
  lines.push('');
  lines.push('| Archivo | Suite | Tipo | Runner | Casos | Líneas | Dominio / Qué Verifica | Comandos |');
  lines.push('| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |');

  for (const f of catalog.files) {
    const cmdList = f.npmCommands.length > 0 ? f.npmCommands.map((c) => `\`${c}\``).join(', ') : '*(Helper)*';
    lines.push(`| [\`${f.path}\`](../../${f.path}) | \`${f.suite}\` | ${f.type} | \`${f.runner}\` | **${f.testCount}** | ${f.lineCount} | ${f.description} | ${cmdList} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 4. Desglose Estructurado por Suite de Pruebas');
  lines.push('');
  lines.push('Para facilitar la inspección humana de la cobertura, las pruebas se agrupan por suite especializada. El catálogo completo y granular con el detalle de cada aserción individual se preserva en [`test-surface.json`](test-surface.json).');
  lines.push('');

  // Agrupar archivos por suite
  const suiteGrouped = new Map<string, TestFileRecord[]>();
  for (const f of catalog.files) {
    const list = suiteGrouped.get(f.suite) || [];
    list.push(f);
    suiteGrouped.set(f.suite, list);
  }

  for (const s of catalog.suites) {
    const files = suiteGrouped.get(s.id) || [];
    if (files.length === 0) continue;

    lines.push(`### Suite: ${s.name} (\`${s.id}\`)`);
    lines.push('');
    lines.push(`- **Runner:** \`${s.runner}\` | **Comando:** \`${s.command}\` | **Total Casos:** ${s.testCases}`);
    lines.push(`- **Propósito:** ${s.description}`);
    lines.push('');
    lines.push('| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |');
    lines.push('| :--- | :---: | :---: | :--- | :--- |');

    for (const f of files) {
      const artifacts = f.targetArtifacts.length > 0 ? f.targetArtifacts.map((a) => `\`${a}\``).join(', ') : '*(General)*';
      lines.push(`| [\`${f.path}\`](../../${f.path}) | **${f.testCount}** | ${f.lineCount} | ${f.description} | ${artifacts} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## 5. Gobernanza y Detección de Drift');
  lines.push('');
  lines.push('Este inventario no es estático ni manual. Se rige por el protocolo de gobernanza automatizado de `repo-testing`:');
  lines.push('');
  lines.push('1. **Código como Fuente de Verdad:** Si se agrega, renombra o elimina un test, el inventario debe reconciliarse mediante `npm run test:surface:update`.');
  lines.push('2. **Quality Gate en CI:** El comando `npm run test:surface:check` valida que no exista drift entre los archivos de prueba en disco y los catálogos `test-surface.json` y `test-surface.md`.');
  lines.push('3. **Taxonomía de Cambios:**');
  lines.push('   - `NEW_TEST_FILE`: Archivo de test no registrado.');
  lines.push('   - `REMOVED_TEST_FILE`: Archivo eliminado del repositorio que aún figura en el catálogo.');
  lines.push('   - `COUNT_CHANGED`: Variación en la cantidad de pruebas de un archivo existente.');
  lines.push('   - `MODIFIED`: Cambio en el hash SHA-256 del archivo que requiere reconciliación de metadatos.');
  lines.push('   - `ORPHAN`: Test en disco no cubierto por ningún script ni workflow.');
  lines.push('');
  lines.push('```bash');
  lines.push('# Comandos de gestión de la superficie');
  lines.push('npm run test:surface         # Inspeccionar superficie y drift');
  lines.push('npm run test:surface:check   # Validar paridad estricta (CI)');
  lines.push('npm run test:surface:update  # Reconciliar catálogo automáticamente');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

export function checkDrift(currentCatalog: TestSurfaceCatalog): DriftReport {
  if (!fs.existsSync(JSON_FILE)) {
    return {
      hasDrift: true,
      newFiles: currentCatalog.files.map((f) => f.path),
      removedFiles: [],
      modifiedFiles: [],
      countChangedFiles: [],
      orphanFiles: [],
      brokenTargetArtifacts: [],
    };
  }

  const existingRaw = fs.readFileSync(JSON_FILE, 'utf8');
  let existingCatalog: TestSurfaceCatalog;
  try {
    existingCatalog = JSON.parse(existingRaw);
  } catch {
    return {
      hasDrift: true,
      newFiles: currentCatalog.files.map((f) => f.path),
      removedFiles: [],
      modifiedFiles: [],
      countChangedFiles: [],
      orphanFiles: [],
      brokenTargetArtifacts: [],
    };
  }

  const existingMap = new Map<string, TestFileRecord>();
  for (const f of existingCatalog.files) {
    existingMap.set(f.path, f);
  }

  const currentMap = new Map<string, TestFileRecord>();
  for (const f of currentCatalog.files) {
    currentMap.set(f.path, f);
  }

  const newFiles: string[] = [];
  const removedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const countChangedFiles: { path: string; old: number; current: number }[] = [];
  const orphanFiles: string[] = [];
  const brokenTargetArtifacts: { testFile: string; artifact: string }[] = [];

  for (const [p, cur] of currentMap.entries()) {
    const old = existingMap.get(p);
    if (!old) {
      newFiles.push(p);
    } else {
      if (old.sha256 !== cur.sha256) {
        modifiedFiles.push(p);
      }
      if (old.testCount !== cur.testCount) {
        countChangedFiles.push({ path: p, old: old.testCount, current: cur.testCount });
      }
    }
    if (cur.role === 'TEST_FILE' && cur.npmCommands.length === 0) {
      orphanFiles.push(p);
    }

    // Validación preventiva de artefactos destino rotos
    for (const art of cur.targetArtifacts) {
      if (art.includes('*')) continue;
      const fullPath = path.resolve(ROOT_DIR, art);
      if (!fs.existsSync(fullPath)) {
        brokenTargetArtifacts.push({ testFile: p, artifact: art });
      }
    }
  }

  for (const p of existingMap.keys()) {
    if (!currentMap.has(p)) {
      removedFiles.push(p);
    }
  }

  const hasDrift =
    newFiles.length > 0 ||
    removedFiles.length > 0 ||
    countChangedFiles.length > 0 ||
    modifiedFiles.length > 0 ||
    brokenTargetArtifacts.length > 0 ||
    !fs.existsSync(MD_FILE);

  return {
    hasDrift,
    newFiles,
    removedFiles,
    modifiedFiles,
    countChangedFiles,
    orphanFiles,
    brokenTargetArtifacts,
  };
}

export function writeCatalog(catalog: TestSurfaceCatalog): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(JSON_FILE, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  const mdContent = generateMarkdownReport(catalog);
  fs.writeFileSync(MD_FILE, mdContent, 'utf8');
}

// ==============================================================================
// CLI Execution
// ==============================================================================
function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isUpdate = args.includes('--update');
  const isJson = args.includes('--json');

  const catalog = buildCatalog();
  const drift = checkDrift(catalog);

  if (isJson) {
    console.log(JSON.stringify({ catalog, drift }, null, 2));
    if (isCheck && drift.hasDrift) {
      process.exit(1);
    }
    return;
  }

  console.log('🧪 Pokedex Test Surface Governance');
  console.log('===================================');
  console.log(`Archivos totales en tests/: ${catalog.summary.totalFiles}`);
  console.log(`Archivos de test activos:  ${catalog.summary.testFiles}`);
  console.log(`Scripts de carga (k6):      ${catalog.summary.performanceScripts}`);
  console.log(`Fixtures / Entorno:        ${catalog.summary.helperFiles}`);
  console.log(`Total casos de prueba:     ${catalog.summary.totalTestCases}`);
  console.log(`Total líneas de testing:   ${catalog.summary.totalLines.toLocaleString('es-ES')}`);
  console.log(`Tamaño total suite:        ${(catalog.summary.totalSizeBytes / 1024).toFixed(1)} KB`);
  console.log('-----------------------------------');

  if (isUpdate) {
    writeCatalog(catalog);
    console.log('✅ Catálogos generados con éxito:');
    console.log(`   - Machine-readable: docs/testing/test-surface.json`);
    console.log(`   - Vista humana:     docs/testing/test-surface.md`);
    return;
  }

  if (drift.hasDrift) {
    console.log('⚠️ DRIFT DETECTADO EN LA SUPERFICIE DE TESTING:');
    if (drift.newFiles.length > 0) {
      console.log(`  ➕ Archivos nuevos (${drift.newFiles.length}):`);
      for (const f of drift.newFiles) console.log(`     - ${f}`);
    }
    if (drift.removedFiles.length > 0) {
      console.log(`  ➖ Archivos eliminados (${drift.removedFiles.length}):`);
      for (const f of drift.removedFiles) console.log(`     - ${f}`);
    }
    if (drift.countChangedFiles.length > 0) {
      console.log(`  🔢 Cambio en cantidad de tests (${drift.countChangedFiles.length}):`);
      for (const c of drift.countChangedFiles) console.log(`     - ${c.path}: ${c.old} -> ${c.current} tests`);
    }
    if (drift.modifiedFiles.length > 0) {
      console.log(`  📝 Archivos con contenido modificado (${drift.modifiedFiles.length}):`);
      for (const f of drift.modifiedFiles) console.log(`     - ${f}`);
    }
    if (drift.brokenTargetArtifacts.length > 0) {
      console.log(`  🔗 Referencias a artefactos inexistentes/rotos (${drift.brokenTargetArtifacts.length}):`);
      for (const b of drift.brokenTargetArtifacts) console.log(`     - [${b.testFile}] -> ${b.artifact}`);
    }
    if (!fs.existsSync(JSON_FILE) || !fs.existsSync(MD_FILE)) {
      console.log('  📄 Catálogos en docs/testing/ ausentes o incompletos.');
    }
    console.log('\n💡 Para reconciliar la documentación ejecute:');
    console.log('   npm run test:surface:update');

    if (isCheck) {
      console.error('\n❌ Falla de Quality Gate: la superficie de pruebas no está sincronizada.');
      process.exit(1);
    }
  } else {
    console.log('✅ Superficie de testing perfectamente sincronizada sin drift.');
    console.log('   docs/testing/test-surface.json y test-surface.md están al día.');
  }

  if (drift.orphanFiles.length > 0) {
    console.log('\n⚠️ ALERTA: Tests potencialmente huérfanos sin comandos registrados:');
    for (const f of drift.orphanFiles) {
      console.log(`   - ${f}`);
    }
  }
}

if (process.argv[1] && (process.argv[1].endsWith('test-surface.ts') || process.argv[1].endsWith('test-surface.js'))) {
  main();
}
