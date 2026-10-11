# Reglas Operativas para Agentes de IA (`AGENTS.md`)

Este archivo contiene instrucciones obligatorias para Antigravity y cualquier agente de IA que interactúe con el repositorio `rocapellino/pokedex`.

---

## 1. Demarcación Estricta: SSOT Actual vs. Evidencia Histórica

Al analizar el repositorio, buscar dependencias, validar configuraciones de infraestructura o inspeccionar secretos:

### A. Fuentes Únicas de Verdad (SSOT Actual)

- `gitops/`: Manifiestos y values de ArgoCD vigentes por entorno.
- `infra/`: Helm charts, templates, Ansible playbooks y OpenTofu.
- `docs/architecture/`: Especificación formal y activa de arquitectura y seguridad.
- `apps/`, `scripts/`, `tests/`: Código fuente ejecutable y suites de pruebas vigentes.

### B. Evidencia Histórica (Solo Lectura / Contexto Pasado)

- `docs/audits/`: Diagnósticos, auditorías fechadas y snapshots de hitos previos.

> [!IMPORTANT]
> **Regla de Oro:** **NUNCA inferir el estado actual, rutas de secretos o configuración vigente desde `docs/audits/`**.
> **Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio.**
> Por ejemplo, referencias pasadas a `pokedex/production` o snapshots de validación previa en auditorías son evidencia histórica. La configuración operativa actual utiliza estrictamente **`pokedex/preprod`** (pre-prod en Proxmox); **`pokedex/prod`** queda reservada para el blueprint prod cloud inactivo (ADR-030).

---

## 2. Markdown Quality Gate y Gobernanza Documental Obligatoria

Las políticas normativas, límites por nivel y presupuesto residen en la regla transversal [`.agents/rules/documentation-governance.md`](.agents/rules/documentation-governance.md).

Cada vez que un agente o skill cree, modifique o actualice cualquier archivo Markdown (`.md`), debe ejecutar:

```bash
npm run lint:md -- <archivos-modificados>
```

No se considerará terminada ninguna tarea que deje errores `MDxxx` pendientes de resolución.

---

## 3. Catálogo Canónico de Skills y Despacho Condicional

Las skills alojadas en `.agents/skills/` se rigen por el principio de **despacho condicional** según la matriz de impacto ([`_shared/change-impact-matrix.md`](.agents/skills/_shared/change-impact-matrix.md)):

- **Core & Lifecycle:** `repo-context`, `repo-lifecycle`, `repo-impact`, `repo-audit` (coordinador).
- **Engineering:** `repo-quality` (calidad de código, modularidad y prevención de God Files), `repo-architecture` (sistema, plataforma y GitOps), `repo-testing` (pirámide de pruebas), `repo-dependencies` (árbol de paquetes npm y librerías huérfanas), `repo-tool-exec` (resolución y ejecución reproducible de herramientas externas locales o en contenedores efímeros).
- **Delivery & Security:** `repo-security` (DevSecOps, secretos, Cilium L7 y supply chain), `repo-ci` (pipelines de GitHub Actions), `repo-pr` (preparación, validación y revisión de PRs), `repo-release` (corte y readiness de versión).
- **Governance & Maintenance:** `repo-docs` (ciclo de vida documental integral, contratos, límites y claims verification), `repo-maintenance` (salud periódica, higiene y limpieza segura), `repo-fix` (ejecución de correcciones con test de regresión previo y trazabilidad `AUD-*`), `repo-refactor` (diseño de cambios incrementales), `repo-modernize` (evaluación de modernización), `repo-metrics` (telemetría auxiliar).

> [!NOTE]
> Todo cambio debe consultar la *Change Impact Matrix* antes de ejecutar suites completas de validación. Los cambios puramente documentales aplican *Fast Track* (`repo-docs` + `npm run lint:md`).

El ciclo de vida se organiza en seis fases (auditar, matriz de cambios, ejecutar, actualizar, documentar y depurar), cada una con una skill responsable y un criterio de salida definidos en [`repo-lifecycle`](.agents/skills/repo-lifecycle/SKILL.md). Todas las skills cumplen el contrato común [`_shared/skill-contract.md`](.agents/skills/_shared/skill-contract.md): enlazan las fuentes de verdad en lugar de copiar versiones, UIDs o rutas volátiles.

---

## 4. Política Transversal de Idioma

El idioma operativo para toda comunicación humana (Pull Requests, descripciones, títulos, comentarios de revisión, issues, reportes, planes y respuestas) es estrictamente el **español** ([`_shared/language-policy.md`](.agents/skills/_shared/language-policy.md)).

Los identificadores técnicos, nombres de herramientas (GitHub Actions, Helm, pre-commit, ArgoCD), comandos de terminal, código y nombres de archivos se preservan en inglés.

---

## 5. Codificación UTF-8 en Contenido para GitHub

Todo texto destinado a Pull Requests, issues o comentarios de GitHub debe conservarse
en UTF-8 durante su generación y publicación.

- En Windows, antes de invocar `gh`, se debe comprobar que
  `[Console]::InputEncoding`, `[Console]::OutputEncoding` y `$OutputEncoding` usen
  UTF-8. No se permite una entrada OEM (`ibm850`, `cp850` u otra code page) combinada
  con salida UTF-8. Si alguna difiere, se debe normalizar la sesión antes de continuar:

  ```powershell
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  [Console]::InputEncoding = $utf8
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
  ```

- Los cuerpos multilínea se deben guardar en un archivo temporal UTF-8 sin BOM dentro de `tmp/`
  (e.g. `tmp/pr-body.md`) y publicar exclusivamente con `gh pr create --body-file <archivo>` o
  `gh pr edit --body-file <archivo>`. No deben enviarse como argumento inline ni por
  una tubería dependiente de la code page de la consola.
- Después de crear o editar el PR, se debe consultar el cuerpo remoto con
  `gh pr view <número> --json body --jq .body` y comprobar acentos, emojis y ausencia
  de indicadores de mojibake como `├`, `Ô`, `ƒ`, `Ã` o `Â`.
- Si falla la verificación, el PR no alcanza `READY_FOR_PR`: se debe regenerar el
  archivo desde la fuente UTF-8 correcta y volver a publicarlo.

---

## 6. Higiene del Repositorio y Gestión de Archivos Temporales

Esta política aplica a **todos los agentes de IA, sin excepción**, incluidos Antigravity, Claude Code, Cursor, VS Code/Copilot, agentes autónomos y cualquier agente incorporado posteriormente, y es independiente del mecanismo utilizado para realizar una operación (herramientas nativas del IDE, terminal, scripts, comandos de shell, MCP, APIs, contenedores, automatizaciones, CI o herramientas auxiliares), conforme a la regla transversal [`.agents/rules/repository-hygiene.md`](.agents/rules/repository-hygiene.md).

### A. Ubicación Canónica e Identificación de Raíz

- Todo archivo temporal, borrador, log, reporte intermedio, patch, diff auxiliar, resultado de diagnóstico, descarga transitoria o artefacto de depuración generado por una tarea debe almacenarse bajo `<repository-root>/tmp/`.
- Los agentes deben identificar la raíz real del repositorio antes de crear estos archivos y usar rutas ancladas a ella.
- Si `tmp/` no existe, debe crearse bajo demanda.
- Queda prohibido dispersar artefactos temporales en la raíz del repositorio, directorios de código, documentación, infraestructura, metadatos de Git u otras ubicaciones del repositorio.
- Ningún contenido de `tmp/` debe incorporarse a commits.

### B. Aplicación a Herramientas y MCP

- Antes de ejecutar una herramienta, el agente debe determinar si generará archivos auxiliares, logs o resultados transitorios y configurar su destino dentro de `tmp/` cuando la herramienta lo permita.
- Los scripts del repositorio deben utilizar `tmp/` para sus artefactos temporales, salvo que exista una excepción técnica documentada.
- Las configuraciones de servidores MCP con acceso al filesystem deben restringir sus operaciones al mínimo directorio necesario. Cuando un servidor genere artefactos temporales, debe configurarse para usar `tmp/` siempre que lo admita.
- Ningún agente puede asumir que un servidor MCP cumple esta política solo porque la instrucción esté documentada. Las capacidades de escritura, rutas de trabajo y destinos temporales deben verificarse cuando sean controlables.
- Si una herramienta utiliza obligatoriamente un directorio temporal gestionado por el sistema operativo, el agente debe documentar la excepción cuando sea relevante, evitar copiar artefactos innecesarios al repositorio y no modificar permisos globales para forzar la política.

### C. Excepciones

- Esta política no obliga a guardar en `tmp/` archivos permanentes cuyo destino funcional sea el código fuente, las pruebas, la documentación o la configuración del proyecto. Estos archivos deben crearse directamente en su ubicación definitiva.
- Tampoco se debe mover indiscriminadamente a `tmp/` la caché interna de gestores de paquetes, el almacenamiento del sistema operativo o datos internos de herramientas que no sean artefactos de la tarea.

### D. Verificación al Finalizar

Al concluir cualquier tarea, es obligatorio ejecutar el protocolo de verificación:

- Confirmar que los archivos temporales generados por la tarea estén bajo `tmp/` o correspondan a una excepción documentada.
- Eliminar los residuos temporales que ya no sean necesarios.
- Verificar `git status --short` y asegurar que ningún artefacto temporal se incluya en el cambio propuesto.
- Si una tarea requiere una excepción, informar su motivo y alcance en el reporte final.

---

## 7. Gobernanza de Model Context Protocol (MCP)

El catálogo de servidores MCP autorizados, sus políticas de seguridad, perfiles y adaptadores se rigen por la regla transversal [`.agents/rules/mcp-governance.md`](.agents/rules/mcp-governance.md) y la arquitectura canónica en [`.mcp/README.md`](.mcp/README.md).

Queda estrictamente prohibido utilizar herramientas MCP para eludir el flujo declarativo de GitOps, solicitar credenciales operativas o introducir servidores fuera del catálogo aprobado. Todo cambio en el catálogo se valida mediante `npm run mcp:validate`.

---

## 8. Gobernanza Centralizada de Git Worktrees

La creación, nomenclatura, ubicación, diagnóstico y limpieza de Git worktrees se rigen estrictamente por la regla transversal [`.agents/rules/worktree-governance.md`](.agents/rules/worktree-governance.md).

Queda terminantemente prohibido que un agente de IA o herramienta elija de forma arbitraria la ruta o la nomenclatura de un worktree. Todos los worktrees residen bajo el directorio base canónico `../.worktrees/<repo-slug>/` y se gestionan exclusivamente mediante los puntos de entrada centralizados: `npm run worktree:create`, `npm run worktree:list`, `npm run worktree:doctor`, `npm run worktree:cleanup` y `npm run worktree:prune`.
