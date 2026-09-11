import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAllPokemons,
  getPokemonById,
  savePokemon,
  deletePokemon,
  getNextPokemonId,
  getStorageHealth
} from '../apps/backend/src/services/db.js';
import { Pokemon } from '../apps/backend/src/types.js';

test('📦 Storage Layer: getStorageHealth reporta estado por defecto', () => {
  const health = getStorageHealth();
  assert.ok(typeof health.database === 'string');
  assert.ok(typeof health.postgres_connected === 'boolean');
  assert.ok(typeof health.redis_connected === 'boolean');
  assert.ok(health.total_records > 0);
});

test('📦 Storage Layer: getAllPokemons pagina y filtra correctamente', async () => {
  const page1 = await getAllPokemons({ limit: 5, offset: 0 });
  assert.equal(page1.pokemons.length, 5);
  assert.ok(page1.total >= 9);

  // Filtrado por tipo
  const firePokemons = await getAllPokemons({ type: 'Fuego' });
  assert.ok(firePokemons.pokemons.length > 0);
  assert.ok(firePokemons.pokemons.some(p => p.nombre.toLowerCase().includes('charmander')));
});

test('📦 Storage Layer: getPokemonById retorna pokemon existente y null para inexistente', async () => {
  const pikachu = await getPokemonById(25);
  assert.ok(pikachu !== null);
  assert.equal(pikachu?.nombre, 'Pikachu');

  const nonExistent = await getPokemonById(999999);
  assert.equal(nonExistent, null);
});

test('📦 Storage Layer: savePokemon guarda y actualiza un registro', async () => {
  const testPokemon: Pokemon = {
    id: 9999,
    nombre: 'Testmon',
    tipo: 'Normal',
    altura: 1.0,
    peso: 20.0,
    descripcion: 'Pokemon de prueba unitaria',
    imagen: 'https://example.com/testmon.png'
  };

  await savePokemon(testPokemon);
  const retrieved = await getPokemonById(9999);
  assert.deepEqual(retrieved, testPokemon);

  // Limpiar
  const deleted = await deletePokemon(9999);
  assert.equal(deleted, true);

  const afterDelete = await getPokemonById(9999);
  assert.equal(afterDelete, null);
});

test('📦 Storage Layer: getNextPokemonId genera IDs continuos', async () => {
  const nextId = await getNextPokemonId();
  assert.ok(nextId > 1008);
});

test('📦 Drizzle ORM: Esquema pokedexEntries y pokedexIdSeq definidos correctamente', async () => {
  const { pokedexEntries, pokedexIdSeq } = await import('../apps/backend/src/db/schema.js');
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
  const migrationsDir = path.resolve('apps/backend/src/db/migrations');
  
  assert.ok(fs.existsSync(migrationsDir), 'El directorio de migraciones debe existir');
  const files = fs.readdirSync(migrationsDir);
  const sqlMigrations = files.filter(f => f.endsWith('.sql'));
  
  assert.ok(sqlMigrations.length >= 1, 'Debe existir al menos un archivo de migración SQL');
  const initialMigration = fs.readFileSync(path.join(migrationsDir, sqlMigrations[0]), 'utf-8');
  assert.ok(initialMigration.includes('CREATE TABLE "pokedex_entries"'));
  assert.ok(initialMigration.includes('idx_pokedex_tipo'));
  assert.ok(initialMigration.includes('idx_pokedex_nombre'));
  assert.ok(initialMigration.includes('pokedex_id_seq'));
});

