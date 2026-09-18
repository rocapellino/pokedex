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

### 2.2. Agentes de Telemetría y Monitoreo (Fase B - Consolidada)
* **Situación:** En desarrollo coexistían agentes independientes en contenedores satélites dedicados:
  - `postgres-exporter`, `redis-exporter`, `cadvisor` y `grafana/alloy`.
* **Diagnóstico:** Grafana Alloy es un recolector programable moderno capaz de embeber internamente los exporters de Prometheus mediante sus componentes nativos `prometheus.exporter.postgres` y `prometheus.exporter.redis` sin necesidad de ejecutar contenedores satélites dedicados.
* **Acción de Poda (Fase B - [x] Ejecutada):**
  - **Migración a Exporters Nativos en Alloy**: Configurados `prometheus.exporter.postgres "postgres"` y `prometheus.exporter.redis "redis"` con descubrimiento y relabeling nativo (`discovery.relabel`) en `infra/monitoring/alloy/config.alloy`.
  - **Retiro de Contenedores Satélites**: Eliminados los servicios `postgres-exporter` y `redis-exporter` de `docker-compose.dev.yml` y `Taskfile.yml`, consolidando la recolección interna de Postgres y Redis dentro de Alloy.

#### 2.2.1. Evaluación y Decisión Arquitectónica sobre cAdvisor (Opción A - Confirmada)
* **Auditoría de Dependencias de Métricas:**
  Se auditó exhaustivamente el repositorio para identificar qué artefactos consumen métricas de cAdvisor:
  - **`container_cpu_usage_seconds_total`**: Utilizado en `pokedex-application.json` y `cluster-observability.json` para graficar el uso de núcleos por contenedor.
  - **`container_memory_working_set_bytes`**: Utilizado en ambos dashboards y en la regla de alerta `ContainerHighMemoryUsage` (`infra/monitoring/alerts.yml`).
  - **`container_spec_memory_limit_bytes`**: Utilizado como denominador en `alerts.yml` para calcular el porcentaje de saturación de RAM contra los límites de cgroups (> 85%).
* **Diferencia entre Entornos (Kubernetes vs. Docker Compose):**
  - **En Kubernetes (Cloud AWS & Proxmox VE K3s):** cAdvisor **NO** corre como contenedor ni pod independiente. Kubelet lo incluye embebido de forma nativa en su binario (`:10250/metrics/cadvisor`), con cero overhead de gestión o pods adicionales.
  - **En Desarrollo Local (Docker Compose):** Docker Engine no expone métricas granulares de cgroups por contenedor en su API estándar, y Grafana Alloy no dispone de un componente embebido equivalente a cAdvisor (solo posee `prometheus.exporter.unix` para el Host OS global).
* **Decisión (Opción A):**
  - **Retener `cadvisor` exclusivamente en `docker-compose.dev.yml`**: Se preserva el contenedor satélite `pokemon-cadvisor` (~80 MB RAM) como único componente auxiliar de métricas en desarrollo local.
  - **Garantía Preservada:** Garantiza paridad 1:1 en las métricas de cgroups (`container_*`) entre local y producción, evitando alterar o crear fallbacks en los paneles de Grafana o en las reglas de alerta Prometheus.


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

### 2.6. Gestión de Secretos: External Secrets Operator como Estándar Canónico Único Multi-Entorno
* **Situación:** Coexistían conceptualmente múltiples mecanismos y directorios fragmentados (`infra/k8s/eso/` con `pokedex-secret-store` y `infra/k8s/secretstores/` con nombres dispares), además de utilidades legadas de Bitnami Sealed Secrets.
* **Diagnóstico de Superficie Conceptual:**
  - Mantener directorios dispersos (`infra/k8s/eso` y `infra/k8s/secretstores`) generaba ambigüedad sobre qué `ClusterSecretStore` se utilizaba y dónde residía.
  - La arquitectura canónica del proyecto (compromiso #206) establece que **External Secrets Operator (ESO) es el mecanismo absoluto y universal** para la inyección y rotación de credenciales en Kubernetes.
* **Acción de Consolidación y Poda (Fase E - [x] Ejecutada):**
  - **Estandarización Canónica Bipolar**:
    - **AWS EKS (Cloud)**: `ESO` $\to$ `ClusterSecretStore/aws-secrets-manager` $\to$ **AWS Secrets Manager** (autenticación federada IRSA).
    - **Proxmox VE (On-Premise)**: `ESO` $\to$ `ClusterSecretStore/vault-backend` $\to$ **HashiCorp Vault** (autenticación Kubernetes ServiceAccount).
  - **Limpieza de Directorios**: Se podó y eliminó `infra/k8s/secretstores/`, consolidando todos los conectores de clúster bajo `infra/k8s/eso/` (`aws-secrets-manager.yaml`, `vault-backend.yaml`, `cluster-secret-store.yaml`).
  - **Deprecación de Sealed Secrets**: Sealed Secrets queda oficialmente deprecado como mecanismo de despliegue; `scripts/seal-secret.ts` se conserva únicamente como utilidad histórica aislada.

### 2.7. Minimal Viable Platform (MVP) en Proxmox VE On-Premise (Prioridad 🔴)
* **Situación:** En el despliegue on-premise sobre Proxmox VE (LXC/VM K3s), trasladar acríticamente componentes auxiliares no esenciales sobrecarga la memoria y multiplica puntos de falla en un laboratorio u operación interna.
* **Diagnóstico de Complejidad vs. Garantía:**
  La meta arquitectónica consiste en podar componentes redundantes preservando intactas las garantías de **disponibilidad, seguridad, observabilidad y disaster recovery**.

| Componente Original | Rol Original | Racional de Poda en Proxmox | Garantía de Reemplazo Preservada |
|---|---|---|---|
| **Stakater Reloader** | Reiniciar Pods ante cambios de config/secretos | Requiere un controller Go dedicado con permisos RBAC en todo el clúster. | **Anotación nativa Helm `checksum/config`** (`spec.template.metadata.annotations`) en `api-deployment` y `web-deployment`. Provoca RollingUpdate determinista nativo ante cambios de ConfigMap sin necesidad de pods extra. |
| **PgBouncer** | Pooler de conexiones PostgreSQL | La API usa `pg.Pool` limitado a 20 conns por réplica (40 en 2 réplicas). PostgreSQL nativo soporta 100-200 conex. sin penalización. | **Pooling nativo en runtime Node.js**. Elimina un intermediario de red y evita fallos con prepared statements. |
| **External Secrets Operator (ESO)** | Sincronización continua de secretos con Vault | Mecanismo canónico oficial (commit #206). En Proxmox conecta con `ClusterSecretStore/vault-backend`. | **Sincronización declarativa con Vault** proyectada a `pokemon-secrets` (`refreshInterval: 1h`). |
| **Beyla (eBPF)** | Auto-instrumentación de trazas por kernel eBPF | En LXC anidado/privilegiado, eBPF requiere privilegios elevados y es propenso a incompatibilidades con el kernel del host PVE. | **Instrumentación nativa W3C `traceparent` (ADR-018)** + logs estructurados Pino JSON con `traceId`/`spanId` + endpoint `/metrics` en la aplicación. |
| **Node Exporter & KSM** | Métricas del host OS y objetos de Kubernetes | Duplica la telemetría que el hipervisor ya captura con precisión absoluta. | **Telemetría RRD nativa de Proxmox VE** (CPU, RAM, I/O) + `metrics-server` embebido en K3s para HPA + scraping ligero de pods vía Grafana Alloy. |
| **Cilium CNI** | CNI eBPF avanzado | Si se opta por Flannel para minimizar memoria (<20MB), solo se obtiene aislamiento L4 (Anti-SSRF RFC1918/IMDS). Para garantizar que destinos externos no autorizados (ej. `https://example.com`) sean bloqueados preservando el acceso a `generativelanguage.googleapis.com` y `pokeapi.co`, se retiene **Cilium CNI con CiliumNetworkPolicy L7 FQDN**. | **Cilium CNI en Proxmox** (`ciliumNetworkPolicy.enabled: true`) preserva paridad 1:1 con producción. Si se opera bajo Flannel puro, el filtrado se limita a L4 (bloqueo de 169.254.169.254 y RFC1918), permitiendo cualquier puerto 443 público. |

#### Arquitectura Canónica de Secretos en Proxmox VE (Commit #206)

```text
Proxmox (Hipervisor / Nodo K3s)
   ↓
ESO (External Secrets Operator en clúster)
   ↓
Vault (HashiCorp Vault Community Edition en LXC dedicado)
   ↓
pokemon-secrets (Secret nativo consumido por API / Postgres / Redis)
```

- **HashiCorp Vault (Community Edition)** se ejecuta en un contenedor LXC dedicado en Proxmox VE, provisionado automáticamente mediante OpenTofu (`infra/opentofu/environments/proxmox/`).
- **ESO** se conecta a Vault mediante el conector canónico [`ClusterSecretStore/vault-backend`](../../infra/k8s/eso/vault-backend.yaml) utilizando autenticación de Kubernetes ServiceAccount (`external-secrets-sa`).
- **ExternalSecret** sincroniza periódicamente las credenciales hacia el Secret `pokemon-secrets` consumido por las cargas de trabajo.

##### ¿Por qué coexisten Reloader (Cloud) y `checksum/config` (Proxmox)?

Una pregunta arquitectónica natural es: *¿Si `checksum/config` cubre la recarga, por qué no eliminar Reloader también de AWS?*

La respuesta radica en la **frontera de renderizado de Helm vs. el ciclo de vida asíncrono de ESO**:
1. **`checksum/config` opera en tiempo de empaquetado/despliegue de Helm (`helm upgrade` / ArgoCD sync):**
   Calcula el hash SHA-256 de `templates/configmap.yaml`. Cuando un operador modifica valores en Git, Helm genera un nuevo hash y Kubernetes reinicia los pods. Sin embargo, **el recurso `v1/Secret pokemon-secrets` NO forma parte del render de Helm** (es generado dinámicamente en runtime por ESO). Cuando una credencial rota en AWS Secrets Manager o Vault, ESO actualiza el Secret en Kubernetes, pero **Helm no se ejecuta y `checksum/config` no muta**. Los pods continuarían corriendo con credenciales viejas.
2. **`Stakater Reloader` opera en tiempo de ejecución (Runtime Watcher):**
   Como controlador activo en el clúster, escucha los eventos de la API de Kubernetes. Al detectar que ESO modificó `v1/Secret pokemon-secrets`, computa el nuevo hash del secreto y muta el Pod template, logrando **rotación zero-touch sin intervención humana ni redeploy de Helm**.
3. **Decisión por Entorno:**
   - **Cloud (AWS EKS):** Se conserva **Stakater Reloader** obligatoriamente para garantizar rotación autónoma continua (60/90 días) de bases de datos, claves de sesión y APIs upstream.
   - **On-Premise (Proxmox VE):** Para priorizar la huella ultraliviana (< 1 GB RAM) y evitar controladores con RBAC global en laboratorio/MVP, se prescinde de Reloader. La recarga de configuración queda cubierta por `checksum/config`, y ante rotación en Vault se asume el reinicio manual o vía pipeline (`kubectl rollout restart`).

##### Demostración Técnica: Anti-SSRF (L4) vs. Control Egress L7 FQDN en Proxmox

Existe una distinción fundamental de seguridad entre el blindaje **Anti-SSRF (Capa 4)** y el **Filtrado Egress Zero-Trust (Capa 7 FQDN)**:

1. **Garantía Anti-SSRF L4 (Preservada por NetworkPolicy estándar con Flannel):**
   La regla L4 en `network-policies.yaml`:
   ```yaml
   - to:
       - ipBlock:
           cidr: 0.0.0.0/0
           except:
             - 169.254.169.254/32 # IMDS AWS/GCP/Azure (Anti-SSRF)
             - 10.0.0.0/8         # RFC1918 Red Privada
             - 172.16.0.0/12      # RFC1918 Red Privada
             - 192.168.0.0/16     # RFC1918 Red Privada
             - 127.0.0.0/8        # Loopback
     ports:
       - protocol: TCP
         port: 443
   ```
   **Bloquea de manera determinista:**
   - `http://169.254.169.254` (IMDS): **BLOQUEADO** (cae en `except` y puerto 80 no permitido).
   - `http://10.0.0.1` (RFC1918): **BLOQUEADO** (cae en `except` y puerto 80 no permitido).
   - `http://192.168.1.1` (RFC1918): **BLOQUEADO** (cae en `except` y puerto 80 no permitido).

2. **Limitación Infranqueable de Flannel L4 (No puede bloquear dominios públicos arbitrarios):**
   Las NetworkPolicies estándar de Kubernetes operan estrictamente en Capa 3/4 (IP y Puerto). No tienen visibilidad de nombres de dominio DNS ni cabeceras SNI de TLS.
   Al requerir acceso a servicios upstream con IPs públicas dinámicas (`generativelanguage.googleapis.com` y `pokeapi.co`), la política L4 debe permitir `0.0.0.0/0:443`.
   **Consecuencia directa:**
   - `https://generativelanguage.googleapis.com` $\to$ **PERMITIDO** (puerto 443 público).
   - `https://pokeapi.co` $\to$ **PERMITIDO** (puerto 443 público).
   - `https://example.com` $\to$ **PERMITIDO en Flannel L4**. Flannel no puede distinguir entre `pokeapi.co` y `example.com`.

3. **Resolución Canónica: Retención de Cilium eBPF en Proxmox:**
   Para satisfacer el requisito de que `https://example.com` **falle** mientras los servicios autorizados funcionan, se retiene **Cilium CNI** en Proxmox:
   - K3s se instala sin Flannel (`--flannel-backend=none --disable-network-policy`).
   - Cilium se despliega como CNI, aplicando `CiliumNetworkPolicy` (`toFQDNs`):
     - `generativelanguage.googleapis.com` (Match exacto)
     - `*.pokeapi.co` (Pattern wildcard)
     - `*.githubusercontent.com` (Pattern wildcard)
   - El motor eBPF inspecciona las respuestas DNS y mantiene un ipset dinámico en el datapath del kernel. Cualquier intento de conexión hacia `example.com` es descartado (`TC_ACT_SHOT`) antes de salir del nodo.
   - En `gitops/environments/proxmox/values.yaml` se activa `ciliumNetworkPolicy.enabled: true` y `networkPolicies.egress.externalHttps: false`, garantizando paridad 1:1 con AWS EKS.


---

## 3. Política de Contención: "Una Sola Herramienta por Dominio"

Para salvaguardar la mantenibilidad del proyecto a largo plazo, se adopta la regla estricta:

| Dominio Operativo | Herramienta Autorizada (Cloud / AWS) | Perfil Minimal Viable Platform (On-Prem / Proxmox) | Alternativas Descartadas / Podadas |
|---|---|---|---|
| **Gestión de Secretos** | **ESO $\to$ AWS Secrets Manager** (`aws-secrets-manager`) | **ESO $\to$ HashiCorp Vault** (`vault-backend`) | Bitnami Sealed Secrets (deprecado), `infra/k8s/secretstores/` disperso |
| **Recarga de Config/Secretos** | Stakater Reloader | **Helm `checksum/config` nativo en Pod template** | Scripts manuales de rollout |
| **Connection Pooling** | PgBouncer (si réplicas > 10) | **Pool nativo `pg.Pool` en aplicación** | PgBouncer innecesario en cargas moderadas |
| **GitOps** | ArgoCD (targetRevision fija) | ArgoCD / Helm directo estandarizado | Scripts de deploy imperativos |
| **Zero-Trust L7 / L4** | CiliumNetworkPolicy eBPF FQDN | CiliumNetworkPolicy eBPF FQDN (Retenido para paridad L7; fallback a Flannel L4 solo si no se requiere FQDN) | Envoy Egress Gateway proxy |
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
- [x] **Poda de Exporters Satélites Locales (Fase B)**: Reemplazo de `postgres-exporter` y `redis-exporter` por componentes embebidos nativos en Grafana Alloy (`prometheus.exporter.postgres` y `prometheus.exporter.redis`), eliminando contenedores satélites de `docker-compose.dev.yml` y `Taskfile.yml`.
- [x] **Poda de Arquitectura en Proxmox VE (Minimal Viable Platform)**: Adopción de `checksum/config` nativo en Helm (sustituyendo Reloader), desactivación explícita de PgBouncer (delegando al pool nativo `pg.Pool`), retención canónica de ESO conectado a HashiCorp Vault en LXC (conforme a commit #206), instrumentación W3C nativa sin eBPF intrusivo en LXC, y telemetría consolidada en Grafana Alloy con huella < 1 GB RAM total.

