/**
 * AUD-ARCH-DB-001 (ADR-011) — el esquema lo migra un Job dedicado; la API productiva solo verifica
 * que el journal de Drizzle registre la última migración incluida en su imagen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getMigrationsFolder,
  getSchemaStatus,
  resolveMigrationDatabaseUrl,
} from '../../apps/backend/src/db/migrate.js';

const journal = JSON.parse(fs.readFileSync(path.join(getMigrationsFolder(), 'meta', '_journal.json'), 'utf-8')) as {
  entries: Array<{ when: number }>;
};
const LATEST = Math.max(...journal.entries.map((e) => e.when));

/** Cliente simulado: `journal` es el nombre de la tabla de Drizzle (o null) y `applied` el max(created_at). */
function fakeClient(journalTable: string | null, applied: number | null) {
  return {
    query: async <R>(text: string): Promise<{ rows: R[] }> => {
      if (text.includes('to_regclass')) return { rows: [{ journal: journalTable } as R] };
      if (text.includes('max(created_at)')) return { rows: [{ last: applied === null ? null : String(applied) } as R] };
      throw new Error(`consulta inesperada: ${text}`);
    },
  };
}

test('getSchemaStatus: al día cuando el journal registra la última migración de la imagen', async () => {
  const status = await getSchemaStatus(fakeClient('drizzle.__drizzle_migrations', LATEST));
  assert.deepEqual(status, { upToDate: true, expected: LATEST, applied: LATEST });
});

test('getSchemaStatus: pendiente cuando falta la última migración', async () => {
  const status = await getSchemaStatus(fakeClient('drizzle.__drizzle_migrations', LATEST - 1));
  assert.equal(status.upToDate, false);
  assert.equal(status.applied, LATEST - 1);
});

test('getSchemaStatus: pendiente cuando no existe el journal de Drizzle (base sin migrar)', async () => {
  const status = await getSchemaStatus(fakeClient(null, null));
  assert.deepEqual(status, { upToDate: false, expected: LATEST, applied: null });
});

test('getSchemaStatus: pendiente cuando el journal existe vacío', async () => {
  const status = await getSchemaStatus(fakeClient('drizzle.__drizzle_migrations', null));
  assert.equal(status.upToDate, false);
});

test('resolveMigrationDatabaseUrl: prioriza DIRECT_DATABASE_URL', () => {
  assert.equal(
    resolveMigrationDatabaseUrl({
      DIRECT_DATABASE_URL: 'postgresql://direct',
      DATABASE_URL: 'postgresql://pooled',
      POSTGRES_HOST: 'postgres-service',
      POSTGRES_USER: 'u',
      POSTGRES_PASSWORD: 'p',
      POSTGRES_DB: 'd',
    }),
    'postgresql://direct',
  );
});

test('resolveMigrationDatabaseUrl: sin DIRECT_DATABASE_URL compone POSTGRES_* antes que DATABASE_URL (PgBouncer)', () => {
  // El Job fija POSTGRES_HOST/PORT al PostgreSQL directo; DATABASE_URL puede apuntar a PgBouncer
  // en modo transacción, que no admite DDL de forma segura (ADR-011).
  assert.equal(
    resolveMigrationDatabaseUrl({
      DATABASE_URL: 'postgresql://u:p@pgbouncer-service:6432/d',
      POSTGRES_HOST: 'postgres-service',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'pokedex_app',
      POSTGRES_PASSWORD: 'p@ss/word',
      POSTGRES_DB: 'pokedex_db',
    }),
    'postgresql://pokedex_app:p%40ss%2Fword@postgres-service:5432/pokedex_db',
  );
});

test('resolveMigrationDatabaseUrl: recurre a DATABASE_URL sin otra fuente y a undefined sin ninguna', () => {
  assert.equal(resolveMigrationDatabaseUrl({ DATABASE_URL: 'postgresql://only' }), 'postgresql://only');
  assert.equal(resolveMigrationDatabaseUrl({}), undefined);
});
