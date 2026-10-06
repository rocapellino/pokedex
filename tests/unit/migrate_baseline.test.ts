import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineLegacySchema } from '../../apps/backend/src/db/migrate.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = path.join(ROOT_DIR, 'apps/backend/src/db/migrations');
const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf-8'));
const INITIAL = journal.entries[0];
const INITIAL_HASH = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(MIGRATIONS, `${INITIAL.tag}.sql`), 'utf-8'))
  .digest('hex');

interface FakeDb {
  entries: boolean;
  journal: boolean;
  tracked: number;
  columns: string[];
}

/** Cliente pg simulado: responde las consultas de inspección y registra todo lo ejecutado. */
function fakeClient(db: FakeDb) {
  const executed: Array<{ text: string; params?: unknown[] }> = [];
  return {
    executed,
    async query(text: string, params?: unknown[]): Promise<{ rows: any[] }> {
      executed.push({ text, params });
      if (text.includes('to_regclass')) {
        return {
          rows: [
            {
              entries: db.entries ? 'pokedex_entries' : null,
              journal: db.journal ? 'drizzle.__drizzle_migrations' : null,
            },
          ],
        };
      }
      if (text.includes('count(*)')) return { rows: [{ total: String(db.tracked) }] };
      if (text.includes('information_schema.columns'))
        return { rows: db.columns.map((column_name) => ({ column_name })) };
      return { rows: [] };
    },
  };
}

const writes = (executed: Array<{ text: string }>) => executed.filter((q) => /^(CREATE|INSERT)/.test(q.text));
const LEGACY_COLUMNS = ['id', 'nombre', 'tipo', 'data', 'updated_at'];

test('🗄️ Migrations: una base vacía no se toca (la migración inicial la crea)', async () => {
  const client = fakeClient({ entries: false, journal: false, tracked: 0, columns: [] });
  assert.equal(await baselineLegacySchema(client, MIGRATIONS), 'fresh');
  assert.equal(writes(client.executed).length, 0);
});

test('🗄️ Migrations: una base con journal no se toca', async () => {
  const client = fakeClient({ entries: true, journal: true, tracked: 1, columns: LEGACY_COLUMNS });
  assert.equal(await baselineLegacySchema(client, MIGRATIONS), 'tracked');
  assert.equal(writes(client.executed).length, 0);
});

test('🗄️ Migrations: un esquema heredado sin journal registra la migración inicial como aplicada', async () => {
  // Regresión: pre-prod (2026-10-04) tenía pokedex_entries creado por un release
  // anterior y sin journal; migrate() reejecutaba CREATE TABLE y la API no arrancaba.
  const client = fakeClient({ entries: true, journal: false, tracked: 0, columns: LEGACY_COLUMNS });
  assert.equal(await baselineLegacySchema(client, MIGRATIONS), 'baselined');

  const insert = client.executed.find((q) => q.text.startsWith('INSERT INTO drizzle.__drizzle_migrations'));
  assert.ok(insert, 'Debe registrar la migración inicial en el journal');
  assert.deepEqual(
    insert.params,
    [INITIAL_HASH, INITIAL.when],
    'El registro debe coincidir con el hash y el timestamp que usa Drizzle',
  );
  assert.ok(client.executed.some((q) => q.text === 'CREATE SCHEMA IF NOT EXISTS drizzle'));
});

test('🗄️ Migrations: un journal existente pero vacío también se completa', async () => {
  const client = fakeClient({ entries: true, journal: true, tracked: 0, columns: LEGACY_COLUMNS });
  assert.equal(await baselineLegacySchema(client, MIGRATIONS), 'baselined');
});

test('🗄️ Migrations: un esquema heredado distinto falla sin escribir (fail-closed)', async () => {
  const client = fakeClient({ entries: true, journal: false, tracked: 0, columns: ['id', 'nombre'] });
  await assert.rejects(baselineLegacySchema(client, MIGRATIONS), /faltan: tipo, data, updated_at/);
  assert.equal(writes(client.executed).length, 0);
});
