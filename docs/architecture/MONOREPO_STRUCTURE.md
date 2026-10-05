# 📂 Estructura del Monorepo y Organización por Dominios

Este documento detalla la estructura de directorios, convención de organización por dominios y propósito de cada componente dentro del monorepo **Pokémon DevOps Platform**.

---

## 📑 Tabla de Contenidos

1. [Filosofía de Diseño del Monorepo](#1-filosofía-de-diseño-del-monorepo)
2. [Árbol de Directorios Detallado](#2-árbol-de-directorios-detallado)
3. [Descripción por Módulos y Dominios](#3-descripción-por-módulos-y-dominios)
4. [Convención de Extensión YAML](#4-convención-de-extensión-yaml)
5. [Gobernanza de Workspaces, Orquestación y Versionado](#5-gobernanza-de-workspaces-orquestación-y-versionado)

---

## 1. Filosofía de Diseño del Monorepo

El monorepo está organizado siguiendo una separación estricta de responsabilidades mediante **npm workspaces**:

- **`apps/backend/`**: Servidor API RESTful Node.js + Express en TypeScript (`@pokedex/backend`), lógica de dominio, persistencia ACID PostgreSQL + Redis con scripts Lua, autenticación timing-safe HMAC SHA-256, middlewares de seguridad, métricas Prometheus e integración con Gemini 2.5 Flash.
- **`apps/frontend/`**: Aplicación web cliente MPA (`@pokedex/frontend`) compuesta por catálogo público (`index.html`) y consola de administración backoffice (`backoffice.html`), servida mediante un contenedor Nginx Alpine no-root hardened con CSP, compresión gzip y reverse proxy inverso.
- **`infra/`**: Infraestructura como Código (IaC), Chart oficial de **`helm/pokedex`**, políticas de control de admisión Kyverno (`k8s/`), aprovisionamiento con OpenTofu (`opentofu/`) y playbooks de Ansible (`ansible/`).
- **`gitops/`**: Manifiestos declarativos de sincronización continua con ArgoCD (`apps/`) y sobrescrituras de configuración por entorno (`environments/`).
- **`docs/`**: Centraliza toda la documentación técnica, diseños de arquitectura, seguridad, contratos de API y runbooks.
- **`scripts/`**: Utilidades de DX, auditorías de calidad de código, benchmarks y pruebas de estrés concurrentes.
- **`tests/`**: Suite exhaustiva de pruebas unitarias, de integración, pentesting lógico, fuzzing y E2E/a11y con Playwright.

---

## 2. Árbol de Directorios Detallado

```text
pokedex/
├── .github/                      # Automatizaciones de CI/CD y gobernanza en GitHub
│   ├── workflows/                # Pipelines de build, test, SAST, SBOM, Cosign y release
│   ├── CODEOWNERS                # Asignación obligatoria de revisores por dominio
│   └── pull_request_template.md  # Plantilla estándar para Pull Requests
├── .vscode/                      # Configuración del editor y tareas automatizadas
│   └── tasks.json                # Capa de presentación: wrappers `task ...` sobre Taskfile.yaml
├── apps/                         # Workspaces de Aplicaciones
│   ├── backend/                  # API RESTful TypeScript (@pokedex/backend)
│   │   ├── package.json          # Manifiesto y scripts del paquete backend
│   │   ├── tsconfig.json         # Configuración del compilador TypeScript
│   │   ├── Dockerfile            # Imagen de producción multi-stage no-root
│   │   ├── server.ts             # Servidor Express, ensamblador de rutas y middlewares
│   │   └── src/                  # Módulos de dominio y servicios backend TypeScript
│   │       ├── types.ts          # Interfaces nativas fuertemente tipadas
│   │       ├── routes/           # Routers modulares de Express (ARCH-002)
│   │       │   ├── pokemons.ts   # CRUD Pokémon con validación Zod y ETags
│   │       │   ├── auth.ts       # Emisión y revocación de sesiones HMAC efímeras
│   │       │   ├── ai.ts         # Endpoints Google Gemini 2.5 Flash con rate limiting
│   │       │   └── health.ts     # Sondas /healthz, /readyz, /version y métricas Prometheus
│   │       ├── middleware/       # Middlewares especializados
│   │       │   ├── auth.ts       # Verificación dual HMAC/API-Key y control CSRF
│   │       │   ├── rate-limiter.ts # Rate limiters híbridos Redis/memoria fail-closed
│   │       │   ├── metrics.ts    # Colector de telemetría HTTP Prometheus
│   │       │   └── request-tracer.ts # Trazabilidad distribuida X-Request-Id
│   │       ├── data/
│   │       │   └── pokedex.json  # Catálogo oficial de 1.025 Pokémon (Generaciones I a IX)
│   │       ├── services/
│   │       │   ├── ai.ts         # Integración Google AI Studio (@google/genai) con Gemini
│   │       │   ├── auth.ts       # Criptografía timing-safe y sesiones revocables
│   │       │   └── db.ts         # Persistencia PostgreSQL 16 (JSONB/Drizzle) + Redis 7
│   │       ├── utils/
│   │       │   ├── lifecycle.ts  # Estado de ciclo de vida para graceful shutdown
│   │       │   ├── async-handler.ts # Captura de promesas asíncronas
│   │       │   └── pagination.ts # Normalización de paginación y límites anti-DoS
│   │       ├── validation/
│   │       │   └── pokemon.ts    # Sanitizador contra inyecciones XSS y validador de esquema
│   │       └── seed.ts           # Inicializador y CLI de carga masiva en base de datos
│   └── frontend/                 # Frontend Web (@pokedex/frontend) — Vanilla TypeScript + Vite + Nginx
│       ├── package.json          # Manifiesto del frontend y dependencias de build
│       ├── vite.config.ts        # Configuración de Vite para empaquetado multi-página (MPA)
│       ├── tsconfig.json         # Configuración del compilador TypeScript
│       ├── Dockerfile            # Imagen Alpine no-root con digest criptográfico pinned
│       ├── nginx.conf            # Configuración endurecida con CSP, compresión y reverse proxy
│       ├── nginx.conf.template   # Plantilla Nginx con inyección de variables por envsubst
│       ├── index.html            # Catálogo público interactivo (Entrypoint Vite)
│       ├── backoffice.html       # Consola de administración CRUD (Entrypoint Vite)
│       ├── src/                  # Código fuente TypeScript con tipado estricto (sin React ni JSX)
│       │   ├── pokedex.ts        # Lógica de catálogo, filtros y renderizado seguro
│       │   ├── backoffice.ts     # Operaciones CRUD, autenticación y telemetría
│       │   ├── theme.ts          # Selector de tema (Claro / Oscuro / Sistema) Zero-FOUC
│       │   ├── sanitizer.ts      # Envoltorio de seguridad DOMPurify anti-XSS
│       │   └── types.ts          # Tipos e interfaces de Pokémon
│       └── public/               # Assets estáticos servidos al navegador (CSS, favicon)
│           ├── css/              # Estilos visuales con variables CSS y glassmorphism
│           └── favicon.*         # Iconografía y branding
├── Dockerfile                    # Construcción multi-stage de producción (Node.js 22 Alpine, UID 1001)
├── docker-compose.yaml            # Orquestación multicontenedor local (API, Web, Postgres, Redis)
├── package.json                  # Manifiesto, dependencias y scripts de ejecución
├── package-lock.json             # Lockfile determinista de npm
├── tsconfig.json                 # Configuración del compilador TypeScript en modo estricto
├── Taskfile.yaml                  # Automatización de tareas de desarrollo y operaciones (go-task)
├── renovate.json                 # Renovate Bot: multi-gestor con cooldown de 7 días y auto-merge de parches npm
├── SECURITY.md                   # Política de seguridad y divulgación responsable de vulnerabilidades
├── SECURITY_RUNBOOK.md           # Guías de respuesta ante incidentes y rotación criptográfica de claves
├── infra/                        # Infraestructura como Código (IaC) y Manifiestos Cloud-Native
│   ├── helm/pokedex/             # Chart oficial de Helm 3 (Deployments, PgBouncer, HPA, NetPols)
│   ├── k8s/                      # ClusterPolicy de Kyverno para verificación de firmas Cosign
│   ├── opentofu/                 # Entornos Proxmox VE (on-premise), lab y cloud-template (blueprint prod)
│   ├── proxmox/                  # Plantillas Cloud-Init y contenedores LXC on-premise
│   └── ansible/                  # Playbooks de baseline de nodos y hardening de firewall UFW
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
└── scripts/                      # Utilidades de DX, auditoría y pruebas de estrés concurrentes
```

---

## 3. Descripción por Módulos y Dominios

### `apps/backend/` (API RESTful Node.js & TypeScript)

- **`server.ts`**: Servidor HTTP de alto rendimiento con **Express 4.21** y compilación previa con **esbuild**.
  - Middlewares de seguridad: cabeceras de hardening (`nosniff`, `SAMEORIGIN`), supresión de `X-Powered-By`, validación CORS fail-closed y body parser limitado a 250 KB.
  - Middlewares de **Rate Limiting** híbridos (scripts atómicos Lua en Redis con fallback local).
  - Autenticación timing-safe mediante `crypto.timingSafeEqual` sobre digests SHA-256.
  - Exportador nativo de métricas Prometheus (`/metrics`) y endpoints de salud (`/healthz`, `/readyz`).
- **`src/services/`**:
  - **`db.ts`**: Cliente relacional PostgreSQL 16 para almacenamiento `JSONB` de entidades y secuencias atómicas (`pokedex_id_seq`), coordinado con Redis 7 para almacenamiento en caché sub-3ms (`pokedex:list:*`) e invalidación reactiva.
  - **`auth.ts`**: Gestión estricta de credenciales con desacoplamiento entre `ADMIN_API_KEY` (clave administrativa) y `ADMIN_SESSION_SECRET` (firma HMAC SHA-256 de tokens con payload `role`, `exp`, `jti`).
  - **`ai.ts`**: Integración con Google Gemini 2.5 Flash (`@google/genai`) con timeout de 12s, límites de cuota diaria y fallbacks deterministas locales.

### `apps/frontend/` (Capa de Presentación y Proxy DMZ)

- **Frontend MPA Vanilla**: Catálogo con visualización Bento Grid, filtros dinámicos, paginación, paleta de tipos y consola de administración Backoffice con sanitización contra XSS (dos entrypoints Vite: `index.html` y `backoffice.html`).
- **Nginx Reverse Proxy**: Contenedor Alpine no-root con digest criptográfico fijado, compresión gzip y cabeceras CSP.

### `infra/` y `gitops/` (Infraestructura, Orquestación y GitOps)

- **Helm 3 Chart (`infra/helm/pokedex`)**: Despliegue altamente parametrizado con políticas NetworkPolicy Zero-Trust (Anti-SSRF, PgBouncer enforced isolation), soporte para External Secrets Operator, HPA v2 y PodDisruptionBudgets.
- **ArgoCD (`gitops/`)**: Sincronización continua declarativa en clústeres híbridos (Proxmox VE on-premise; prod cloud agnóstico como blueprint inactivo).

---

## 4. Convención de Extensión YAML

### 4.1. Regla Normativa

> **La extensión canónica y obligatoria para todo archivo YAML del monorepo es `.yaml`.**
> La extensión `.yml` está **prohibida para archivos nuevos**.

Esta regla aplica a todo el repositorio sin excepción: manifests de Kubernetes, values de Helm, definiciones de ArgoCD, workflows de GitHub Actions, configuraciones de herramientas, playbooks de Ansible e inventories.

### 4.2. Enforcement Automático

La convención no es una recomendación documental: es un **Quality Gate fail-closed** ejecutado por `scripts/check-yaml-extension.ts`.

| Elemento | Valor |
| --- | --- |
| Script del gate | `scripts/check-yaml-extension.ts` |
| Comando local (estándar) | `npm run lint:yaml` |
| Modo estricto (CI) | `npm run lint:yaml:strict` |
| Integración en `validate` | `npm run validate` |
| Paso de CI | `.github/workflows/ci.yaml`, job *Auditoría de Calidad y Complejidad* |
| Contrato de impacto | `.github/ci-impact.yaml`, regla `linting` |
| Suite de pruebas | `tests/security/yaml_extension_governance.test.ts` |

El gate opera con dos listas:

- **Deuda tolerada** (`LEGACY_YML_ALLOWLIST`): inventario de archivos `.yml` pre-existentes que aún no se migraron. Cualquier archivo `.yml` **fuera** de esta lista es una violación y bloquea el pipeline.
- **Detección de obsolescencia**: en modo estricto, una entrada del allowlist cuyo archivo ya fue renombrado a `.yaml` también falla. Esto obliga a **drenar la allowlist en el mismo commit** que migra los archivos, garantizando que el inventario nunca quede desincronizado.

### 4.3. Excepciones Permanentes

- **`.mega-linter.yml`**: nombre de configuración documentado por MegaLinter, pasado explícitamente vía la variable `MEGALINTER_CONFIG` en CI y en `Taskfile`. No se renombra.
- **Literales de terceros**: referencias a archivos YAML de proyectos externos (por ejemplo, el workflow `release.yaml` de `sigstore/gitsign` fijado en el `--certificate-identity` de Gitsign) **no** se renombran. Son claims criptográficos de supply chain y deben permanecer literales.

### 4.4. Deuda Técnica Vigente y Plan de Drenaje

El repositorio mantiene **1 archivo `.yml` heredado** frente a 102 archivos `.yaml` tras la Wave 3. La migración por waves queda **completa**: `.yaml` es la única extensión en uso, salvo la excepción permanente documentada.

| Wave | Alcance | Estado | Riesgo principal |
| --- | --- | --- | --- |
| 0 | Gobernanza (gate, tests, contrato de impacto) | Completada (PR #352) | Nulo |
| 1 | `infra/ansible/**`, `infra/monitoring/alerts.yaml`, `docker-compose*.yaml` | Completada (PR #354) | Globs y flags `-f` explícitos en `Taskfile` y `.vscode/tasks.json` |
| 2 | `Taskfile.yaml` | Completada (PR #355) | Numerosas referencias documentales |
| 3 | `.github/workflows/**` (16 workflows) | Completada | Rutas `uses:`, `subject` de Kyverno, required status checks y badge |

### Excepción permanente restante

- **`.mega-linter.yml`**: es el nombre de configuración documentado por MegaLinter, que además se pasa explícitamente vía la variable `MEGALINTER_CONFIG` en el workflow y en `Taskfile.yaml`.

### 4.5. SSOT de Comandos Operativos: `Taskfile.yaml`

`Taskfile.yaml` es la **única fuente de verdad operativa** de comandos del
repositorio. La CLI, VS Code y la documentación consumen esa misma definición.

`.vscode/tasks.json` es una **capa de presentación**: expone tareas frecuentes
como wrappers `task <nombre>` y no debe implementar lógica de orquestación
propia. Antes de esta decisión, el archivo reproducía comandos `helm`/`kubectl`
directos que ya existían en el Taskfile, lo que producía dos fuentes de verdad
con divergencia silenciosa (por ejemplo, la tarea "Test Endpoints" consultaba un
único deployment mientras `task k8s:test` valida API y frontend).

El contrato se blinda en `tests/security/iac_baseline_security.test.ts` (Dev DX),
que falla si se reintroduce un comando de orquestación o si un wrapper apunta a
una tarea inexistente del Taskfile.

> [!NOTE]
> Excepción deliberada: las tareas de `docker compose` de VS Code conservan sus
> flags `-f` (perfil dev con hot-reload) porque `task dev:compose` no los
> replica. Unificar ese perfil es una decisión de producto pendiente, no un
> refactor mecánico.

### Identidades de firma actualizadas en la Wave 3

> [!WARNING]
> Renombrar `ci.yaml` a `ci.yaml` cambia la **identidad del workflow firmante** que GitHub publica en los claims OIDC. Las políticas de admisión Kyverno que verifican las firmas Cosign declaraban el `subject` exacto `.../.github/workflows/ci.yaml@refs/heads/main`; si no se actualizan en el mismo commit, la verificación de supply chain fallaría en runtime aunque el pipeline fuera verde.
>
> Archivos actualizados: `infra/k8s/kyverno-cosign-policy.yaml` (Enforce) e `infra/k8s/policies/verify-image-signature.yaml` (Audit).
>
> Los required status checks del ruleset `main-protection` no se ven afectados: referencian el **nombre del job** (`Core CI / Auditoría de Calidad y Complejidad`), no el nombre del archivo.
> **Riesgo fail-open latente (resuelto en la Wave 1):** el job *Ansible Syntax Check* de `.github/workflows/infra.yaml` valida los playbooks mediante el glob `infra/ansible/playbooks/*.yml`. Si los playbooks se renombraran sin actualizar ese glob, el gate iteraría cero veces y **pasaría por vacuidad**, degradando un control fail-closed. El glob se actualizó a `*.yaml` en el mismo commit que el renombrado.
>
> `infra/ansible/playbooks/host_baseline.yaml` importa otro playbook mediante `import_playbook: security_hardening.yaml` (ruta relativa sin prefijo), lo que obliga a renombrar **de forma consistente** el playbook importado.
> **Resolución de nombre en la Wave 2:** `go-task` busca `Taskfile.yml`, `taskfile.yml`, `Taskfile.yaml` y `taskfile.yaml`, en ese orden de prioridad. El renombrado a `Taskfile.yaml` es soportado nativamente y no requiere flags adicionales. La variante `.dist` no se usa en este repositorio, por lo que no hay ambigüedad de resolución.

### 4.5. Beneficio para la Seguridad

La unificación no es cosmética. Mientras coexistan ambas extensiones, los globs de CI y las allowlists de Gitleaks deben recurrir a regex ambiguas del tipo `\.ya?ml`, que admiten rutas no previstas. Con una extensión única es posible usar **coincidencia exacta de ruta**, reduciendo la superficie ambigua de los controles de secrets scanning.

---

## 5. Gobernanza de Workspaces, Orquestación y Versionado

### 5.1. Naturaleza MPA de `@pokedex/frontend`

La aplicación cliente no es una SPA monolítica singular. La configuración de Vite (`vite.config.ts`) compila dos entrypoints independientes estructurados como una **Multi-Page Application (MPA)**:

1. **Catálogo Público (`index.html` $\rightarrow$ `src/pokedex.ts`):** Navegación interactiva, filtrado por tipos/generaciones, búsqueda por voz/texto, gráficos de stats y tema visual zero-FOUC.
2. **Consola Administrativa (`backoffice.html` $\rightarrow$ `src/backoffice.ts`):** Operaciones CRUD sobre el catálogo, gestión de autenticación, panel de eventos y telemetría de storage.

Ambas páginas comparten componentes modulares (`src/components/`) y servicios transversales (`src/shared/`), evitando cualquier duplicación de contratos de red, formateo o tipado.

### 5.2. Demarcación de Serving Estático: Producción vs. Desarrollo Local

En despliegues de producción y orquestación Kubernetes (GitOps ArgoCD):

- El tráfico web y estático es resuelto exclusivamente por los pods de **Nginx Alpine** (`apps/frontend/Dockerfile`, `infra/helm/pokedex/templates/web-deployment.yaml`).
- El Ingress enruta la raíz `/` hacia el Service de Nginx (`pokemon-web`) y las llamadas de API `/api/` directamente hacia el backend (`pokemon-api`).
- El serving de archivos estáticos implementado en `apps/backend/server.ts` opera como un **mecanismo de contingencia para desarrollo local y ejecución standalone**, permitiendo a los desarrolladores levantar el backend sin requerir un proxy reverso Nginx intermedio.

### 5.3. Política de Versionado Unificado (Single Source of Versioning)

El monorepo adopta un modelo de versión unificada centralizada:

- **Versión Semver Oficial:** Reside exclusivamente en el `package.json` raíz del repositorio (`version`), gobernada y promovida por la skill `repo-release` mediante tags `vX.Y.Z`.
- **Workspaces Internos:** Tanto `apps/backend/package.json` como `apps/frontend/package.json` declaran `"private": true` y mantienen un valor fijo (`1.0.0`). Los componentes del monorepo no se publican a registros npm públicos de forma atomizada, sino que se distribuyen como imágenes de contenedor OCI versionadas con el digest y tag semver global del release.

### 5.4. Orquestación Canónica: npm Workspaces

Para garantizar determinismo absoluto en la integración continua:

- **`npm workspaces` (SSOT de CI/CD):** Es el orquestador canónico, reproducible y obligatorio para pipelines de GitHub Actions, pre-commit hooks y Quality Gates. Los scripts raíz (`npm run build`, `npm run lint`, `npm test`) coordinan los workspaces sin dependencias externas de ejecución.
- **Turborepo:** retirado (ADR-019). Operaba solo como aceleración opt-in local, sin ser compuerta de CI, y con dos workspaces su caché no compensaba la herramienta adicional.
