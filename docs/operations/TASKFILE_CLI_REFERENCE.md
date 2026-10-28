# Referencia Oficial del CLI Canónico con Taskfile (`Taskfile.yaml`)

## 1. Principio Rector: `task --list` como Interfaz Oficialmente Soportada

Conforme a la decisión arquitectónica [ADR-020](../decisions/ADR-020-unified-deployment-governance-and-script-retirement.md) (que consolida el ciclo de vida de aliases de ADR-026), el proyecto consolida **`Taskfile.yaml`** como el único orquestador canónico de operaciones, compilación, pruebas, infraestructura y entrega continua.

La interfaz oficialmente soportada para el descubrimiento dinámico, documentación contextual e inspección de tareas disponibles es:

```bash
task --list
# o simplemente:
task
```

Al invocar `task` sin argumentos, se ejecuta de forma predeterminada `task --list`, presentando el catálogo estandarizado con la descripción funcional de cada comando disponible.

---

## 2. Catálogo de Comandos Canónicos Oficialmente Soportados

| Dominio | Tarea Canónica | Propósito / Acción |
| :--- | :--- | :--- |
| **Descubrimiento** | `task` o `task --list` | Muestra el catálogo de tareas disponibles y su descripción oficial. |
| **Gestión Monorepo** | `task install` | Instalación limpia y reproducible con `npm ci`. |
| **Desarrollo** | `task dev` | Servidor Pokédex en modo hot-reload interactivo. |
| **Compilación** | `task build` | Compila backend con esbuild y frontend con Vite (con caché determinista). |
| | `task build:backend` | Compila y empaqueta el servidor Node.js/Express con esbuild. |
| | `task build:frontend` | Compila y empaqueta la aplicación web frontend con Vite. |
| **Producción** | `task start` | Ejecuta el bundle de producción compilado (`npm start`). |
| **Validación y QA** | `task lint` | Ejecuta linting y análisis de tipos unificado. |
| | `task lint:changed` | Ejecuta linting rápido con Biome sobre archivos modificados respecto a main. |
| | `task lint:md` | Valida la calidad y consistencia de Markdown con markdownlint (0 errores MDxxx). |
| | `task lint:md:fix` | Aplica autocorrección de formato a la documentación Markdown. |
| | `task validate` | Suite obligatoria previa a commit (`lint`, `typecheck`, `build`, `test`). |
| | `task test` | Pruebas unitarias de seguridad y lógica de negocio. |
| | `task test:unit` | Pruebas unitarias aisladas de aplicación. |
| | `task test:integration` | Pruebas de integración de base de datos, concurrencia y límites. |
| | `task test:gitops` | Pruebas de contratos de GitOps y despliegue. |
| | `task test:surface` | Valida consistencia e inventario de la superficie de pruebas (`test-surface`). |
| | `task test:e2e` | Pruebas de integración E2E con Playwright. |
| | `task test:a11y` | Auditoría de accesibilidad WCAG 2.1 con Axe-core. |
| | `task test:coverage` | Generación de reporte de cobertura LCOV. |
| | `task evals` | Ejecuta la suite de evaluaciones conductuales para agentes de IA (`.agents/evals/`). |
| | `task perf:lighthouse` | Auditoría de Core Web Vitals y rendimiento con Lighthouse CI sobre nginx real y una API simulada con el catálogo completo (ver `apps/frontend/README.md`). |
| **Entorno Local** | `task dev:compose` | Levanta el stack interactivo con Docker Compose (`pokemon-web`, `pokemon-api`, `postgres`, `redis`). |
| | `task dev:compose:down` | Detiene y desmantela los contenedores locales de Compose. |
| | `task dev:catalog:generate` | Regenera el catálogo nacional completo de Pokémon desde PokeAPI. |
| | `task dev:k8s:up` | Despliega clúster Kind local con ingress y namespaces configurados. |
| | `task dev:k8s:status` | Consulta estado de pods, servicios e ingress en namespace `pokemon-app`. |
| **Infraestructura (OpenTofu)** | `task infra:fmt` | Verifica formato canónico en todos los entornos de OpenTofu (`tofu fmt -check`). |
| | `task infra:validate` | Valida sintaxis e inicializa backends (`Proxmox`, `Cloud Template`, `Lab`). |
| | `task infra:plan:proxmox` | Genera plan de ejecución para entorno on-premise Proxmox VE. |
| | `task infra:apply:proxmox` | Aplica configuración IaC en Proxmox VE. |
| | `task infra:plan:lab` | Plan de ejecución para entorno de laboratorio de pruebas. |
| | `task infra:apply:lab` | Aplica infraestructura de laboratorio. |
| **Automatización (Ansible)** | `task ansible:syntax` | Valida sintaxis de los 9 playbooks y roles de Ansible (`--syntax-check`). |
| | `task ansible:prepare` | Aprovisiona baseline de sistema y configuración de nodo Proxmox. |
| | `task ansible:harden` | Aplica blindaje perimetral y reglas de firewall UFW en hosts. |
| | `task ansible:validate` | Auditoría y compliance de hosts sin alterar estado. |
| | `task k3s:setup:proxmox` | Aprovisiona K3s (Flannel por defecto en LXC 800; Cilium CNI opcional) en Proxmox mediante Ansible (`setup_k3s.yaml`). |
| | `task vault:setup:proxmox` | Aprovisiona e inicializa HashiCorp Vault CE en Proxmox (`setup_vault.yaml`). |
| **Empaquetado (Helm)** | `task helm:lint` | Valida sintaxis y buenas prácticas del Chart de Helm. |
| | `task helm:template` | Renderiza manifiestos Kubernetes generados por el Chart. |
| **Kubernetes Runtime** | `task k8s:up` | Despliega o actualiza el release de Helm en el clúster activo. |
| | `task k8s:down` | Desinstala el release de Helm de forma controlada. |
| | `task k8s:status` | Diagnóstico de pods, réplicas, servicios e ingress. |
| **Bootstrap de Plataforma** | `task platform:bootstrap:preprod VAULT_CA=<ruta>` | Bootstrap completo de GitOps en pre-prod: ESO, ClusterSecretStore, ArgoCD, health checks y App-of-Apps. |
| | `task platform:eso:install` | Instala External Secrets Operator (chart fijado) y el binding `system:auth-delegator` de su ServiceAccount. |
| | `task platform:eso:vault-store VAULT_CA=<ruta>` | Publica la CA de Vault (`vault-ca`) y aplica el `ClusterSecretStore` de pre-prod. |
| | `task platform:argocd:install` | Instala ArgoCD desde el manifiesto oficial fijado por versión. |
| **GitOps (ArgoCD)** | `task gitops:apps:root` | Sincroniza la aplicación App-of-Apps en el clúster. |
| | `task gitops:sync:preprod` | Sincroniza la aplicación ArgoCD de pre-prod en Proxmox VE (ADR-030). |
| | `task gitops:sync:cloud` | Fuerza sincronización del blueprint prod cloud (solo tras activarlo, ADR-030). |
| | `task gitops:health-checks` | Aplica evaluadores de salud personalizados para CRDs. |
| **Seguridad & Egress L7** | `task security:egress` | Ejecuta pruebas automatizadas de política de egress L7 Anti-SSRF. |
| | `task security:egress:probe` | Ejecuta la sonda activa de seguridad y filtrado egress L7 en clúster. |
| **Supply Chain & Registro (GHCR)** | `task ghcr:retention` | Aplica política de retención en GHCR conservando estrictamente los últimos 3 releases. |
| | `task ghcr:retention:dry-run` | Inspecciona versiones en GHCR y simula la purga sin mutaciones (Dry-Run). |
| **Gobernanza & Auditoría** | `task governance:audit-scripts` | Valida lista blanca estricta de scripts y prohíbe scripts imperativos. |
| | `task ci:impact` | Calcula el grafo de impacto de cambios y el DAG dinámico de CI. |
| **Sincronización Linear** | `task linear:sonar-sync` | Sincroniza incidencias de SonarCloud con Linear. |
| | `task linear:security-sync` | Sincroniza alertas de seguridad GitHub (CodeQL, Dependabot, Secret Scanning) con Linear. |
| **Gobernanza MCP** | `task mcp:validate` | Valida integridad estructural, permisos y esquemas del catálogo MCP. |
| | `task mcp:scan` | Escaneo estático Zero-Trust contra Tool Poisoning, Rug Pulls y RCE. |
| | `task mcp:generate` | Genera configuraciones nativas e idempotentes para todos los clientes MCP. |
| | `task mcp:doctor` | Diagnóstico seguro de dependencias, variables y conectividad MCP. |
| | `task mcp:test` | Ejecuta la suite de pruebas unitarias, contratos y seguridad MCP. |

---

## 3. Aliases Retirados

Los aliases legados de compatibilidad (`ts:*`, `tofu:*`, `docker:*`, `deploy:proxmox` y `gitops:sync:proxmox`)
se retiraron de forma definitiva de `Taskfile.yaml` en `v1.76.0` y `v1.94.1`. El ciclo de retiro en cuatro fases
está registrado en [ADR-020](../decisions/ADR-020-unified-deployment-governance-and-script-retirement.md) y
[`tests/security/iac_baseline_security.test.ts`](../../tests/security/iac_baseline_security.test.ts) impide que
vuelvan a declararse. La tabla de equivalencias de la migración se conserva en el historial de Git de este
documento; la interfaz soportada es exclusivamente el catálogo de la sección 2.
