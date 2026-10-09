import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_REQUIRED_COLUMNS, getMigrationsFolder, runMigrations } from '../../../apps/backend/src/db/migrate.js';
import { createTestDatabase, postgresSkip, queryRows, type TestDatabase } from '../../helpers/services.js';

const journalEntries = (
  JSON.parse(fs.readFileSync(path.join(getMigrationsFolder(), 'meta', '_journal.json'), 'utf-8')) as {
    entries: unknown[];
  }
).entries.length;

const LEGACY_TABLE = `CREATE TABLE pokedex_entries (
  id integer PRIMARY KEY NOT NULL,
  nombre varchar(100) NOT NULL,
  tipo varchar(50) NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

describe('🐘 Migraciones Drizzle sobre PostgreSQL real', { skip: postgresSkip }, () => {
  let database: TestDatabase | undefined;

  afterEach(async () => {
    await database?.drop();
    database = undefined;
  });

  const journalRows = (url: string) =>
    queryRows<{ total: string }>(url, 'SELECT count(*)::text AS total FROM drizzle.__drizzle_migrations');

  test('una base vacía recibe la tabla, los índices y la secuencia que declara el esquema', async () => {
    database = await createTestDatabase();
    await runMigrations(database.url);

    const columns = await queryRows<{ column_name: string }>(
      database.url,
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pokedex_entries'",
    );
    assert.deepEqual(columns.map((c) => c.column_name).sort(), [...BASELINE_REQUIRED_COLUMNS].sort());

    const indexes = await queryRows<{ indexname: string }>(
      database.url,
      "SELECT indexname FROM pg_indexes WHERE tablename = 'pokedex_entries'",
    );
    for (const expected of ['idx_pokedex_tipo', 'idx_pokedex_nombre', 'pokedex_entries_pkey']) {
      assert.ok(
        indexes.some((i) => i.indexname === expected),
        `falta el índice ${expected}`,
      );
    }

    const [sequence] = await queryRows<{ start_value: string }>(
      database.url,
      "SELECT start_value::text FROM pg_sequences WHERE sequencename = 'pokedex_id_seq'",
    );
    assert.equal(sequence?.start_value, '1009', 'la secuencia debe arrancar después del catálogo inicial');

    assert.equal((await journalRows(database.url))[0].total, String(journalEntries));
  });

  test('aplicar las migraciones dos veces es idempotente', async () => {
    database = await createTestDatabase();
    await runMigrations(database.url);
    await queryRows(
      database.url,
      "INSERT INTO pokedex_entries (id, nombre, tipo, data) VALUES (1, 'Uno', 'Fuego', '{}')",
    );

    await runMigrations(database.url);

    assert.equal((await journalRows(database.url))[0].total, String(journalEntries));
    const [row] = await queryRows<{ total: string }>(
      database.url,
      'SELECT count(*)::text AS total FROM pokedex_entries',
    );
    assert.equal(row.total, '1', 'una segunda migración no debe tocar los datos');
  });

  test('una tabla creada antes de Drizzle (sin journal) se registra como aplicada y conserva sus datos', async () => {
    database = await createTestDatabase();
    await queryRows(database.url, LEGACY_TABLE);
    await queryRows(
      database.url,
      "INSERT INTO pokedex_entries (id, nombre, tipo, data) VALUES (7, 'Heredado', 'Agua', '{}')",
    );

    // Sin la línea base, el CREATE TABLE de la migración inicial fallaría por «ya existe».
    await runMigrations(database.url);

    assert.equal((await journalRows(database.url))[0].total, String(journalEntries));
    const rows = await queryRows<{ nombre: string }>(database.url, 'SELECT nombre FROM pokedex_entries WHERE id = 7');
    assert.deepEqual(rows, [{ nombre: 'Heredado' }]);
  });

  test('una tabla heredada a la que le faltan columnas aborta la migración en lugar de adivinar', async () => {
    database = await createTestDatabase();
    await queryRows(database.url, 'CREATE TABLE pokedex_entries (id integer PRIMARY KEY, nombre varchar(100))');

    await assert.rejects(
      runMigrations(database.url),
      /no coincide con la migración inicial \(faltan: tipo, data, updated_at\)/,
    );
  });
});
