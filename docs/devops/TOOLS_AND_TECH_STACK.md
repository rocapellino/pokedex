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
| Categoría | Herramienta | Uso en el Proyecto | Archivo / Configuración |
|---|---|---|---|
| **Backend & API** | **Node.js 22 LTS / Express 4.21** | Servidor HTTP de alto rendimiento, rate limiting y métricas nativas | [`server.ts`](file:///server.ts) |
| **Lenguaje Backend** | **TypeScript 5.7** | Tipado estático estricto, interfaces de dominio y calidad de código | [`tsconfig.json`](file:///tsconfig.json), [`src/types.ts`](file:///src/types.ts) |
| **Compilador & Bundler** | **esbuild** | Empaquetado ultrarrápido a CommonJS para runtime optimizado en producción | [`package.json`](file:///package.json) |
| **Frontend Web** | **Vanilla JS / HTML5 / CSS3** | Catálogo Pokédex interactivo, selector de temas y modal de evoluciones | [`apps/web/public/`](file:///apps/web/public/) |
| **Frontend Server** | **Nginx 1.27 (Alpine)** | Servidor web proxy inverso con compresión gzip, CSP estricto y usuario no-root | [`apps/web/nginx.conf`](file:///apps/web/nginx.conf) |
| **Type Checking / Lint** | **TypeScript Compiler (`tsc`)** | Validación de sintaxis y tipos sin emisión (`npm run lint`) | [`package.json`](file:///package.json) |
| **Performance Testing** | **k6 (Grafana k6)** | Pruebas de estrés y benchmarking de endpoints de la API como código | [`tests/performance/k6_stress_test.js`](file:///tests/performance/k6_stress_test.js) |
| **Load Testing HPA** | **Python Simulator** | Generador de carga concurrente multi-hilo para estresar y validar autoescalado | [`scripts/k8s_load_test.py`](file:///scripts/k8s_load_test.py) |
| **Seguridad SCA** | **Trivy (Aqua Security)** | Escaneo de vulnerabilidades en imágenes Docker | [`.github/workflows/security-trivy.yml`](file:///.github/workflows/security-trivy.yml) |
| **Auditoría de Paquetes** | **npm audit** | Verificación estricta de CVEs en árbol de dependencias Node.js | [`.github/workflows/api.yml`](file:///.github/workflows/api.yml) |
| **Duplicación** | **JSCPD & SHA-256 Auditor** | Detección de código y archivos duplicados en el repositorio | [`scripts/audit_code_quality.py`](file:///scripts/audit_code_quality.py) |
| **Hooks Git** | **Pre-commit** | Ejecución de validaciones automáticas antes de cada commit local | [`.pre-commit-config.yaml`](file:///.pre-commit-config.yaml) |
| **Secret Scanning** | **Gitleaks** | Detección preventiva de credenciales, tokens y secretos en el historial git | [`.gitleaks.toml`](file:///.gitleaks.toml), [`.github/workflows/security-gitleaks.yml`](file:///.github/workflows/security-gitleaks.yml) |
| **Secretos K8s** | **Bitnami Sealed Secrets** | Encriptación asimétrica de secretos para guardarlos de forma segura en Git | [`scripts/seal_secret.py`](file:///scripts/seal_secret.py), [`scripts/seal_secret.sh`](file:///scripts/seal_secret.sh) |
| **Contenedores** | **Docker & Buildx** | Empaquetado en imágenes ligeras multi-stage (desarrollo y producción) | [`Dockerfile`](file:///Dockerfile), [`apps/web/Dockerfile`](file:///apps/web/Dockerfile) |
| **Composición local** | **Docker Compose** | Orquestación local multicontenedor (API + Web + Postgres + Redis) | [`docker-compose.yml`](file:///docker-compose.yml), `docker-compose.dev.yml` |
| **Orquestación K8s** | **Helm 3** | Despliegue estandarizado en clúster con Chart parametrizado (`values.yaml`, `values.prod.yaml`) | [`infra/helm/pokedex/`](file:///infra/helm/pokedex/) |
| **GitOps** | **Argo CD** | Sincronización continua declarativa del Chart de Helm en Kubernetes (Proxmox y Cloud) | [`gitops/apps/`](file:///gitops/apps/) |
| **IaC** | **OpenTofu & Terraform** | Aprovisionamiento declarativo híbrido (Proxmox VE y AWS Cloud con OpenTofu; Multi-Cloud con TF) | [`infra/opentofu/`](file:///infra/opentofu/), [`infra/terraform/`](file:///infra/terraform/) |
| **Config Management** | **Ansible** | Automatización de configuración de servidores y hardening UFW/SSH | [`infra/ansible/`](file:///infra/ansible/) |
| **Virtualización** | **Proxmox VE** | Infraestructura de nodos y contenedores LXC con Cloud-Init | [`infra/proxmox/`](file:///infra/proxmox/), [`scripts/proxmox_deploy.sh`](file:///scripts/proxmox_deploy.sh) |
| **CI/CD** | **GitHub Actions** | Pipelines automatizados con Quality Gates paralelos (Gitleaks, Semgrep, Checkov) y escaneo Trivy | [`.github/workflows/`](file:///.github/workflows/) |
| **CI/CD Alternativo** | **Jenkins** | Pipeline declarativo enterprise adaptado a Node.js, Docker y Helm | [`Jenkinsfile`](file:///Jenkinsfile) |
| **Observabilidad & Métricas** | **Prometheus + Exporters** | Métricas nativas de la API (`/metrics`), contenedores y base de datos | `docker_monitoreo/` |
| **Logs Centralizados** | **Grafana Loki + Promtail** | Agregación e indexación de logs de stdout/stderr de contenedores con consultas LogQL | `docker_monitoreo/` |
| **Alertas & Notificaciones** | **Prometheus Alertmanager** | Detección proactiva de caídas, modo degradado y latencias altas | `docker_monitoreo/alertmanager/` |
| **Dashboards Unificados** | **Grafana** | Tableros unificados con métricas HTTP, recursos Docker y estado de BD | `docker_monitoreo/grafana/` |
| **Actualizaciones Auto** | **Renovate Bot** | Detección y apertura de PRs agrupados con auto-merge (Docker, Helm, OpenTofu, Node) | [`renovate.json`](file:///renovate.json) |
| **Automatización DX** | **Taskfile (go-task)** | Comandos unificados 100% cross-platform (`task dev`, `task build`, `task k8s:up`, etc.) | [`Taskfile.yml`](file:///Taskfile.yml) |
| **Gestión Ágil** | **Linear** | Gestión de tickets, ciclos, ramas automatizadas y PR linkbacks | [`.github/pull_request_template.md`](file:///.github/pull_request_template.md) |
| **Inteligencia Artificial** | **Google AI Studio (`@google/genai`)** | Integración nativa en backend con Gemini 2.5 Flash para mockups y diagramas | [`src/services/ai.ts`](file:///src/services/ai.ts) |



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
  * *¿Para qué sirve?* Sincronización automática y declarativa del clúster de Kubernetes con el Chart de Helm en `infra/helm/pokedex/` soportando entornos híbridos con [`gitops/apps/app-proxmox.yaml`](file:///gitops/apps/app-proxmox.yaml) y [`gitops/apps/app-cloud.yaml`](file:///gitops/apps/app-cloud.yaml).
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
