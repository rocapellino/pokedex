# Guía Contrastiva: Persistencia Avanzada (Drizzle ORM + PgBouncer 1.25.2)

## 1. Por qué importa (Why It Matters)

PgBouncer 1.25.2 operando en modo transacción (`pool_mode=transaction`) reutiliza conexiones TCP del servidor en cuanto finaliza cada transacción. Si el cliente instanciar sentencias preparadas con nombre (*named prepared statements*) o ejecuta migraciones DDL a través del pooler, se producen colisiones de estado (`prepared statement already exists`) o bloqueos transaccionales. Además, cualquier mutación de esquema o índice en producción sin el protocolo *Expand-Contract* (`CREATE INDEX CONCURRENTLY IF NOT EXISTS`) bloquea la tabla `pokedex_entries`, provocando tiempo de inactividad inadmisible en despliegues GitOps con ArgoCD.

---

## 2. Incorrecto (Incorrect)

```typescript
// ❌ ANTIPATRÓN: Conexión DDL a través de PgBouncer y creación de índices con bloqueo
import { pgTable, text, index } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

// 1. Pool sobredimensionado atravesando PgBouncer
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Apuntando al puerto 6432 de PgBouncer
  max: 50, // Double pooling severo que satura PgBouncer
});

// 2. Migración SQL generada con bloqueo exclusivo de tabla
// En archivo de migración incremental:
// CREATE INDEX "idx_pokedex_species" ON "pokedex_entries" ("species"); -- Bloquea lecturas y escrituras
// LOCK TABLE "pokedex_entries" IN EXCLUSIVE MODE;
```

---

## 3. Correcto (Correct)

```typescript
// ✅ PATRÓN CANÓNICO: Segregación estricta de conexiones y pool acotado (ADR-011)
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// 1. Runtime API: PgBouncer (puerto 6432) en Transaction Mode con consultas ad-hoc
const runtimePool = new Pool({
  connectionString: process.env.DATABASE_URL, // PgBouncer
  max: 10, // Cota contractual estricta (AUD-ARCH-ADR-001)
});
export const db = drizzle(runtimePool);

// 2. Migraciones DDL y Seeding: Conexión TCP directa (puerto 5432)
export function getDirectDatabaseUrl(): string | undefined {
  return process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
}

// 3. Migraciones incrementales Expand-Contract sin bloqueo:
// CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_pokedex_species" ON "pokedex_entries" ("species");
// DROP INDEX CONCURRENTLY IF EXISTS "idx_pokedex_old";
```

Validación automatizada con:

```bash
npm run db:lint-migrations
```

---

## 4. Referencias

- [ADR-011: Persistencia con Drizzle ORM y PgBouncer](../../docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md)
- [ADR-031: Adopción Valkey y Actualización PostgreSQL 17](../../docs/decisions/ADR-031-adopcion-valkey-y-actualizacion-postgresql-17.md)
- [Script de Higiene de Migraciones](../../scripts/check-migration-hygiene.ts)
