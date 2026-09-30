# Higiene de Configuración y Archivos de Exclusión (`configuration-hygiene`)

> **Dominio de:** `repo-lifecycle` (orquestación), con colaboración de `repo-quality`,
> `repo-security` y `repo-docs` según el aspecto evaluado.
> **Estado de cada regla:** taxonomía de 5 estados registrada en
> [`_shared/state-model.md`](../../_shared/state-model.md) §4.

## 1. Detección Dinámica de Archivos de Exclusión

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

## 2. Dimensiones de Análisis Requerido

Para cada archivo detectado, se ejecutan sistemáticamente diez comprobaciones:

1. **Necesidad y Vigencia:** Verificar si el archivo continúa siendo requerido o si responde a herramientas ya retiradas.
2. **Reglas Inexistentes u Obsoletas:** Identificar reglas que referencien archivos, directorios, herramientas o tecnologías que ya no existen en el repositorio.
3. **Duplicación y Redundancia:** Detectar patrones duplicados o absorbidos por reglas más amplias ya presentes.
4. **Reglas Excesivamente Amplias (*Overbroad*):** Patrones genéricos (e.g. `*`, `temp*`, `test*`) que puedan excluir accidentalmente archivos legítimos y necesarios.
5. **Riesgos de Seguridad:** Exclusiones que puedan comprometer la postura de seguridad (ocultar código sin auditar o ignorar directorios críticos).
6. **Fugas de Contexto y Empaquetado:** Reglas que dejen fuera archivos indispensables de Git, Docker build context, escaneos de seguridad, empaquetado Helm o publicación.
7. **Alineación con Stack Activo:** Contrastar contra el stack vigente. La especificación canónica de stack reside en `docs/architecture/`; no se replica aquí para evitar divergencia.
8. **Consistencia Cruzada:** Verificar coherencia con:
   - `package.json` y `package-lock.json`
   - `Dockerfile` (multi-stage en backend y frontend)
   - Workflows de GitHub Actions (`.github/workflows/*.yaml`)
   - [`.pre-commit-config.yaml`](../../../../.pre-commit-config.yaml)
   - [`.gitleaks.toml`](../../../../.gitleaks.toml)
   - `Taskfile.yaml`
   - Manifiestos de Kubernetes y Helm (`infra/helm/`)
   - Suites de pruebas (`tests/`)
   - Scripts operativos (`scripts/`)
   - Documentación activa (`docs/architecture/`, ADRs).
9. **Referencias a Componentes Eliminados:** Reglas residuales asociadas a migraciones arquitectónicas completadas.
10. **Deuda Histórica:** Patrones heredados sin justificación operativa demostrable.

## 3. Protocolo Específico de Seguridad (`.gitignore` y `.gitleaksignore`)

- **Principio Fundamental:** Ignorar un archivo en `.gitignore` **no equivale** a solucionar un problema de seguridad ni exime de evaluar si contiene secretos.
- **Detección de Fugas Latentes:** Identificar exclusiones que puedan enmascarar accidentalmente credenciales, certificados reales o variables de entorno sensibles en entornos locales sin ser detectados por los linters de seguridad.
- **Auditoría Estricta de `.gitleaksignore`:**
  - Analizar individualmente cada excepción (*fingerprint* o regla).
  - Verificar si la justificación técnica original continúa vigente (e.g. si el archivo referenciado ya fue eliminado del árbol activo y solo permanece como remanente histórico de commits previos).
  - Identificar excepciones que puedan removerse de forma segura si la regla global en `.gitleaks.toml` ya no aplica.
  - **Prohibición Estricta:** Jamás eliminar automáticamente una excepción de seguridad sin validación fáctica cruzada contra el historial y el escáner.
  - Clasificar cada hallazgo según riesgo e impacto comprobado.

## 4. Protocolo Específico de `.dockerignore`

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

## 5. Taxonomía de 5 Estados de Clasificación

Cada hallazgo o regla evaluada se clasifica en uno de los siguientes estados:

| Estado | Significado Operativo | Criterio de Aplicación |
| :--- | :--- | :--- |
| **`KEEP`** | Regla vigente y justificada | Necesaria, alineada con el stack activo y con consumidor fáctico comprobado. |
| **`KEEP_IMPROVE`** | Regla válida pero perfectible | Funcional pero requiere refinamiento (acotar alcance, añadir documentación o unificar con patrones análogos). |
| **`REMOVE`** | Regla obsoleta o redundante | Apunta a tecnologías/directorios inexistentes, duplicada o sin propósito demostrado. |
| **`REVIEW`** | Estado o impacto incierto | Regla cuyo impacto no puede determinarse con certeza automática; requiere validación humana. |
| **`SECURITY_REVIEW`** | Exclusión con implicancia de seguridad | Regla o excepción que afecta la superficie de escaneo de secretos o vulnerabilidades; requiere auditoría DevSecOps. |

> [!NOTE]
> Esta taxonomía es **exclusiva del dominio `.*ignore`**. No debe aplicarse a otros
> dominios. El registro completo de vocabularios vive en

## 6. Modelo de Evidencia Estructurada

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

## 7. Reglas de Seguridad y Guardarraíles

> [!CAUTION]
> **Guardarraíles Obligatorios:**
>
> 1. **No Eliminación Automática:** Prohibido suprimir o modificar archivos `.ignore` automáticamente durante la fase de auditoría (`full-audit`).
> 2. **Prohibición de Suposiciones:** La ausencia aparente de una referencia no constituye prueba concluyente para suprimir una regla sin contrastar el contexto operativo completo.
> 3. **Excepciones de Seguridad Intocables sin Evidencia:** Prohibido modificar o retirar excepciones de seguridad (`.gitleaksignore`, `.trivyignore`) sin comprobación contra escaneos activos y trazabilidad de commits.
> 4. **Prevalencia de `REVIEW`:** Ante cualquier duda sobre el impacto de una exclusión, clasificar estrictamente como `REVIEW` o `SECURITY_REVIEW`.
> 5. **Trazabilidad Completa:** Toda sugerencia debe incluir su justificación técnica, consumidor asociado y evidencia verificable.

## 8. Relación con el Motor de Impacto

Este dominio describe **los gates y skills a ejecutar**, no el disparador del motor
determinista. Ningún archivo `.*ignore` figura en `global.paths` de
[`.github/ci-impact.yaml`](../../../../.github/ci-impact.yaml): cada uno se clasifica
por dominio (`.dockerignore` → regla `docker`, `.markdownlintignore` → regla
`documentation`). Ante un patrón no clasificado aplica la política **fail-closed** y se
despacha Full CI. La matriz completa está en
[`_shared/change-impact-matrix.md`](../../_shared/change-impact-matrix.md) §4.

> [`_shared/state-model.md`](../../_shared/state-model.md) §4.
