---
name: db-drizzle-ops
description: "Operaciones de base de datos relacional y migraciones con Drizzle ORM. Guía la modificación de esquemas en pokedex_entries, generación de migraciones SQL, validación de índices GIN sobre JSONB y compatibilidad con pg.Pool y PgBouncer."
---

# db-drizzle-ops

## Objetivo

Gobernar el ciclo de vida de la capa de persistencia relacional con Drizzle ORM sobre PostgreSQL 17 (ADR-011, ADR-031), garantizando migraciones deterministas, integridad del modelo híbrido relacional + `JSONB` y compatibilidad con connection pooling.

## Alcance y Reglas de Persistencia

1. **Fuente Única de Verdad de Esquema (SSOT):**
   - El esquema canónico reside en `apps/backend/src/db/schema.ts`.
   - Queda prohibida la introducción de scripts SQL manuales fuera del flujo de Drizzle Kit.
2. **Modelo de Datos Híbrido:**
   - La tabla central `pokedex_entries` almacena columnas clave relacionales indexadas (`id`, `nombre`, `tipo`, `updatedAt`) combinadas con la columna `data` de tipo `JSONB`.
   - Cualquier nuevo índice sobre la tabla debe crearse concurrentemente (`CREATE INDEX CONCURRENTLY IF NOT EXISTS`) para no bloquear tablas en producción (`npm run db:lint-migrations`).
3. **Flujo de Migraciones:**
   - Para aplicar cambios al esquema:
     1. Editar `apps/backend/src/db/schema.ts`.
     2. Ejecutar `npm run db:generate --workspace=@pokedex/backend` para generar el artefacto SQL secuencial en `apps/backend/src/db/migrations/`.
     3. Verificar que la migración generada aplique `CONCURRENTLY` en la creación de índices y no introduzca sentencias destructivas (`DROP TABLE`, `DROP COLUMN`) sin mitigación.
     4. Aplicar con `npm run db:migrate --workspace=@pokedex/backend` usando `DIRECT_DATABASE_URL` (puerto 5432).
4. **Resiliencia de Conexión y Pooling (ADR-011, ADR-031):**
   - El runtime de la API conecta mediante PgBouncer en puerto `6432` (`DATABASE_URL`, pool `max: 10`). Las migraciones DDL conectan directamente a PostgreSQL 17 en puerto `5432` (`DIRECT_DATABASE_URL`).
   - El backend opera bajo **Fail-Closed estricto (ADR-027)** en producción: si PostgreSQL está caído o inaccesible, las peticiones administrativas y consultas retornan `503 Service Unavailable` sin degradar a fallbacks volátiles ni envenenar la caché.

## Verificación

```bash
# 1. Validar tipos de Drizzle y backend
npm run typecheck

# 2. Validar higiene de migraciones DDL (CONCURRENTLY, transaccionalidad)
npm run db:lint-migrations

# 3. Ejecutar pruebas unitarias e integración de base de datos
npm run test:integration:db

# 4. Comprobar contratos de persistencia y Drizzle ORM
npm run test:contracts
```

---

> [!NOTE]
> Esta skill cumple estrictamente el contrato transversal [`_shared/skill-contract.md`](../_shared/skill-contract.md).
