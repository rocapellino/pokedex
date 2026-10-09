import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';

test('📦 Drizzle ORM: Esquema pokedexEntries y pokedexIdSeq definidos correctamente', async () => {
  const schemaMod: any = fs.existsSync(path.join(ROOT_DIR, 'apps/backend/src/db/schema.js'))
    ? await import('../../apps/backend/src/db/schema.js')
    : await import('../../apps/backend/src/db/schema.ts');
  const { pokedexEntries, pokedexIdSeq } = schemaMod;
  assert.ok(pokedexEntries);
  assert.ok(pokedexIdSeq);
  assert.equal(pokedexIdSeq.seqName, 'pokedex_id_seq');

  // Verificar columnas del esquema Drizzle
  assert.ok(pokedexEntries.id);
  assert.ok(pokedexEntries.nombre);
  assert.ok(pokedexEntries.tipo);
  assert.ok(pokedexEntries.data);
  assert.ok(pokedexEntries.updatedAt);
});

test('📦 Drizzle ORM: Migraciones declarativas generadas y consistentes en disco', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const migrationsDir = path.join(ROOT_DIR, 'apps/backend/src/db/migrations');

  assert.ok(fs.existsSync(migrationsDir), 'El directorio de migraciones debe existir');
  const files = fs.readdirSync(migrationsDir);
  const sqlMigrations = files.filter((f) => f.endsWith('.sql'));

  assert.ok(sqlMigrations.length >= 1, 'Debe existir al menos un archivo de migración SQL');
  const initialMigration = fs.readFileSync(path.join(migrationsDir, sqlMigrations[0]), 'utf-8');
  assert.ok(initialMigration.includes('CREATE TABLE "pokedex_entries"'));
  assert.ok(initialMigration.includes('idx_pokedex_tipo'));
  assert.ok(initialMigration.includes('idx_pokedex_nombre'));
  assert.ok(initialMigration.includes('pokedex_id_seq'));
});

test('📦 Drizzle ORM: drizzle.config.ts implementa política fail-closed en producción', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const configPath = path.join(ROOT_DIR, 'apps/backend/drizzle.config.ts');

  assert.ok(fs.existsSync(configPath), 'drizzle.config.ts debe existir');
  const content = fs.readFileSync(configPath, 'utf-8');
  assert.ok(content.includes("NODE_ENV === 'production'"), 'drizzle.config.ts debe evaluar NODE_ENV');
  assert.ok(
    content.includes('DATABASE_URL o POSTGRES_PASSWORD es obligatoria'),
    'drizzle.config.ts debe requerir credenciales en producción',
  );
});
