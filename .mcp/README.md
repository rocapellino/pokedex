# Arquitectura e Integración MCP Gobernada (`.mcp`)

Este directorio contiene la especificación canónica, registro y políticas de seguridad para el Model Context Protocol (MCP) en `rocapellino/pokedex`.

---

## 1. Visión General y Arquitectura

La arquitectura MCP de Pokédex desacopla el catálogo de herramientas de los clientes específicos (Cursor, VS Code, Claude Code o agentes de IA):

```mermaid
flowchart TD
    REG[".mcp/registry.yaml
Catálogo Canónico Aprobado"] --> VAL["scripts/mcp/validate.ts
Validación Estricta"]
    POL[".mcp/policies.yaml
Perfiles y Políticas"] --> VAL
    CLI[".mcp/clients.yaml
Clientes Soportados"] --> VAL

    VAL --> GEN["scripts/mcp/generate.ts
Generador Idempotente"]

    GEN --> OUT_CUR[".cursor/mcp.json
(Ignorado por Git)"]
    GEN --> OUT_VSC[".vscode/mcp.json
(Ignorado por Git)"]
    GEN --> OUT_CLA[".claude/mcp.json
(Ignorado por Git)"]
    GEN --> OUT_GEN[".mcp/generated/mcp-config.json
(Ignorado por Git)"]
```

### Separación Estricta de Responsabilidades

1. **Registro Canónico ([`registry.yaml`](registry.yaml)):** Fuente única de verdad de servidores autorizados, versiones fijas y metadatos.
2. **Políticas de Seguridad ([`policies.yaml`](policies.yaml)):** Definición de perfiles (`development`, `github`, `infrastructure-readonly`, `infrastructure-write`, `ci`).
3. **Especificación de Clientes ([`clients.yaml`](clients.yaml)):** Declaración de clientes verificados y rutas de destino.
4. **Validación y Contratos ([`schema.json`](schema.json)):** Validación determinista y prevención de configuraciones inseguras.
5. **Generador de Adaptadores ([`scripts/mcp/generate.ts`](../scripts/mcp/generate.ts)):** Emisión reproducible e idempotente de configuraciones locales.

---

## 2. Perfiles de Seguridad

| Perfil | Propósito | Red | Filesystem | Escritura | Estado por Defecto |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `development` | Herramientas locales de análisis y memoria contextual | none | `repo-root-only` | No | Habilitado |
| `github` | Repositorios, issues y PRs autorizados (`rocapellino/pokedex`) | outbound | none | No | Habilitado |
| `infrastructure-readonly` | Consulta de métricas, telemetría y observabilidad | outbound | none | No | Habilitado |
| `infrastructure-write` | Operaciones de escritura en K8s o cloud | outbound | temp-only | Sí | **Deshabilitado** |
| `ci` | Validación en GitHub Actions sin secretos operativos | isolated | `read-only-repo` | No | Habilitado |

> [!IMPORTANT]
> El perfil `infrastructure-write` permanece deshabilitado por defecto. Ningún agente ni desarrollador debe utilizar servidores MCP para eludir el flujo formal de GitOps (ArgoCD) y Pull Requests.

---

## 3. Servidores Registrados y Estado

| ID | Nombre | Transporte | Modo | Paquete / Imagen | Versión | Perfil |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `github` | GitHub Official | `stdio` | `local` | `@modelcontextprotocol/server-github` | `2025.4.8` | `github` |
| `filesystem` | Filesystem | `stdio` | `local` | `@modelcontextprotocol/server-filesystem` | `2026.8.31` | `development` |
| `memory` | Memory Graph | `stdio` | `local` | `@modelcontextprotocol/server-memory` | `2026.8.31` | `development` |
| `sonarqube` | SonarQube Launcher | `stdio` | `local` | `mcp-sonarqube-launcher` | `1.1.2` | `development` |
| `observability-readonly` | Grafana Observability | `sse` | `remote` | Endpoint HTTPS con TLS | `1.0.0` | `infrastructure-readonly` |
| `k8s-platform-write` | K8s Platform Write | `stdio` | `container` | `alpine/k8s` (fijado por SHA256) | `1.32.0` | `infrastructure-write` (Inactivo) |

---

## 4. Onboarding y Uso Diario

### Paso 1: Preparación Inicial

Ejecutar el asistente interactivo de preparación:

```bash
npm run mcp:setup
# O mediante Task:
task mcp:setup
```

El asistente verifica Node.js (>= 24), detecta Docker, valida el catálogo y emite las configuraciones locales ignoradas por Git.

### Paso 2: Configuración Segura de Variables

Para servidores que requieran credenciales (ej. `GITHUB_PERSONAL_ACCESS_TOKEN`, `SONAR_TOKEN`), defínalas en su entorno local o en `.env` local:

```bash
# Variables locales (NUNCA commitear)
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_..."
export SONAR_TOKEN="..."
```

### Paso 3: Diagnóstico del Entorno

Compruebe la salud de sus servidores y clientes sin exponer valores de secretos:

```bash
npm run mcp:doctor
# O mediante Task:
task mcp:doctor
```

---

## 5. Comandos Disponibles

| Comando npm | Tarea Taskfile | Acción Realizada |
| :--- | :--- | :--- |
| `npm run mcp:validate` | `task mcp:validate` | Valida catálogo, políticas, esquemas y ausencia de secretos |
| `npm run mcp:generate` | `task mcp:generate` | Genera configuraciones nativas para todos los clientes |
| `npm run mcp:generate:check` | `task mcp:generate:check` | Valida sincronización en CI (falla si hay drift) |
| `npm run mcp:setup` | `task mcp:setup` | Asistente de onboarding y verificación de dependencias |
| `npm run mcp:doctor` | `task mcp:doctor` | Diagnóstico seguro de conectividad, runtime y variables |
| `npm run mcp:test` | `task mcp:test` | Ejecuta las suites de tests unitarios, contratos y seguridad |

---

## 6. Procedimiento para Modificar el Catálogo

1. **Alta de Servidor:**
   - Añadir la definición en [`registry.yaml`](registry.yaml) con versión semver explícita (prohibido `latest`).
   - Si utiliza contenedor, fijar la imagen obligatoriamente por digest SHA256 inmutable (`@sha256:`).
   - Asignar el perfil adecuado de [`policies.yaml`](policies.yaml).
2. **Validación:**
   - Ejecutar `npm run mcp:validate` y `npm run mcp:test`.
3. **Regeneración:**
   - Ejecutar `npm run mcp:generate`.
4. **Gobernanza:**
   - Superar el Markdown Quality Gate: `npm run lint:md -- .mcp/README.md`.
