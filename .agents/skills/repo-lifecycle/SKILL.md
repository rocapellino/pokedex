---
name: repo-lifecycle
description: Orquestador del ciclo de vida completo del repositorio Pokedex.
---

# repo-lifecycle

## Objetivo

Orquestar de extremo a extremo el ciclo de vida de desarrollo, análisis, refactorización, calidad, pruebas, documentación, higiene de configuración (`configuration-hygiene`), preparación de Pull Requests y publicación de releases en `rocapellino/pokedex`. Esta skill coordina la invocación condicional de las skills especializadas, evitando redundancias y garantizando cambios verificables y gobernados.

---

## Flujo Conceptual de Orquestación

El ciclo de vida del repositorio sigue una secuencia estricta y desacoplada donde cada skill opera bajo su ámbito de responsabilidad:

```text
               1. repo-context (Construir contexto técnico y operativo)
                               │
                               ▼
               2. repo-audit (Diagnóstico integral o delta)
                               │
                               ▼
               3. repo-impact (Identificar archivos y clasificar radio de cambio)
                               │
                               ▼
               4. Skills Especializadas (Activadas según impacto)
                               │
                               ▼
               5. Implementación / Refactor (repo-refactor si aplica)
                               │
                               ▼
               6. Quality Gates & Pre-Commit (repo-quality & suites técnicas)
                               │
                               ▼
               7. Cierre Documental & Gobernanza (repo-doc-governance, repo-docs & lint:md)
                               │
                               ▼
               8. Preparación y Gate de Pull Request (repo-pr)
                               │
                               ▼
               9. Corte y Promoción de Release (repo-release, si amerita tag)
                               │
                               ▼
              10. Registro y Mantenimiento de Backlog (repo-maintenance)
```

---

## Flujo Canónico de `full-audit` en `/repo-lifecycle`

Cuando se invoca una auditoría integral completa (`full-audit`), `repo-lifecycle` ejecuta de forma secuencial y estructurada el flujo canónico de 17 etapas sin duplicar análisis especializados:

```text
PR/repository
 └── 1. inventory (Catálogo de archivos, módulos y artefactos)
      └── 2. code (Calidad estática, modularidad y antipatrones -> repo-quality)
           └── 3. dependencies (Árbol npm, lockfile y licencias -> repo-dependencies)
                └── 4. testing (Pirámide de pruebas, cobertura y valor -> repo-testing)
                     └── 5. security (SAST, secretos, supply chain y K8s -> repo-security)
                          └── 6. infrastructure (Helm, GitOps, Tofu y Ansible -> repo-architecture)
                               └── 7. CI/CD (Workflows, permisos y optimización -> repo-ci)
                                    └── 8. change impact (Matriz de impacto y propagación -> repo-impact)
                                         └── 9. documentation (Integridad, drift y Markdown Gate -> repo-docs)
                                              └── 10. scripts (Utilidades, consumidores y ADR-020 -> repo-maintenance)
                                                   └── 11. configuration hygiene (Auditoría integral de archivos *.ignore)
                                                        └── 12. issues/debt (Deuda técnica consolidada y backlog)
                                                             └── 13. skills (Auditoría de consistencia de skills del agente)
                                                                  └── 14. cleanup (Higiene de artefactos huérfanos o temporales)
                                                                       └── 15. architecture/simplification (Coherencia sistémica)
                                                                            └── 16. consolidated report (Reporte consolidado)
```

---

## Dominio: Higiene de Configuración y Archivos de Exclusión (`configuration-hygiene`)

La gobernanza de archivos de exclusión y configuración (`*.ignore`) está **centralizada exclusivamente en `repo-lifecycle`**. No existe una skill separada `repo-ignore`; `repo-lifecycle` orquesta este análisis y convoca a las skills especializadas (`repo-quality`, `repo-security`, `repo-docs`) según el aspecto evaluado.

### 1. Detección Dinámica de Archivos de Exclusión

El análisis **no debe asumir que todos los archivos existen ni hardcodear una lista fija**. En tiempo de ejecución, debe descubrir dinámicamente cualquier archivo de exclusión en la raíz o subdirectorios del monorepo, incluyendo pero no limitándose a:

- `.gitignore` (control de versiones Git)
- `.dockerignore` (raíz y subproyectos en `apps/backend/`, `apps/frontend/`)
- `.gitleaksignore` (excepciones de escaneo de secretos)
- `.markdownlintignore` (exclusiones de linter de documentación)
- `.semgrepignore` (exclusiones de análisis estático SAST)
- `.helmignore` (exclusiones de empaquetado de Helm charts)
- `.trivyignore` (excepciones de escaneo de vulnerabilidades e IaC)
- `.npmignore` (si existiera empaquetado npm)
- Cualquier otro archivo cuyo nombre, extensión o función corresponda a un mecanismo `.ignore`.

### 2. Dimensiones de Análisis Requerido

Para cada archivo detectado, se ejecutan sistemáticamente diez comprobaciones:

1. **Necesidad y Vigencia:** Verificar si el archivo continúa siendo requerido o si responde a herramientas ya retiradas.
2. **Reglas Inexistentes u Obsoletas:** Identificar reglas que referencien archivos, directorios, herramientas o tecnologías que ya no existen en el repositorio.
3. **Duplicación y Redundancia:** Detectar patrones duplicados o absorbidos por reglas más amplias ya presentes.
4. **Reglas Excesivamente Amplias (*Overbroad*):** Patrones genéricos (e.g. `*`, `temp*`, `test*`) que puedan excluir accidentalmente archivos legítimos y necesarios.
5. **Riesgos de Seguridad:** Exclusiones que puedan comprometer la postura de seguridad (ocultar código sin auditar o ignorar directorios críticos).
6. **Fugas de Contexto y Empaquetado:** Reglas que dejen fuera archivos indispensables de Git, Docker build context, escaneos de seguridad, empaquetado Helm o publicación.
7. **Alineación con Stack Activo:** Contrastar contra el stack vigente (TypeScript, Vite, Express, Drizzle ORM, PostgreSQL, Redis, Helm, OpenTofu, Cilium, Vault).
8. **Consistencia Cruzada:** Verificar coherencia con:
   - `package.json` y `package-lock.json`
   - `Dockerfile` (multi-stage en backend y frontend)
   - Workflows de GitHub Actions (`.github/workflows/*.yml`)
   - [`.pre-commit-config.yaml`](../../../.pre-commit-config.yaml)
   - [`.gitleaks.toml`](../../../.gitleaks.toml)
   - `Taskfile.yml`
   - Manifiestos de Kubernetes y Helm (`infra/helm/`)
   - Suites de pruebas (`tests/`)
   - Scripts operativos (`scripts/`)
   - Documentación activa (`docs/architecture/`, ADRs).
9. **Referencias a Componentes Eliminados:** Reglas residuales asociadas a migraciones arquitectónicas completadas (e.g. componentes legados de scaffolds iniciales).
10. **Deuda Histórica:** Patrones heredados sin justificación operativa demostrable.

### 3. Protocolo Específico de Seguridad (`.gitignore` y `.gitleaksignore`)

- **Principio Fundamental:** Ignorar un archivo en `.gitignore` **no equivale** a solucionar un problema de seguridad ni exime de evaluar si contiene secretos.
- **Detección de Fugas Latentes:** Identificar exclusiones que puedan enmascarar accidentalmente credenciales, certificados reales o variables de entorno sensibles en entornos locales sin ser detectados por los linters de seguridad.
- **Auditoría Estricta de `.gitleaksignore`:**
  - Analizar individualmente cada excepción (*fingerprint* o regla).
  - Verificar si la justificación técnica original continúa vigente (e.g. si el archivo referenciado ya fue eliminado del árbol activo y solo permanece como remanente histórico de commits previos).
  - Identificar excepciones que puedan removerse de forma segura si la regla global en `.gitleaks.toml` ya no aplica.
  - **Prohibición Estricta:** Jamás eliminar automáticamente una excepción de seguridad sin validación fáctica cruzada contra el historial y el escáner.
  - Clasificar cada hallazgo según riesgo e impacto comprobado.

### 4. Protocolo Específico de `.dockerignore`

- **Optimización de Build Context:** Evaluar el impacto en el tamaño de transferencia hacia el daemon de Docker.
- **Exclusiones Obligatorias:** Garantizar que queden excluidos:
  - `.git/` y metadatos de control de versiones
  - `node_modules/` locales (las dependencias deben instalarse dentro del contenedor)
  - Artefactos de compilación local (`dist/`, `build/`)
  - Cobertura y reportes (`coverage/`, `test-results/`)
  - Archivos temporales y cachés de herramientas
  - Secretos y variables de entorno (`.env`, `.env.*` excepto `.env.example`, `*.pem`, `*.key`)
  - Documentación (`docs/`, auditorías fechadas) que no interviene en el runtime
  - Tests (`tests/`) que no son consumidos durante la construcción de la imagen productiva.
- **Protección Contractual del Build:** Contrastar rigurosamente cada regla propuesta contra las instrucciones `COPY` del `Dockerfile`. **Prohibido proponer exclusiones que provoquen fallos de compilación (`COPY failed`)**.

### 5. Taxonomía de 5 Estados de Clasificación

Cada hallazgo o regla evaluada se clasifica en uno de los siguientes estados:

| Estado | Significado Operativo | Criterio de Aplicación |
| :--- | :--- | :--- |
| **`KEEP`** | Regla vigente y justificada | Necesaria, alineada con el stack activo y con consumidor fáctico comprobado. |
| **`KEEP_IMPROVE`** | Regla válida pero perfectible | Funcional pero requiere refinamiento (acotar alcance, añadir documentación o unificar con patrones análogos). |
| **`REMOVE`** | Regla obsoleta o redundante | Apunta a tecnologías/directorios inexistentes, duplicada o sin propósito demostrado. |
| **`REVIEW`** | Estado o impacto incierto | Regla cuyo impacto no puede determinarse con certeza automática; requiere validación humana. |
| **`SECURITY_REVIEW`** | Exclusión con implicancia de seguridad | Regla o excepción que afecta la superficie de escaneo de secretos o vulnerabilidades; requiere auditoría DevSecOps. |

### 6. Modelo de Evidencia Estructurada

Toda propuesta de modificación debe acompañarse de evidencia demostrable en formato tabular:

| Archivo | Regla | Estado | Evidencia | Acción |
| :--- | :--- | :--- | :--- | :--- |
| `.gitignore` | `legacy-dir/` | `REMOVE` | Directorio inexistente y sin referencias en scripts o configs | Eliminar regla |
| `.dockerignore` | `coverage/` | `KEEP` | No requerido por Dockerfile; previene inflado del contexto | Mantener regla |
| `.gitleaksignore` | `fingerprint-x` | `SECURITY_REVIEW` | Excepción histórica sobre archivo retirado; validar si git log lo requiere | Auditar con git log |

Para hallazgos detallados, registrar:

- **Archivo:** Ruta relativa del archivo de exclusión.
- **Regla afectada:** Línea o patrón específico.
- **Motivo:** Justificación técnica del hallazgo.
- **Consumidor relacionado:** Herramienta, script o workflow vinculado.
- **Evidencia encontrada:** Búsqueda en código, Git o configuración que soporta el hallazgo.
- **Impacto:** Riesgo operativo, de seguridad o de build context.
- **Acción propuesta:** Recomendación concreta (`KEEP`, `REMOVE`, refactorizar o auditar).

### 7. Reglas de Seguridad y Guardarraíles de la Skill

> [!CAUTION]
> **Guardarraíles Obligatorios:**
>
> 1. **No Eliminación Automática:** Prohibido suprimir o modificar archivos `.ignore` automáticamente durante la fase de auditoría (`full-audit`).
> 2. **Prohibición de Suposiciones:** La ausencia aparente de una referencia no constituye prueba concluyente para suprimir una regla sin contrastar el contexto operativo completo.
> 3. **Excepciones de Seguridad Intocables sin Evidencia:** Prohibido modificar o retirar excepciones de seguridad (`.gitleaksignore`, `.trivyignore`) sin comprobación contra escaneos activos y trazabilidad de commits.
> 4. **Prevalencia de `REVIEW`:** Ante cualquier duda sobre el impacto de una exclusión, clasificar estrictamente como `REVIEW` o `SECURITY_REVIEW`.
> 5. **Trazabilidad Completa:** Toda sugerencia debe incluir su justificación técnica, consumidor asociado y evidencia verificable.

---

## Demarcación Estricta de Responsabilidades entre Skills

Para evitar duplicaciones y mantener límites arquitectónicos claros:

1. **`repo-lifecycle` (Orquestación, Full-Audit & Consolidación):**
   - Decide el flujo general, el orden de invocación y coordina el ciclo de vida completo.
   - Centraliza el dominio de **`configuration-hygiene`** integrando la auditoría de todos los archivos `*.ignore`.
   - Consolida los hallazgos de todas las skills en el reporte final.
2. **`repo-quality` (Quality Gates Técnicos y Formato):**
   - Ejecuta y audita linters (`npm run lint`, `typecheck`), formateo y la inspección/ejecución de [`.pre-commit-config.yaml`](../../../.pre-commit-config.yaml).
   - Valida la sintaxis y formateo de archivos de configuración cuando corresponda.
   - Genera evidencias estructuradas diferenciando `EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE`, `NOT_APPLICABLE` o `NOT_EXECUTED`.
3. **`repo-security` (Superficie de Seguridad y DevSecOps):**
   - Analiza implicancias de seguridad de las exclusiones (riesgo de enmascarar secretos o código no auditado).
   - Audita a fondo las excepciones de `.gitleaksignore` y `.trivyignore` bajo principios Zero-Trust.
   - Evalúa secretos, SAST, SBOM, Cosign, SLSA y políticas de clúster Kubernetes.
4. **`repo-testing` (Estrategia y Gobernanza Multidimensional de Pruebas):**
   - Evalúa cobertura, duplicación, valor, velocidad, estabilidad y relación fáctica con el código fuente.
   - Aplica la taxonomía de 12 estados (`KEEP`, `KEEP_IMPROVE`, `DUPLICATE`, `REDUNDANT`, `OBSOLETE`, `BROKEN`, `FLAKY`, `SLOW`, `MOVE`, `MERGE`, `DELETE`, `REVIEW`).
   - Diferencia Application Tests de Policy-as-Test y detecta antipatrones (God Test Files, asertos vacíos, dependencias temporales/externas).
5. **`repo-doc-governance` (Fuente Normativa de Gobernanza Documental):**
   - Establece los límites (*boundaries*), presupuestos (*budgets*), contrato declarativo (`documentation-contract.yaml`) y políticas de contenido para `README.md`, `SECURITY.md` y `docs/`.
   - Clasifica afirmaciones en taxonomía de volatilidad y evalúa la deriva (*drift*) frente a la evidencia real del repositorio.
6. **`repo-docs` (Ciclo de Vida e Integridad Documental):**
   - Responsable de ejecutar el ciclo de vida documental completo: inventario, clasificación en 7 estados, validación cruzada fáctica contra código/configuración/IaC/GitOps, remediación activa, depuración de referencias huérfanas y Markdown Quality Gate (`npm run lint:md`).
   - Evalúa si cambios en archivos `.ignore` generan drift con la documentación funcional.
7. **`repo-pr` (Preparación y Gate de Pull Request):**
   - Descubre dinámicamente el PR Template real del repositorio ([`.github/pull_request_template.md`](../../../.github/pull_request_template.md)).
   - Consume las evidencias consolidadas por `repo-lifecycle` y las skills de dominio para el PR Readiness Gate.
   - Redacta el título, descripción y checklists en español ([language-policy.md](../_shared/language-policy.md)). No realiza auditorías completas redundantes.
8. **`repo-release` (Gobernanza de Release y Promoción):**
   - Gobierna la transición de los cuatro niveles: `MAIN` → `RELEASE` → `GITOPS` → `RUNTIME`.
9. **`repo-maintenance` (Higiene de Tooling, Scripts y Cleanup):**
   - Aplica el protocolo de 7 fases (`DISCOVER → CLASSIFY → EVIDENCE → PROPOSE → APPROVE → EXECUTE → VALIDATE`) para scripts, utilidades y artefactos obsoletos.
   - Aplica la taxonomía de 8 estados con análisis de consumidores cruzados.
10. **Gobernanza de Skills (`repo-skills-audit` / Catálogo):**
    - Verifica que las skills reflejen fielmente las capacidades activas del repositorio sin desfases ni solapamiento de atribuciones.

---

## Estructura del Reporte Consolidado (`## Configuration Hygiene`)

En todo reporte de `full-audit`, debe incluirse obligatoriamente la sección `## Configuration Hygiene` estructurada en las siguientes siete subsecciones:

```markdown
## Configuration Hygiene

### 1. `.ignore inventory`
Catálogo exhaustivo de archivos de exclusión detectados dinámicamente en el monorepo (ruta, tamaño, número de reglas, estado general).

### 2. Obsolete rules
Reglas que referencian rutas, herramientas, lenguajes o tecnologías inexistentes en el estado actual del repositorio.

### 3. Missing rules
Reglas necesarias omitidas que deberían incorporarse para proteger el control de versiones o el build context.

### 4. Overbroad rules
Patrones excesivamente amplios que pueden excluir accidentalmente artefactos legítimos.

### 5. Security-sensitive exclusions
Exclusiones en .gitignore, .gitleaksignore o .trivyignore con potencial impacto en la postura de seguridad.

### 6. Cross-configuration consistency
Validación cruzada de consistencia entre los archivos .ignore y Dockerfiles, CI workflows, package.json, pre-commit, Taskfile y Helm.

### 7. Recommended changes
Tabla consolidada de recomendaciones con clasificación (KEEP, KEEP_IMPROVE, REMOVE, REVIEW, SECURITY_REVIEW), evidencia e impacto.
```

---

## Despacho Condicional por Tipología de Cambio

No todas las skills son obligatorias para todos los cambios. Las validaciones a ejecutar dependen estrictamente del impacto clasificado en [change-impact-matrix.md](../_shared/change-impact-matrix.md):

### 1. Cambio Backend (`apps/backend/`)

```text
impact ──► testing ──► quality (lint/pre-commit) ──► security (App SAST) ──► architecture ──► docs ──► pr
```

### 2. Cambio Documentación Pura (`docs/`, `*.md`) — Fast Track

```text
impact ──► docs ──► markdown quality gate (0 errores MDxxx) ──► pr
```

*Exento de compilar código, correr tests unitarios de apps o levantar contenedores Docker.*

### 3. Cambio en Workflows de CI/CD (`.github/workflows/`)

```text
impact ──► quality (sintaxis YAML/pre-commit) ──► security (permisos OIDC) ──► ci ──► docs ──► pr
```

### 4. Cambio en Helm / GitOps (`infra/helm/`, `gitops/`)

```text
impact ──► quality ──► security ──► architecture (AST/paridad) ──► release (pinning) ──► docs ──► pr
```

### 5. Cambio en Archivos de Exclusión y Configuración (`.*ignore`)

```text
impact ──► lifecycle (configuration-hygiene) ──► security (Zero-Trust) ──► quality (sintaxis) ──► docs ──► pr
```

---

## Motor de Change Impact Analysis y DAG Dinámico de CI

`repo-lifecycle` gobierna el contrato declarativo [`.github/ci-impact.yaml`](../../../.github/ci-impact.yaml) y ejecuta el motor determinista [`scripts/detect-change-impact.ts`](../../../scripts/detect-change-impact.ts):

1. **Nivel Always:** Controles no negociables (escaneo de secretos y gobernanza de PR) que corren en todo Pull Request, incluidos los puramente documentales. Se implementan en `applyAlwaysTriggers()` y se aplican en los cuatro caminos de retorno del motor.
2. **Nivel Global:** Alteraciones en archivos transversales activan validación integral de todos los dominios. El conjunto canónico de rutas globales es el bloque `global.paths` de [`.github/ci-impact.yaml`](../../../.github/ci-impact.yaml), que a fecha de hoy incluye `package.json`, `package-lock.json`, `turbo.json`, `tsconfig.json`, `.pre-commit-config.yaml`, `.github/workflows/**`, `scripts/detect-change-impact.ts` y `scripts/declarations.d.ts`.
   > [!IMPORTANT]
   > `scripts/**` **no** es global en bloque: los scripts se clasifican de forma **individual** por dominio. La entrada de los `*.ignore` como "Nivel Global" en [change-impact-matrix.md](../_shared/change-impact-matrix.md) describe los *gates y skills a ejecutar*, no el disparador del motor. Esta clasificación granular es deliberada y más eficiente; ante un script no clasificado aplica la política fail-closed.
3. **Nivel Condicional:** Modificaciones acotadas disparan únicamente los Quality Gates y pipelines afectados (Fast Track documental, suites de backend, empaquetado Helm, etc.).
4. **Política Fail-Closed (Unknown):** Si el análisis no puede determinar con certeza el impacto de una ruta, se inhibe la optimización y se despacha Full CI.

---

## Modos de Operación

- **Full-Audit:** Ciclo completo de 17 etapas desde inventario inicial hasta reporte consolidado, incluyendo `configuration-hygiene`.
- **Full:** Ciclo completo desde contexto y auditoría integral hasta release y mantenimiento.
- **Fast:** Validación rápida de cambios acotados (`repo-context` + `repo-impact` + gates de dominio).
- **Change:** Modo estándar para desarrollo de features o correcciones de bugs (`repo-impact` + skills de dominio + `repo-pr`).
- **Release:** Preparación formal de corte de versión y actualización GitOps (`repo-release`).
- **Maintenance:** Evaluación periódica de salud, higiene y backlog (`repo-maintenance`).

---

## Referencias Compartidas

- **Contrato de Impacto CI:** [ci-impact.yaml](../../../.github/ci-impact.yaml)
- **Metodología Base:** [methodology.md](../_shared/methodology.md)
- **Política de Idioma:** [language-policy.md](../_shared/language-policy.md)
- **Modelo de Estados:** [state-model.md](../_shared/state-model.md)
- **Matriz de Impacto:** [change-impact-matrix.md](../_shared/change-impact-matrix.md)
- **Planes de Cambio:** [change-plan.md](../_shared/change-plan.md)
- **Quality Gate de Markdown:** [markdown-quality.md](../_shared/markdown-quality.md)
- **Plantilla de Reporte:** [report-template.md](../_shared/report-template.md)
