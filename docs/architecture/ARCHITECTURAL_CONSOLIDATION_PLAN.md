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
* **Acción de Poda (Fase A):**
  - **Desmantelar Envoy Egress Gateway** (`infra/helm/pokedex/templates/egress-gateway.yaml`).
  - **Consolidar en Cilium eBPF** (`CiliumNetworkPolicy`) como estándar único Zero-Trust L7 para entornos con Cilium CNI, y NetworkPolicies estándar como baseline L4.

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

---

## 3. Política de Contención: "Una Sola Herramienta por Dominio"

Para salvaguardar la mantenibilidad del proyecto a largo plazo, se adopta la regla estricta:

| Dominio Operativo | Herramienta Autorizada | Alternativas Descartadas / Desmanteladas |
|---|---|---|
| **GitOps** | ArgoCD (targetRevision fija por release) | Scripts de deploy imperativos |
| **Ingress & TLS** | cert-manager + Nginx Ingress / ALB | Gestión manual de certificados |
| **Zero-Trust L7** | CiliumNetworkPolicy eBPF FQDN | Envoy Egress Gateway proxy |
| **Telemetría** | Grafana Alloy + Grafana Cloud OTLP | Stack de monitoreo local legado (`docker_monitoreo`) |
| **Auditoría de Imagen** | Trivy (SCA/SBOM) + Cosign (Keyless) | Múltiples scanners redundantes |
| **Disaster Recovery** | `backup-cronjob` + `backup-restore-verify` | Scripts manuales ad-hoc sin restore drill |

---

## 4. Estado de Implementación

- [x] Retiro de `docker_monitoreo` y targets legacy en `Taskfile.yml`.
- [x] Unificación de telemetría dev/cloud en Grafana Alloy y OTLP.
- [x] Inmutabilidad estricta por SHA-256 digest pinning en GitOps (`aws`, `proxmox`).
- [x] Formalización del CronJob de verificación periódica de Disaster Recovery (`dr-restore-verify`).
- [ ] Poda de `egress-gateway.yaml` (programada para el próximo ciclo de refactorización de Helm).
