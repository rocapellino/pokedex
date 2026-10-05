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
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png',
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

test('🐾 Pokemon Mapper [Unit]: applyPokemonUpdates cubre mutaciones completas y todas las ramas de fallback', () => {
  const existing: Pokemon = {
    id: 4,
    nombre: 'Charmander',
    tipo: 'Fuego',
    tipos: ['Fuego'],
    imagen: 'https://example.com/charmander.png',
    fuerza: 52,
    habitat: 'Montaña',
    caracteristicas: {
      peso: 8.5,
      altura: 0.6,
      fuerza: 52,
      edad: 4,
      categoria: 'Lagarto',
      descripcion: 'Fuego en su cola',
      habitat: 'Montaña',
    },
    habilidades: ['Mar Llamas'],
    stats: {
      hp: 39,
      attack: 52,
      defense: 43,
      sp_attack: 60,
      sp_defense: 50,
      speed: 65,
    },
    evoluciones: [],
  };

  // 1. Mutación con campos exhaustivos cubriendo ramas ternarias
  const fullUpdates = {
    imagen: 'https://example.com/charmeleon.png',
    tipo: 'Fuego/Dragón',
    tipos: ['Fuego', 'Dragón'],
    habitat: 'Volcán',
    habilidades: ['Poder Solar', 'Mar Llamas'],
    caracteristicas: {
      altura: 1.1,
      edad: 6,
      categoria: 'Llama',
      descripcion: 'Escupe fuego intenso',
      fuerza: 64,
    },
    stats: {
      defense: 58,
      sp_attack: 80,
      sp_defense: 65,
      speed: 80,
    },
    evoluciones: [{ id: 5, nombre: 'Charmeleon', etapa: 'Fase 1' }],
  };

  const updatedFull = applyPokemonUpdates(existing, fullUpdates);
  assert.equal(updatedFull.imagen, 'https://example.com/charmeleon.png');
  assert.equal(updatedFull.tipo, 'Fuego/Dragón');
  assert.deepEqual(updatedFull.tipos, ['Fuego', 'Dragón']);
  assert.equal(updatedFull.habitat, 'Volcán');
  assert.deepEqual(updatedFull.habilidades, ['Poder Solar', 'Mar Llamas']);
  assert.equal(updatedFull.caracteristicas.altura, 1.1);
  assert.equal(updatedFull.caracteristicas.edad, 6);
  assert.equal(updatedFull.caracteristicas.categoria, 'Llama');
  assert.equal(updatedFull.caracteristicas.descripcion, 'Escupe fuego intenso');
  assert.equal(updatedFull.caracteristicas.fuerza, 64);
  assert.equal(updatedFull.stats.defense, 58);
  assert.equal(updatedFull.stats.sp_attack, 80);
  assert.equal(updatedFull.stats.sp_defense, 65);
  assert.equal(updatedFull.stats.speed, 80);
  assert.equal(updatedFull.evoluciones.length, 1);

  // 2. Mutación con strings individuales en tipos/habilidades y habitat en caracteristicas
  const stringTypeUpdates = {
    tipos: 'Fuego' as any,
    habilidades: 'Impulso' as any,
    caracteristicas: {
      habitat: 'Cueva',
    },
  };
  const updatedStringTypes = applyPokemonUpdates(existing, stringTypeUpdates);
  assert.deepEqual(updatedStringTypes.tipos, ['Fuego']);
  assert.deepEqual(updatedStringTypes.habilidades, ['Impulso']);
  assert.equal(updatedStringTypes.caracteristicas.habitat, 'Cueva');

  // 3. Mutación vacía: preserva valores previos intactos
  const emptyUpdate = applyPokemonUpdates(existing, {});
  assert.equal(emptyUpdate.nombre, existing.nombre);
  assert.equal(emptyUpdate.imagen, existing.imagen);
  assert.equal(emptyUpdate.habitat, existing.habitat);
  assert.equal(emptyUpdate.caracteristicas.peso, existing.caracteristicas.peso);
  assert.equal(emptyUpdate.stats.hp, existing.stats.hp);
});

test('🐾 Pokemon Mapper [Unit]: buildPokemonFromPayload cubre payloads exhaustivos y tipos no-array', () => {
  const payloadExhaustivo = {
    nombre: 'Charizard',
    imagen: 'https://example.com/charizard.png',
    tipo: 'Fuego',
    tipos: 'Fuego' as any, // prueba de rama no-array
    habitat: 'Volcán',
    fuerza: 84,
    caracteristicas: {
      peso: 90.5,
      altura: 1.7,
      fuerza: 84,
      edad: 10,
      categoria: 'Llama',
      descripcion: 'Alas poderosas',
      habitat: 'Volcán',
    },
    habilidades: 'Mar Llamas' as any, // prueba de rama no-array
    stats: {
      hp: 78,
      attack: 84,
      defense: 78,
      sp_attack: 109,
      sp_defense: 85,
      speed: 100,
    },
    evoluciones: [{ id: 6, nombre: 'Charizard', etapa: 'Fase 2' }],
  };

  const entity = buildPokemonFromPayload(6, payloadExhaustivo);
  assert.equal(entity.id, 6);
  assert.equal(entity.nombre, 'Charizard');
  assert.deepEqual(entity.tipos, ['Fuego']);
  assert.deepEqual(entity.habilidades, ['Mar Llamas']);
  assert.equal(entity.stats.sp_attack, 109);
  assert.equal(entity.caracteristicas.descripcion, 'Alas poderosas');
  assert.equal(entity.evoluciones.length, 1);
});
