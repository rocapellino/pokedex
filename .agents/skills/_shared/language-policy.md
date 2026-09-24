# Política Canónica de Idioma para Comunicación y Artefactos

Este documento establece la política transversal y obligatoria sobre el uso del idioma en las interacciones de los agentes y la generación de artefactos en el repositorio `rocapellino/pokedex`.

---

## 1. Principio Fundamental

> [!IMPORTANT]
> El idioma operativo para toda **comunicación destinada a personas** en este proyecto es estrictamente el **español**.

Cualquier contenido, reporte, mensaje o propuesta generado por un agente o skill para ser leído por desarrolladores, mantenedores o usuarios debe redactarse en español con tono profesional, técnico y directo.

---

## 2. Contenido Obligatoriamente en Español

Todo artefacto o texto orientado a humanos generado por las skills debe redactarse íntegramente en español:

- **Pull Requests:**
  - Títulos de Pull Requests (siguiendo Conventional Commits con descripción en español, ej. `feat(api): implementar validación de tipos con Zod`).
  - Descripciones y resúmenes ejecutivos del cambio.
  - Secciones descriptivas de contexto, justificación e impacto.
  - Checklists y comentarios de estado de validación.
  - Comentarios de revisión de código (*review comments*), retroalimentación y sugerencias.
- **Issues y Tareas:**
  - Títulos, descripciones, criterios de aceptación y actualizaciones de estado.
- **Reportes y Auditorías:**
  - Diagnósticos técnicos, evaluaciones de arquitectura y auditorías de seguridad.
  - Planes de cambio (`change-plan.md`) y planes de modernización o refactorización.
  - Documentos de cierre, retrospectivas y sumarios.
- **Documentación:**
  - Nueva documentación técnica en `docs/`, guías operativas, runbooks y ADRs.
- **Interacción y Mensajería:**
  - Respuestas al usuario en chats de pair-programming.
  - Mensajes de progreso, advertencias, recomendaciones y conclusiones.

---

## 3. Elementos que Deben Mantenerse en Inglés

Para evitar traducciones forzadas, ambiguas o que rompan la compatibilidad técnica, los siguientes elementos deben preservarse en su forma canónica en **inglés**:

- **Nombres de Herramientas y Productos Oficiales:**
  - GitHub, GitHub Actions, Pull Request, Git, Kubernetes, Helm, OpenTofu, Ansible, ArgoCD, Docker, Docker Compose, pre-commit, Trivy, Semgrep, Gitleaks, SonarQube / SonarCloud, MegaLinter, Playwright, Lighthouse, Pino, Drizzle ORM, Zod, Redis, PostgreSQL.
- **Comandos de Terminal y Sintaxis:**
  - Invocaciones CLI exactas (ej. `npm test`, `git checkout -b`, `helm lint`, `pre-commit run`).
- **Nombres de Archivos y Rutas:**
  - Rutas del sistema de archivos (ej. `apps/backend/src/server.ts`, `.github/workflows/ci.yml`).
- **Identificadores Técnicos y Código:**
  - Nombres de clases, tipos, interfaces, variables, funciones, métodos, decoradores, constantes y tags de lenguajes (ej. `Express`, `ZodSchema`, `ClusterSecretStore`, `targetRevision`).
- **Nombres de APIs y Endpoints:**
  - Identificadores de endpoints HTTP (ej. `GET /api/v1/pokemons`, `/healthz`, `/metrics`).
- **Nombres Propios de Protocolos y Estándares:**
  - OIDC, JWT, SHA-256, TLS 1.3, AES-256-CBC, PBKDF2, REST, JSON, YAML, SBOM CycloneDX, SLSA Provenance.
- **Mensajes Originales de Herramientas:**
  - Trazas de pila (*stack traces*), logs literales o salidas estándar de compiladores cuando se citan textualmente para sustentar un diagnóstico.

---

## 4. Reglas Anti-Traducción Artificial

No traducir literalmente términos técnicos arraigados en el ecosistema. Ejemplos de uso correcto vs. incorrecto:

| Término Técnico Original | Uso Correcto | Uso Incorrecto (Prohibido) |
| :--- | :--- | :--- |
| Pull Request / PR | Pull Request / PR | *Petición de extracción / Solicitud de tiro* |
| Merge | Merge / Integración | *Refundición / Fusión casera* |
| Commit | Commit | *Encomienda / Remisión* |
| Rollout restart | Rollout restart | *Reinicio de despliegue progresivo* |
| Cluster | Clúster (o Cluster) | *Cúmulo / Racimo* |
| Framework | Framework | *Marco de trabajo* |
| Pipeline | Pipeline / Flujo | *Tubería* |
| Hook | Hook / Disparador | *Gancho* |
| Secret Scanning | Secret Scanning | *Escaneo de secretos* (aceptable) / *Rastreo secreto* |

---

## 5. Aplicación Transversal en las Skills

Toda skill alojada en `.agents/skills/` debe incorporar esta política como referencia obligatoria. Al formular preguntas, reportar hallazgos o estructurar PRs, la verificación del idioma forma parte del Quality Gate previo a la finalización de cualquier tarea.
