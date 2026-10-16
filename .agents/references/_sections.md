# Índice Maestro de Referencias Operativas Contrastivas

> **Gobernanza:** `.agents/references/`
> **Formato:** Patrón Contrastivo Canónico (4 bloques: *Por qué importa* → *Incorrecto* → *Correcto* → *Referencias*)
> **Propósito:** Proveer a agentes de IA y desarrolladores pautas técnicas accionables y directas, sin boilerplate innecesario, ancladas a las Decisiones de Arquitectura (ADR) del repositorio.

---

## 📚 Secciones por Dominio Técnico

| Prefijo / Sección | Dominio | Archivo | Decisiones de Arquitectura Vinculadas |
| :--- | :--- | :--- | :--- |
| `schema-` | **Persistencia, Drizzle ORM & PgBouncer** | [`schema-persistence.md`](schema-persistence.md) | [ADR-011](../../docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md), [ADR-031](../../docs/decisions/ADR-031-adopcion-valkey-y-actualizacion-postgresql-17.md) |
| `query-` | **Contratos de API, Tipado y Límites de Runtime** | [`query-api.md`](query-api.md) | [ADR-020](../../docs/decisions/ADR-020-unified-deployment-governance-and-script-retirement.md), [ADR-027](../../docs/decisions/ADR-027-resilience-fail-open-vs-fail-closed-contracts.md) |
| `k8s-` | **Kubernetes, GitOps, Helm & Supply Chain** | [`k8s-gitops.md`](k8s-gitops.md) | [ADR-008](../../docs/decisions/ADR-008-supply-chain-security.md), [ADR-013](../../docs/decisions/ADR-013-zero-trust-network-architecture.md), [ADR-017](../../docs/decisions/ADR-017-kyverno-admission-control-and-pod-security.md) |
| `security-` | **Blindaje Zero-Trust de MCP & Privilegio Mínimo** | [`security-mcp.md`](security-mcp.md) | [ADR-018](../../docs/decisions/ADR-018-opentelemetry-distributed-tracing-and-w3c.md), [ADR-027](../../docs/decisions/ADR-027-resilience-fail-open-vs-fail-closed-contracts.md) |

---

## 🛠️ Regla de Estilo para Nuevas Guías

Toda nueva guía modular incorporada a este directorio debe estructurarse obligatoriamente bajo los 4 bloques contrastivos:

1. **Por qué importa (*Why It Matters*):** Explicación concisa del riesgo operacional, de seguridad o de arquitectura.
2. **Incorrecto (*Incorrect*):** Antipatrón prohibido en el repositorio con ejemplo concreto.
3. **Correcto (*Correct*):** Patrón canónico aprobado y probado en el repositorio.
4. **Referencias (*References*):** Vínculos directos a ADRs o runbooks canónicos que fundamentan la regla.
