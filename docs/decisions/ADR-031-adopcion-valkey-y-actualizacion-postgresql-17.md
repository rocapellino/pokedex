# ADR-031: Adopción de Valkey 8 y Actualización a PostgreSQL 17

## Estado

Aceptado el 2026-10-14.

Enmienda contractualmente a [ADR-006](./ADR-006-disaster-recovery-strategy.md), [ADR-008](./ADR-008-supply-chain-security.md), [ADR-010](./ADR-010-authentication-and-session-management.md), [ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md) y [ADR-027](./ADR-027-resilience-fail-open-vs-fail-closed-contracts.md).

---

## Contexto

La arquitectura de datos de la plataforma Pokédex se apoya en dos componentes de persistencia e infraestructura crítica:

1. **Capa de Caché y Sesiones en Memoria:**
   - Históricamente operaba sobre **Redis 7** (`redis:7-alpine`).
   - A partir de 2024, Redis Ltd. abandonó la licencia permisiva BSD-3 en favor de licencias duales restrictivas no reconocidas por la Open Source Initiative (OSI): la *Server Side Public License* (SSPLv1) y la *Redis Source Available License* (RSALv2).
   - En respuesta, la **Linux Foundation**, junto a una coalición de la industria (AWS, Google, Ericsson, Snap, etc.), estableció el proyecto **Valkey**: un fork 100% de código abierto bajo licencia **BSD-3**, con paridad binaria y de protocolo con Redis (compatible con RESP2/RESP3 y el cliente `ioredis` utilizado en `apps/backend`).
2. **Capa Relacional Transaccional:**
   - La base de datos operaba sobre **PostgreSQL 16** (`postgres:16-alpine`), con clientes gestionados mediante Drizzle ORM ([ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md)).
   - **PostgreSQL 17** consolida la versión LTS más moderna, introduciendo sustanciales mejoras en gestión de memoria durante vacuuming, optimizaciones del optimizador de consultas B-Tree, aceleración de funciones JSON/JSONB y mayor rendimiento transaccional.

Para mantener la plataforma completamente alineada con los estándares abiertos, la seguridad de la cadena de suministro ([ADR-008](./ADR-008-supply-chain-security.md)) y los contratos de Disaster Recovery ([ADR-006](./ADR-006-disaster-recovery-strategy.md)), se definió una migración controlada en dos fases: desarrollo local (Fase 1) y pre-producción/plataforma Kubernetes (Fase 2).

---

## Decisión

### 1. Adopción Canónica de Valkey 8 (`valkey/valkey:8-alpine`)

1. Se reemplaza la imagen `redis:7-alpine` por la imagen oficial gobernada por la Linux Foundation:
   - **Imagen OCI:** `valkey/valkey:8-alpine@sha256:081c2f5cb575efc901aa80ff9cdbd1ec6a301682fd35e1ebb4b0990a4a4a8507`
   - **Compatibilidad de Red y DNS:** Se preservan los nombres de servicio existentes, sin renombrarlos a Valkey: `redis` en `docker-compose.yaml` y `pokemon-redis-svc` en Kubernetes (`infra/helm/pokedex/templates/redis-deployment.yaml`), garantizando interoperabilidad transparente sin requerir cambios de variables de entorno ni bifurcación en el código cliente `apps/backend/src/services/cache.ts`.
   - **Comando de Arranque y Healthcheck:** Se configuran comandos nativos `valkey-server` y `valkey-cli` con fallback defensivo a `redis-cli`.
2. Se ratifican los contratos de resiliencia ([ADR-027](./ADR-027-resilience-fail-open-vs-fail-closed-contracts.md)):
   - **Fail-Open (Disponibilidad):** Ante indisponibilidad temporal de Valkey, la lectura del catálogo de Pokémon degrada grácilmente a PostgreSQL sin interrumpir el servicio.
   - **Fail-Closed (Seguridad):** La revocación de tokens JWT (`isJtiRevokedInRedis`), la sesión administrativa y el rate limiter de IA rechazan solicitudes si la capa de memoria no está disponible.

### 2. Actualización a PostgreSQL 17 (`postgres:17-alpine`)

1. Se migra la imagen relacional principal a:
   - **Servidor:** `postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`
2. **CronJobs de Respaldo y Verificación DR:**
   - La imagen de respaldo (`backup.image` en `values.yaml`) se actualiza a `postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826`.
   - Mantiene la variante Debian Bookworm para contar de forma nativa con `pg_dump` 17 y la herramienta criptográfica `openssl` necesaria para el cifrado AES-256-CBC con HMAC-SHA256 ([ADR-006](./ADR-006-disaster-recovery-strategy.md)).
3. **Simulación y Pruebas Automatizadas de DR:**
   - Se actualiza el contenedor efímero de `scripts/dr_verify_restore.sh` y `scripts/dr-drill.ts` a `postgres:17-alpine`, manteniendo la verificación criptográfica inmutable por digest en los simulacros de Disaster Recovery.

### 3. Gobernanza de Dependencias y Supply Chain (RENOVATE-001)

1. Se actualizan las políticas de Renovate ([`renovate.json`](../../renovate.json)) y su contrato de prueba (`tests/contracts/delivery/renovate_config_contract.test.ts`):
   - Se bloquean formalmente las versiones *major* de `postgres` (bloqueando v18+), `valkey/valkey` (bloqueando v9+) y `redis` a través de los gestores `docker-compose`, `helm-values`, `custom.regex` y `github-actions`.
   - Se integran los patrones regex de extracción de `tag` y `digest` para `valkey/valkey` en `values.yaml`.
   - Se mantiene la matriz de escaneo de seguridad estricto de Trivy (`.github/workflows/security-trivy.yaml`) sincronizada 1:1 con las 4 imágenes desplegadas por el Helm Chart.

---

## Consecuencias

### Positivas

- **Seguridad Jurídica y Licenciamiento Abierto:** Adopción de una base de código estrictamente BSD-3 mantenida por la Linux Foundation, eliminando riesgos de propiedad intelectual y restricciones de uso comercial.
- **Rendimiento Mejorado:** PostgreSQL 17 optimiza el consumo de memoria en operaciones de mantenimiento y acelera las consultas de catálogo y agregaciones.
- **Paridad Criptográfica Estricta:** Paridad certificada entre entornos locales (Docker Compose) y manifiestos de Kubernetes (Helm y GitOps) con fijación inmutable por digest SHA-256 (regla `INFRA-005` y contrato `ADR-008`).
- **Gobernanza Automatizada:** Los contratos de prueba verifican continuamente que no exista deriva (*drift*) entre los manifiestos, los workflows de Trivy y las reglas de Renovate.

### Consideraciones Operativas

- **Incompatibilidad de Directorio de Datos ($PGDATA):** Los clústeres preexistentes con volúmenes de PostgreSQL 16 requieren exportación lógica previa (`pg_dumpall`) o recreación de datos mediante el K8s Seed Job / `npm run seed`, ya que el formato de almacenamiento de PostgreSQL 17 no es compatible hacia atrás a nivel de bloques de disco sin ejecutar `pg_upgrade`.
