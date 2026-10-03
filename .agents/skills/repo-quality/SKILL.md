---
name: repo-quality
description: Mejorar mantenibilidad y calidad del código sin imponer una reescritura.
---

# repo-quality

## Objetivo

Evaluar y elevar la mantenibilidad, legibilidad, robustez y adherencia a estándares de ingeniería en el código fuente de `rocapellino/pokedex`, promoviendo refactorizaciones incrementales y seguras sin requerir reescrituras masivas.

## Alcance y Verificaciones de Dominio

- **Tipado Estricto TypeScript:** Eliminación de tipos `any`, coherencia de genéricos y compilación sin errores (`npm run typecheck`).
- **Convención de Extensión YAML (archivos nuevos):**
  - Todo archivo YAML creado en el monorepo debe usar la extensión **`.yaml`**. La extensión `.yml` está **prohibida para archivos nuevos**.
  - Aplica a toda ruta del repositorio sin excepción: manifiestos de Kubernetes, values de Helm, definiciones de ArgoCD, workflows de GitHub Actions, configuraciones de herramientas, playbooks e inventories de Ansible.
  - **Excepciones:** solo se admite `.yml` cuando la extensión la impone una herramienta externa, y debe documentarse de forma explícita. El único caso vigente es `.mega-linter.yml`, nombre de configuración documentado por MegaLinter y pasado explícitamente vía la variable `MEGALINTER_CONFIG`.
  - **No confundir con literales de terceros:** los archivos YAML de proyectos externos (por ejemplo, el workflow `release.yaml` de `sigstore/gitsign` fijado en el `--certificate-identity` de Gitsign) son claims literales de supply chain y **no se renombran**. Este tipo de referencia no constituye una excepción a la política.
  - **Enforcement:** el gate `scripts/check-yaml-extension.ts` (`npm run lint:yaml`, y `npm run lint:yaml:strict` en CI) falla ante cualquier `.yml` fuera del allowlist. Para justificar una excepción hay que declararla en `LEGACY_YML_ALLOWLIST` con su motivo.
  - Contrato normativo: [docs/architecture/MONOREPO_STRUCTURE.md](../../../docs/architecture/MONOREPO_STRUCTURE.md) §4.
- **Arquitectura de Software y Separación de Capas:**
  - En `apps/backend`: Separación clara entre rutas, middlewares, controladores, servicios de dominio, repositorios Drizzle y validadores Zod.
  - En `apps/frontend`: Organización modular en Vanilla TypeScript, separación de UI del estado, encapsulamiento de llamadas API y saneamiento con DOMPurify.
- **Prevención de God Files y Monolitos Relocalizados:** Detección de módulos sobrecargados (*God files*), funciones desproporcionadas y carpetas cajón de sastre sin cohesión (control de regresión histórica estilo `server.ts` 1.178 LOC → 280 LOC).
- **Código Muerto y Exports sin Importador:** Detectar exports que ningún módulo importa, en especial los re-exports declarados "por retrocompatibilidad" y los alias de funciones (por ejemplo, un `verifySessionToken` que solo envuelve a `verifySessionTokenDetailed`). Para cada export, buscar importadores en `apps/**`, `tests/**` y `scripts/**`; sin importadores, el candidato pasa al [protocolo único de depuración](../_shared/cleanup-protocol.md) con estado `DELETE` o `REVIEW`. No introducir herramientas nuevas para esto salvo beneficio demostrado (*Economía de Herramientas*, [methodology.md](../_shared/methodology.md) §4).
- **Métricas Estructurales y Acoplamiento:** Evaluación multidimensional de acoplamiento aferente/eferente ($C_a$, $C_e$), índice de inestabilidad ($I$), cohesión (LCOM), complejidad ciclomática y detección de dependencias circulares.
- **Manejo Robusto de Errores y Logging:**
  - Registro estructurado con Pino incorporando correlación (`X-Request-Id`).
  - Prohibición estricta de captura silenciosa de excepciones (`catch (e) {}` sin log o manejo).
  - Códigos de estado HTTP semánticos y esquemas de error normalizados.
- **Gobernanza Dinámica de Pre-Commit y Quality Gates Locales:**
  - Inspección dinámica de configuración: Verificar si existe archivo de configuración de hooks en la raíz del repositorio (`.pre-commit-config.yaml`). Si no existe, clasificar el estado como `NOT_CONFIGURED`.
  - Si existe configuración, parsear dinámicamente los repositorios y hooks declarados en tiempo de ejecución, determinando su aplicabilidad frente a las extensiones y rutas de los archivos modificados en el diff.
  - Verificación de disponibilidad del CLI en el entorno local (`pre-commit --version`). Si el comando no está disponible en el PATH, reportar `NOT_AVAILABLE_LOCAL / CI_REQUIRED` delegando la validación a CI sin registrar falsos fallos locales.
  - Si el CLI está disponible y aplican hooks, ejecutar selectivamente sobre los archivos modificados (`pre-commit run --files <archivos>`).
  - Clasificación fáctica del resultado: `EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE_LOCAL / CI_REQUIRED`, `NOT_CONFIGURED`, `NOT_APPLICABLE` o `NOT_EXECUTED`.
  - Principio de complementariedad: `pre-commit` es un control previo local que complementa y no sustituye los pipelines integrales de CI/CD.
- **Compuerta de Diagnósticos de IDE y Análisis Estático Local (Zero Problems Gate):**
  - Todo archivo nuevo o modificado en el diff debe estar libre de advertencias y errores reportados en el panel *Problems* del IDE (diagnósticos de TypeScript, ESLint, SonarLint/SonarQube).
  - Reglas SonarQube críticas a verificar proactivamente antes de commit:
    - `typescript:S8786`: Simplificar expresiones regulares para evitar complejidad super-lineal (ReDoS). Favorecer análisis de cadenas secuenciales (`startsWith`, `slice`, `indexOf`) frente a regex con cuantificadores abiertos sobre clases solapadas.
    - `typescript:S4036`: Sanitizar la variable `PATH` y llamadas a procesos del sistema operativo: fijar binarios explícitos (`gh.exe`/`gh`), evitar inyección por shell (`shell: false`) y aislar argumentos.
    - `typescript:S3776`: Mantener la complejidad cognitiva controlada evitando anidamientos excesivos.
  - Verificación por Agentes de IA: Los agentes deben revisar activamente las advertencias del IDE o utilizar las herramientas MCP de SonarQube (`analyze_code_snippet`) para certificar que el código en staged no introduzca code smells ni vulnerabilidades.

## Comandos

- `/repo-quality`: Evaluación integral de calidad y mantenibilidad del código en el monorepo.
- `/repo-quality precommit`: Detección dinámica, auditoría y ejecución selectiva de hooks de pre-commit sobre el diff activo.

- `/repo-quality backend`: Auditoría específica de patrones, middlewares y rutas en `apps/backend`.
- `/repo-quality frontend`: Auditoría de componentes, manipulación de DOM y modularidad en `apps/frontend`.
- `/repo-quality structure`: Evaluación multidimensional de cohesión, acoplamiento ($C_a, C_e, I$) y dependencias circulares.
- `/repo-quality godfiles`: Detección precoz de archivos o módulos con acumulación patológica de responsabilidades.
- `/repo-quality hotspots`: Identificación de los archivos con mayor deuda técnica, complejidad y churn.
- `/repo-quality dead-code`: Detección de exports, re-exports y alias sin importador.

## Referencias Especializadas

- **Métricas Estructurales:** [references/structural-metrics.md](references/structural-metrics.md)
- **Acoplamiento y Cohesión:** [references/coupling-and-cohesion.md](references/coupling-and-cohesion.md)
- **Detección de Monolitos:** [references/monolith-detection.md](references/monolith-detection.md)
- **Guías de Refactorización:** [references/refactoring-guidelines.md](references/refactoring-guidelines.md)

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Planificar las mejoras incrementales mediante [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-refactor`.
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de calidad, planes) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
