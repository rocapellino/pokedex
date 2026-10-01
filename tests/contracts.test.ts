import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildCatalog, checkDrift } from '../scripts/test-surface.js';
import type { Pokemon as BackendPokemon, PokemonCharacteristics as BackendChars, PokemonStats as BackendStats } from '../apps/backend/src/types.js';
import type { Pokemon as FrontendPokemon, PokemonCharacteristics as FrontendChars, PokemonStats as FrontendStats } from '../apps/frontend/src/types.js';

test('🛡️ Contratos de Tipos: compatibilidad estructural e interoperabilidad entre Backend y Frontend', () => {
  const sampleBackendPokemon: BackendPokemon = {
    id: 1,
    nombre: 'Bulbasaur',
    tipo: 'Planta',
    tipos: ['Planta', 'Veneno'],
    imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    habilidades: ['Espesura'],
    caracteristicas: {
      peso: 6.9,
      altura: 0.7,
      fuerza: 49,
      edad: 2,
      categoria: 'Semilla',
      descripcion: 'Una rara semilla fue plantada en su espalda al nacer.',
    },
    stats: {
      hp: 45,
      attack: 49,
      defense: 49,
      sp_attack: 65,
      sp_defense: 65,
      speed: 45,
    },
  };

  const frontendView: FrontendPokemon = sampleBackendPokemon;
  assert.strictEqual(frontendView.id, 1);
  assert.strictEqual(frontendView.nombre, 'Bulbasaur');
  assert.strictEqual(frontendView.caracteristicas?.peso, 6.9);
  assert.strictEqual(frontendView.stats?.hp, 45);
});

test('🛡️ Contrato de Superficie de Pruebas: el inventario test-surface.json y test-surface.md están sincronizados sin drift', () => {
  const rootDir = process.cwd();
  const jsonPath = path.join(rootDir, 'docs', 'testing', 'test-surface.json');
  const mdPath = path.join(rootDir, 'docs', 'testing', 'test-surface.md');

  assert.ok(fs.existsSync(jsonPath), 'docs/testing/test-surface.json debe existir');
  assert.ok(fs.existsSync(mdPath), 'docs/testing/test-surface.md debe existir');

  const catalog = buildCatalog();
  const drift = checkDrift(catalog);

  assert.strictEqual(
    drift.hasDrift,
    false,
    `No debe existir drift en la superficie de testing. Nuevos: ${drift.newFiles.length}, Eliminados: ${drift.removedFiles.length}, Conteo modificado: ${drift.countChangedFiles.length}, Modificados: ${drift.modifiedFiles.length}`
  );
  assert.strictEqual(
    drift.orphanFiles.length,
    0,
    `No debe haber tests huérfanos sin comandos asignados: ${drift.orphanFiles.join(', ')}`
  );
});

