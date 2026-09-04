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
│   └── tasks.json                # Tasks automatizadas
├── apps/                         # Aplicaciones y código fuente por servicios
│   └── web/                      # Frontend Web (SPA Pokédex + Backoffice)
│       └── public/               # Assets estáticos (HTML5, CSS3, JS Vanilla con protección XSS)
│           ├── index.html        # Catálogo público interactivo
│           ├── backoffice.html   # Consola de administración CRUD
│           ├── css/              # Estilos visuales y diseño Bento
│           └── js/               # Lógica de cliente, modales y toasts sanitizados
├── src/                          # Módulos de dominio y servicios TypeScript
│   ├── types.ts                  # Interfaces nativas (Pokemon, Characteristics, Stats, EvolutionNode)
│   ├── data/
│   │   └── initialPokemons.ts    # Catálogo inicial de Pokémon (Generaciones I a IX)
│   └── services/
│       └── ai.ts                 # Integración con Google AI Studio (@google/genai) y fallbacks
├── server.ts                     # Servidor Full-Stack (Express, Rate Limiter, Timing-Safe Auth, Metrics)
├── Dockerfile                    # Construcción multi-stage de producción (Node.js 22 Alpine)
├── package.json                  # Manifiesto y scripts npm (dev, build, lint, start, test)
├── package-lock.json             # Lockfile determinista de npm
├── tsconfig.json                 # Configuración del compilador TypeScript
├── Taskfile.yml                  # Automatización de tareas de desarrollo y operaciones
├── infra/                        # Infraestructura como Código (IaC) y Manifiestos
│   ├── docker/                   # Scripts de inicialización
│   ├── k8s/                      # Manifiestos declarativos de Kubernetes (Kustomize)
│   ├── helm/                     # Chart de Helm para despliegue Cloud-Native
│   ├── terraform/                # Módulos y ambientes de Terraform
│   ├── ansible/                  # Playbooks de aprovisamiento y hardening
│   └── proxmox/                  # Templates LXC y cloud-init
├── docs/                         # Documentación técnica centralizada
│   ├── README.md                 # Índice general de documentación
│   ├── architecture/             # Diseños de arquitectura, seguridad, UI y monorepo
│   ├── best-practices/           # Guías de Git Flow y Dockerfiles seguros
│   ├── api/                      # Especificación de endpoints y contratos
│   └── runbooks/                 # Manuales operativos y pruebas de estrés
└── scripts/                      # Scripts de automatización y herramientas de infraestructura
```

---

## 3. Descripción por Módulos y Dominios

### `server.ts` (Servidor Full-Stack Node.js & TypeScript)
Punto de entrada principal del servicio. Implementa:
* Servidor HTTP de alto rendimiento con **Express 4.21**.
* Catálogo indexado en memoria con `Map<number, Pokemon>` para resolución $O(1)$ por ID.
* Soporte para ETag condicional (`If-None-Match`), `Cache-Control` y compresión.
* Middlewares de **Rate Limiting** con ventana deslizante en memoria (10 req/min para IA, 30 req/min para mutaciones CRUD).
* Autenticación segura mediante `crypto.timingSafeEqual` sobre digests SHA-256 contra ataques de canal lateral.
* Exportador nativo de métricas en formato Prometheus (`/metrics`) y endpoints de salud (`/healthz`, `/readyz`).
* Servido de los assets estáticos del catálogo y la consola administrativa.

### `src/` (Lógica de Dominio y Servicios de IA)
* **`src/types.ts`**: Contratos e interfaces TypeScript fuertemente tipadas compartidas entre el catálogo y el backend.
* **`src/data/initialPokemons.ts`**: Dataset semilla exhaustivo con especímenes de Generaciones I a IX, matrices de estadísticas base y árboles evolutivos.
* **`src/services/ai.ts`**: Cliente del SDK `@google/genai` con modelo Gemini 2.5 Flash y arquitectura de *graceful fallback* para diagramas Mermaid, mockups de UI y generación de imágenes.

### `apps/web/public/` (Frontend y Backoffice)
* **Catálogo Público (`index.html`)**: Bento Grid, filtros por tipo, búsqueda multigenacional y modal de evoluciones sanitizado contra XSS.
* **Backoffice (`backoffice.html`)**: Consola de gestión de altas, bajas y modificaciones con autenticación protegida y notificaciones seguras con `textContent`.

### `infra/` (Kubernetes, Helm, Terraform y Ansible)
Manifiestos y configuraciones declarativas para despliegues locales y en la nube (Kubernetes, Helm 3, Proxmox VE, Terraform).
