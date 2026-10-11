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
3. **Protección Anti-Path Traversal:**
   - Todo comando de creación valida que la ruta resuelta pertenezca inequívocamente al directorio base canónico, bloqueando cualquier intento de escape o traversal.

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

---

## 4. Punto de Entrada Centralizado (CLI y npm scripts)

Toda interacción con worktrees debe realizarse a través de la CLI canónica del repositorio (`scripts/worktree/cli.ts`), expuesta a través de comandos `npm`:

| Operación | Comando Canónico | Propósito |
| :--- | :--- | :--- |
| **Crear** | `npm run worktree:create -- --type <tipo> --slug <slug> [--scope <scope>] [--ticket <id>]` | Valida parámetros, genera nomenclatura canónica, verifica colisiones y crea el worktree en la base aprobada. |
| **Listar** | `npm run worktree:list` | Inspecciona todos los worktrees registrados, su HEAD, rama y estado de cumplimiento. |
| **Diagnosticar** | `npm run worktree:doctor` | Audita worktrees fuera de política, detecta metadatos huérfanos (*prunables*) y candidatos a limpieza. |
| **Limpiar** | `npm run worktree:cleanup -- --target <path/rama/id>` | Elimina de forma segura un worktree, bloqueando si hay cambios sin confirmar o commits sin integrar. |
| **Prunar** | `npm run worktree:prune` | Limpia referencias en Git de worktrees cuyos directorios ya no existen en disco. |

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

---

## 6. Matriz de Responsabilidades y Cumplimiento

| Componente | Rol en la Gobernanza | Responsabilidad |
| :--- | :--- | :--- |
| **`.agents/rules/worktree-governance.md`** | **Normativa (SSOT)** | Especificación formal de ubicación, nomenclatura y directivas. |
| **`AGENTS.md`** | **Directiva Operativa** | Obligación vinculante para todos los agentes de utilizar el CLI centralizado. |
| **`scripts/worktree/`** | **Motor de Ejecución** | Validador determinista, sanitizador y ejecutor de `git worktree`. |
| **`repo-lifecycle` / `repo-maintenance`** | **Skills Operativas** | Invocan `worktree:create` y `worktree:cleanup` en los flujos de ciclo de vida. |
| **`tests/unit/worktree_governance.test.ts`** | **Enforcement Automatizado** | Certifica la resolución de rutas, rechazo de path traversal y nomenclatura. |
