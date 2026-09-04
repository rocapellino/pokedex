# 📚 Portal de Documentación Técnica

Bienvenido al centro de documentación del monorepo **Pokémon DevOps Platform**. Aquí se concentran todas las guías de arquitectura, mejores prácticas, contratos de API y manuales operativos.

---

## 📑 Mapa de la Documentación

### 1. 🏗️ Arquitectura y Decisiones de Diseño ([`docs/architecture/`](./architecture/))
* 🎨 [**MOCKUPS_Y_DISENO_UI.md**](./architecture/MOCKUPS_Y_DISENO_UI.md): **Mockups visuales de alta fidelidad** del Catálogo Público, Ficha de Detalle de Pokémon y Panel Backoffice CRUD, acompañados de tokens de diseño y directrices de accesibilidad.
* 🔬 [**ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md**](./architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md): **Análisis técnico de lenguajes (TypeScript vs. Python vs. Go)**, evaluación de migración de stack, arquitectura limpia y mejores prácticas de ingeniería de software.
* 🔄 [**APPLICATION_LIFECYCLE.md**](./architecture/APPLICATION_LIFECYCLE.md): **Ciclo de vida integral (SDLC & DevOps)** de la aplicación con diagrama de flujo de punta a punta (Linear, Git, CI/CD, SemVer Auto-Release, K8s/Helm y Dependabot).
* 📂 [**MONOREPO_STRUCTURE.md**](./architecture/MONOREPO_STRUCTURE.md): Estructura detallada de directorios, convención de organización por dominios (`apps/`, `infra/`, `docs/`, `scripts/`, `src/`) y responsabilidades de cada componente.
* 📊 [**DATABASE_ANALYSIS.md**](./architecture/DATABASE_ANALYSIS.md): Análisis de persistencia de datos (SQL relacional vs NoSQL vs Híbrido), modelado entidad-relación y almacenamiento de assets multimedia.
* ☸️ [**KUBERNETES_SCALING_ANALYSIS.md**](./architecture/KUBERNETES_SCALING_ANALYSIS.md): Diseño de autoescalado horizontal (**HPA v2**), garantía de consistencia de base de datos única y análisis comparativo entre Load Balancer (L4) e Ingress Controller (L7).
* 🛡️ [**SECURITY_AND_NETWORK_ISOLATION.md**](./architecture/SECURITY_AND_NETWORK_ISOLATION.md): Modelo de defensa en profundidad, segmentación DMZ de 3 capas y políticas de red (NetworkPolicies) para aislamiento estricto de base de datos y caché.
* 🔐 [**SECRETS_MANAGEMENT_SEALED_SECRETS.md**](./architecture/SECRETS_MANAGEMENT_SEALED_SECRETS.md): Gestión de secretos sin texto plano en Git, plantillas `.env.example`, detección con Gitleaks y cifrado asimétrico con Bitnami Sealed Secrets.
* 🖥️ [**PROXMOX_DEPLOYMENT_GUIDE.md**](./architecture/PROXMOX_DEPLOYMENT_GUIDE.md): Guía de virtualización y despliegue on-premise en Proxmox VE (LXC y Cloud-Init).
* ☁️ [**CLOUD_INFRASTRUCTURE_DESIGN.md**](./architecture/CLOUD_INFRASTRUCTURE_DESIGN.md): Arquitectura Multi-Cloud con Terraform para AWS, GCP y Azure.

---

## 2. 🌿 Estándares y Mejores Prácticas ([`docs/best-practices/`](./best-practices/))
* 🌿 [**MEJORES_PRACTICAS_GIT.md**](./best-practices/MEJORES_PRACTICAS_GIT.md): Estrategia de ramas (GitHub Flow), estándar de commits convencionales, protección de ramas, higiene de repositorio y prevención de fuga de secretos.
* 🐳 [**MEJORES_PRACTICAS_DOCKERFILE.md**](./best-practices/MEJORES_PRACTICAS_DOCKERFILE.md): Construcción multi-stage, reducción de superficie de ataque (usuario no-root), optimización de capas de caché y healthchecks nativos.

---

## 3. 📡 Contratos e Interfaces de API ([`docs/api/`](./api/))
* 📡 [**API_SPECIFICATION.md**](./api/API_SPECIFICATION.md): Especificación formal de los endpoints REST (`/pokemons`, `/pokemons/:id`, `/healthz`, `/metrics`), query params, esquemas JSON y códigos de estado HTTP.

---

## 4. 📖 Manuales Operativos y Runbooks ([`docs/runbooks/`](./runbooks/))
* ⎈ [**HELM_DEPLOYMENT_GUIDE.md**](./runbooks/HELM_DEPLOYMENT_GUIDE.md): **Manual integral de despliegue con Helm 3**, valores por entorno, empaquetado y GitOps con Argo CD.
* 🚀 [**KUBERNETES_AUTOSCALING_GUIDE.md**](./runbooks/KUBERNETES_AUTOSCALING_GUIDE.md): Manual paso a paso para el escalado elástico en Kubernetes, siembra de datos y diagnóstico.
* 🧪 [**STRESS_TESTING_GUIDE.md**](./runbooks/STRESS_TESTING_GUIDE.md): Guía de ejecución de pruebas de estrés con k6 y generador concurrente de carga HPA.

---

## 5. 🤖 DevOps, CI/CD y Herramientas ([`docs/devops/`](./devops/))
* 🤖 [**GITHUB_WORKFLOWS_GUIDE.md**](./devops/GITHUB_WORKFLOWS_GUIDE.md): Guía completa de pipelines de CI/CD (GitHub Actions), path filtering y flujo con Linear.
* 🌿 [**GIT_BRANCHING_AND_MERGE_WORKFLOW.md**](./devops/GIT_BRANCHING_AND_MERGE_WORKFLOW.md): Guía y diagramas de creación de ramas, Conventional Commits, Pull Requests, merge a `main` y limpieza.
* 🛠️ [**TOOLS_AND_TECH_STACK.md**](./devops/TOOLS_AND_TECH_STACK.md): Catálogo exhaustivo de herramientas utilizadas en el proyecto y stack de observabilidad (Prometheus, Grafana, Loki, Tempo).
