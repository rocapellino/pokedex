/**
 * Metadata del catálogo de superficie de testing: CI, GitOps, contratos de plataforma, e2e y helpers.
 */

import type { FileMetadata } from './metadata.js';

export const PLATFORM_FILE_METADATA: Record<string, FileMetadata> = {
  'tests/ci_workflow_governance.test.ts': {
    type: 'Contract / CI',
    targetDomain: 'Topología de CI / Workflows',
    targetArtifacts: ['.github/workflows/ci.yaml', '.github/workflows/change-impact.yaml', '.github/ci-impact.yaml'],
    description:
      'Verifica sobre los workflows parseados la topología de CI (reusables sin concurrency ni pull_request, serialización por PR, Quality Gate fail-closed que depende de todos los jobs y coincide con el ruleset), permisos mínimos, secretos permitidos, SHA pineados y los gates de Sonar, Gitleaks, Trivy, Zizmor y docs.',
  },
  'tests/node_strip_types_entrypoints.test.ts': {
    type: 'Contract / CI',
    targetDomain: 'Scripts ejecutados con node --experimental-strip-types',
    targetArtifacts: [
      'package.json',
      '.github/workflows/ci.yaml',
      'scripts/verify-image-digest-parity.ts',
      'scripts/lib/helm.ts',
    ],
    description:
      'Verifica que los scripts que CI y package.json ejecutan con node --experimental-strip-types importen sus dependencias con extensión .ts y que los módulos compartidos se carguen realmente con Node sin tsx.',
  },
  'tests/ci/lighthouse.test.ts': {
    type: 'Contract / CI',
    targetDomain: 'Lighthouse / Pila de Medición',
    targetArtifacts: ['scripts/lighthouse-stack.ts', 'scripts/lighthouse-summary.ts', 'lighthouserc.json'],
    description:
      'Verifica la API simulada de Lighthouse (paginación como el backend, X-Total-Count, imágenes locales) y la carga de extremo a extremo del catálogo.',
  },
  'tests/e2e/fixtures.ts': {
    type: 'Helper',
    targetDomain: 'Playwright / IP por Proyecto',
    targetArtifacts: ['apps/backend/src/middleware/rate-limiter.ts'],
    description:
      'Fixture de Playwright que identifica a cada proyecto con una IP de documentación distinta (X-Forwarded-For) para no agotar el límite de 300 peticiones por minuto del backend.',
  },
  'tests/gitops/environment_http_contract.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'GitOps / Contrato HTTP por Entorno',
    targetArtifacts: ['gitops/apps/', 'gitops/environments/', 'infra/helm/pokedex/templates/ingress.yaml'],
    description:
      'Comprueba por entorno activo que los orígenes CORS no sean de ejemplo y coincidan con el ingress, que se sirva por TLS con cookie Secure y que el certificado tenga fuente declarada.',
  },
  'tests/gitops/gitops_adr_contracts.test.ts': {
    type: 'Contract / Architecture',
    targetDomain: 'GitOps / ADR-003 y ADR-005',
    targetArtifacts: ['docs/decisions/', 'infra/helm/pokedex/values.yaml'],
    description:
      'Comprueba ADR-003 (Sync Waves, hooks de siembra, health checks, App-of-Apps) y ADR-005 (Stakater Reloader, refreshInterval acotado, auditoría).',
  },
  'tests/gitops/gitops_architecture.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'GitOps / Árbol y Entornos',
    targetArtifacts: ['gitops/', 'docs/architecture/'],
    description:
      'Comprueba sobre los manifiestos de ArgoCD, los values y los comandos del workflow parseados que cada entorno activo se renderice y valide en CI, que la referencia cloud inactiva quede fuera del App-of-Apps y el blueprint prod (ADR-030); el README se verifica como texto.',
  },
  'tests/gitops/image_digest_promotion.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'GitOps / Promoción de Digests',
    targetArtifacts: ['scripts/update-image-digests.ts', '.github/workflows/release-tag.yaml'],
    description:
      'Verifica la promoción de digests: reemplaza solo el del componente, conserva CRLF, rechaza digests mutables y fija los verificados con Cosign en el PR de promoción.',
  },
  'tests/gitops/metrics_token_contract.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'Pre-prod / Token de /metrics',
    targetArtifacts: ['gitops/environments/proxmox-preprod/values.yaml', 'infra/helm/pokedex/'],
    description:
      'Comprueba que pre-prod sincronice METRICS_BEARER_TOKEN desde Vault al Secret de la API (AUD-SEC-OBS-001).',
  },
  'tests/gitops/platform_bootstrap_contract.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'Pre-prod / Bootstrap de Plataforma',
    targetArtifacts: [
      'gitops/apps/',
      'infra/ansible/playbooks/setup_k3s.yaml',
      'infra/ansible/playbooks/setup_vault.yaml',
    ],
    description:
      'Comprueba el bootstrap de pre-prod (ADR-030): ESO y ArgoCD con versiones fijadas, ClusterSecretStore, auth de Vault, health checks y pasaje de CronJobs de backup.',
  },
  'tests/gitops/secret_key_refs_contract.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'GitOps / Claves de Secret Sincronizadas',
    targetArtifacts: ['infra/helm/pokedex/templates/', 'gitops/environments/'],
    description:
      'Comprueba que cada clave de Secret exigida por un workload esté sincronizada por el ExternalSecret en proxmox-preprod.',
  },
  'tests/gitops/seed_job_contract.test.ts': {
    type: 'Contract / GitOps',
    targetDomain: 'Pre-prod / Seed Job del Catálogo',
    targetArtifacts: ['infra/helm/pokedex/templates/seed-job.yaml', 'gitops/environments/proxmox-preprod/values.yaml'],
    description:
      'Comprueba que pre-prod siembre el catálogo completo con la imagen de la API, después de la sincronización, y que los demás entornos no siembren por defecto.',
  },
  'tests/helpers/argocd.ts': {
    type: 'Helper',
    targetDomain: 'ArgoCD / Exclusiones de Directorio',
    targetArtifacts: ['gitops/apps/'],
    description:
      'Helper parseDirectoryExclude: lee del YAML parseado la exclusión de directorio de una Application de ArgoCD y devuelve vacío si no es un glob de una línea.',
  },
  'tests/helpers/docs-portal.ts': {
    type: 'Helper',
    targetDomain: 'Portal de Documentación / Índice de ADRs',
    targetArtifacts: ['docs/README.md'],
    description:
      'Helper assertDocsPortalLinksAdrIndex: exige que el portal enlace el índice docs/decisions/README.md en lugar de citar rangos numéricos de ADRs.',
  },
  'tests/helpers/http-app.ts': {
    type: 'Helper',
    targetDomain: 'Pruebas de Integración HTTP',
    targetArtifacts: ['apps/backend/server.ts'],
    description:
      'Levanta la app Express en un puerto efímero y ofrece api() con IP de cliente simulada para que cada test tenga su propio cupo en los limitadores de tasa.',
  },
  'tests/helpers/helm-render.ts': {
    type: 'Helper',
    targetDomain: 'Render del Chart de Helm',
    targetArtifacts: ['infra/helm/pokedex/'],
    description:
      'Renderiza el chart con helm template (local o en contenedor) para los perfiles default, prod y pre-prod, con caché, y expone los documentos y los workloads con su especificación de pod.',
  },
  'tests/helpers/services.ts': {
    type: 'Helper',
    targetDomain: 'Servicios Reales para Pruebas de Integración',
    targetArtifacts: ['docker-compose.yaml', '.github/workflows/ci.yaml'],
    description:
      'Activa las suites de base de datos solo si existen POKEDEX_TEST_DATABASE_URL y POKEDEX_TEST_REDIS_URL, crea y elimina una base PostgreSQL aleatoria por suite y reserva una base lógica de Redis por suite.',
  },
  'tests/helpers/ansible.ts': {
    type: 'Helper',
    targetDomain: 'Lectura de Playbooks y Roles de Ansible',
    targetArtifacts: ['infra/ansible/'],
    description:
      'Aplana las tareas de playbooks y roles (incluidos block, rescue y always), localiza una tarea por nombre y expone los argumentos de su módulo, para comprobar la configuración que Ansible ejecuta y no el texto del archivo.',
  },
  'tests/helpers/hcl.ts': {
    type: 'Helper',
    targetDomain: 'Lectura de HCL de OpenTofu',
    targetArtifacts: ['infra/opentofu/'],
    description:
      'Lee archivos .tf y .tfvars como bloques y atributos, sin comentarios y respetando llaves anidadas e interpolaciones, para comprobar la IaC sobre su estructura y no sobre el texto.',
  },
  'tests/helpers/yaml.ts': {
    type: 'Helper',
    targetDomain: 'Lectura de YAML del Repositorio',
    targetArtifacts: ['.github/workflows/'],
    description:
      'Lee y parsea YAML del repo; expone los jobs y pasos de un workflow con los scripts run: sin las líneas de shell comentadas, para comprobar estructura y no texto.',
  },
  'tests/helpers/repo.ts': {
    type: 'Helper',
    targetDomain: 'Raíz del Repositorio',
    targetArtifacts: [],
    description:
      'Exporta ROOT_DIR resuelto desde la ubicación del helper, para que las suites no dependan del directorio de trabajo.',
  },
  'tests/helpers/taskfile.ts': {
    type: 'Helper',
    targetDomain: 'Taskfile / Contenido Efectivo',
    targetArtifacts: ['Taskfile.yaml', 'taskfiles/'],
    description:
      'Helpers del Taskfile efectivo: getCompleteTaskfileContent concatena la raíz y los submódulos de taskfiles/; readTaskfiles y taskCommands devuelven las tareas parseadas y sus comandos, sin comentarios.',
  },
  'tests/security/docs_governance_gate.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Gobernanza Documental / Gate de Enlaces',
    targetArtifacts: ['scripts/validate-docs-governance.ts', 'docs/'],
    description:
      'Comprueba que el gate de gobernanza documental detecte enlaces rotos en .agents/ y AGENTS.md y que la documentación vigente no tenga enlaces rotos ni drift.',
  },
  'tests/security/image_publication_contract.test.ts': {
    type: 'Contract / Supply Chain',
    targetDomain: 'Publicación de Imágenes',
    targetArtifacts: [
      '.github/workflows/ci.yaml',
      'gitops/environments/proxmox-preprod/values.yaml',
      'infra/helm/pokedex/values.prod.yaml',
    ],
    description:
      'Comprueba que CI publique todas las imágenes que GitOps despliega (api y web), con el SHA completo del commit, y el Chart una sola vez.',
  },
  'tests/security/renovate_config_contract.test.ts': {
    type: 'Contract / Dependencies',
    targetDomain: 'Renovate / Configuración',
    targetArtifacts: ['renovate.json', '.github/workflows/config-linters.yaml', 'infra/helm/pokedex/values.yaml'],
    description:
      'Comprueba renovate.json: major de postgres y redis bloqueados, sin claves de comentario inválidas, validado por digest en modo strict y exclusiones de imágenes del chart.',
  },
  'tests/security/vault_operator_policy.test.ts': {
    type: 'Security / Secrets',
    targetDomain: 'Vault / Política de Operador',
    targetArtifacts: ['infra/vault/policies/pokedex-preprod-operator.hcl', 'docs/runbooks/VAULT_OPERATOR_ACCESS.md'],
    description:
      'Comprueba el mínimo privilegio del operador de Vault: solo rutas de pre-prod, sin sudo ni borrado, metadatos de solo lectura y política de ESO distinta.',
  },
  'tests/skills_frontmatter.test.ts': {
    type: 'Contract / Governance',
    targetDomain: 'Skills / Frontmatter',
    targetArtifacts: ['.agents/skills/'],
    description: 'Comprueba que cada SKILL.md de .agents/skills/ tenga frontmatter YAML válido con name y description.',
  },
};
