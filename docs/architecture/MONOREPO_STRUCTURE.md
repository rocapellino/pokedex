# 📂 Estructura del Monorepo y Organización por Dominios

Este documento detalla la estructura de directorios, convención de organización por dominios y propósito de cada componente dentro del monorepo **Pokémon DevOps Platform**.

---

## 📑 Tabla de Contenidos
1. [Filosofía de Diseño del Monorepo](#1-filosofía-de-diseño-del-monorepo)
2. [Árbol de Directorios Detallado](#2-árbol-de-directorios-detallado)
3. [Descripción por Módulos y Dominios](#3-descripción-por-módulos-y-dominios)

---

## 1. Filosofía de Diseño del Monorepo

El monorepo está organizado siguiendo una separación estricta de responsabilidades mediante **npm workspaces**:
* **`apps/backend/`**: Servidor API RESTful Node.js + Express en TypeScript (`@pokedex/backend`), lógica de dominio, persistencia ACID PostgreSQL + Redis con scripts Lua, autenticación timing-safe HMAC SHA-256, middlewares de seguridad, métricas Prometheus e integración con Gemini 2.5 Flash.
* **`apps/frontend/`**: Aplicación web cliente SPA (`@pokedex/frontend`) servida mediante un contenedor Nginx Alpine no-root hardened con CSP, compresión gzip y reverse proxy inverso.
* **`infra/`**: Infraestructura como Código (IaC), Chart oficial de **`helm/pokedex`**, políticas de control de admisión Kyverno (`k8s/`), aprovisionamiento con OpenTofu (`opentofu/`) y playbooks de Ansible (`ansible/`).
* **`gitops/`**: Manifiestos declarativos de sincronización continua con ArgoCD (`apps/`) y sobrescrituras de configuración por entorno (`environments/`).
* **`docs/`**: Centraliza toda la documentación técnica, diseños de arquitectura, seguridad, contratos de API y runbooks.
* **`scripts/`**: Utilidades de DX, auditorías de calidad de código, pruebas de estrés concurrentes y sellado de secretos.
* **`tests/`**: Suite exhaustiva de pruebas unitarias, de integración, pentesting lógico, fuzzing y E2E/a11y con Playwright.

---

## 2. Árbol de Directorios Detallado

```text
pokedex/
├── .github/                      # Automatizaciones de CI/CD y gobernanza en GitHub
│   ├── workflows/                # Pipelines de build, test, SAST, SBOM, Cosign y release
│   ├── dependabot.yml            # Configuración de Dependabot con cooldown de 7 días
│   ├── CODEOWNERS                # Asignación obligatoria de revisores por dominio
│   └── pull_request_template.md  # Plantilla estándar para Pull Requests
├── .vscode/                      # Configuración del editor y tareas automatizadas
│   └── tasks.json                # Tareas de build, test y ejecución de Kubernetes local
├── apps/                         # Workspaces de Aplicaciones
│   ├── backend/                  # API RESTful TypeScript (@pokedex/backend)
│   │   ├── package.json          # Manifiesto y scripts del paquete backend
│   │   ├── tsconfig.json         # Configuración del compilador TypeScript
│   │   ├── Dockerfile            # Imagen de producción multi-stage no-root
│   │   ├── server.ts             # Servidor Express, Rate Limiter, Metrics Prometheus
│   │   └── src/                  # Módulos de dominio y servicios backend TypeScript
│   │       ├── types.ts          # Interfaces nativas fuertemente tipadas
│   │       ├── data/
│   │       │   └── pokedex.json  # Catálogo oficial de 1.025 Pokémon (Generaciones I a IX)
│   │       ├── services/
│   │       │   ├── ai.ts         # Integración Google AI Studio (@google/genai) con Gemini 2.5 Flash
│   │       │   ├── auth.ts       # Autenticación timing-safe y sesiones HMAC SHA-256 independientes
│   │       │   └── db.ts         # Persistencia ACID PostgreSQL 16 (JSONB) + Redis 7 con scripts Lua
│   │       ├── utils/
│   │       │   └── pagination.ts # Normalización de paginación y límites anti-DoS
│   │       ├── validation/
│   │       │   └── pokemon.ts    # Sanitizador contra inyecciones XSS y validador de esquema
│   │       └── seed.ts           # Inicializador y CLI de carga masiva en base de datos
│   └── frontend/                 # Frontend Web (@pokedex/frontend)
│       ├── package.json          # Manifiesto del frontend
│       ├── Dockerfile            # Imagen Alpine no-root con digest criptográfico pinned
│       ├── nginx.conf            # Configuración endurecida con CSP, compresión y reverse proxy
│       └── public/               # Assets estáticos (HTML5, CSS3, JS Vanilla con protección XSS)
│           ├── index.html        # Catálogo público interactivo
│           ├── backoffice.html   # Consola de administración CRUD
│           ├── css/              # Estilos visuales y diseño Bento
│           └── js/               # Lógica de cliente, modales y selector de tema
├── Dockerfile                    # Construcción multi-stage de producción (Node.js 22 Alpine, UID 1001)
├── docker-compose.yml            # Orquestación multicontenedor local (API, Web, Postgres, Redis)
├── package.json                  # Manifiesto, dependencias y scripts de ejecución
├── package-lock.json             # Lockfile determinista de npm
├── tsconfig.json                 # Configuración del compilador TypeScript en modo estricto
├── Taskfile.yml                  # Automatización de tareas de desarrollo y operaciones (go-task)
├── renovate.json                 # Renovate Bot con auto-merge restringido a parches de npm
├── SECURITY.md                   # Política de seguridad y divulgación responsable de vulnerabilidades
├── SECURITY_RUNBOOK.md           # Guías de respuesta ante incidentes y rotación criptográfica de claves
├── infra/                        # Infraestructura como Código (IaC) y Manifiestos Cloud-Native
│   ├── helm/pokedex/             # Chart oficial de Helm 3 (Deployments, PgBouncer, HPA, NetPols)
│   ├── k8s/                      # ClusterPolicy de Kyverno para verificación de firmas Cosign
│   ├── opentofu/                 # Entornos Proxmox VE (on-premise) y AWS EKS (cloud)
│   ├── terraform/                # Módulos multi-cloud para nubes públicas
│   └── ansible/                  # Playbooks de aprovisionamiento y hardening de firewall UFW
├── gitops/                       # GitOps con ArgoCD
│   ├── apps/                     # Definiciones de ArgoCD Applications (app-proxmox, app-cloud)
│   └── environments/             # Sobrescrituras de valores por clúster (proxmox, cloud)
├── docs/                         # Portal de documentación técnica centralizada
│   ├── README.md                 # Índice general de documentación
│   ├── architecture/             # Diseños de arquitectura, seguridad, persistencia y escalabilidad
│   ├── best-practices/           # Guías de Git Flow y Dockerfiles seguros
│   ├── api/                      # Especificación formal de contratos REST
│   └── runbooks/                 # Manuales operativos de Helm, HPA y pruebas de estrés
├── tests/                        # Suite de pruebas automatizadas
│   ├── unit/                     # Pruebas unitarias de modelos y validaciones
│   ├── security/                 # Pentests lógicos, evasión de auth y validación fail-closed
│   └── fuzz/                     # Fuzzing de endpoints con payloads malformados
└── scripts/                      # Utilidades de DX, auditoría y sellado de secretos
```

---

## 3. Descripción por Módulos y Dominios

### `apps/backend/` (API RESTful Node.js & TypeScript)
* **`server.ts`**: Servidor HTTP de alto rendimiento con **Express 4.21** y compilación previa con **esbuild**.
  * Middlewares de seguridad: cabeceras de hardening (`nosniff`, `SAMEORIGIN`), supresión de `X-Powered-By`, validación CORS fail-closed y body parser limitado a 250 KB.
  * Middlewares de **Rate Limiting** híbridos (scripts atómicos Lua en Redis con fallback local).
  * Autenticación timing-safe mediante `crypto.timingSafeEqual` sobre digests SHA-256.
  * Exportador nativo de métricas Prometheus (`/metrics`) y endpoints de salud (`/healthz`, `/readyz`).
* **`src/services/`**:
  * **`db.ts`**: Cliente relacional PostgreSQL 16 para almacenamiento `JSONB` de entidades y secuencias atómicas (`pokedex_id_seq`), coordinado con Redis 7 para almacenamiento en caché sub-3ms (`pokedex:list:*`) e invalidación reactiva.
  * **`auth.ts`**: Gestión estricta de credenciales con desacoplamiento entre `ADMIN_API_KEY` (clave administrativa) y `ADMIN_SESSION_SECRET` (firma HMAC SHA-256 de tokens con payload `role`, `exp`, `jti`).
  * **`ai.ts`**: Integración con Google Gemini 2.5 Flash (`@google/genai`) con timeout de 12s, límites de cuota diaria y fallbacks deterministas locales.

### `apps/frontend/` (Capa de Presentación y Proxy DMZ)
* **Frontend SPA Vanilla**: Catálogo con visualización Bento Grid, filtros dinámicos, paginación, paleta de tipos y consola de administración Backoffice con sanitización contra XSS.
* **Nginx Reverse Proxy**: Contenedor Alpine no-root con digest criptográfico fijado, compresión gzip y cabeceras CSP.

### `infra/` y `gitops/` (Infraestructura, Orquestación y GitOps)
* **Helm 3 Chart (`infra/helm/pokedex`)**: Despliegue altamente parametrizado con políticas NetworkPolicy Zero-Trust (Anti-SSRF, PgBouncer enforced isolation), soporte para External Secrets Operator, HPA v2 y PodDisruptionBudgets.
* **ArgoCD (`gitops/`)**: Sincronización continua declarativa en clústeres híbridos (Proxmox VE on-premise y AWS EKS en la nube).
