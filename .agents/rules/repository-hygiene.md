# Gobernanza de Higiene del Repositorio y Gestión de Archivos Temporales

Esta regla aplica a todos los agentes de IA (Antigravity), procesos automatizados, scripts de mantenimiento y herramientas operativas en `rocapellino/pokedex`.

---

## 1. Principio Fundamental de Centralización Temporal

> **Todos los archivos temporales y artefactos transitorios creados o utilizados durante operaciones sobre el repositorio deben almacenarse bajo `tmp/`, ubicado en la raíz del repositorio (`<repository-root>/tmp/`).**

Queda prohibida la dispersión o creación de archivos efímeros en la raíz del proyecto, en subdirectorios de código (`apps/`, `infra/`, `scripts/`, `tests/`, `docs/`) o dentro de metadatos de Git (`.git/`).

---

## 2. Directivas de Gobernanza para `tmp/`

1. **Exclusividad Temporal y Efímera:**
   - El directorio `tmp/` está reservado exclusivamente para datos efímeros y no persistentes.
   - Jamás debe utilizarse `tmp/` para alojar configuraciones, código fuente, documentación o activos de naturaleza permanente.

2. **Ubicación Canónica e Ignorado por Git:**
   - La ubicación canónica es estrictamente la raíz del repositorio (`/tmp/`).
   - El directorio debe estar formalmente ignorado por Git en el archivo `.gitignore` mediante la regla `/tmp/`.
   - Ningún archivo, subdirectorio o artefacto contenido dentro de `tmp/` debe commitearse al repositorio bajo ninguna circunstancia.

3. **Ciclo de Vida sin `.gitkeep`:**
   - `tmp/` no debe versionar un archivo `.gitkeep` ni existir obligatoriamente en el árbol rastreado por Git.
   - Los agentes, tareas de automatización y scripts deben crear `tmp/` bajo demanda si no existe (`fs.mkdirSync('tmp', { recursive: true })` o equivalente).

4. **Promoción Explícita de Artefactos:**
   - Si un artefacto generado inicialmente en `tmp/` pasa a ser un activo permanente (por ejemplo, una migración, un esquema validado o un reporte formalizado), debe moverse de forma explícita a su ubicación de destino antes de ser commiteado.

5. **Working Tree Limpio Fuera de `tmp/`:**
   - Toda operación o comando ejecutado por agentes debe procurar dejar limpio el working tree.
   - Al finalizar una tarea, la salida de `git status --short` no debe contener archivos no rastreados (*untracked*) ni modificaciones residuales fuera del alcance previsto. Los archivos de soporte transitorio deben eliminarse o residir en `tmp/`.

---

## 3. Tipología de Artefactos Temporales Aceptados en `tmp/`

El almacenamiento bajo `tmp/` comprende, entre otros:

- Archivos intermedios generados durante análisis o diagnósticos de código.
- Salidas y logs transitorios de debugging o troubleshooting.
- Reportes provisionales y borradores de auditoría antes de su consolidación.
- Archivos generados durante transformaciones, renderizados o conversiones de formato.
- Copias temporales de seguridad o comparación de archivos durante refactorizaciones.
- Resultados intermedios de pruebas locales o simulacros.
- Artefactos o binarios descargados exclusivamente para la ejecución de una operación puntual.
- Archivos de patches, diffs temporales y textos multilínea temporales para comandos de CLI (e.g. cuerpos de PR para `gh pr create --body-file tmp/<archivo>.md`).
- Resultados de herramientas de profiling, benchmarking o escaneo que no formen parte del repositorio permanente.

---

## 4. Matriz Operativa de Responsabilidades

| Componente | Rol en la Gobernanza | Responsabilidad |
| :--- | :--- | :--- |
| **`.agents/rules/repository-hygiene.md`** | **Normativa (SSOT)** | Define la política transversal, restricciones y ubicación canónica (`tmp/`). |
| **`AGENTS.md`** | **Directiva Operativa** | Instrucción vinculante a los agentes para dirigir archivos efímeros a `tmp/`. |
| **`.gitignore`** | **Enforcement en VCS** | Bloquea la inclusión accidental de `/tmp/` en el árbol de Git. |
| **`repo-maintenance`** | **Detección e Higiene** | Detecta archivos temporales dispersos fuera de `tmp/` y residuos en working tree. |
| **`repo-lifecycle`** | **Orquestación y Gate** | Valida el ciclo: operación ➔ `tmp/` ➔ limpieza ➔ `git status --short` limpio. |
| **Suites de Pruebas** | **Enforcement Automatizado** | `tests/contracts/governance/ignore_hygiene.test.ts` certifica la regla `/tmp/` y las directivas. |
