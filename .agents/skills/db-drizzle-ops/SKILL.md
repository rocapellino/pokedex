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
   - La tabla central `pokedex_entries` almacena columnas clave relacionales indexadas (`id`, `nombre`, `tipo`, `fuerza`) combinadas con la columna `data` de tipo `JSONB`.
   - La columna `data` contiene el documento completo del espécimen y debe estar acelerada con un índice GIN (`CREATE INDEX IF NOT EXISTS ... USING gin (data)`).
3. **Flujo de Migraciones:**
   - Para aplicar cambios al esquema:
     1. Editar `apps/backend/src/db/schema.ts`.
     2. Ejecutar `npm run db:generate --workspace=@pokedex/backend` para generar el artefacto SQL secuencial en `apps/backend/src/db/migrations/`.
     3. Verificar que la migración generada preserve el índice GIN y no introduzca sentencias destructivas (`DROP TABLE`, `DROP COLUMN`) sin mitigación.
     4. Aplicar con `npm run db:migrate --workspace=@pokedex/backend`.
4. **Resiliencia de Conexión y Pooling:**
   - El pool canónico opera con `pg.Pool` con soporte opcional para PgBouncer (`scram-sha-256`, puerto `6432`).
   - El backend debe mantener degradación controlada (*fail-open* en catálogo en memoria si la base de datos se encuentra indisponible en desarrollo, o *fail-closed* en mutaciones administrativas de backoffice según ADR-027).

## Verificación

```bash
# 1. Validar tipos de Drizzle y backend
npm run typecheck

# 2. Ejecutar pruebas unitarias e integración de base de datos
npm run test:integration:db

# 3. Comprobar contratos de persistencia y Drizzle ORM
npm run test:contracts
```
