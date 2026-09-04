# ⚡ Plataforma Pokémon DevOps: Monorepo & Cloud-Native Architecture

[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21+-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![Google AI Studio](https://img.shields.io/badge/Google_AI_Studio-Gemini_2.5_Flash-4285F4?style=flat&logo=google&logoColor=white)](https://aistudio.google.com/)
[![Docker](https://img.shields.io/badge/Docker-27+-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.30+-326CE5?style=flat&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Helm](https://img.shields.io/badge/Helm-3.17-0F1689?style=flat&logo=helm&logoColor=white)](https://helm.sh/)
[![Security: Gitleaks](https://img.shields.io/badge/Security-Gitleaks_Protected-green?style=flat&logo=shield)](https://github.com/gitleaks/gitleaks)

Este repositorio implementa una solución completa de ingeniería **DevOps, Full-Stack y Cloud-Native** para la plataforma **Pokédex**, basada en un servicio de alto rendimiento en **Node.js 22 LTS y TypeScript 5.7** con integración a **Google AI Studio (Gemini 2.5 Flash)**, catálogo indexado en memoria $O(1)$, orquestación unificada en **Helm 3**, empaquetado multi-stage y un estricto modelo de **Hardening de Seguridad**.

---

## 📑 Tabla de Contenidos

1. [Arquitectura del Sistema](#1-arquitectura-del-sistema)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Seguridad y Hardening Implementado](#3-seguridad-y-hardening-implementado)
4. [Inicio Rápido (Quickstart)](#4-inicio-rápido-quickstart)
   * [Paso Previo: Configuración de Variables de Entorno](#paso-previo-configuración-de-variables-de-entorno)
   * [Opción 1: Ejecución Nativa con Node.js](#opción-1-ejecución-nativa-con-nodejs-desarrollo-local)
   * [Opción 2: Ejecución con Docker Compose](#opción-2-ejecución-con-docker-compose-multi-contenedor)
   * [Opción 3: Despliegue en Kubernetes con Helm 3](#opción-3-despliegue-en-kubernetes-con-helm-3)
   * [Opción 4: Despliegue en Proxmox VE](#opción-4-despliegue-en-proxmox-ve-on-premises)
   * [Opción 5: Aprovisionamiento Multi-Cloud con Terraform](#opción-5-aprovisionamiento-multi-cloud-con-terraform)
5. [Pruebas Automatizadas y Auditoría de Código](#5-pruebas-automatizadas-y-auditoría-de-código)
6. [Gestión Segura de Secretos](#6-gestión-segura-de-secretos)
7. [Centro de Documentación Técnica (`docs/`)](#7-centro-de-documentación-técnica-docs)

---

## 1. Arquitectura del Sistema

El ecosistema aplica el principio de **Defensa en Profundidad (DMZ de 3 capas)** y separación de responsabilidades:

```text
                             [ Usuarios / Navegadores ]
                                         │
                                         ▼ (HTTP :80 / :8080)
               ┌──────────────────────────────────────────────────┐
               │    Capa 1: Ingress / Nginx Reverse Proxy (DMZ)    │
               │  • Servido de estáticos HTML5/CSS3/JS Vanilla    │
               │  • Cabeceras de seguridad estrictas (CSP, CORS)  │
               └─────────────────────────┬────────────────────────┘
                                         │
                                         ▼ (HTTP interno :3000)
               ┌──────────────────────────────────────────────────┐
               │   Capa 2: Backend Pokédex Server (Express + TS)  │
               │  • Rate Limiting (Ventana deslizante en memoria) │
               │  • Autenticación Timing-Safe (SHA-256 + crypto)  │
               │  • Catálogo indexado en memoria O(1) con ETags   │
               │  • Exportador nativo de métricas (/metrics)      │
               └──────────────┬───────────────────┬───────────────┘
                              │                   │
                              ▼ (PokeAPI / SDK)   ▼ (SDK @google/genai)
                   ┌──────────────────┐   ┌────────────────────────┐
                   │  Catálogo PokéAPI│   │   Google AI Studio     │
                   │  (1.025 Pokémon) │   │   (Gemini 2.5 Flash)   │
                   └──────────────────┘   └────────────────────────┘
                              │
                              ▼ (Capa 3: Persistencia Segura)
               ┌──────────────────────────────────────────────────┐
               │  PostgreSQL 16 StatefulSet + Redis 7 Caché       │
               │  (Aislamiento total con Kubernetes NetworkPolicy)│
               └──────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Backend & API** | Node.js 22 LTS / Express 4.21 | Servidor HTTP REST, middlewares de seguridad, rate limiting y métricas. |
| **Lenguaje Core** | TypeScript 5.7 | Tipado estático estricto, interfaces de dominio y calidad de código. |
| **Compilador & Bundler** | esbuild | Compilación ultrarrápida a CommonJS optimizado para producción. |
| **Frontend Web** | HTML5, CSS3 Tokens, JS Vanilla | Catálogo interactivo, selector de tema (Claro/Oscuro/Sistema) y modales. |
| **Proxy & Web Server** | Nginx 1.27 Alpine | Proxy inverso, compresión gzip, CSP estricto y usuario no-root. |
| **Inteligencia Artificial**| `@google/genai` (Gemini 2.5 Flash) | Generación de diagramas Mermaid y mockups UI con fallbacks resilientes. |
| **Orquestación Cloud** | Kubernetes & Helm 3 | Despliegue estandarizado, HPA v2, PDB, NetworkPolicies y GitOps. |
| **Infraestructura (IaC)** | Terraform & Ansible | Aprovisionamiento Multi-Cloud (AWS, GCP, Azure, Proxmox) y hardening. |
| **Testing & Rendimiento** | Grafana k6 & Python Simulator | Pruebas de estrés concurrentes y validación dinámica de autoescalado. |
| **Seguridad & SAST/SCA** | Gitleaks & Trivy | Escaneo continuo de secretos en Git y auditoría de vulnerabilidades en imágenes. |

---

## 3. Seguridad y Hardening Implementado

* 🛡️ **Prevención Estricta de XSS:** Sanitización exhaustiva de contenido dinámico y uso estricto de `textContent` en notificaciones Toast y modales.
* ⏱️ **Protección contra Timing Attacks:** Validación de claves administrativas y de microservicios mediante hashes SHA-256 de longitud fija y comparación en tiempo constante con `crypto.timingSafeEqual`.
* 🚦 **Rate Limiting Adaptativo:** Ventana deslizante de 60 segundos (10 req/min para IA, 30 req/min para mutaciones CRUD), respondiendo con código HTTP `429` y cabecera estándar `Retry-After`.
* 📦 **Límites de Carga Útil (Payload Limits):** Parser JSON restringido a 250 KB y validación estricta de esquema para prevenir ataques de denegación de servicio (DoS).
* 🔒 **Cabeceras HTTP Defensivas:** Deshabilitación de `X-Powered-By`, activación de `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` y `Content-Security-Policy`.
* 👤 **Principios de Menor Privilegio:** Contenedores configurados con usuarios sin privilegios (`node` en la API y `nginx` en el frontend), con sistemas de archivos de solo lectura donde corresponde.

---

## 4. Inicio Rápido (Quickstart)

### 🔑 Paso Previo: Configuración de Variables de Entorno

El repositorio implementa una **política de Cero Secretos en Git**. Copia la plantilla [`.env.example`](.env.example) para tu entorno local:

```bash
cp .env.example .env
```

> [!WARNING]
> **Nunca guardes credenciales de producción en el archivo `.env` local ni las comitees en Git.**
> Utiliza valores locales ficticios para desarrollo y consulta la [Sección 6](#6-gestión-segura-de-secretos) para producción.

---

### Opción 1: Ejecución Nativa con Node.js (Desarrollo Local)

```bash
# 1. Instalar dependencias del proyecto
npm install

# 2. Iniciar servidor en modo desarrollo (recarga automática con tsx)
npm run dev

# 3. Verificar tipos y compilar bundle
npm run lint
npm run build
```

* 🖥️ **Catálogo Pokédex:** [http://localhost:3000/](http://localhost:3000/)
* 🛠️ **Backoffice Admin:** [http://localhost:3000/backoffice](http://localhost:3000/backoffice)
* 🩺 **Health Probes:** [http://localhost:3000/healthz](http://localhost:3000/healthz)
* 📊 **Métricas Prometheus:** [http://localhost:3000/metrics](http://localhost:3000/metrics)

---

### Opción 2: Ejecución con Docker Compose (Multi-Contenedor)

```bash
# Modo Desarrollo (Hot-Reload y puertos expuestos para inspección)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Modo Producción (Contenedores endurecidos y redes aisladas)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Detener el stack
docker compose down
```

---

### Opción 3: Despliegue en Kubernetes con Helm 3

```bash
# 1. Validar sintaxis y buenas prácticas del Chart
helm lint infra/helm/pokedex

# 2. Desplegar en clúster local (minikube, kind o Docker Desktop)
helm upgrade --install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --create-namespace

# 3. Despliegue en Producción con perfil de alta disponibilidad
helm upgrade --install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --create-namespace \
  -f ./infra/helm/pokedex/values.prod.yaml

# 4. Verificar estado de los Pods y el HPA
kubectl get pods,svc,hpa,ingress -n pokemon-app
```

---

### Opción 4: Despliegue en Proxmox VE (On-Premises)

```bash
# Ejecución mediante el script automatizado (especificando host y usuario seguro)
bash scripts/proxmox_deploy.sh "<PROXMOX_HOST>" "<REMOTE_USER>" 22

# O mediante Taskfile:
task deploy:proxmox -- "<PROXMOX_HOST>" "<REMOTE_USER>"
```

---

### Opción 5: Aprovisionamiento Multi-Cloud con Terraform

```bash
# Google Cloud Platform (GCP)
cd infra/terraform/envs/gcp/dev && terraform init && terraform plan

# Amazon Web Services (AWS)
cd infra/terraform/envs/aws/dev && terraform init && terraform plan

# Microsoft Azure
cd infra/terraform/envs/azure/dev && terraform init && terraform plan
```

---

## 5. Pruebas Automatizadas y Auditoría de Código

La calidad e integridad del monorepo se valida mediante suites de pruebas continuas y tareas unificadas con **Taskfile**:

```bash
# Verificación estricta de tipos de TypeScript (cero errores)
task lint       # o: npm run lint

# Compilación y empaquetado optimizado con esbuild
task build      # o: npm run build

# Pruebas de rendimiento y estrés con Grafana k6
task perf       # o: k6 run tests/performance/k6_stress_test.js

# Simulador de carga concurrente multi-hilo para estresar HPA
task test:load  # o: python scripts/k8s_load_test.py --concurrency 50

# Detección preventiva de credenciales con Gitleaks
task secrets:scan

# Auditoría de duplicación de archivos e integridad
task audit
```

---

## 6. Gestión Segura de Secretos

Para evitar fugas de información y garantizar el cumplimiento de normativas de seguridad:

1. **Pre-commit Hooks & Gitleaks:** Cada commit local y Pull Request es analizado por Gitleaks para bloquear credenciales antes de que ingresen al historial.
2. **Kubernetes GitOps con Bitnami Sealed Secrets:** En producción, los secretos se cifran asimétricamente de modo que únicamente el controlador del clúster puede descifrarlos. Los archivos `SealedSecret` son seguros para versionar en Git:
   ```bash
   task secrets:seal
   # Genera: infra/helm/pokedex/templates/sealed-secrets.yaml
   ```
3. **Divulgación Responsable:** Si descubres una vulnerabilidad potencial de seguridad en este proyecto, por favor repórtala de forma confidencial a través de los canales privados de seguridad del equipo en lugar de abrir un issue público.

---

## 7. Centro de Documentación Técnica (`docs/`)

Para profundizar en los detalles técnicos de cada componente, consulta las guías dedicadas:

| Área | Documento Canónico | Descripción |
| :--- | :--- | :--- |
| **Helm & K8s** | ⎈ [**HELM_DEPLOYMENT_GUIDE.md**](file:///docs/runbooks/HELM_DEPLOYMENT_GUIDE.md) | Manual de operaciones con Helm 3, perfiles, hooks y GitOps. |
| **CI/CD** | 🤖 [**GITHUB_WORKFLOWS_GUIDE.md**](file:///docs/devops/GITHUB_WORKFLOWS_GUIDE.md) | Catálogo de pipelines de GitHub Actions y path filtering. |
| **Rendimiento** | 🧪 [**STRESS_TESTING_GUIDE.md**](file:///docs/runbooks/STRESS_TESTING_GUIDE.md) | Guía de pruebas de carga k6 y validación dinámica de autoescalado HPA. |
| **Herramientas** | 🛠️ [**TOOLS_AND_TECH_STACK.md**](file:///docs/devops/TOOLS_AND_TECH_STACK.md) | Catálogo tecnológico y arquitectura de observabilidad. |
| **Git Flow** | 🌿 [**GIT_BRANCHING_AND_MERGE_WORKFLOW.md**](file:///docs/devops/GIT_BRANCHING_AND_MERGE_WORKFLOW.md) | Estrategia de ramas, Conventional Commits y ciclo de PRs. |
| **Monorepo** | 📂 [**MONOREPO_STRUCTURE.md**](file:///docs/architecture/MONOREPO_STRUCTURE.md) | Estructura de directorios y organización por dominios. |
| **Proxmox** | 🖥️ [**PROXMOX_DEPLOYMENT_GUIDE.md**](file:///docs/architecture/PROXMOX_DEPLOYMENT_GUIDE.md) | Despliegue en virtualización on-premises (LXC & Cloud-Init). |
| **Multi-Cloud** | ☁️ [**CLOUD_INFRASTRUCTURE_DESIGN.md**](file:///docs/architecture/CLOUD_INFRASTRUCTURE_DESIGN.md) | Arquitectura multi-nube con Terraform (AWS, GCP, Azure). |
| **Seguridad Red**| 🛡️ [**SECURITY_AND_NETWORK_ISOLATION.md**](file:///docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md) | Segmentación DMZ, políticas Zero-Trust y NetworkPolicies. |
| **Secretos** | 🔐 [**SECRETS_MANAGEMENT_SEALED_SECRETS.md**](file:///docs/architecture/SECRETS_MANAGEMENT_SEALED_SECRETS.md) | Gestión de credenciales, `.env` y Bitnami Sealed Secrets. |
| **Contenedores**| 🐳 [**MEJORES_PRACTICAS_DOCKERFILE.md**](file:///docs/best-practices/MEJORES_PRACTICAS_DOCKERFILE.md) | Directrices para Dockerfiles seguros y multi-stage optimizados. |
| **API REST** | 📡 [**API_SPECIFICATION.md**](file:///docs/api/API_SPECIFICATION.md) | Especificación formal de contratos REST, códigos de estado y schemas. |
| **Escalabilidad**| ☸️ [**KUBERNETES_SCALING_ANALYSIS.md**](file:///docs/architecture/KUBERNETES_SCALING_ANALYSIS.md) | Análisis de escalado horizontal HPA y balanceo L4/L7. |
