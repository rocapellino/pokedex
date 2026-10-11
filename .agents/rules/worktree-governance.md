# Gobernanza Centralizada de Git Worktrees

Esta regla aplica a todos los agentes de IA (Antigravity, Claude Code, Cursor, Copilot), herramientas operativas, skills, hooks, MCPs y scripts de mantenimiento en `rocapellino/pokedex`.

---

## 1. Principio Fundamental y Autoridad Central

> **Ninguna skill, agente de IA o herramienta externa puede definir de forma independiente dónde crear los Git worktrees ni cómo nombrarlos.**
> **La política y los mecanismos centrales del repositorio son la Única Fuente de Verdad (SSOT).**

Queda estrictamente prohibido que un agente seleccione carpetas arbitrarias en el sistema de archivos (ej. directorios temporales globales `/tmp`, subcarpetas no controladas en el directorio de usuario o dentro del propio checkout principal) para alojar checkouts de trabajo.

---

## 2. Ubicación Canónica Única

1. **Ubicación Aprobada:**
   - Todos los Git worktrees de este repositorio residen exclusivamente bajo un único directorio base canónico hermano del checkout principal:
     `../.worktrees/<slug-del-repositorio>/` (e.g. `../.worktrees/pokedex/`).
   - El cálculo de la ruta se realiza a partir de la raíz real del repositorio principal (`git rev-parse --path-format=absolute --git-common-dir`), garantizando que la ubicación sea idéntica independientemente del subdirectorio o worktree desde el que se invoque.
2. **Aislamiento y Demarcación respecto a `tmp/`:**
   - Los Git worktrees **no** son archivos temporales y nunca deben crearse dentro de `<repository-root>/tmp/`.
   - Los archivos temporales, logs de depuración y reportes transitorios generados durante una tarea deben seguir estrictamente la regla [repository-hygiene.md](repository-hygiene.md) bajo `tmp/`.
3. **Protección Anti-Path Traversal y Enlaces Simbólicos:**
   - Todo comando de creación y resolución valida exhaustivamente que cada componente existente de la ruta (incluyendo el directorio intermedio `.worktrees/` y el directorio del slug) resida físicamente dentro del directorio padre aprobado (`parentDir`), bloqueando traversal léxico (`..`), desvíos mediante enlaces simbólicos (*symlinks* / *junctions*) y enlaces rotos o inaccesibles antes de crear subdirectorios.
4. **Mitigación contra Condiciones de Carrera (TOCTOU) y Protocolo de Rollback Seguro:**
   - Para proteger la creación de worktrees frente a condiciones de carrera (*Time-Of-Check to Time-Of-Use*) o modificaciones concurrentes del filesystem durante la ventana entre la validación previa y la invocación de `git worktree add`, el motor aplica una estrategia de doble verificación con rollback seguro:
     - **Pre-flight check:** Valida la contención léxica, colisiones previas y ausencia de desvíos en ancestros antes de `mkdirSync`.
     - **Post-creation audit (`verifyWorktreePostCreation`):** Inmediatamente después de `git worktree add`, valida síncronamente que el worktree creado sea un directorio real (rechazando symlinks/junctions), valida nuevamente la cadena de componentes en disco mediante `realpath`, y consulta a Git (`git rev-parse --show-toplevel`) desde el worktree para asegurar que la raíz registrada coincida con la ruta aprobada.
     - **Protocolo de Rollback Seguro (`safeRollbackWorktree`):** Si cualquier verificación post-creación detecta una anomalía, se ejecuta una recuperación controlada:
       1. Intenta retirar el worktree formalmente con Git (`git worktree remove --force`).
       2. Valida la identidad y ubicación del destino antes de intervenir en el filesystem: si es un enlace simbólico o junction, elimina **únicamente el enlace** sin borrado recursivo; si es un directorio, solo lo elimina recursivamente tras comprobar que su `realpath` reside estrictamente dentro de la base canónica; si no puede validarse con seguridad, **no se ejecuta borrado recursivo**, se preserva la evidencia intacta para inspección manual y se documenta la advertencia de seguridad.
       3. Purga metadatos huérfanos con `git worktree prune`.
       4. Informa por separado el estado de cada paso del rollback y prohíbe presentar el rollback como completado si algún paso falló o si se preservaron residuos no verificables.

---

## 3. Nomenclatura Canónica Obligatoria

Los nombres de ramas y de carpetas se derivan de forma centralizada y determinista siguiendo la convención de tipos de **Conventional Commits** y los identificadores de tareas/auditorías:

1. **Tipos de Tarea Permitidos:**
   `feat`, `fix`, `chore`, `ci`, `docs`, `test`, `refactor`, `perf`, `revert`.
2. **Formato de Rama (Git Branch):**
   - General: `<tipo>/<slug>` (ej. `feat/nueva-pantalla`).
   - Con ámbito: `<tipo>/<scope>-<slug>` (ej. `fix/ci-pipeline-runner`).
   - Con ticket/auditoría: `<tipo>/<ticket>-<slug>` (ej. `chore/aud-sec-001-secret-rotation`).
3. **Formato de Carpeta (Worktree Folder):**
   Para evitar colisiones de rutas y anidamientos innecesarios en el sistema de archivos, el separador de ámbito en disco es un doble guión (`--`):
   - General: `<tipo>--<slug>` (ej. `feat--nueva-pantalla`).
   - Con ámbito: `<tipo>--<scope>-<slug>` (ej. `fix--ci-pipeline-runner`).
   - Con ticket/auditoría: `<tipo>--<ticket>-<slug>` (ej. `chore--aud-sec-001-secret-rotation`).
4. **Saneamiento Estricto:**
   - Todos los slugs se convierten a minúsculas, se eliminan tildes/diacríticos y se reemplazan caracteres especiales por un único guión medio (`-`).
   - Los identificadores de ticket se normalizan en mayúsculas (`AUD-SEC-001`).
5. **Relación con Hooks y SSOT de Nomenclatura:**
   - Los tipos permitidos en `ALLOWED_TASK_TYPES` están alineados de forma idéntica con el hook `conventional-pre-commit` declarado en `.pre-commit-config.yaml`.
   - Dado que Git no proporciona un hook de cliente nativo que intercepte la creación de worktrees (e.g. no existe `pre-worktree-add` en Git ni en pre-commit), no se generan hooks artificiales. `scripts/worktree/naming.ts` actúa como la Fuente Única de Verdad (SSOT) programática para la nomenclatura y validación de referencias de Git (`validateGitRef`).

---

## 4. Punto de Entrada Centralizado (CLI y npm scripts)

Toda interacción con worktrees debe realizarse a través de la CLI canónica del repositorio (`scripts/worktree/cli.ts`), expuesta a través de comandos `npm`:

| Operación | Comando Canónico | Propósito |
| :--- | :--- | :--- |
| **Crear** | `npm run worktree:create -- --type <tipo> --slug <slug> [--scope <scope>] [--ticket <id>]` | Valida parámetros, genera nomenclatura canónica, verifica colisiones y crea el worktree en la base aprobada. |
| **Listar** | `npm run worktree:list` | Inspecciona todos los worktrees registrados, su HEAD, rama y estado de cumplimiento. |
| **Diagnosticar** | `npm run worktree:doctor` | Audita worktrees fuera de política, detecta metadatos huérfanos (*prunables*), regresiones y candidatos a limpieza. |
| **Limpiar** | `npm run worktree:cleanup -- --target <path/rama/id>` | Elimina de forma segura un worktree, bloqueando si hay cambios sin confirmar o commits sin integrar. |
| **Prunar** | `npm run worktree:prune` | Limpia referencias en Git de worktrees cuyos directorios ya no existen en disco. |

### Ejecución Segura de Comandos (Sin Invocación de Shell)

El motor de worktrees invoca directamente ejecutables binarios (`execFileSync('git', [...])`) pasando argumentos discretos como listas de cadenas. Queda terminantemente prohibida la interpolación de comandos o parámetros en un intérprete de shell (`sh`, `bash`, `cmd`, `powershell`). Todas las referencias de Git externas (e.g. `--base-branch`) se validan previamente mediante `validateGitRef` para impedir la inyección de flags (argumentos que inicien con `-`) o secuencias de escape.

---

## 5. Protocolo de Limpieza Segura y No Destructiva

1. **Inspección Previa Obligatoria:**
   Antes de eliminar un worktree, `worktree:cleanup` inspecciona:
   - Cambios sin confirmar en el working tree (`git status --porcelain`).
   - Archivos sin seguimiento (*untracked*).
   - Commits locales no integrados en `main` ni publicados en upstream remoto.
2. **Protección contra Pérdida de Trabajo:**
   - La eliminación falla automáticamente si se detecta trabajo pendiente, a menos que el usuario o agente especifique explícitamente `--force`.
   - Prohibido el uso de `rm -rf` directo o manipulación manual del directorio `.git/worktrees/`.
   - Prohibido eliminar automáticamente un worktree solo porque su PR se haya fusionado sin antes verificar el estado local del checkout.
3. **Preservación de Tareas Ajenas:**
   Ningún agente debe modificar o eliminar worktrees pertenecientes a otras tareas sin autorización expresa.
4. **Modelo de Amenazas y Mitigación TOCTOU en Rollback:**
   - La función `safeRollbackWorktree` aplica defensa en profundidad comprobando el destino (`lstatSync` y `realpathSync`) inmediatamente antes de `rmSync()`, seguido de post-verificación de ausencia. Si el destino no puede probarse dentro de la base canónica, o muta a enlace simbólico, la eliminación recursiva se aborta y se preserva la evidencia intacta (`residualPreservedForEvidence: true`).
   - *Límites técnicos:* En Node.js sobre sistemas operativos convencionales, esta secuencia mitiga la ventana de carrera (TOCTOU), pero no constituye una garantía atómica a nivel de kernel (e.g. primitivas `*at` con descriptores de archivo abiertos sin seguir symlinks). El proyecto asume este modelo de amenazas: ante anomalías o interferencias locales concurrentes, se preserva la evidencia y se exige intervención manual en lugar de ejecutar limpiezas destructivas inciertas.

---

## 6. Límites Técnicos y Enforcement en Puntos de Entrada

Por diseño de la arquitectura interna de Git, el cliente no expone hooks previos para bloquear o condicionar la ejecución de `git worktree add` si una herramienta externa o proceso con acceso directo a terminal o filesystem decide invocarlo por fuera de la CLI. Para garantizar el cumplimiento efectivo:

1. **Obligación Operativa en `AGENTS.md`:** Ningún agente de IA puede invocar `git worktree add` de manera desregulada.
2. **Detección Preventiva y Observabilidad en la Superficie Delimitada:**
   `npm run worktree:doctor` audita estáticamente la superficie delimitada de automatización del repositorio (`scripts/`, `.agents/`, `.github/`, `infra/`, `apps/`, `gitops/` y archivos de tareas como `Makefile`, `GNUmakefile`, `justfile`, `Taskfile*` y `package.json`).
   - Reporta hallazgos `WT-REGRESSION-UNGOVERNED-WORKTREE-CALL` si detecta llamadas directas o instrucciones ejecutables a `git worktree add`.
   - **Observabilidad y Auditoría Completa vs. Parcial:** Registra explícitamente el recuento de archivos inspeccionados e identifica como `WT-AUDIT-UNREADABLE-FILE` cualquier archivo que no pueda ser leído por errores de E/S o permisos, garantizando que el diagnóstico distinga con precisión entre «auditoría completa sin infracciones» y «auditoría parcial con omisiones».
   - *Alcance y modelo de amenazas:* La auditoría estática cubre exhaustivamente el código versionado, flujos de CI/CD, agentes y herramientas gobernadas del proyecto. No sustituye ni pretende ser una intercepción a nivel de kernel del sistema operativo para procesos externos no controlados.
3. **Auditoría Post-Facto:** `npm run worktree:doctor` etiqueta inmediatamente cualquier checkout fuera de la base canónica como `WT-NON-CANONICAL-LOCATION`.
4. **Verificación Automatizada:** La suite `tests/unit/worktree_governance.test.ts` valida en CI y localmente la estricta ausencia de regresiones en todos los puntos de entrada automatizados y la cobertura de los distintos formatos de tareas.

---

## 7. Matriz de Responsabilidades y Cumplimiento

| Componente | Rol en la Gobernanza | Responsabilidad |
| :--- | :--- | :--- |
| **`.agents/rules/worktree-governance.md`** | **Normativa (SSOT)** | Especificación formal de ubicación, nomenclatura, seguridad de ejecución y directivas. |
| **`AGENTS.md`** | **Directiva Operativa** | Obligación vinculante para todos los agentes de utilizar el CLI centralizado. |
| **`scripts/worktree/`** | **Motor de Ejecución** | Validador determinista, ejecutor seguro sin shell y sanitizador de rutas y refs. |
| **`repo-lifecycle` / `repo-maintenance`** | **Skills Operativas** | Invocan `worktree:create` y `worktree:cleanup` en los flujos de ciclo de vida. |
| **`tests/unit/worktree_governance.test.ts`** | **Enforcement Automatizado** | Certifica la resolución de rutas, rechazo de path traversal/symlinks, nomenclatura y ausencia de regresiones. |
