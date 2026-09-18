# 🏛️ Plan de Consolidación y Simplificación Arquitectónica

> **Objetivo:** Responder a la pregunta estratégica: *"¿Qué herramientas e infraestructuras podemos simplificar o eliminar para reducir la complejidad operativa global del proyecto?"*

---

## 1. Diagnóstico de Sobrearquitectura y Carga Cognitiva

El ecosistema Pokédex ha implementado una arquitectura de clase empresarial extremadamente robusta. Sin embargo, para una aplicación de catálogo Pokémon con backend Express y frontend Vite, la superficie de mantenimiento de herramientas ha alcanzado un punto de rendimientos decrecientes, donde **la complejidad operativa supera con creces la complejidad del código de negocio**.

### Inventario Actual de Herramientas y Servicios

```text
Capa Operativa        Herramientas Coexistentes
─────────────────────────────────────────────────────────────────────────────
Observabilidad        Prometheus local, Grafana Cloud, Alloy, Beyla eBPF,
                      cAdvisor, postgres-exporter, redis-exporter,
                      Node Exporter, Kube-State-Metrics, Jaeger/Tempo OTLP
Red y Perímetro       K8s NetworkPolicies, CiliumNetworkPolicies L7 FQDN,
                      Envoy Egress Gateway
Base de Datos         PostgreSQL StatefulSet, PgBouncer Connection Pooler
Secretos & Config     K8s Secrets, External Secrets Operator (ESO),
                      Stakater Reloader, SealedSecrets
GitOps & Deploy       ArgoCD (App-of-Apps), Helm OCI, OpenTofu, Ansible
Supply Chain & QA     Cosign, Sigstore, Trivy, SBOM CycloneDX, Semgrep,
                      Checkov, MegaLinter, SonarCloud, Playwright, Axe-core,
                      k6, Lighthouse CI, Renovate
```

---

## 2. Matriz de Redundancia y Poda Recomendada

### 2.1. Red y Filtrado Perimetral (Zero-Trust Egress)
* **Situación:** Coexisten tres mecanismos de control de tráfico saliente:
  1. `NetworkPolicy` estándar de Kubernetes (L3/L4 por CIDR/PodSelector).
  2. `CiliumNetworkPolicy` L7 con filtrado FQDN por kernel eBPF (`generativelanguage.googleapis.com`, `*.pokeapi.co`).
  3. `Envoy Egress Gateway` (Deployment + ConfigMap + Service dedicados).
* **Diagnóstico:** El Envoy Egress Gateway actúa como proxy intermedio de capa 7 duplicando lo que Cilium ya realiza de forma nativa en el socket del kernel mediante eBPF sin saltos de red adicionales ni consumo de pods proxy.
* **Acción de Poda (Fase A - Prioridad 🟠):**
  - **Desmantelar Envoy Egress Gateway** (`infra/helm/pokedex/templates/egress-gateway.yaml`).
  - **Consolidar en Cilium eBPF** (`CiliumNetworkPolicy`) como estándar único Zero-Trust L7 para entornos con Cilium CNI, y NetworkPolicies estándar como baseline L4.
  - **Protocolo de Validación Pre-Poda (Staging/Sandbox):** Antes de eliminar definitivamente los manifiestos de Envoy, se debe certificar la matriz de 7 pruebas en un entorno con Cilium eBPF activo:
    1. **Gemini API:** Peticiones HTTPS hacia `generativelanguage.googleapis.com:443` operan sin degradación de latencia ni fallos de handshake.
    2. **PokeAPI:** Resolución y consumo REST hacia `*.pokeapi.co:443` permitidos.
    3. **GitHub Content:** Descarga de assets/sprites desde `*.githubusercontent.com:443` permitida.
    4. **Anti-SSRF:** Bloqueo irrecuperable de peticiones hacia `169.254.169.254` (Cloud IMDS) y subredes RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
    5. **DNS Inspection:** CoreDNS interceptado y resuelto vía proxy DNS eBPF de Cilium sin desbordamiento de caché ni TTL drops.
    6. **TLS SNI Passthrough:** Handshakes cifrados validados mediante SNI en socket sin requerir certificados CA privados ni terminación TLS.
    7. **Fail-Closed Estricto:** Cualquier destino externo no explícitamente en la allowlist (ej. `curl -I https://example.com` o puerto 80) debe ser rechazado/descartado inmediatamente.

### 2.2. Agentes de Telemetría y Monitoreo
* **Situación:** En desarrollo y producción conviven agentes independientes:
  - `postgres-exporter`, `redis-exporter`, `cadvisor` y `grafana/alloy`.
* **Diagnóstico:** Grafana Alloy es un recolector programable moderno capaz de embeber internamente los exporters de Prometheus mediante sus componentes `prometheus.exporter.postgres` y `prometheus.exporter.redis` sin necesidad de ejecutar contenedores satélites dedicados.
* **Acción de Poda (Fase B):**
  - Migrar la recolección de métricas de PostgreSQL y Redis a componentes nativos dentro del pipeline de `config.alloy`.
  - Retirar los contenedores `postgres-exporter` y `redis-exporter` del Compose local, reduciendo el footprint a un único agente Alloy.

### 2.3. Pooler de Conexiones (PgBouncer)
* **Situación:** Se incluye PgBouncer frente a PostgreSQL.
* **Diagnóstico:** La API Pokédex utiliza `pg.Pool` con un límite estricto de 20 conexiones por réplica. Con 2-3 réplicas en Proxmox/Cloud, la base de datos maneja cómodamente 40-60 conexiones concurrentes, muy por debajo de los límites nativos de PostgreSQL (100-200 conex.). PgBouncer agrega un salto TCP y complejidad en el manejo de transacciones/prepared statements sin necesidad imperativa en este volumen.
* **Acción de Poda (Fase C):**
  - Mantener PgBouncer desactivado por defecto (`pgbouncer.enabled: false`) y considerar su deprecación formal en futuras revisiones mayores del chart.

### 2.4. Herramientas de Calidad Estática y Linters en CI
* **Situación:** Se ejecutan simultáneamente MegaLinter, Semgrep, SonarCloud, Checkov, ESLint y TypeCheck.
* **Diagnóstico:** MegaLinter y ESLint ejecutan reglas redundantes sobre los mismos archivos TypeScript.
* **Acción de Poda (Fase D):**
  - Consolidar la verificación de código en `npm run lint` (TypeScript + ESLint estricto) + Semgrep (SAST de seguridad enfocado), delegando la orquestación a tareas rápidas sin sobrecosto de contenedores monolíticos en cada commit.

### 2.5. Ergonomía del Monorepo: Modularización de `Taskfile.yml` (Prioridad 🟡)
* **Situación:** `Taskfile.yml` cuenta con ~550 líneas agrupando 11 dominios heterogéneos (desarrollo, testing, observabilidad, DR, GitOps, Kubernetes, secretos, Ansible, OpenTofu, Helm). Coexisten además aliases de compatibilidad (`docker:up` -> `dev:compose`, `tofu:*` -> `infra:*`).
* **Evaluación de Ergonomía:**
  - **Monolítico (Decisión Actual):** Ofrece descubrimiento inmediato con `task --list`, cero fricción de búsqueda (`Ctrl+F` global), consistencia multiplataforma (Windows/Linux) y compatibilidad directa con la suite de auditoría (`tests/security/deploy_scripts_security.test.ts`).
  - **Modularización Futura (`includes:`):** Cuando el equipo crezca o se requiera aislar responsabilidades de mantenimiento, se adoptará la descomposición nativa de go-task (`taskfiles/Taskfile.{dev,k8s,infra,security,gitops}.yml`) utilizando `flatten: true` para preservar la nomenclatura canónica sin introducir prefijos redundantes.
* **Resolución:** Mantener `Taskfile.yml` unificado en la fase actual por ergonomía y estabilidad de CI/tests, conservando los aliases de compatibilidad documentados.

### 2.6. Gestión de Secretos: Consolidación en External Secrets Operator (Prioridad 🟡)
* **Situación:** Coexisten conceptualmente dos mecanismos para Kubernetes: External Secrets Operator (ESO) y Bitnami Sealed Secrets (`scripts/seal-secret.ts`).
* **Diagnóstico de Superficie Conceptual:**
  - Mantener ambos genera ambigüedad sobre la autoridad de las credenciales, dónde residen y quién las rota.
  - Ni AWS EKS ni Proxmox VE utilizan Sealed Secrets en sus manifiestos GitOps (`gitops/environments/*/values.yaml` ambos implementan `externalSecrets.enabled: true` apuntando a AWS Secrets Manager y HashiCorp Vault respectivamente).
  - Sealed Secrets no soporta rotación periódica desatendida ni polling aguas arriba.
* **Acción de Poda (Fase E):**
  - **Mecanismo Canónico Único:** **External Secrets Operator (ESO) + Secret Manager Upstream (AWS/Vault) $\to$ `v1/Secret` efímero $\to$ Stakater Reloader**.
  - **Deprecación de Sealed Secrets:** Se declara Sealed Secrets como mecanismo legado/deprecado. Se retira su necesidad operativa y se mantiene `scripts/seal-secret.ts` únicamente como utilidad histórica aislada.

### 2.7. Minimal Viable Platform (MVP) en Proxmox VE On-Premise (Prioridad 🔴)
* **Situación:** En el despliegue on-premise sobre Proxmox VE (LXC/VM K3s), trasladar acríticamente todo el ecosistema de operadores de nube (ESO, Stakater Reloader, PgBouncer, Beyla eBPF, Node Exporter, Cilium CNI) sobrecarga la memoria disponible y multiplica puntos de falla sin aportar valor real en un laboratorio u operación interna.
* **Diagnóstico de Complejidad vs. Garantía:**
  La meta arquitectónica consiste en podar componentes redundantes preservando intactas las garantías de **disponibilidad, seguridad, observabilidad y disaster recovery**.

| Componente Original | Rol Original | Racional de Poda en Proxmox | Garantía de Reemplazo Preservada |
|---|---|---|---|
| **Stakater Reloader** | Reiniciar Pods ante cambios de config/secretos | Requiere un controller Go dedicado con permisos RBAC en todo el clúster. | **Anotación nativa Helm `checksum/config`** (`spec.template.metadata.annotations`) en `api-deployment` y `web-deployment`. Provoca RollingUpdate determinista nativo ante cambios de ConfigMap sin necesidad de pods extra. |
| **PgBouncer** | Pooler de conexiones PostgreSQL | La API usa `pg.Pool` limitado a 20 conns por réplica (40 en 2 réplicas). PostgreSQL nativo soporta 100-200 conex. sin penalización. | **Pooling nativo en runtime Node.js**. Elimina un intermediario de red y evita fallos con prepared statements. |
| **External Secrets Operator (ESO)** | Sincronización continua de secretos con Vault | En laboratorio on-premise, 3 pods de ESO para sincronizar 5 credenciales estáticas es desproporcionado. | **`v1/Secret` estático nativo de Kubernetes** (`pokemon-secrets`), desacoplado vía GitOps (`secrets.existingSecret`). |
| **Beyla (eBPF)** | Auto-instrumentación de trazas por kernel eBPF | En LXC anidado/privilegiado, eBPF requiere privilegios elevados y es propenso a incompatibilidades con el kernel del host PVE. | **Instrumentación nativa W3C `traceparent` (ADR-018)** + logs estructurados Pino JSON con `traceId`/`spanId` + endpoint `/metrics` en la aplicación. |
| **Node Exporter & KSM** | Métricas del host OS y objetos de Kubernetes | Duplica la telemetría que el hipervisor ya captura con precisión absoluta. | **Telemetría RRD nativa de Proxmox VE** (CPU, RAM, I/O) + `metrics-server` embebido en K3s para HPA + scraping ligero de pods vía Grafana Alloy. |
| **Cilium CNI** | CNI eBPF avanzado | K3s incluye Flannel embebido con huella de memoria prácticamente nula (<20MB). | **Flannel + K8s NetworkPolicies L4 estándar** con reglas de Default-Deny y Anti-SSRF estrictas. |

---

## 3. Política de Contención: "Una Sola Herramienta por Dominio"

Para salvaguardar la mantenibilidad del proyecto a largo plazo, se adopta la regla estricta:

| Dominio Operativo | Herramienta Autorizada (Cloud / AWS) | Perfil Minimal Viable Platform (On-Prem / Proxmox) | Alternativas Descartadas / Podadas |
|---|---|---|---|
| **Gestión de Secretos** | **External Secrets Operator (ESO)** | `v1/Secret` nativo K8s (`existingSecret`) | Bitnami Sealed Secrets (deprecado) |
| **Recarga de Config/Secretos** | Stakater Reloader | **Helm `checksum/config` nativo en Pod template** | Scripts manuales de rollout |
| **Connection Pooling** | PgBouncer (si réplicas > 10) | **Pool nativo `pg.Pool` en aplicación** | PgBouncer innecesario en cargas moderadas |
| **GitOps** | ArgoCD (targetRevision fija) | ArgoCD / Helm directo estandarizado | Scripts de deploy imperativos |
| **Ingress & TLS** | cert-manager + Nginx Ingress / ALB | Traefik embebido de K3s + split-DNS | Gestión manual de certificados |
| **Zero-Trust L7 / L4** | CiliumNetworkPolicy eBPF FQDN | K8s NetworkPolicies L4 (Default-Deny + Anti-SSRF) | Envoy Egress Gateway proxy |
| **Telemetría** | Grafana Alloy + Grafana Cloud OTLP | Grafana Alloy (OTLP + logs /var/log/pods) | Stack legado (`docker_monitoreo`), Beyla en LXC |
| **Métricas de Host** | Node Exporter + KSM | **Proxmox VE RRD hypervisor metrics + metrics-server** | Agentes duplicados en nodo LXC |
| **Auditoría de Imagen** | Trivy (SCA/SBOM) + Cosign (Keyless) | Trivy + Cosign en CI | Múltiples scanners redundantes |
| **Disaster Recovery** | `backup-cronjob` + `dr-restore-verify` | `backup-cronjob` + `dr-restore-verify` | Scripts ad-hoc sin restore drill |
| **Task Runner Monorepo** | Task (`Taskfile.yml` unificado) | Task (`Taskfile.yml` unificado) | Makefiles dispersos o scripts Bash ad-hoc |

---

## 4. Estado de Implementación

- [x] Retiro de `docker_monitoreo` y targets legacy en `Taskfile.yml`.
- [x] Unificación de telemetría dev/cloud en Grafana Alloy y OTLP.
- [x] Inmutabilidad estricta por SHA-256 digest pinning en GitOps (`aws`, `proxmox`).
- [x] Formalización del CronJob de verificación periódica de Disaster Recovery (`dr-restore-verify`).
- [x] Poda de `egress-gateway.yaml` ejecutada: consolidación del filtrado L7 en `CiliumNetworkPolicy` (eBPF FQDN) y baseline L4 con Anti-SSRF.
- [x] Evaluación y estrategia de modularización de `Taskfile.yml` formalizada (monolito ergonómico actual con blueprint de migración a `includes` con `flatten: true`).
- [x] Consolidación de Gestión de Secretos formalizada: ESO como mecanismo único y autoridad absoluta; Sealed Secrets deprecado.
- [x] **Poda de Arquitectura en Proxmox VE (Minimal Viable Platform)**: Adopción de `checksum/config` nativo en Helm (sustituyendo Reloader), desactivación explícita de PgBouncer y ESO, instrumentación W3C nativa sin eBPF intrusivo en LXC, y telemetría consolidada en Grafana Alloy con huella < 1 GB RAM total.

