# Guía de Herramientas DevOps - Proyecto Pokédex

Esta guía documenta la integración de las **7 herramientas esenciales de DevOps** implementadas en la arquitectura de la Pokédex.

---

## 1. Git (Control de Versiones y Flujo de Trabajo)
* **Ubicación:** Raíz del proyecto.
* **Buenas Prácticas:**
  * Flujo de ramas: *Trunk-Based Development* (`main` para producción, `feature/*` para nuevas funcionalidades).
  * Hooks de pre-commit activos: [`.pre-commit-config.yaml`](../.pre-commit-config.yaml) y [`.gitleaks.toml`](../.gitleaks.toml) para evitar fuga de credenciales.
* **Comandos Clave:**
  ```bash
  git checkout -b feature/nueva-mejora
  git commit -m "feat(api): agregar soporte para exportacion de metricas"
  ```

---

## 2. Docker (Contenedores y Multi-Stage Builds)
* **Ubicación:** [`docker-compose.yml`](../docker-compose.yml), [`docker-compose.dev.yml`](../docker-compose.dev.yml), [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`apps/web/Dockerfile`](../apps/web/Dockerfile), [`apps/api/Dockerfile`](../apps/api/Dockerfile).
* **Arquitectura:**
  * `web`: Nginx Reverse Proxy (DMZ pública en `:8080`).
  * `api`: FastAPI ASGI Backend (`:5000` interno con Uvicorn).
  * `postgres`: PostgreSQL 16 Alpine con almacenamiento persistente.
  * `redis`: Redis 7 Alpine para caché de alta velocidad.
* **Comandos Clave:**
  ```powershell
  # Modo Desarrollo con Hot-Reload y puertos abiertos
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

  # Modo Producción limpio y endurecido
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  ```

---

## 3. Kubernetes & Helm 3 (Orquestación, HPA, GitOps y NetworkPolicies)
* **Ubicación:** [`infra/helm/pokedex/`](../infra/helm/pokedex).
* **Componentes Principales (Templates):**
  * `postgres-statefulset.yaml`: Persistencia de datos mediante PVCs.
  * `api-deployment.yaml` & `web-deployment.yaml`: Replicación y rolling updates.
  * `api-hpa.yaml` & `web-hpa.yaml`: Autoescalado horizontal de pods ante picos de CPU y memoria.
  * `network-policies.yaml`: Aislamiento estricto de capas (Zero-Trust networking).
  * `values.yaml` / `values.prod.yaml`: Parametrización desacoplada por entorno.
* **Comandos Clave:**
  ```bash
  # Despliegue / Actualización con Helm
  helm upgrade --install pokedex ./infra/helm/pokedex -n pokemon-app --create-namespace

  # Despliegue con perfil de producción
  helm upgrade --install pokedex ./infra/helm/pokedex -n pokemon-app -f ./infra/helm/pokedex/values.prod.yaml

  # Monitoreo de estado
  kubectl get pods,svc,hpa,ingress -n pokemon-app
  ```

---

## 4. Terraform (Infraestructura como Código - IaC Multi-Cloud)
* **Ubicación:** [`infra/terraform/`](../infra/terraform).
* **Módulos Multi-Cloud:**
  * Soporte desacoplado para **Google Cloud (GCP)**, **Amazon Web Services (AWS)**, **Microsoft Azure** y **Proxmox VE**.
  * Aprovisionamiento de VPC/VNet, cómputo serverless de contenedores, PostgreSQL administrado, Redis en caché y almacenamiento de objetos/CDN.
* **Comandos Clave por Nube:**
  ```bash
  # Despliegue en GCP
  cd infra/terraform/envs/gcp/dev && terraform init && terraform plan

  # Despliegue en AWS
  cd infra/terraform/envs/aws/dev && terraform init && terraform plan

  # Despliegue en Azure
  cd infra/terraform/envs/azure/dev && terraform init && terraform plan

  # Despliegue en Proxmox VE
  cd infra/terraform/envs/proxmox/dev && terraform init && terraform plan
  ```

---

## 5. Ansible (Gestión de Configuración y Aprovisionamiento)
* **Ubicación:** [`infra/ansible/`](../infra/ansible).
* **Estructura:**
  * [`ansible.cfg`](../infra/ansible/ansible.cfg): Configuración de conexiones SSH y escalamiento sudo.
  * [`inventory/hosts.ini`](../infra/ansible/inventory/hosts.ini): Inventario de nodos K8s y servidores de aplicación.
  * [`playbooks/setup_nodes.yml`](../infra/ansible/playbooks/setup_nodes.yml): Instalación de Docker/containerd, módulos de kernel (`overlay`, `br_netfilter`) y apagado de Swap.
  * [`playbooks/security_hardening.yml`](../infra/ansible/playbooks/security_hardening.yml): Configuración de UFW Firewall y hardening de SSH.
  * [`playbooks/deploy_app.yml`](../infra/ansible/playbooks/deploy_app.yml): Despliegue automatizado con Docker Compose.
* **Comandos Clave:**
  ```bash
  ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/setup_nodes.yml
  ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/security_hardening.yml
  ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/deploy_app.yml
  ```

---

## 6. Jenkins & GitLab CI (Pipelines de CI/CD)
* **Jenkins Controller:**
  * **Ubicación:** Repositorio independiente [`docker_jenkins`](https://github.com/rocapellino/docker_jenkins).
  * **Servidor en Docker:** Jenkins LTS (JDK 21) en puerto `8090` con Docker CLI, buildx, compose plugin, kubectl y Python 3 preinstalados.
  * **Pipeline Declarativo:** [`Jenkinsfile`](../Jenkinsfile) con etapas de: Linting (`flake8`/`ruff`), Security Scan (`gitleaks`), Unit Tests (`pytest`), Docker Build & Push, y Deploy a Kubernetes.
  * **Comandos Clave (desde el repositorio `docker_jenkins`):**
    ```bash
    # Iniciar Jenkins Controller
    docker compose up --build -d

    # Ver contraseña inicial de admin
    docker exec jenkins-server cat /var/jenkins_home/secrets/initialAdminPassword

    # Web UI: http://localhost:8090
    ```
* **GitLab CI:** [`.gitlab-ci.yml`](../.gitlab-ci.yml)
  * Etapas nativas en contenedor: `lint`, `test`, `security`, `build`, `deploy_staging`, `deploy_production`.

---

## 7. Stack de Observabilidad (Prometheus, Grafana, Loki, Tempo y más)

* **Ubicación:** Repositorio independiente [`docker_monitoreo`](https://github.com/rocapellino/docker_monitoreo).
* **Documentación completa:** [`docker_monitoreo/docs/componentes.md`](https://github.com/rocapellino/monitoreo/blob/main/docs/componentes.md)

### Componentes del Stack (10 servicios)

| Servicio | Puerto | Rol |
|---|---|---|
| **Prometheus** | `9090` | TSDB — recolecta métricas de todas las apps vía scrape cada 10s |
| **Alertmanager** | `9093` | Gestiona, agrupa y enruta alertas (Slack, email, webhooks) |
| **Grafana** | `3000` | Dashboards unificados de métricas, logs y trazas |
| **Node Exporter** | `9100` | Métricas de hardware y SO del host (CPU, RAM, disco, red) |
| **cAdvisor** | `8085` | Métricas de consumo por contenedor Docker individual |
| **Loki** | `3100` | Base de datos de logs centralizada (como Prometheus pero para logs) |
| **Promtail** | — | Recolector de logs: detecta contenedores automáticamente vía Docker socket |
| **Grafana Tempo** | `3200/4317/4318` | Almacén de trazas distribuidas OpenTelemetry (OTLP) |
| **PostgreSQL Exporter** | `9187` | Traduce estadísticas internas de PostgreSQL a métricas Prometheus |
| **Redis Exporter** | `9121` | Traduce estadísticas de Redis (hit ratio, memoria, comandos) a métricas Prometheus |

### Métricas Expuestas por la API Pokédex

Endpoint en la API: `GET /metrics`

* `pokedex_uptime_seconds` — Tiempo activo de la API.
* `pokedex_total_pokemons` — Cantidad total de Pokémon en la base de datos.
* `pokedex_http_requests_total` — Conteo de solicitudes por método, ruta y código HTTP.
* `pokedex_http_request_duration_seconds` — Histograma de latencia de peticiones.

### Integración con el Stack de Monitoreo

La Pokédex está integrada con el stack de monitoreo a través de:
1. **Red `monitoring-net`** — Los contenedores de la API, PostgreSQL y Redis son accesibles desde el stack de monitoreo vía esta red compartida.
2. **Target dinámico en Prometheus** — Configurado en `docker_monitoreo/prometheus/targets/pokedex.yml`, detectado automáticamente sin reiniciar Prometheus.
3. **Logs automáticos en Loki** — Promtail detecta y recolecta los logs de todos los contenedores de Pokédex sin ninguna configuración adicional.
4. **Dashboard de Grafana provisionado** — `Pokédex DevOps - Monitor Unificado de Rendimiento & Observabilidad` disponible en http://localhost:3000 al levantar el stack de monitoreo.

### Comandos Clave (desde el repositorio `docker_monitoreo`)
```bash
# Iniciar el stack de monitoreo
docker compose up -d

# Acceso web:
# Grafana:      http://localhost:3000  (admin / admin)
# Prometheus:   http://localhost:9090
# Alertmanager: http://localhost:9093
# cAdvisor:     http://localhost:8085
```
