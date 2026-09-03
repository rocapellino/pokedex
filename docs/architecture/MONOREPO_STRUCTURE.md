# 📂 Estructura del Monorepo y Organización por Dominios

Este documento detalla la estructura de directorios, convención de organización por dominios y propósito de cada componente dentro del monorepo **Pokémon DevOps Platform**.

---

## 📑 Tabla de Contenidos
1. [Filosofía de Diseño del Monorepo](#1-filosofía-de-diseño-del-monorepo)
2. [Árbol de Directorios Detallado](#2-árbol-de-directorios-detallado)
3. [Descripción por Módulos y Dominios](#3-descripción-por-módulos-y-dominios)

---

## 1. Filosofía de Diseño del Monorepo

El monorepo está organizado siguiendo una separación estricta de responsabilidades:
* **`apps/`**: Aloja exclusivamente el código fuente de las aplicaciones y servicios ejecutables (Frontend y Backend).
* **`infra/`**: Contiene la Infraestructura como Código (IaC), manifiestos declarativos de Kubernetes (`k8s/`), scripts de base de datos (`docker/`) y aprovisionamiento con Terraform (`terraform/`).
* **`docs/`**: Centraliza toda la documentación técnica, diseños de arquitectura, guías de buenas prácticas y manuales operativos.
* **`scripts/`**: Scripts auxiliares de automatización (despliegues K8s, pruebas de estrés concurrentes, siembra de datos).

---

## 2. Árbol de Directorios Detallado

```text
pokedex/
├── .github/                      # Automatizaciones de CI/CD (GitHub Actions)
│   ├── workflows/                # Pipelines de build, test y validación
│   └── pull_request_template.md  # Plantilla estándar para PRs
├── .vscode/                      # Configuración del editor y tareas automatizadas
│   └── tasks.json                # Tasks de Docker y Kubernetes Up/Down
├── apps/                         # Aplicaciones y código fuente por servicios
│   ├── api/                      # Backend REST API activo (Python 3.13 + FastAPI + Uvicorn)
│   │   ├── src/                  # Lógica de negocio, rutas asíncronas y conexión a BD
│   │   ├── tests/                # Suite de pruebas unitarias y de integración
│   │   ├── scripts/              # Script de siembra masiva (1025 Pokémon)
│   │   ├── requirements.txt      # Dependencias de Python
│   │   └── Dockerfile            # Construcción multi-stage segura (non-root)
│   └── web/                      # Frontend Web Nginx (SPA Pokédex)
│       ├── public/               # Assets estáticos (HTML5, CSS3, JS Vanilla)
│       ├── nginx.conf            # Configuración de proxy inverso y caché
│       └── Dockerfile            # Imagen ligera Nginx Alpine
├── src/                          # Dominio TypeScript y módulo de datos unificado
│   ├── pokemonData.ts            # Interfaces TypeScript (Pokemon, Stats) y dataset Gen I-IX
│   └── [legacy python]           # Archivos históricos (app.py, db.py) pendientes de deprecación
├── server.ts                     # Servidor unificado en TypeScript (Express + Gemini SDK)
├── public/                       # Frontend web modernizado (Catálogo interactivo + Backoffice CRUD)
├── infra/                        # Infraestructura como Código (IaC) y Manifiestos
│   ├── docker/                   # Scripts de inicialización (init.sql PostgreSQL)
│   ├── k8s/                      # Manifiestos declarativos de Kubernetes (Kustomize)
│   │   ├── 00-namespace.yaml
│   │   ├── 01-config-and-secrets.yaml
│   │   ├── 01b-postgres-init-configmap.yaml
│   │   ├── 02-postgres-statefulset.yaml
│   │   ├── 02b-pgbouncer.yaml
│   │   ├── 03-redis-deployment.yaml
│   │   ├── 04-api-deployment.yaml
│   │   ├── 05-web-deployment.yaml
│   │   ├── 06-hpa-autoscaling.yaml
│   │   ├── 07-ingress.yaml
│   │   ├── 08-db-seed-job.yaml
│   │   ├── 09-network-policies.yaml
│   │   └── kustomization.yaml
│   ├── terraform/                # Módulos y ambientes de Terraform
│   ├── ansible/                  # Playbooks de aprovisamiento y hardening
│   └── proxmox/                  # Templates LXC y cloud-init
├── docs/                         # Documentación técnica centralizada
│   ├── README.md                 # Índice general de documentación
│   ├── architecture/             # Diseños de arquitectura, seguridad, UI y monorepo
│   │   ├── ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md
│   │   ├── MOCKUPS_Y_DISENO_UI.md
│   │   ├── DATABASE_ANALYSIS.md
│   │   ├── KUBERNETES_SCALING_ANALYSIS.md
│   │   ├── SECURITY_AND_NETWORK_ISOLATION.md
│   │   └── MONOREPO_STRUCTURE.md
│   ├── best-practices/           # Guías de Git Flow y Dockerfiles seguros
│   │   ├── MEJORES_PRACTICAS_GIT.md
│   │   └── MEJORES_PRACTICAS_DOCKERFILE.md
│   ├── api/                      # Especificación de endpoints y contratos
│   │   └── API_SPECIFICATION.md
│   └── runbooks/                 # Manuales operativos y pruebas de estrés
│       ├── KUBERNETES_AUTOSCALING_GUIDE.md
│       └── STRESS_TESTING_GUIDE.md
├── scripts/                      # Scripts de automatización y herramientas
│   ├── k8s_deploy.sh             # Despliegue automatizado en K8s (Bash)
│   ├── proxmox_deploy.sh         # Despliegue automatizado en Proxmox VE (Bash)
│   ├── seal_secret.py            # Cifrado de secretos con Sealed Secrets (Python)
│   ├── seal_secret.sh            # Cifrado de secretos con Sealed Secrets (Bash)
│   ├── k8s_load_test.py          # Simulador de carga concurrente y estrés HPA
│   └── bulk_load_pokemons.py     # Script de carga masiva de datos (1.025 Pokémon)
├── docker-compose.yml            # Orquestación local para desarrollo con DMZ
├── pytest.ini                    # Configuración de pruebas Pytest
├── package.json                  # Manifiesto y scripts para el entorno TypeScript
└── requirements.txt              # Dependencias globales del monorepo Python
```

---

## 3. Descripción por Módulos y Dominios

### `apps/api/` (Backend Principal Python)
Microservicio desarrollado en Python 3.13 con **FastAPI** y servidor ASGI **Uvicorn**. Implementa consultas parametrizadas con caché en Redis, conexión a PostgreSQL mediante driver nativo `psycopg2` / PgBouncer, esquemas Pydantic v2 y endpoints REST asíncronos para la consulta, mutación y filtrado de Pokémon.

### `apps/web/` (Frontend Legacy Nginx)
Interfaz Single Page Application (SPA) en Vanilla HTML5/CSS3/JS, servida por Nginx 1.27. Actúa como proxy inverso local para enrutar las peticiones `/api/*` hacia el microservicio backend.

### `src/` (Directorio Raíz: Tipos TypeScript y Código Legado)
> [!WARNING]
> **Aclaración sobre `src/` raíz:**
> * **Código Activo:** Aloja [`src/pokemonData.ts`](file:///src/pokemonData.ts) con las interfaces de TypeScript (`Pokemon`, `PokemonStats`, etc.) que alimentan el servidor unificado `server.ts`.
> * **Código Legado:** Los archivos Python en la raíz de `src/` (`src/app.py`, `src/db.py`, `src/static/`, `src/templates/`) corresponden a una versión previa no modularizada. El backend Python oficial y activo del monorepo se encuentra exclusivamente en `apps/api/src/`. No se deben realizar modificaciones en `src/app.py` legacy.

### `infra/k8s/` (Kubernetes Manifests)
Manifiestos organizados y gestionados con Kustomize para desplegar StatefulSets (PostgreSQL), Deployments con autoescalado elástico HPA v2 (API y Web), PgBouncer, Redis, Ingress y NetworkPolicies de seguridad DMZ.
