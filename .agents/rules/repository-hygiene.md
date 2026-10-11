# Gobernanza de Higiene del Repositorio y Gestión de Archivos Temporales (`repository-hygiene.md`)

Esta regla aplica a **todos los agentes de IA, sin excepción**, incluidos Antigravity, Claude Code, Cursor, VS Code/Copilot, agentes autónomos y cualquier agente incorporado posteriormente, así como a procesos automatizados, scripts de mantenimiento y herramientas operativas en `rocapellino/pokedex`.

Es independiente del mecanismo utilizado para realizar una operación: herramientas nativas del IDE, terminal, scripts, comandos de shell, MCP, APIs, contenedores, automatizaciones, CI o herramientas auxiliares.

---

## 1. Ubicación Canónica y Anclaje a la Raíz

1. **Principio Fundamental de Centralización Temporal:**
   - Todo archivo temporal, borrador, log, reporte intermedio, patch, diff auxiliar, resultado de diagnóstico, descarga transitoria o artefacto de depuración generado por una tarea debe almacenarse bajo `<repository-root>/tmp/`.
   - Los agentes deben identificar la raíz real del repositorio antes de crear estos archivos y usar rutas ancladas a ella.
   - Si `tmp/` no existe, debe crearse bajo demanda (`fs.mkdirSync('tmp', { recursive: true })` o equivalente).

2. **Prohibición Estricta de Dispersión:**
   - Queda estrictamente prohibido dispersar o crear artefactos temporales en la raíz del repositorio, directorios de código (`apps/`), infraestructura (`infra/`, `gitops/`), documentación (`docs/`), pruebas (`tests/`), scripts (`scripts/`), metadatos de Git (`.git/`) u otras ubicaciones del repositorio.

3. **Ciclo de Vida sin `.gitkeep` y Aislamiento en VCS:**
   - La ubicación canónica es estrictamente la raíz del repositorio (`/tmp/`), ignorada formalmente en `.gitignore` mediante la regla `/tmp/`.
   - `tmp/` no debe versionar un archivo `.gitkeep` ni existir obligatoriamente en el árbol rastreado por Git.
   - Ningún archivo, subdirectorio o contenido de `tmp/` debe incorporarse a commits bajo ninguna circunstancia.

4. **Promoción Explícita de Artefactos:**
   - Si un artefacto generado inicialmente en `tmp/` pasa a ser un activo permanente (por ejemplo, una migración, un esquema validado o un reporte formalizado), debe moverse de forma explícita a su ubicación definitiva antes de ser commiteado.

---

## 2. Aplicación a Herramientas, Scripts y Model Context Protocol (MCP)

1. **Previsión y Configuración de Herramientas:**
   - Antes de ejecutar una herramienta, el agente debe determinar si generará archivos auxiliares, logs o resultados transitorios y configurar su destino dentro de `tmp/` cuando la herramienta lo permita.

2. **Gobernanza de Scripts del Repositorio:**
   - Los scripts del repositorio deben utilizar `tmp/` para sus artefactos temporales, salvo que exista una excepción técnica documentada.

3. **Servidores MCP y Mínimo Directorio de Filesystem:**
   - Las configuraciones de servidores MCP con acceso al filesystem deben restringir sus operaciones al mínimo directorio necesario.
   - Cuando un servidor MCP genere artefactos temporales, debe configurarse para usar `tmp/` siempre que lo admita.

4. **Principio de No Asunción Pasiva en MCP:**
   - Ningún agente puede asumir que un servidor MCP cumple esta política solo porque la instrucción esté documentada.
   - Las capacidades de escritura, rutas de trabajo y destinos temporales deben verificarse cuando sean controlables.

5. **Gestión de Directorios Temporales del Sistema Operativo:**
   - Si una herramienta utiliza obligatoriamente un directorio temporal gestionado por el sistema operativo, el agente debe documentar la excepción cuando sea relevante.
   - Debe evitarse copiar artefactos innecesarios al repositorio y bajo ninguna circunstancia modificar permisos globales para forzar la política.

---

## 3. Excepciones Formales y Límites de la Política

1. **Archivos Permanentes con Destino Funcional:**
   - Esta política no obliga a guardar en `tmp/` archivos permanentes cuyo destino funcional sea el código fuente, las pruebas, la documentación o la configuración del proyecto.
   - Estos archivos deben crearse directamente en su ubicación definitiva.

2. **Cachés Internas y Almacenamiento del Sistema:**
   - No se debe mover ni redirigir indiscriminadamente a `tmp/` la caché interna de gestores de paquetes (npm, Playwright, toolchains), el almacenamiento del sistema operativo o datos internos de herramientas que no constituyan artefactos transitorios de la tarea en curso.

---

## 4. Protocolo Obligatorio de Verificación al Finalizar

Al concluir cualquier tarea, el agente o proceso debe ejecutar el siguiente protocolo de cierre:

1. **Confirmación de Ubicación:**
   - Confirmar que todos los archivos temporales generados por la tarea estén bajo `tmp/` o correspondan a una excepción documentada.

2. **Eliminación de Residuos:**
   - Eliminar los residuos temporales que ya no sean necesarios para la trazabilidad inmediata.

3. **Verificación de Working Tree Limpio:**
   - Verificar `git status --short` y asegurar que ningún artefacto temporal se incluya en el cambio propuesto ni permanezca sin rastrear fuera de `tmp/`.

4. **Transparencia en Excepciones:**
   - Si una tarea requirió una excepción técnica o del sistema operativo, informar su motivo y alcance en el reporte final.

---

## 5. Tipología de Artefactos Temporales Aceptados en `tmp/`

El almacenamiento bajo `tmp/` comprende, entre otros:

- Archivos intermedios generados durante análisis o diagnósticos de código.
- Salidas y logs transitorios de debugging, profiling o troubleshooting.
- Reportes provisionales y borradores de auditoría antes de su consolidación formal.
- Archivos generados durante transformaciones, renderizados o conversiones de formato.
- Copias temporales de seguridad o comparación de archivos durante refactorizaciones.
- Resultados intermedios de pruebas locales o simulacros.
- Artefactos o binarios descargados transitoriamente para la ejecución de una operación puntual.
- Archivos de patches, diffs temporales y textos multilínea temporales para comandos de CLI (e.g. cuerpos de PR para `gh pr create --body-file tmp/<archivo>.md`).
- Resultados de herramientas de profiling, benchmarking o escaneo que no formen parte del repositorio permanente.

---

## 6. Matriz Operativa de Responsabilidades

| Componente | Rol en la Gobernanza | Responsabilidad |
| :--- | :--- | :--- |
| **`.agents/rules/repository-hygiene.md`** | **Normativa (SSOT)** | Define la política transversal, restricciones, alcance universal y ubicación canónica (`tmp/`). |
| **`AGENTS.md`** | **Directiva Operativa** | Instrucción vinculante para todos los agentes de IA (Antigravity, Claude Code, Cursor, Copilot, etc.) y mecanismos. |
| **`.agents/rules/mcp-governance.md`** | **Gobernanza MCP** | Exige mínimo directorio en filesystem, configuración de `tmp/` y no asunción pasiva. |
| **`.gitignore`** | **Enforcement en VCS** | Bloquea la inclusión accidental de `/tmp/` anclada a la raíz en el árbol de Git. |
| **`repo-tool-exec`** | **Aislamiento de Ejecución** | Garantiza redirección de salidas y logs a `tmp/` en herramientas locales y contenedores efímeros. |
| **`repo-maintenance`** | **Detección e Higiene** | Detecta archivos temporales dispersos fuera de `tmp/` y residuos en working tree. |
| **`repo-lifecycle`** | **Orquestación y Gate** | Valida el ciclo: operación ➔ `tmp/` ➔ limpieza ➔ `git status --short` limpio. |
| **Suites de Pruebas** | **Enforcement Automatizado** | `tests/contracts/governance/ignore_hygiene.test.ts` certifica la regla `/tmp/` y las directivas transversales. |
