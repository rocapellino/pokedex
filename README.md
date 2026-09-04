# ⚡ Plataforma Pokémon DevOps: Monorepo & Cloud-Native Architecture

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Express](https://img.shields.io/badge/Express-4.21+-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/) [![Google AI Studio](https://img.shields.io/badge/Google_AI_Studio-Gemini_2.5-4285F4?style=flat&logo=google&logoColor=white)](https://aistudio.google.com/) [![Docker](https://img.shields.io/badge/Docker-29.0+-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/) [![Kubernetes](https://img.shields.io/badge/Kubernetes-1.36+-326CE5?style=flat&logo=kubernetes&logoColor=white)](https://kubernetes.io/) [![Helm](https://img.shields.io/badge/Helm-3.17-0F1689?style=flat&logo=helm&logoColor=white)](https://helm.sh/)

Este repositorio implementa una solución completa de ingeniería **DevOps, Full-Stack y Cloud-Native** para la plataforma **Pokédex**, migrada a un servicio nativo de alto rendimiento en **Node.js y TypeScript** con integración a **Google AI Studio (Gemini)**, catálogo indexado en memoria $O(1)$, contenerización multi-stage y un esquema riguroso de **Hardening de Seguridad** (defensa contra XSS, timing attacks y DoS).

---

## 📑 Tabla de Contenidos
1. [Resumen General y Arquitectura](#1-resumen-general-y-arquitectura)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Seguridad y Hardening Implementado](#3-seguridad-y-hardening-implementado)
4. [Inicio Rápido (Quickstart)](#4-inicio-rápido-quickstart)
   * [Opción 1: Ejecución Nativa con Node.js (Recomendado para Desarrollo)](#opción-1-ejecución-nativa-con-nodejs-recomendado-para-desarrollo)
   * [Opción 2: Ejecución con Docker Multi-Stage](#opción-2-ejecución-con-docker-multi-stage)
   * [Opción 3: Despliegue en Kubernetes y Helm](#opción-3-despliegue-en-kubernetes-y-helm)
5. [Pruebas Automatizadas y Validación](#5-pruebas-automatizadas-y-validación)
6. [Centro de Documentación (`docs/`)](#6-centro-de-documentación-docs)

---

## 1. Resumen General y Arquitectura

El ecosistema unifica el backend REST, el proxy de servicios y la entrega de frontend en un único microservicio reactivo y seguro:

```
                              [ Usuarios / Navegadores ]
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │    External Load Balancer / Ingress     │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼ (Puerto 3000)
                     ┌─────────────────────────────────────────┐
                     │   Pokédex Full-Stack Server (Express)   │
                     │  • Rate Limiting (Ventana Deslizante)   │
                     │  • Timing-Safe Auth (crypto SHA-256)    │
                     │  • Security Headers & Input Bounds      │
                     └─────────┬───────────────────┬───────────┘
                               │                   │
                ┌──────────────┴─────────┐         │ (SDK @google/genai)
                ▼                        ▼         ▼
     ┌─────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
     │   Public Catalog    │  │ Backoffice Management │  │   Google AI Studio    │
     │  (Vanilla JS + CSS) │  │  (CRUD + Observability│  │   (Gemini 2.5 Flash)  │
     └─────────────────────┘  └───────────────────────┘  └───────────────────────┘
                │                        │
                └──────────────┬─────────┘
                               ▼
     ┌────────────────────────────────────────────────────────┐
     │  In-Memory Fast Store & Map Indexing O(1) con ETags    │
     │  (/healthz • /readyz • /metrics Prometheus)            │
     └────────────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Full-Stack Runtime** | Node.js 22 LTS / TypeScript 5.7 | Servidor unificado de alto rendimiento compilado con esbuild. |
| **Framework Web** | Express 4.21 | Ruteo REST, middlewares de seguridad, rate limiting y servido estático. |
| **Frontend & UI** | HTML5, CSS3 Tokens, JS Vanilla | Catálogo Pokédex dinámico y Backoffice CRUD con sanitización XSS. |
| **Inteligencia Artificial**| `@google/genai` (Gemini 2.5 Flash) | Generación asistida de diagramas Mermaid, mockups UI e ilustraciones. |
| **Almacenamiento** | In-Memory Data Store & `Map<number, Pokemon>` | Consultas $O(1)$ por ID, validación de caché condicional vía ETag. |
| **Observabilidad** | Prometheus Metrics (`/metrics`) | Exportador nativo de métricas de rendimiento, uptime y peticiones HTTP. |
| **Contenerización** | Docker Multi-Stage (Alpine) | Imagen ultra-ligera (<150 MB) con ejecución bajo usuario sin privilegios `node`. |
| **Orquestación Cloud**| Kubernetes / Helm 3 | Despliegue elástico, autoescalado horizontal (HPA) y manifiestos declarativos. |

---

## 3. Seguridad y Hardening Implementado

Tras una auditoría exhaustiva de seguridad, se incorporaron las siguientes protecciones en la arquitectura:

* 🛡️ **Prevención Estricta de XSS:** Sanitización con `escapeHTML()` de todos los nodos del árbol de evoluciones y refactorización a `textContent` en notificaciones Toast.
* ⏱️ **Protección contra Timing Attacks:** Validación de claves administrativas y de IA mediante hashes SHA-256 de longitud fija y comparación en tiempo constante con `crypto.timingSafeEqual`.
* 🚦 **Rate Limiting Adaptativo:** Ventana deslizante de 60 segundos (10 req/min para IA, 30 req/min para mutaciones CRUD), respondiendo con código HTTP `429` y cabecera estándar `Retry-After`.
* 📦 **Límites de Payload y Validación de Carga:** Parser JSON restringido a 250 KB y validación exhaustiva de rangos, caracteres (nombres ≤ 60, descripciones ≤ 1.000) y atributos físicos positivos.
* 🔒 **Cabeceras de Defensa en Profundidad:** Deshabilitación de `X-Powered-By`, activación de `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` y CORS configurable por lista blanca.

---

## 4. Inicio Rápido (Quickstart)

### 🔑 Paso Previo: Configuración de Variables de Entorno

Copia el archivo de plantilla `.env.example` a `.env` y configura tus credenciales:

```bash
cp .env.example .env
```

Variables esenciales:
* `ADMIN_API_KEY`: Clave para operaciones administrativas en el Backoffice.
* `GEMINI_API_KEY`: Clave de Google AI Studio para endpoints generativos.
* `PORT`: Puerto de escucha del servidor (por defecto: `3000`).

---

### Opción 1: Ejecución Nativa con Node.js (Recomendado para Desarrollo)

1. **Instalar dependencias:**
   ```bash
   npm install
   # O mediante Taskfile:
   task install
   ```

2. **Iniciar servidor en modo desarrollo (recarga en caliente):**
   ```bash
   npm run dev
   # O con Taskfile:
   task dev
   ```

3. **Verificación de tipos y compilación:**
   ```bash
   npm run lint   # Chequeo estricto TypeScript
   npm run build  # Empaquetado optimizado en dist/server.cjs
   ```

4. **Acceder a la aplicación:**
   * 🖥️ **Catálogo Pokédex:** [http://localhost:3000/](http://localhost:3000/)
   * 🛠️ **Backoffice Admin:** [http://localhost:3000/backoffice](http://localhost:3000/backoffice)
   * 🩺 **Health Probes:** [http://localhost:3000/healthz](http://localhost:3000/healthz) & [http://localhost:3000/readyz](http://localhost:3000/readyz)
   * 📊 **Métricas Prometheus:** [http://localhost:3000/metrics](http://localhost:3000/metrics)

---

### Opción 2: Ejecución con Docker Multi-Stage

1. **Construir la imagen de producción:**
   ```bash
   docker build -t pokedex-server:latest .
   ```

2. **Ejecutar el contenedor:**
   ```bash
   docker run -d --name pokedex-app -p 3000:3000 --env-file .env pokedex-server:latest
   ```

---

### Opción 3: Despliegue en Kubernetes con Helm (Cloud Native & GitOps)

1. **Validar y previsualizar manifiestos con Taskfile:**
   ```bash
   # Validar Chart con linter
   task helm:lint

   # Renderizar manifiestos para desarrollo o producción
   task helm:template
   task helm:template:prod
   ```

2. **Instalar el release con Helm CLI:**
   ```bash
   # Entorno de desarrollo / local
   helm install pokedex ./infra/helm/pokedex --namespace pokemon-app --create-namespace

   # O entorno de producción con alta disponibilidad y overrides
   helm install pokedex ./infra/helm/pokedex -n pokemon-app --values ./infra/helm/pokedex/values.prod.yaml
   ```

3. **GitOps con ArgoCD:**
   ```bash
   # Despliegue continuo declarativo gestionado por ArgoCD
   kubectl apply -f infra/helm/argocd-helm-application.yaml
   ```

> [!TIP]
> Consulta la [**Guía de Despliegue y Operación con Helm (`docs/runbooks/HELM_DEPLOYMENT_GUIDE.md`)**](file:///docs/runbooks/HELM_DEPLOYMENT_GUIDE.md) para detalles sobre rollbacks, hooks y parametrización avanzada.

---

### Opción C: Despliegue con Docker Compose (Multi-Entorno)

#### 🟢 Modo Desarrollo (Hot-Reload & Puertos Abiertos):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

#### 🌐 Modo Producción (Limpio & Endurecido):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

### Opción D: Despliegue en Proxmox VE (On-Premises / Homelab)

```bash
# Despliegue automatizado en contenedor LXC o VM de Proxmox
bash scripts/proxmox_deploy.sh "192.168.1.150" "root" 22
# O vía Taskfile
task deploy:proxmox -- "192.168.1.150" "root"
```

---

## 5. Pruebas Automatizadas y Auditoría de Código

Para ver el detalle exhaustivo de todas las pruebas implementadas y cómo ejecutarlas, consulta la [**Guía Completa de Pruebas (`docs/testing-guide.md`)**](file:///docs/testing-guide.md).

### Ejecución Rápida con Taskfile:
* **Verificación de Tipos Estáticos (TypeScript):** `task lint` o `npm run lint`
* **Compilación y Empaquetado:** `task build` o `npm run build`
* **Pruebas de Rendimiento k6:** `task perf` (o `k6 run tests/performance/k6_stress_test.js`)
* **Escaneo de Secretos (Gitleaks):** `task secrets:scan`

### Ejecución Directa con npm:
```bash
# Verificación de tipos TypeScript estricta (cero errores)
npm run lint

# Empaquetado de producción con esbuild
npm run build

# Ejecución del bundle compilado
npm start
```

---

## 5. Centro de Documentación (`docs/`)

Para profundizar en los aspectos técnicos, consulta la documentación detallada:

* ⎈ [**Guía de Despliegue y Operación con Helm (Helm Guide)**](file:///docs/runbooks/HELM_DEPLOYMENT_GUIDE.md)
* 🤖 [**Guía Completa de Workflows de GitHub Actions**](file:///docs/devops/GITHUB_WORKFLOWS_GUIDE.md)
* 🖥️ [**Guía de Despliegue en Proxmox VE (LXC & VM)**](file:///docs/architecture/PROXMOX_DEPLOYMENT_GUIDE.md)
* ☁️ [**Diseño de Arquitectura en la Nube (Cloud Design)**](file:///docs/architecture/CLOUD_INFRASTRUCTURE_DESIGN.md)
* 🧪 [**Guía Completa de Pruebas y Validación (Testing Guide)**](file:///docs/testing-guide.md)
* 🛠️ [**Guía de Herramientas DevOps (DevOps Guide)**](file:///docs/devops-guide.md)
* 📂 [**Estructura del Monorepo y Organización por Dominios**](file:///docs/architecture/MONOREPO_STRUCTURE.md)
* 📊 [**Análisis de Base de Datos (SQL vs NoSQL)**](file:///docs/architecture/DATABASE_ANALYSIS.md)
* ☸️ [**Análisis de Escalado en Kubernetes, HPA y Balanceadores**](file:///docs/architecture/KUBERNETES_SCALING_ANALYSIS.md)
* 🛡️ [**Arquitectura de Seguridad, DMZ y Aislamiento de Red**](file:///docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md)
* 🔐 [**Gestión de Secretos: .env, Gitleaks y Bitnami Sealed Secrets**](file:///docs/architecture/SECRETS_MANAGEMENT_SEALED_SECRETS.md)
* 🌿 [**Guía de Mejores Prácticas Git y Flujo de Ramas**](file:///docs/best-practices/MEJORES_PRACTICAS_GIT.md)
* 🐳 [**Guía de Mejores Prácticas para Dockerfiles**](file:///docs/best-practices/MEJORES_PRACTICAS_DOCKERFILE.md)
* 📡 [**Especificación de Endpoints y Contratos REST**](file:///docs/api/API_SPECIFICATION.md)
* 🚀 [**Manual de Operación de Kubernetes**](file:///docs/runbooks/KUBERNETES_AUTOSCALING_GUIDE.md)
* 🧪 [**Guía Operativa de Pruebas de Estrés**](file:///docs/runbooks/STRESS_TESTING_GUIDE.md)
