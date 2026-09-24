# Diagnóstico y Análisis Estructural del Proceso de Pull Requests en Skills

**Fecha:** 2026-09-24  
**Repositorio:** `rocapellino/pokedex`  
**Área:** Framework de Agentes (`.agents/skills/`)  
**Documento:** Diagnóstico de Proceso de Preparación y Generación de PRs (Fase 0)

---

## 1. Resumen Ejecutivo

Este diagnóstico evalúa el estado del framework de skills (`.agents/skills/`) en relación con la preparación, validación y generación de Pull Requests (PRs).

El objetivo es transformar `repo-pr` en el componente canónico responsable de preparar y validar la representación final de los cambios como Pull Request, garantizando:

1. Consumo dinámico de [`.github/pull_request_template.md`](../../../../.github/pull_request_template.md) como Fuente Única de Verdad (SSOT).
2. Incorporación de [`.pre-commit-config.yaml`](../../../../.pre-commit-config.yaml) dentro del modelo de calidad gestionado por `repo-quality` y consumido como evidencia por `repo-pr`.
3. Política transversal de idioma que establezca el español como estándar operativo para toda comunicación humana, preservando la nomenclatura técnica canónica en inglés.
4. Definición de un PR Readiness Gate formal con estados de validación no ambiguos (`PASS`, `FAIL`, `NOT_APPLICABLE`, `NOT_EXECUTED`, `BLOCKED`), prohibiendo tratar validaciones omitidas como aprobadas.
5. Preservación estricta de responsabilidades entre `repo-lifecycle`, `repo-impact`, `repo-quality`, `repo-testing`, `repo-security`, `repo-pr`, `repo-docs` y `repo-release`.

---

## 2. Estado Actual del Proceso de PR

### 2.1 Enfoque Actual de `repo-pr`

Actualmente, [`.agents/skills/repo-pr/SKILL.md`](../../../../.agents/skills/repo-pr/SKILL.md) está orientada principalmente a la **revisión pasiva de código** sobre un PR existente o diff:

- Define pautas de revisión para correctitud, cobertura, seguridad e infraestructura.
- Carece de instrucciones operativas para **preparar y generar** un PR a partir de un cambio local.
- No contiene mecanismos para descubrir y mapear el template oficial de PR del repositorio.
- No dispone de un checklist estructurado ni de un gate explícito de readiness previo a la apertura de un PR.

### 2.2 Desconexión del Template de PR

El repositorio cuenta con [`.github/pull_request_template.md`](../../../../.github/pull_request_template.md), el cual define:

- Issues vinculados (Linear / GitHub).
- Tipo de cambio según Conventional Commits (`feat`, `fix`, `refactor`, `infra`, `ci/cd`, `test`, `chore`, `docs`).
- Resumen descriptivo del cambio.
- Componentes afectados (`apps/backend`, `apps/frontend`, `infra`, `scripts`, `docs/.github`).
- Checklist exhaustivo de pruebas y verificaciones realizadas.
- Variables de entorno y breaking changes.

Actualmente, ninguna skill lee dinámicamente este archivo. Al preparar PRs de forma no automatizada, los agentes tienden a inventar la estructura de la descripción o copiar fragmentos de memoria, perdiendo sincronización con el template real si este se actualiza.

### 2.3 Estado de `pre-commit` en el Repositorio

El archivo [`.pre-commit-config.yaml`](../../../../.pre-commit-config.yaml) existe en la raíz del repositorio y define:

- `pre-commit/pre-commit-hooks` (v5.0.0): `trailing-whitespace`, `end-of-file-fixer`, `check-yaml`, `check-json`, `check-added-large-files`, `check-merge-conflict`.
- `gitleaks/gitleaks` (v8.24.0): Detección de secretos.
- `compilerla/conventional-pre-commit` (v4.0.0): Validación de mensajes de commit.

**Hallazgos respecto a pre-commit:**

1. Ninguna skill actual referencia ni valida la configuración de `pre-commit`.
2. En el entorno local de desarrollo de Windows, el binario `pre-commit` no se encuentra instalado en el PATH del sistema.
3. El framework no contempla la diferenciación de estados de disponibilidad de herramientas locales (`EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE`, `NOT_APPLICABLE`, `NOT_EXECUTED`).
4. Existe el riesgo de que una skill asuma que `pre-commit` reemplaza las pruebas y linters de CI, o que afirme falsamente que pre-commit fue ejecutado sin evidencia.

### 2.4 Ausencia de Política Formal de Idioma

El monorepo cuenta con documentación técnica en español y skills en español, pero no existe una política transversal codificada en `.agents/skills/_shared/`.

Esto genera incoherencias en las interacciones de los agentes:

- Descripciones de PR generadas ocasionalmente en inglés.
- Títulos de commits o PRs con mezcla de idiomas.
- Comentarios de revisión o resúmenes redactados en inglés cuando el equipo opera en español.

---

## 3. Archivos Involucrados

| Archivo | Rol Actual | Impacto del Proyecto |
| :--- | :--- | :--- |
| [`.agents/skills/repo-pr/SKILL.md`](../../../../.agents/skills/repo-pr/SKILL.md) | Revisión de código en PRs | Ampliar a preparación, generación y readiness gate |
| [`.agents/skills/repo-quality/SKILL.md`](../../../../.agents/skills/repo-quality/SKILL.md) | Quality gates estáticos de código | Incorporar detección, auditoría y ejecución de `pre-commit` |
| [`.agents/skills/repo-lifecycle/SKILL.md`](../../../../.agents/skills/repo-lifecycle/SKILL.md) | Orquestador integral | Integrar etapa formal de `repo-pr` previa a release |
| [`.agents/skills/_shared/language-policy.md`](../../../../.agents/skills/_shared/language-policy.md) | Inexistente | Crear como SSOT transversal de idioma español |
| [`.agents/skills/repo-pr/references/pr-template-policy.md`](../../../../.agents/skills/repo-pr/references/pr-template-policy.md) | Inexistente | Crear guía de descubrimiento y consumo de template |
| [`.agents/skills/repo-pr/references/pr-validation-policy.md`](../../../../.agents/skills/repo-pr/references/pr-validation-policy.md) | Inexistente | Crear especificación del Readiness Gate y estados |
| [`.github/pull_request_template.md`](../../../../.github/pull_request_template.md) | Template estático de PR | SSOT de estructura de PR (solo lectura para skills) |
| [`.pre-commit-config.yaml`](../../../../.pre-commit-config.yaml) | Configuración de hooks Git | SSOT de hooks pre-commit (solo lectura para skills) |

---

## 4. Duplicaciones y Solapamientos Encontrados

1. **Duplicación de Auditoría de Código vs. Preparación de PR:**
   - Si `repo-pr` ejecutara directamente linters, SAST y suites de pruebas, duplicaría las responsabilidades ya asignadas a `repo-quality`, `repo-security` y `repo-testing`.
   - **Solución:** `repo-pr` debe ser un consumidor de evidencias (*evidence consumer*), no un ejecutor redundante de auditorías.
2. **Riesgo de Hardcodear el Template de PR:**
   - Si se copia la estructura de `.github/pull_request_template.md` dentro de `repo-pr/SKILL.md`, cualquier modificación futura al template en GitHub quedará desincronizada.
   - **Solución:** `repo-pr` debe instruir al agente a leer dinámicamente el archivo del template en tiempo de ejecución.
3. **Validaciones en Checklists sin Evidencia:**
   - El template de PR contiene casillas de verificación para 9 tipos de validaciones (`npm run test:coverage`, `npm run lint`, Playwright, Lighthouse, MegaLinter, SonarCloud, Semgrep/Trivy, Docker/Helm).
   - Sin una regla estricta de evidencia, los agentes marcan casillas (`[x]`) de pruebas que jamás se ejecutaron en el entorno local.

---

## 5. Matriz de Responsabilidades (RACI)

Para evitar duplicaciones y mantener límites claros entre skills:

| Fase del Proceso | `repo-lifecycle` | `repo-impact` | `repo-quality` | `repo-testing` | `repo-security` | `repo-docs` | `repo-pr` | `repo-release` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1. Contexto & Auditoría | **A** | C | C | C | C | C | I | I |
| 2. Clasificación de Impacto | I | **A / R** | C | C | C | C | I | I |
| 3. Ejecución Quality Gates / Pre-commit | I | I | **A / R** | C | C | I | C | I |
| 4. Ejecución Pruebas Especializadas | I | I | I | **A / R** | I | I | C | I |
| 5. Verificaciones de Seguridad / SAST | I | I | I | I | **A / R** | I | C | I |
| 6. Integridad Documental | I | I | I | I | I | **A / R** | C | I |
| 7. Estructuración y Gate de PR | I | C | C | C | C | C | **A / R** | I |
| 8. Publicación y Corte de Versión | **A** | I | I | I | I | I | I | **A / R** |

*Leyenda: **R** = Responsable de ejecución, **A** = Accountable (aprueba/orquesta), **C** = Consultado / Proveedor de evidencia, **I** = Informado.*

---

## 6. Conflictos Identificados y Reglas de Resolución

### Conflicto A: PR vs. Release (Despliegue Prematuro)

- **Conflicto:** Se tiende a asumir que la creación o aprobación de un PR implica que la funcionalidad ya está en producción o lista en GitOps.
- **Resolución:** Aplicar estrictamente el modelo transversal de cuatro niveles (`MAIN` → `RELEASE` → `GITOPS` → `RUNTIME`). Un PR solo impacta a la rama candidata (`MAIN`). Toda afirmación en la descripción del PR debe ceñirse al estado `IMPLEMENTED` o `CONFIGURED`.

### Conflicto B: Herramientas no disponibles vs. Validación Aprobada

- **Conflicto:** Si una herramienta como `pre-commit` o `playwright` no está instalada en el entorno local, se tiende a marcar el checklist como aprobado (`[x]`) para "pasar el gate", o a fallar catastróficamente.
- **Resolución:** El PR Readiness Gate debe definir estados precisos:
  - `PASS`: Ejecutado y exitoso con evidencia verificable.
  - `FAIL`: Ejecutado y fallido.
  - `NOT_APPLICABLE`: La prueba no aplica según el impacto del cambio (ej. Playwright para un cambio exclusivo en un ADR).
  - `NOT_EXECUTED`: La prueba aplica pero no fue ejecutada. **Nunca equivale a PASS**.
  - `NOT_AVAILABLE`: La herramienta no está instalada o configurada en el entorno local. Debe señalarse explícitamente delegando la validación final a los runners de CI.
  - `BLOCKED`: Hay fallos críticos que impiden preparar el PR.

### Conflicto C: Idioma del Contenido Técnico vs. Humano

- **Conflicto:** La exigencia de escribir en español puede llevar a traducciones forzadas e incorrectas de comandos (`ejecutar acción de git`, `empujar rama`) o nombres de productos (`Contenedor de Muelle`, `Acciones de GitHub`).
- **Resolución:** La política de idioma debe demarcar con claridad:
  - **Español:** Títulos de PR, descripciones, resúmenes, comentarios explicativos, justificaciones, mensajes de commit conceptuales y checklists.
  - **Inglés:** Comandos de terminal, nombres de archivos, identificadores de código, nombres propios de software y productos (GitHub Actions, Helm, OpenTofu, pre-commit, ArgoCD, Docker), y mensajes literales de error emitidos por compiladores.

---

## 7. Propuesta de Cambios por Fase

1. **Fase 1 — Política transversal de idioma:**  
   Crear `.agents/skills/_shared/language-policy.md`.
2. **Fase 2 — Actualizar `repo-pr`:**  
   Actualizar `.agents/skills/repo-pr/SKILL.md` para incluir el flujo dinámico de consumo del template de PR y redacción en español.
3. **Fase 3 — Integración con `pre-commit-config.yaml`:**  
   Actualizar `.agents/skills/repo-quality/SKILL.md` para inspeccionar y ejecutar `pre-commit` si está disponible, categorizando su resultado.
4. **Fase 4 — PR Readiness Gate:**  
   Definir el gate de preparación con estados contractuales y verificación de evidencias antes de dar por listo un PR.
5. **Fase 5 — Responsabilidades en `repo-lifecycle`:**  
   Actualizar `.agents/skills/repo-lifecycle/SKILL.md` para reflejar el flujo secuencial completo:  
   `repo-context` → `repo-audit` → `repo-impact` → skills de dominio → implementación → quality gates (`repo-quality`) → documentación (`repo-docs`) → `repo-pr` → `repo-release`.
6. **Fase 6 — Referencias Especializadas de `repo-pr`:**  
   Crear `.agents/skills/repo-pr/references/pr-template-policy.md` y `.agents/skills/repo-pr/references/pr-validation-policy.md`.
7. **Fase 7 a 9 — Validación:**  
   Validar con `npm run lint:md` asegurando 0 errores Markdown.
8. **Fase 10 — Prueba Funcional:**  
   Documentar simulación controlada en `docs/audits/2026-09-24/skills/pr-process-validation.md`.

---

## 8. Inventario de Modificaciones de Archivos

### Archivos a Crear

- `.agents/skills/_shared/language-policy.md`
- `.agents/skills/repo-pr/references/pr-template-policy.md`
- `.agents/skills/repo-pr/references/pr-validation-policy.md`
- `docs/audits/2026-09-24/skills/pr-process-analysis.md` (este documento)
- `docs/audits/2026-09-24/skills/pr-process-validation.md`

### Archivos a Modificar

- `.agents/skills/repo-pr/SKILL.md`
- `.agents/skills/repo-quality/SKILL.md`
- `.agents/skills/repo-lifecycle/SKILL.md`

### Archivos que Explícitamente NO Necesitan Cambios

- `apps/**` (No modificar código de aplicación).
- `infra/**` (No alterar configuraciones de infraestructura ni templates Helm).
- `gitops/**` (No alterar manifiestos ni pinning de ArgoCD).
- `.github/workflows/**` (Los workflows de CI/CD ya validan PRs correctamente).
- `.github/pull_request_template.md` (Permanece intacto como SSOT original).
- `.pre-commit-config.yaml` (Permanece intacto como SSOT original de hooks).
- `docs/decisions/**` (No alterar ADRs).
