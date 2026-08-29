# 📚 Portal de Documentación Técnica

Bienvenido al centro de documentación del monorepo **Pokémon DevOps**. Aquí se concentran todas las guías de arquitectura, mejores prácticas, contratos de API y manuales operativos.

---

## 📑 Mapa de la Documentación

### 1. 🏗️ Arquitectura y Decisiones de Diseño ([`docs/architecture/`](./architecture/))
* 📂 [**MONOREPO_STRUCTURE.md**](./architecture/MONOREPO_STRUCTURE.md): Estructura detallada de directorios, convención de organización por dominios (`apps/`, `infra/`, `docs/`, `scripts/`) y responsabilidades de cada componente.
* 📊 [**DATABASE_ANALYSIS.md**](./architecture/DATABASE_ANALYSIS.md): Análisis de persistencia de datos (SQL relacional vs NoSQL vs Híbrido), modelado entidad-relación basado en WikiDex y almacenamiento de assets multimedia.
* ☸️ [**KUBERNETES_SCALING_ANALYSIS.md**](./architecture/KUBERNETES_SCALING_ANALYSIS.md): Diseño de autoescalado horizontal (**HPA v2**), garantía de consistencia de base de datos única y análisis comparativo entre Load Balancer (L4) e Ingress Controller (L7).
* 🛡️ [**SECURITY_AND_NETWORK_ISOLATION.md**](./architecture/SECURITY_AND_NETWORK_ISOLATION.md): Modelo de defensa en profundidad, segmentación DMZ de 3 capas y políticas de red (NetworkPolicies) para aislamiento estricto de base de datos y caché.
* 🔐 [**SECRETS_MANAGEMENT_SEALED_SECRETS.md**](./architecture/SECRETS_MANAGEMENT_SEALED_SECRETS.md): Gestión de secretos sin texto plano en Git, plantillas `.env.example`, detección con Gitleaks y cifrado asimétrico con Bitnami Sealed Secrets.

---

### 2. 🌿 Estándares y Mejores Prácticas ([`docs/best-practices/`](./best-practices/))
* 🌿 [**MEJORES_PRACTICAS_GIT.md**](./best-practices/MEJORES_PRACTICAS_GIT.md): Estrategia de ramas (GitHub Flow), estándar de commits convencionales, protección de ramas, higiene de repositorio y prevención de fuga de secretos.
* 🐳 [**MEJORES_PRACTICAS_DOCKERFILE.md**](./best-practices/MEJORES_PRACTICAS_DOCKERFILE.md): Construcción multi-stage, reducción de superficie de ataque (usuario no-root `appuser`), optimización de capas de caché y healthchecks nativos.

---

### 3. 📡 Contratos e Interfaces de API ([`docs/api/`](./api/))
* 📡 [**API_SPECIFICATION.md**](./api/API_SPECIFICATION.md): Especificación formal de los endpoints REST (`/pokemons`, `/pokemons/<id>`, `/healthz`), query params, esquemas JSON y códigos de estado HTTP.

---

### 4. 📖 Manuales Operativos y Runbooks ([`docs/runbooks/`](./runbooks/))
* 🚀 [**KUBERNETES_AUTOSCALING_GUIDE.md**](./runbooks/KUBERNETES_AUTOSCALING_GUIDE.md): Manual paso a paso para el despliegue de la infraestructura en Kubernetes, siembra de datos y diagnóstico.
* 🧪 [**STRESS_TESTING_GUIDE.md**](./runbooks/STRESS_TESTING_GUIDE.md): Guía de ejecución de pruebas de estrés, benchmark de concurrencia y validación del comportamiento dinámico del HPA.
