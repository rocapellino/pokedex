# 🛠️ Catálogo de Herramientas y Stack Tecnológico

Este documento describe todas las tecnologías, utilidades, frameworks y servicios integrados en el ciclo de vida del proyecto **Pokédex** (Desarrollo, CI/CD, Seguridad, Infraestructura y Gestión).

---

## 📑 Índice
1. [Herramientas Actuales del Proyecto](#1-herramientas-actuales-del-proyecto)
   * [1.1. Core & Aplicación](#11-core--aplicación)
   * [1.2. Calidad de Código & Testing](#12-calidad-de-código--testing)
   * [1.3. Seguridad](#13-seguridad)
   * [1.4. Contenedores & Orquestación](#14-contenedores--orquestación)
   * [1.5. Infraestructura como Código (IaC) & Aprovisionamiento](#15-infraestructura-como-código-iac--aprovisionamiento)
   * [1.6. CI/CD & Automatización](#16-cicd--automatización)
   * [1.7. Gestión & Seguimiento](#17-gestión--seguimiento)
2. [Herramientas Recomendadas para Integrar](#2-herramientas-recomendadas-para-integrar)

---

## 1. Herramientas Actuales del Proyecto

| Categoría | Herramienta | Uso en el Proyecto | Archivo / Configuración |
|---|---|---|---|
| **Backend** | **Python 3.13** / **FastAPI** | Framework API REST asíncrono para endpoints de Pokémon, tipos y evoluciones | [`apps/api/`](file:///apps/api) |
| **Backend** | **Pydantic v2** | Validación de tipos, schemas y serialización de datos (definidos inline en el módulo principal) | `apps/api/src/app.py` |
| **Backend** | **psycopg2 (driver nativo)** | Acceso directo a PostgreSQL sin ORM, con consultas parametrizadas y caché en Redis | `apps/api/src/db.py` |
| **Frontend** | **Vanilla JS / HTML5 / CSS3** | Interfaz de usuario interactiva y responsiva para consultar la Pokédex | [`apps/web/`](file:///apps/web) |
| **Frontend Server** | **Nginx (Alpine)** | Servidor web proxy inverso y entrega de estáticos | `apps/web/nginx.conf` |
| **Testing & Cobertura** | **Pytest + Pytest-Cov** | Suite de pruebas unitarias y reporte de cobertura de código (>75%) | [`pytest.ini`](file:///pytest.ini), `apps/api/tests/` |
| **Linter / Formatter** | **Ruff** | Linter y formateador ultrarrápido para Python (PEP8, imports, code quality) | [`ruff.toml`](file:///ruff.toml) |
| **Seguridad SAST** | **Bandit** | Análisis estático de seguridad y prevención de vulnerabilidades en Python | [`scripts/audit_code_quality.py`](file:///scripts/audit_code_quality.py) |
| **Seguridad SCA** | **Trivy (Aqua Security)** | Escaneo de vulnerabilidades en imágenes Docker y librerías | [`.github/workflows/security-trivy.yml`](file:///.github/workflows/security-trivy.yml) |
| **Complejidad** | **Radon** | Análisis de complejidad ciclomática de funciones | [`scripts/audit_code_quality.py`](file:///scripts/audit_code_quality.py) |
| **Duplicación** | **JSCPD** | Detección de código duplicado (*Copy-Paste Detector*) | [`.jscpd.json`](file:///.jscpd.json) |
| **Hooks Git** | **Pre-commit** | Ejecución de validaciones automáticas antes de cada commit local | [`.pre-commit-config.yaml`](file:///.pre-commit-config.yaml) |
| **Secret Scanning** | **Gitleaks** | Detección preventiva de credenciales, tokens y secretos en el historial git | [`.gitleaks.toml`](file:///.gitleaks.toml), [`.github/workflows/security-gitleaks.yml`](file:///.github/workflows/security-gitleaks.yml) |
| **Secretos K8s** | **Sealed Secrets (`kubeseal`)** | Encriptación asimétrica de secretos para guardarlos de forma segura en Git | [`scripts/seal_secret.py`](file:///scripts/seal_secret.py), [`scripts/seal_secret.sh`](file:///scripts/seal_secret.sh) |
| **Performance Testing** | **k6 (Grafana k6)** | Pruebas de estrés y benchmarking de endpoints de la API como código | [`tests/performance/k6_stress_test.js`](file:///tests/performance/k6_stress_test.js) |
| **Contenedores** | **Docker & Buildx** | Empaquetado en imágenes ligeras multi-stage (desarrollo y producción) | [`Dockerfile`](file:///Dockerfile), `apps/*/Dockerfile` |
| **Composición local** | **Docker Compose** | Orquestación local multicontenedor (API + Web + Postgres + Redis) | [`docker-compose.yml`](file:///docker-compose.yml), `docker-compose.dev.yml` |
| **Orquestación** | **Kubernetes (K8s)** | Despliegue en clúster con manifiestos declarativos y Kustomize | [`infra/k8s/`](file:///infra/k8s) |
| **IaC** | **Terraform** | Aprovisionamiento declarativo de infraestructura en la nube y virtualización | [`infra/terraform/`](file:///infra/terraform) |
| **Config Management** | **Ansible** | Automatización de configuración de servidores y aprovisionamiento | [`infra/ansible/`](file:///infra/ansible) |
| **Virtualización** | **Proxmox VE** | Infraestructura de nodos/VMs on-premise con scripts de automatización | [`infra/proxmox/`](file:///infra/proxmox), `scripts/proxmox_deploy.sh` |
| **CI/CD** | **GitHub Actions** | Pipelines automatizados por paths (`api`, `web`, `infra`, `security`, `ci`, `trivy`) | [`.github/workflows/`](file:///.github/workflows) |
| **CI/CD** | **Jenkins** | Pipeline declarativo alternativo enterprise con stages de build/test/audit | [`Jenkinsfile`](file:///Jenkinsfile) |
| **CI/CD** | **GitLab CI** | Pipeline multiplataforma para GitLab | [`.gitlab-ci.yml`](file:///.gitlab-ci.yml) |
| **Actualizaciones Auto** | **Dependabot** | Apertura automática de PRs consolidados (Grouped Updates) para pip, docker y actions | [`.github/dependabot.yml`](file:///.github/dependabot.yml) |
| **Automatización DX** | **Taskfile (go-task)** | Comandos unificados 100% cross-platform (`task test`, `task dev`, `task audit`, etc.) | [`Taskfile.yml`](file:///Taskfile.yml) |
| **Gestión Ágil** | **Linear** | Gestión de tickets, ciclos, ramas automatizadas y PR linkbacks | [`.github/pull_request_template.md`](file:///.github/pull_request_template.md) |
| **Inteligencia Artificial** | **Google AI Studio (Gemini & Imagen)** | Generación de diagramas de arquitectura, mockups UI y assets visuales | [`apps/api/src/ai_service.py`](file:///apps/api/src/ai_service.py), [`scripts/ai_tools.py`](file:///scripts/ai_tools.py) |



---

## 2. Herramientas Recomendadas para Integrar

A continuación se presentan herramientas de alto impacto divididas por área que llevarían el proyecto al siguiente nivel:

### 🛡️ 1. Seguridad de Contenedores y Dependencias (SCA & SAST)
* **Trivy (Aqua Security):**
  * *¿Para qué sirve?* Escaneo de vulnerabilidades (CVEs) en imágenes Docker (`Dockerfile`) y dependencias de Python (`requirements.txt`).
  * *Implementación:* Añadir un paso en GitHub Actions con `aquasecurity/trivy-action`.
* **Bandit:**
  * *¿Para qué sirve?* Análisis estático de seguridad (SAST) específico para Python. Detecta inyecciones SQL, uso inseguro de `subprocess`, `assert` en producción, etc.
  * *Implementación:* Ejecutable en `scripts/audit_code_quality.py` o pre-commit.
* **Renovate / Dependabot:**
  * *¿Para qué sirve?* Apertura automática de PRs cuando hay actualizaciones o parches de seguridad en paquetes de Python, imágenes base de Docker o GitHub Actions.

---

### 📊 2. Pruebas de Carga y Rendimiento (Performance Testing)
* **k6 (Grafana k6) o Locust:**
  * *¿Para qué sirve?* Reemplazar scripts básicos de prueba de carga con escenarios realistas (curvas de carga, umbrales de latencia P95/P99, tasa de errores) definidos en código.
  * *Implementación:* Ejecutar tests de k6 en CI antes de desplegar a producción.

---

### 📈 3. Cobertura y Métricas de Calidad
* **Pytest-Cov + Codecov / Coverage Gutters:**
  * *¿Para qué sirve?* Medir el porcentaje exacto de líneas de código cubiertas por pruebas unitarias y bloquear PRs que disminuyan la cobertura mínima (ej. 85%).
* **SonarCloud / SonarQube:**
  * *¿Para qué sirve?* Panel unificado de deuda técnica, duplicación, code smells, vulnerabilidades y cobertura.

---

### 🔄 4. GitOps & Entrega Continua (CD)
* **Argo CD:**
  * *¿Para qué sirve?* Sincronización automática y declarativa del clúster de Kubernetes con la carpeta `infra/k8s/` del repositorio (Git como única fuente de verdad).
* **TFLint & Checkov / tfsec:**
  * *¿Para qué sirve?* Linter de mejores prácticas de Terraform y escáner de seguridad para IaC (detecta puertos abiertos, permisos excesivos en K8s o buckets inseguros).

---

### 🔭 5. Observabilidad & Tracing Distribuido
* **OpenTelemetry + Jaeger / Grafana Tempo:**
  * *¿Para qué sirve?* Trazabilidad distribuida (*Distributed Tracing*) para medir tiempos exactos de cada request HTTP, consultas a PostgreSQL y llamadas a Redis.
* **Prometheus & Grafana (Docker Monitoreo):**
  * *¿Para qué sirve?* Ya dispones del stack en tu workspace `docker_monitoreo`; instrumentar métricas de FastAPI (`prometheus-fastapi-instrumentator`) para ver RPS, errores 5xx y latencia en dashboards en tiempo real.

---

### ⚡ 6. Experiencia de Desarrollo (DX)
* **Taskfile (`task` - go-task):**
  * *¿Para qué sirve?* Unificar comandos largos entre Windows, Linux y macOS (ej: `task dev`, `task test`, `task lint`, `task docker:up`) mediante un único ejecutable sin dependencias de shells UNIX ni emuladores.
* **Linear MCP Server:**
  * *¿Para qué sirve?* Conectar Linear mediante Model Context Protocol para crear y consultar tickets directamente desde el asistente de IA en el IDE.
