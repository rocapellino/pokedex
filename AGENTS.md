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
- **Engineering:** `repo-quality` (calidad de código, modularidad y prevención de God Files), `repo-architecture` (sistema, plataforma y GitOps), `repo-testing` (pirámide de pruebas), `repo-dependencies` (árbol de paquetes npm y librerías huérfanas), `repo-tool-exec` (resolución y ejecución reproducible de herramientas externas locales o en contenedores efímeros), `db-drizzle-ops` (migraciones deterministas con Drizzle ORM, índices GIN en `JSONB` y conexión PgBouncer según ADR-011).
- **Delivery & Security:** `repo-security` (DevSecOps, secretos, Cilium L7 y supply chain), `repo-ci` (pipelines de GitHub Actions), `repo-pr` (preparación, validación y revisión de PRs), `repo-release` (corte y readiness de versión), `k8s-gitops-validator` (validación de manifiestos con Kubeconform, Kube-Linter, Checkov y admisión Kyverno según ADR-013 y ADR-017), `devsecops-preflight` (batería de comprobación obligatoria previa a la apertura de Pull Requests).
- **Governance & Maintenance:** `repo-docs` (ciclo de vida documental integral, contratos, límites y claims verification), `adr-manager` (gobernanza inmutable, redacción y sincronización canónica de ADRs), `repo-maintenance` (salud periódica, higiene y limpieza segura), `repo-fix` (ejecución de correcciones con test de regresión previo y trazabilidad `AUD-*`), `repo-refactor` (diseño de cambios incrementales), `repo-modernize` (evaluación de modernización), `repo-metrics` (telemetría auxiliar).

> [!NOTE]
> Todo cambio debe consultar la *Change Impact Matrix* antes de ejecutar suites completas de validación. Los cambios puramente documentales aplican *Fast Track* (`repo-docs` o `adr-manager` + `npm run lint:md`).

El ciclo de vida se organiza en seis fases (auditar, matriz de cambios, ejecutar, actualizar, documentar y depurar), cada una con una skill responsable y un criterio de salida definidos en [`repo-lifecycle`](.agents/skills/repo-lifecycle/SKILL.md). Todas las skills cumplen el contrato común [`_shared/skill-contract.md`](.agents/skills/_shared/skill-contract.md): enlazan las fuentes de verdad en lugar de copiar versiones, UIDs o rutas volátiles.

### Reglas de Arquitectura Inquebrantables del Proyecto

1. **Diseño Fail-Closed (ADR-027):** El sistema debe fallar de forma segura cerrando accesos y denegando peticiones administrativas o mutaciones ante caídas de proveedores de seguridad, almacenamiento o red. La única degradación *fail-open* tolerada y contractualmente acotada es la consulta pública de lectura del catálogo de Pokémon en modo local dev sin base de datos conectada.
2. **Gobernanza Centralizada de Worktrees:** Estricta prohibición de operar o mutar en rutas no canónicas. Toda rama y checkout se crea bajo `../.worktrees/<repo-slug>/` mediante `npm run worktree:create`.
3. **Persistencia Exclusiva con Drizzle ORM (ADR-011, ADR-031):** El esquema en TypeScript es la SSOT única; no se admiten scripts SQL huérfanos ni migraciones manuales sin trazabilidad.
4. **Zero-Trust y Aislamiento L7 (ADR-013, ADR-016, ADR-017):** Tráfico inter-servicio bloqueado por defecto; validación eBPF con Cilium, control de admisión con Kyverno y bloqueo estricto de IMDS (`169.254.169.254/32`).

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

### A. Principios de Blindaje y Mínimo Privilegio (Zero-Trust)

1. **Cero Secretos Hardcodeados:** Todo token, URL o credencial se interpola en tiempo de ejecución mediante variables de entorno del sistema o `.env` (`${VAR_NAME}`). Ningún archivo `.mcp/*.json` o `.mcp/*.yaml` contiene credenciales en texto plano.
2. **Infraestructura de Solo Lectura por Defecto:** Queda estrictamente prohibido habilitar herramientas MCP con capacidad de mutación de infraestructura (`infrastructure-write`). Toda modificación sobre Kubernetes o IaC debe realizarse exclusivamente a través del flujo declarativo de GitOps (Helm / ArgoCD).
3. **Aislamiento de Filesystem:** Las herramientas locales (`filesystem`) operan con alcance acotado a la raíz del repositorio (`repo-root-only`) en modo solo lectura para evitar desvíos o lectura de archivos fuera del árbol del proyecto.
4. **Protección en Git:** Los archivos locales de configuración generados (`.cursor/mcp.json`, `.vscode/mcp.json`, `.mcp.json`, `.agents/mcp_config.json`, `.mcp/*.local.json`) están formalmente excluidos en `.gitignore`.

### B. Flujo de Operación y Diagnóstico para Agentes

- **Validación del Catálogo:** `npm run mcp:validate` (comprueba sintaxis, unicidad de IDs y conformidad con `policies.yaml`).
- **Generación de Adaptadores:** `npm run mcp:generate` (genera deterministamente las configuraciones para Antigravity, Cursor, Claude Code y VS Code).
- **Diagnóstico y Chequeo de Salud:** `npm run mcp:doctor` (audita dependencias binarias en el host y la presencia de variables de entorno requeridas).
- **Servidores Canónicos para Asistencia Local:**
  - `postgres-readonly`: Inspección segura de esquemas de `pokedex_entries` y planes `EXPLAIN` en PostgreSQL 17 local.
  - `observability-readonly`: Consulta de métricas Prometheus y trazas OpenTelemetry sin alterar el clúster.
  - `filesystem`: Exploración indexada de código y documentación (`docs/`).
  - `trivy` & `sonarqube`: Consulta de hallazgos de seguridad y calidad estática.

---

## 8. Gobernanza Centralizada de Git Worktrees

La creación, nomenclatura, ubicación, diagnóstico y limpieza de Git worktrees se rigen estrictamente por la regla transversal [`.agents/rules/worktree-governance.md`](.agents/rules/worktree-governance.md).

Queda terminantemente prohibido que un agente de IA o herramienta elija de forma arbitraria la ruta o la nomenclatura de un worktree, o ejecute llamadas directas no gobernadas a `git worktree add`. Todos los worktrees residen bajo el directorio base canónico `../.worktrees/<repo-slug>/` y se gestionan exclusivamente mediante los puntos de entrada centralizados: `npm run worktree:create`, `npm run worktree:list`, `npm run worktree:doctor`, `npm run worktree:cleanup` y `npm run worktree:prune`.

Si una aplicación host o IDE (como Antigravity) inicia una conversación situando el directorio de trabajo (`Cwd`) en un worktree fuera de la base canónica (por ejemplo, bajo `.gemini/antigravity/worktrees/`), el agente tiene **estrictamente prohibido** operar, cambiar de rama o realizar commits dentro de esa ruta no canónica: debe aprovisionar de inmediato el worktree gobernado en `../.worktrees/<repo-slug>/` con `npm run worktree:create`, ejecutar todas las operaciones allí y retirar el worktree fuera de regla mediante `npm run worktree:cleanup -- --non-canonical`. Dado que Git no provee hooks nativos de cliente para interceptar worktrees, el cumplimiento y la detección de regresiones se auditan activamente mediante `npm run worktree:doctor` y la suite de pruebas automatizadas.
