# Guía de Herramientas DevOps - Proyecto Pokédex

Esta guía documenta la integración de las **7 herramientas esenciales de DevOps** implementadas en la arquitectura de la Pokédex.

---

## 1. Git (Control de Versiones y Flujo de Trabajo)
* **Ubicación:** Raíz del proyecto.
* **Buenas Prácticas:**
  * Flujo de ramas: *Trunk-Based Development* (`main` para producción, `feature/*` para nuevas funcionalidades).
  * Hooks de pre-commit activos: [`.pre-commit-config.yaml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/.pre-commit-config.yaml) y [`.gitleaks.toml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/.gitleaks.toml) para evitar fuga de credenciales.
* **Comandos Clave:**
  ```bash
  git checkout -b feature/nueva-mejora
  git commit -m "feat(api): agregar soporte para exportacion de metricas"
  ```

---

## 2. Docker (Contenedores y Multi-Stage Builds)
* **Ubicación:** [docker-compose.yml](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/docker-compose.yml), [`docker-compose.dev.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/docker-compose.dev.yml), [`docker-compose.prod.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/docker-compose.prod.yml), [`apps/web/Dockerfile`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/apps/web/Dockerfile), [`apps/api/Dockerfile`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/apps/api/Dockerfile).
* **Arquitectura:**
  * `web`: Nginx Reverse Proxy (DMZ pública en `:8080`).
  * `api`: FastAPI ASGI Backend (`:5000` interno con Uvicorn).
  * `postgres`: PostgreSQL 16 Alpine con almacenamiento persistente.
  * `redis`: Redis 7 Alpine para caché de alta velocidad.
  * `minio`: Object Storage S3 compatible para backups y assets.
* **Comandos Clave:**
  ```powershell
  # Modo Desarrollo con Hot-Reload y puertos abiertos
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

  # Modo Producción limpio y endurecido
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  ```

---

## 3. Kubernetes (Orquestación, HPA y NetworkPolicies)
* **Ubicación:** [`infra/k8s/`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/k8s).
* **Manifiestos Destacados:**
  * `02-postgres-statefulset.yaml`: Persistencia de datos mediante PVCs.
  * `04-api-deployment.yaml` & `05-web-deployment.yaml`: Replicación y rolling updates.
  * `06-hpa-autoscaling.yaml`: Autoescalado horizontal de pods ante picos de CPU.
  * `09-network-policies.yaml`: Aislamiento de capas (Zero-Trust networking).
* **Comandos Clave:**
  ```bash
  kubectl apply -k infra/k8s/
  kubectl get pods -w
  kubectl get hpa
  ```

---

## 4. Terraform (Infraestructura como Código - IaC)
* **Ubicación:** [`infra/terraform/`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/terraform).
* **Módulos:**
  * Creación de VPC, subredes públicas/privadas, clúster gestionado (EKS/GKE) y almacenamiento.
* **Comandos Clave:**
  ```bash
  cd infra/terraform/envs/dev
  terraform init
  terraform plan
  terraform apply
  ```

---

## 5. Ansible (Gestión de Configuración y Aprovisionamiento)
* **Ubicación:** [`infra/ansible/`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/ansible).
* **Estructura:**
  * [`ansible.cfg`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/ansible/ansible.cfg): Configuración de conexiones SSH y escalamiento sudo.
  * [`inventory/hosts.ini`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/ansible/inventory/hosts.ini): Inventario de nodos K8s y servidores de aplicación.
  * [`playbooks/setup_nodes.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/ansible/playbooks/setup_nodes.yml): Instalación de Docker/containerd, módulos de kernel (`overlay`, `br_netfilter`) y apagado de Swap.
  * [`playbooks/security_hardening.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/ansible/playbooks/security_hardening.yml): Configuración de UFW Firewall y hardening de SSH.
  * [`playbooks/deploy_app.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/ansible/playbooks/deploy_app.yml): Despliegue automatizado con Docker Compose.
* **Comandos Clave:**
  ```bash
  ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/setup_nodes.yml
  ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/security_hardening.yml
  ansible-playbook -i infra/ansible/inventory/hosts.ini infra/ansible/playbooks/deploy_app.yml
  ```

---

## 6. Jenkins & GitLab CI (Pipelines de CI/CD)
* **Jenkins:** [`Jenkinsfile`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/Jenkinsfile)
  * Pipeline declarativo multi-etapa con: Linting (`flake8`), Security Scan (`gitleaks`), Unit Tests (`pytest`), Docker Build & Push, y Deploy a Kubernetes con puerta de aprobación manual para producción.
* **GitLab CI:** [`.gitlab-ci.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/.gitlab-ci.yml)
  * Etapas nativas en contenedor: `lint`, `test`, `security`, `build`, `deploy_staging`, `deploy_production`.

---

## 7. Prometheus & Grafana (Monitoreo y Observabilidad)
* **Ubicación:** [`infra/monitoring/`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/monitoring) y [docker-compose.monitoring.yml](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/docker-compose.monitoring.yml).
* **Métricas Expuestas:**
  * Endpoint en la API: `GET /metrics`
  * Métricas:
    * `pokedex_uptime_seconds`: Tiempo activo.
    * `pokedex_total_pokemons`: Cantidad total de Pokémon.
    * `pokedex_http_requests_total`: Conteo de solicitudes por método, ruta y código HTTP.
    * `pokedex_http_request_duration_seconds`: Latencia de peticiones.
* **Dashboard de Grafana:**
  * Preconfigurado en [`infra/monitoring/grafana/dashboards/pokedex_dashboard.json`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/infra/monitoring/grafana/dashboards/pokedex_dashboard.json).
  * Auto-provisioning listo con datasource Prometheus.
* **Comandos Clave:**
  ```bash
  # Iniciar la stack de monitoreo
  docker compose -f docker-compose.monitoring.yml up -d

  # Acceso web:
  # Prometheus: http://localhost:9090
  # Grafana:    http://localhost:3000 (Usuario: admin / Contraseña: admin)
  ```
