import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateETag } from '../../apps/backend/src/utils/etag.js';
import {
  sanitizeLogString,
  buildPokemonFromPayload,
  applyPokemonUpdates,
} from '../../apps/backend/src/controllers/pokemon-mapper.js';
import type { Pokemon } from '../../apps/backend/src/types.js';

test('⚡ ETag Utility [Unit]: calculateETag genera hash determinista y entrecomillado', () => {
  const dataA = { id: 1, nombre: 'Bulbasaur' };
  const dataB = { id: 1, nombre: 'Bulbasaur' };
  const dataC = { id: 2, nombre: 'Ivysaur' };

  const etagA = calculateETag(dataA);
  const etagB = calculateETag(dataB);
  const etagC = calculateETag(dataC);

  // Idempotencia
  assert.equal(etagA, etagB);
  // Distinción ante mutación
  assert.notEqual(etagA, etagC);
  // Formato HTTP canónico ETag ("...")
  assert.ok(etagA.startsWith('"'));
  assert.ok(etagA.endsWith('"'));
  assert.equal(etagA.length, 18); // 16 hex chars + 2 comillas
});

test('🛡️ Log Security [Unit]: sanitizeLogString previene Log Injection (CWE-117)', () => {
  assert.equal(sanitizeLogString(null), '');
  assert.equal(sanitizeLogString(undefined), '');

  const maliciousInput = 'Pikachu\r\n[CRITICAL] System Compromised\tAdmin';
  const sanitized = sanitizeLogString(maliciousInput);
  assert.ok(!sanitized.includes('\r'));
  assert.ok(!sanitized.includes('\n'));
  assert.ok(!sanitized.includes('\t'));
  assert.ok(sanitized.includes('Pikachu__'));

  const longInput = 'A'.repeat(150);
  assert.equal(sanitizeLogString(longInput).length, 100);
});

test('🐾 Pokemon Mapper [Unit]: buildPokemonFromPayload construye entidad con defaults y tipos normalizados', () => {
  const minimalPayload = {
    nombre: '  Gengar  ',
    tipo: 'Fantasma',
  };

  const entity = buildPokemonFromPayload(94, minimalPayload);

  assert.equal(entity.id, 94);
  assert.equal(entity.nombre, 'Gengar');
  assert.equal(entity.tipo, 'Fantasma');
  assert.deepEqual(entity.tipos, ['Fantasma']);
  assert.equal(
    entity.imagen,
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png'
  );
  assert.equal(entity.habitat, 'Kanto');
  assert.equal(entity.fuerza, 50);
  assert.equal(entity.caracteristicas.peso, 10.0);
  assert.equal(entity.caracteristicas.altura, 1.0);
  assert.equal(entity.stats.hp, 50);
  assert.equal(entity.stats.attack, 50);

  // Payload con tipos y habilidades múltiples
  const multiPayload = {
    nombre: 'Venusaur',
    tipos: ['Planta', 'Veneno'],
    habilidades: ['Espesura', 'Clorofila'],
    imagen: 'https://example.com/venusaur.png',
  };
  const multiEntity = buildPokemonFromPayload(3, multiPayload);
  assert.deepEqual(multiEntity.tipos, ['Planta', 'Veneno']);
  assert.deepEqual(multiEntity.habilidades, ['Espesura', 'Clorofila']);
  assert.equal(multiEntity.imagen, 'https://example.com/venusaur.png');
});

test('🐾 Pokemon Mapper [Unit]: applyPokemonUpdates preserva inmutabilidad y fusiona campos anidados', () => {
  const existing: Pokemon = {
    id: 1,
    nombre: 'Bulbasaur',
    tipo: 'Planta',
    tipos: ['Planta', 'Veneno'],
    imagen: 'https://example.com/bulbasaur.png',
    fuerza: 49,
    habitat: 'Pradera',
    caracteristicas: {
      peso: 6.9,
      altura: 0.7,
      fuerza: 49,
      edad: 3,
      categoria: 'Semilla',
      descripcion: 'Semilla en su lomo',
      habitat: 'Pradera',
    },
    habilidades: ['Espesura'],
    stats: {
      hp: 45,
      attack: 49,
      defense: 49,
      sp_attack: 65,
      sp_defense: 65,
      speed: 45,
    },
    evoluciones: [],
  };

  const updates = {
    nombre: '  Bulbasaur Prime  ',
    fuerza: 60,
    caracteristicas: {
      peso: 7.5,
    },
    stats: {
      attack: 60,
    },
  };

  const updated = applyPokemonUpdates(existing, updates);

  // Inmutabilidad
  assert.notEqual(updated, existing);
  assert.equal(existing.nombre, 'Bulbasaur');

  // Actualizaciones aplicadas
  assert.equal(updated.nombre, 'Bulbasaur Prime');
  assert.equal(updated.fuerza, 60);
  assert.equal(updated.caracteristicas.peso, 7.5);
  // Campos preservados del existing
  assert.equal(updated.caracteristicas.altura, 0.7);
  assert.equal(updated.caracteristicas.categoria, 'Semilla');
  assert.equal(updated.stats.hp, 45);
  assert.equal(updated.stats.attack, 60);
  assert.equal(updated.stats.defense, 49);
});
