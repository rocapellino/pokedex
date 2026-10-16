# Guía Contrastiva: Blindaje Zero-Trust de MCP & Privilegio Mínimo

## 1. Por qué importa (Why It Matters)

El protocolo Model Context Protocol (MCP) amplía las capacidades de los agentes de IA exponiendo herramientas locales, bases de datos y APIs. Si una definición MCP incluye secretos hardcodeados, permisos de mutación de infraestructura (`infrastructure-write`), o comandos con paquetes flotantes (`npx tool@latest`), el repositorio queda expuesto a ataques de inyección de prompts, exfiltración de credenciales (*credential dumping*) y ejecución de código no autorizada (RCE). El catálogo de `.mcp/` debe operar bajo el principio de **Mínimo Privilegio Absoluto** y **Cero Secretos**.

---

## 2. Incorrecto (Incorrect)

```json
// ❌ ANTIPATRÓN: Secretos en texto plano, permisos mutables y versión flotante
{
  "mcpServers": {
    "postgres-mutating": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres@latest"], // ❌ Versión flotante insegura
      "env": {
        "POSTGRES_URL": "postgresql://postgres:MySecretPassword123@localhost:5432/pokemon" // ❌ Credencial expuesta
      },
      "permissions": {
        "infrastructure-write": true // ❌ Mutación descontrolada de infraestructura
      }
    }
  }
}
```

---

## 3. Correcto (Correct)

```yaml
# ✅ PATRÓN CANÓNICO: Interpolación en runtime, solo lectura y versiones inmutables (.mcp/policies.yaml)
servers:
  postgres-readonly:
    command: "docker"
    args:
      - "run"
      - "--rm"
      - "-i"
      - "--network=host"
      - "-e"
      - "DATABASE_URL=${READONLY_DATABASE_URL}" # ✅ Interpola en runtime sin persistir secretos
      - "ghcr.io/modelcontextprotocol/servers/postgres:v1.2.0@sha256:7a8b9c..." # ✅ Versión y digest inmutables
    security:
      readOnly: true
      allowWrite: false
      scope: "database-schema-inspection-only"
```

Validación automatizada con:

```bash
npm run mcp:validate
npm run mcp:doctor
```

---

## 4. Referencias

- [Regla de Gobernanza MCP](../rules/mcp-governance.md)
- [Arquitectura y Catálogo Canónico MCP](../../.mcp/README.md)
- [ADR-018: OpenTelemetry Distributed Tracing and W3C](../../docs/decisions/ADR-018-opentelemetry-distributed-tracing-and-w3c.md)
