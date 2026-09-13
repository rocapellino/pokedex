# ⚡ Pokémon DevOps Platform

Plataforma full-stack y referencia de arquitectura DevSecOps que implementa una Pokédex reactiva para la consulta y gestión del catálogo oficial de Pokémon. Diseñada bajo principios de separación de responsabilidades, seguridad por defecto (*fail-closed*) y despliegue continuo mediante contenedores y orquestación con Kubernetes y GitOps.

[![CI Pipeline](https://github.com/rocapellino/pokedex/actions/workflows/ci.yml/badge.svg)](https://github.com/rocapellino/pokedex/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-24+-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.30+-326CE5?style=flat&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Helm](https://img.shields.io/badge/Helm-3.17-0F1689?style=flat&logo=helm&logoColor=white)](https://helm.sh/)
[![Security: Gitleaks](https://img.shields.io/badge/Security-Gitleaks_Protected-green?style=flat&logo=shield)](https://github.com/gitleaks/gitleaks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📑 Tabla de Contenidos

- [Demo y Acceso Rápido](#demo-y-acceso-rápido)
- [Características Principales](#características-principales)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Requisitos](#requisitos)
- [Inicio Rápido](#inicio-rápido)
- [Comandos Disponibles](#comandos-disponibles)
- [Configuración](#configuración)
- [API REST](#api-rest)
- [Testing y Calidad](#testing-y-calidad)
- [Estrategia de Despliegue](#estrategia-de-despliegue)
- [Observabilidad](#observabilidad)
- [Backup y Disaster Recovery](#backup-y-disaster-recovery)
- [Seguridad](#seguridad)
- [Estructura del Repositorio](#estructura-del-repositorio)
- [Documentación Adicional](#documentación-adicional)
- [Contribución](#contribución)
- [Licencia](#licencia)

---

## Demo y Acceso Rápido

Al iniciar la plataforma en el entorno local, los servicios quedan disponibles en:

* **Interfaz Web (Catálogo)**: `http://localhost:8080`
* **Panel de Administración (Backoffice)**: `http://localhost:8080/backoffice.html`
* **API REST Backend**: `http://localhost:3000`
* **Healthcheck de Preparación**: `http://localhost:3000/readyz`
* **Métricas Prometheus**: `http://localhost:3000/metrics`
* **Portal de Documentación**: [docs/README.md](docs/README.md)

---

## Características Principales

* **Catálogo Completo**: Visualización, filtrado por tipo y búsqueda de los 1.025 Pokémon oficiales.
* **API REST Tipada**: Construida con Node.js 22, Express y TypeScript, con esquemas y migraciones declarativas gestionadas mediante Drizzle ORM.
* **Persistencia y Caché**: Almacenamiento relacional ACID en PostgreSQL 16 y aceleración en memoria con Redis 7 para rate limiting y gestión de sesiones revocables.
* **Frontend Reactivo**: SPA modular desarrollada con Vite, TypeScript y sanitización estricta del DOM con DOMPurify, servida mediante Nginx reverse proxy.
* **Servicios de Inteligencia Artificial**: Integración con Google Gemini 2.5 Flash (`@google/genai`) para la generación asistida de diagramas de arquitectura y especificaciones UI, con disyuntor (*circuit breaker*) y fallback local heurístico.
* **Seguridad DevSecOps**: Escaneo SAST con Semgrep y CodeQL, detección de secretos con Gitleaks, verificación de dependencias (SCA) con Dependency Review y Trivy, análisis IaC con Checkov, generación de SBOM CycloneDX y firmas de imágenes con Cosign.
* **Despliegue Declarativo**: Helm Chart v3 parametrizado, políticas de admisión Kyverno y sincronización continua GitOps mediante ArgoCD.

---

## Arquitectura del Sistema

La solución desacopla la capa de presentación, la lógica de negocio y los servicios de datos:

```mermaid
flowchart TD
    User(["👤 Usuario / Cliente"]) -->|HTTP 8080| Proxy["🌐 Nginx Reverse Proxy\napps/frontend"]
    Proxy -->|Assets Estáticos| Web["📦 SPA Vite + TS"]
    Proxy -->|Proxy /api/*, /pokemons| API["⚙️ API Express + TS\napps/backend :3000"]
    
    API -->|SQL :5432| DB[("🗄️ PostgreSQL 16\npokedex_entries")]
    API -->|RESP :6379| Cache[("⚡ Redis 7\nCaché & Sesiones")]
    API -->|HTTPS| AI["🤖 Google Gemini 2.5 Flash\nServicio de IA"]

    subgraph GitOps_Flow ["☸️ Despliegue GitOps"]
        GH["🐙 GitHub Actions"] -->|Build, SBOM & Sign| OCI["📦 GitHub Packages (GHCR)"]
        Argo["🚀 ArgoCD"] -->|Sync Declarativo| K8s["☸️ Clúster Kubernetes"]
        OCI -.->|Pull por Digest Inmutable| K8s
    end
```

Para una descripción exhaustiva de la arquitectura, flujos de datos y contratos de red, consulta [docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md](docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md) y [docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md](docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md).

---

## Requisitos

Para ejecutar y colaborar en el proyecto se requiere:

* [Node.js](https://nodejs.org/) 22 LTS y npm 10+
* [Docker](https://www.docker.com/) 24+ y Docker Compose v2
* [Task](https://taskfile.dev/) (recomendado como ejecutor de tareas unificado)
* [Helm](https://helm.sh/) 3.17+ y [Kind](https://kind.sigs.k8s.io/) (opcional, para validación sobre Kubernetes local)

---

## Inicio Rápido

Sigue estos pasos para levantar la plataforma en tu entorno de desarrollo en menos de dos minutos:

### 1. Clonar el repositorio

```bash
git clone https://github.com/rocapellino/pokedex.git
cd pokedex
```

### 2. Configurar variables de entorno

Copia la plantilla de configuración e inicializa el archivo `.env`:

```bash
cp .env.example .env
```

> [!NOTE]
> En desarrollo local los valores por defecto de `.env.example` permiten arrancar sin configuración adicional. Si deseas habilitar funciones de IA, añade tu clave `GEMINI_API_KEY`.

### 3. Instalar dependencias

```bash
npm ci
```

### 4. Iniciar la aplicación

Puedes utilizar `task` o `docker compose` directamente:

```bash
# Con Task (recomendado):
task dev:compose

# O directamente con Docker Compose:
docker compose up -d
```

Este comando inicia los contenedores de PostgreSQL 16, Redis 7, el Backend Express y el Frontend Nginx con inicialización automática de datos.

### 5. Verificar el servicio

Comprueba que las dependencias y la API respondan correctamente:

```bash
curl -s http://localhost:3000/readyz
# Salida esperada: {"status":"ready","database":"connected","redis":"connected"}
```

Abre tu navegador en [http://localhost:8080](http://localhost:8080) para explorar el catálogo interactivo.

### 6. Detener los servicios

```bash
task dev:compose:down
# O bien: docker compose down
```

---

## Comandos Disponibles

El proyecto utiliza un [`Taskfile.yml`](Taskfile.yml) como interfaz de desarrollo estandarizada, complementado con scripts de `package.json`:

| Comando | Herramienta | Propósito |
| :--- | :--- | :--- |
| `npm ci` | npm | Instala dependencias del monorepo de forma limpia y reproducible. |
| `npm run lint` | TypeScript | Valida tipos y reglas de sintaxis en `apps/backend` y `apps/frontend`. |
| `npm run build` | esbuild / Vite | Compila el backend a CommonJS y genera el bundle optimizado del frontend. |
| `npm test` | Node Test Runner | Ejecuta la suite de 127 pruebas unitarias, de integración, seguridad y DR. |
| `npm run test:fuzz` | Script dinámico | Ejecuta pruebas de fuzzing con cargas malformadas sobre los endpoints. |
| `task dev:compose` | Docker Compose | Levanta el stack multicontenedor local (API, Web, DB, Redis). |
| `task dev:compose:down` | Docker Compose | Detiene y remueve los contenedores del entorno local de Compose. |
| `task dev:k8s:up` | Kind + Helm | Crea un clúster Kind local y despliega el Helm chart con Ingress. |
| `task dev:k8s:status` | kubectl | Muestra el estado de Pods, Services e Ingress en Kubernetes local. |
| `task dev:k8s:down` | Kind | Elimina el clúster Kind local y libera sus recursos. |
| `task dr:verify` | Bash / Docker | Ejecuta el simulacro automatizado de Disaster Recovery en PostgreSQL efímero. |
| `helm lint infra/helm/pokedex` | Helm | Valida sintácticamente las plantillas del chart de Helm. |

---

## Configuración

Las variables de entorno se definen en el archivo `.env` tomando como base [`.env.example`](.env.example):

| Variable | Obligatoria | Ejemplo | Descripción | Entorno |
| :--- | :---: | :--- | :--- | :--- |
| `NODE_ENV` | Sí | `development` | Modo de ejecución de la aplicación (`development`, `production`, `test`). | Todos |
| `PORT` | No | `3000` | Puerto HTTP en el que escucha el servidor backend (por defecto `3000`). | Backend |
| `WEB_PORT` | No | `8080` | Puerto HTTP expuesto por el proxy Nginx en Compose. | Frontend |
| `DATABASE_URL` | Sí en prod | `postgresql://user:pass@localhost:5432/pokedex` | Cadena de conexión principal hacia PostgreSQL 16. | Backend |
| `REDIS_URL` | Sí en prod | `redis://localhost:6379` | Conexión hacia Redis 7 para rate limiting y caché. | Backend |
| `ADMIN_API_KEY` | Sí en prod | `openssl rand -hex 32` | Credencial maestra para endpoints de gestión y emisión de sesiones. | Backend |
| `ADMIN_SESSION_SECRET` | Sí en prod | `openssl rand -hex 32` | Secreto HMAC utilizado para firmar y verificar tokens de sesión Bearer. | Backend |
| `CORS_ORIGINS` | Sí en prod | `https://pokedex.example.com` | Lista de orígenes autorizados separados por coma. | Backend |
| `GEMINI_API_KEY` | Opcional | `AIzaSy...` | Clave de Google AI Studio para activar generación con Gemini 2.5 Flash. | Backend |
| `DR_BACKUP_KEY` | Opcional | `clave-secreta-dr` | Clave de descifrado AES-256 para validación de backups de DR. | DR / Scripts |

> [!WARNING]
> Nunca incorpores credenciales reales, tokens o claves privadas al repositorio. En producción, las contraseñas deben gestionarse mediante Kubernetes Secrets o proveedores externos como External Secrets Operator.

---

## API REST

La API expone endpoints para la consulta pública y la administración autenticada del catálogo.

* **URL Base en desarrollo**: `http://localhost:3000`
* **Especificación detallada de contratos**: [docs/api/API_SPECIFICATION.md](docs/api/API_SPECIFICATION.md)

### Endpoints Principales

| Método | Endpoint | Autenticación | Descripción |
| :---: | :--- | :--- | :--- |
| `GET` | `/healthz` | Pública | Comprueba que el proceso de la aplicación esté activo (*liveness*). |
| `GET` | `/readyz` | Pública | Verifica conectividad con PostgreSQL y Redis (*readiness*). |
| `GET` | `/metrics` | Pública | Expone métricas en formato estándar de Prometheus. |
| `GET` | `/version` | Pública | Retorna metadatos de versión y commit SHA inyectados durante el build. |
| `GET` | `/pokemons` | Pública | Lista paginada del catálogo (soporta filtros `type` y `search`). |
| `GET` | `/pokemons/:id` | Pública | Detalle de un Pokémon por su ID nacional (1 - 1025). |
| `POST` | `/api/v1/auth/session` | `X-API-Key` | Intercambia la API Key administrativa por un token de sesión HMAC Bearer. |
| `POST` | `/api/v1/auth/logout` | Bearer Token | Revoca la sesión en Redis de forma inmediata. |
| `POST` | `/pokemons` | Bearer Token | Registra un nuevo Pokémon en la base de datos. |
| `PUT` | `/pokemons/:id` | Bearer Token | Actualiza los datos de un Pokémon e invalida la caché. |
| `DELETE` | `/pokemons/:id` | Bearer Token | Elimina un registro del catálogo e invalida la caché. |
| `POST` | `/api/v1/ai/diagram` | Bearer Token | Genera un diagrama de arquitectura en sintaxis Mermaid con IA. |

### Ejemplos de Solicitud

```bash
# Consultar Pokémon por ID con cabecera ETag
curl -s http://localhost:3000/pokemons/25

# Paginación del catálogo con límite y búsqueda
curl -s "http://localhost:3000/pokemons?limit=5&offset=0&type=Electric"

# Verificación de salud y dependencias
curl -s http://localhost:3000/readyz
```

---

## Testing y Calidad

El proyecto mantiene una suite automatizada de pruebas y quality gates:

```bash
# Ejecutar suite completa de 127 pruebas
npm test

# Ejecutar verificación estricta de tipos
npm run lint

# Ejecutar pruebas de resistencia con payloads malformados
npm run test:fuzz
```

En integración continua (GitHub Actions), cada Pull Request debe superar satisfactoriamente:
* **Pruebas Unitarias y de Integración**: Pruebas con el Node Test Runner nativo sobre servicios, API y validaciones.
* **Seguridad SAST**: Semgrep y GitHub CodeQL analizando reglas OWASP Top 10.
* **Seguridad SCA & Secretos**: Gitleaks contra filtración de credenciales y Dependency Review para bloqueo de dependencias vulnerables.
* **Seguridad IaC**: Checkov escaneando Dockerfiles, Helm charts y manifiestos de OpenTofu.
* **Integración Canónica en Kind**: Despliegue real del Helm chart en clúster efímero validando Pods, Ingress y probes.

---

## Estrategia de Despliegue

La plataforma diferencia claramente los propósitos de cada entorno de ejecución:

| Entorno / Capa | Tecnología Principal | Rol y Propósito |
| :--- | :--- | :--- |
| **Desarrollo Local** | Docker Compose (`docker-compose.yml`) | Iteración rápida para desarrollo y pruebas interactivas. |
| **Integración Local / CI** | Kubernetes + Kind (`task dev:k8s:up`) | Validación idéntica a producción (Ingress, Probes, NetPols). |
| **Producción On-Premise** | Kubernetes sobre Proxmox VE | Despliegue continuo gobernado por ArgoCD y Helm. |
| **Producción Cloud** | Kubernetes sobre AWS EKS | Infraestructura escalable gestionada mediante OpenTofu. |
| **Aprovisionamiento IaC** | OpenTofu ([`infra/opentofu`](infra/opentofu)) | Declaración reproducible de infraestructura (Terraform retirado). |
| **Hardening de Servidores** | Ansible ([`infra/ansible`](infra/ansible)) | Configuración base, UFW, módulos de kernel y Docker en nodos. |
| **Empaquetado** | Helm 3 ([`infra/helm/pokedex`](infra/helm/pokedex)) | Plantillas parametrizadas con HPA, PDB y NetworkPolicies. |
| **Entrega Continua (GitOps)** | ArgoCD ([`gitops/`](gitops/)) | Sincronización declarativa basada en digests OCI inmutables. |

> [!IMPORTANT]
> Docker Compose está destinado exclusivamente al desarrollo local interactivo. Todos los despliegues productivos se realizan de manera inmutable sobre Kubernetes mediante ArgoCD y Helm.

---

## Observabilidad

El sistema está instrumentado para integrarse con stacks de observabilidad estándar (Prometheus, Grafana y Loki):

* **Métricas**: Expuestas en `/metrics` mediante el cliente nativo de Prometheus (latencias HTTP por ruta, códigos de estado, uso de memoria, etc.).
* **Healthchecks**: `/healthz` para comprobación de vida del proceso y `/readyz` para estado de dependencias activas (PostgreSQL y Redis).
* **Logs Estructurados**: Salida estándar en formato JSON con inyección y propagación de `X-Request-Id` para trazabilidad de solicitudes de extremo a extremo.

---

## Backup y Disaster Recovery

La estrategia de respaldo y recuperación ante desastres contempla:

* Respaldos periódicos de PostgreSQL generados con compresión gzip y cifrado simétrico AES-256-CBC con PBKDF2 y checksum SHA-256.
* Script de validación automatizado ([`scripts/dr_verify_restore.sh`](scripts/dr_verify_restore.sh)) que efectúa restauraciones de prueba en un contenedor PostgreSQL efímero aislado fijado por digest (`postgres:16-alpine@sha256:...`), comprobando integridad de esquemas, Primary Keys, secuencias y recuento de registros bajo política estricta *fail-closed*.

Para consultar los procedimientos paso a paso y la arquitectura de respaldo, revisa el [Plan de Disaster Recovery](docs/runbooks/DISASTER_RECOVERY_PLAN.md).

---

## Seguridad

La seguridad está integrada en todas las capas del ciclo de vida:

* **Supply Chain Security**: Las imágenes OCI publicadas en GitHub Packages son firmadas criptográficamente con **Cosign** (modo keyless con Sigstore OIDC) y cuentan con atestaciones de SBOM en formato CycloneDX y SLSA Provenance.
* **Control de Admisión**: En Kubernetes, políticas de **Kyverno** verifican la firma de las imágenes antes de autorizar la creación de Pods.
* **Network Isolation**: Políticas de red Zero-Trust (Default-Deny Egress) en PostgreSQL y Redis, y bloqueo anti-SSRF hacia metadatos de nube (`169.254.169.254/32`).
* **Comparaciones Timing-Safe**: Autenticación administrativa protegida contra ataques de canal lateral basados en tiempo.

Para conocer el procedimiento de divulgación responsable o reportar una vulnerabilidad, consulta [SECURITY.md](SECURITY.md).

---

## Estructura del Repositorio

```text
.
├── apps/
│   ├── backend/                     # API REST Express + TypeScript + Drizzle ORM
│   │   ├── Dockerfile               # Contenedor Alpine no-root (Node.js 22 LTS)
│   │   ├── server.ts                # Servidor Express, middlewares y rutas
│   │   └── src/                     # Lógica de negocio, base de datos y esquemas
│   └── frontend/                    # SPA Vite + TypeScript + DOMPurify
│       ├── Dockerfile               # Servidor Nginx Alpine con build multi-stage
│       ├── nginx.conf               # Configuración optimizada con cabeceras de seguridad
│       └── src/                     # Componentes y controladores de interfaz
├── infra/
│   ├── ansible/                     # Hardening de SO y preparación de nodos (host_baseline.yml)
│   ├── helm/pokedex/                # Helm Chart 3 parametrizado (HPA, NetPols, Secrets)
│   ├── k8s/                         # Configuración de clúster Kind local y políticas Kyverno
│   ├── opentofu/                    # Infraestructura como Código (Proxmox VE + AWS EKS)
│   └── proxmox/                     # Plantillas Cloud-Init y contenedores LXC
├── gitops/
│   ├── apps/                        # Definiciones de Application para ArgoCD
│   └── environments/                # Values específicos por clúster (on-premise y cloud)
├── scripts/                         # Utilidades de auditoría, verificación DR y testing
├── tests/                           # Suite de pruebas automatizadas (127 tests)
├── .github/workflows/               # Pipelines de CI/CD, SAST, DAST, IaC y Supply Chain
├── docker-compose.yml               # Orquestación de desarrollo local interactivo
├── package.json                     # Monorepo workspaces y dependencias compartidas
└── Taskfile.yml                     # Automatizador de comandos del proyecto (Task)
```

---

## Documentación Adicional

La documentación técnica detallada se encuentra organizada en el directorio [`docs/`](docs/):

* 📚 [Índice General de Documentación](docs/README.md)
* 📡 [Especificación de Contratos de la API REST](docs/api/API_SPECIFICATION.md)
* 🔄 [Ciclo de Vida de la Aplicación y SDLC](docs/architecture/APPLICATION_LIFECYCLE.md)
* 🛡️ [Seguridad, DMZ y Aislamiento de Red](docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md)
* 📊 [Análisis de Base de Datos y Caché](docs/architecture/DATABASE_ANALYSIS.md)
* ☁️ [Diseño de Infraestructura Cloud y GitOps](docs/architecture/CLOUD_INFRASTRUCTURE_DESIGN.md)
* ☸️ [Escalabilidad y Resiliencia en Kubernetes](docs/architecture/KUBERNETES_SCALING_ANALYSIS.md)
* 🤖 [Guía de Workflows de CI/CD](docs/devops/GITHUB_WORKFLOWS_GUIDE.md)
* 🛠️ [Catálogo de Herramientas y Stack Tecnológico](docs/devops/TOOLS_AND_TECH_STACK.md)
* ⎈ [Manual de Despliegue con Helm 3 y ArgoCD](docs/runbooks/HELM_DEPLOYMENT_GUIDE.md)
* 🚀 [Manual de Autoescalado con HPA v2](docs/runbooks/KUBERNETES_AUTOSCALING_GUIDE.md)
* 🧪 [Guía de Pruebas de Estrés con k6](docs/runbooks/STRESS_TESTING_GUIDE.md)
* 📋 [Plan y Runbook de Disaster Recovery](docs/runbooks/DISASTER_RECOVERY_PLAN.md)

---

## Contribución

Para proponer cambios en el proyecto:

1. Crea una rama descriptiva a partir de `main` (`feature/nombre-mejora` o `fix/descripcion-error`).
2. Implementa tus cambios asegurando que las pruebas y el linter se ejecuten sin fallos:
   ```bash
   npm run lint
   npm test
   ```
3. Realiza commits con formato convencional (`feat: ...`, `fix: ...`, `docs: ...`).
4. Abre un Pull Request hacia `main`. Todos los checks automáticos de seguridad y calidad deben completarse en verde antes de la integración.

---

## Licencia

Este proyecto está licenciado bajo los términos de la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
