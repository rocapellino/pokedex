import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePokemonPayload } from '../../apps/backend/src/validation/pokemon.js';
import { validateMegaEvolutionZod } from '../../apps/backend/src/validation/schemas.js';
import type { MegaEvolution, Pokemon } from '../../apps/backend/src/types.js';

const validMega: MegaEvolution = {
  clave: 'charizard-mega-x',
  nombre: 'Mega-Charizard X',
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10034.png',
  tipos: ['Fuego', 'Dragón'],
  habilidades: ['Garra Dura'],
  stats: { hp: 78, attack: 130, defense: 111, sp_attack: 130, sp_defense: 85, speed: 100 },
  peso: 110.5,
  altura: 1.7,
};

const basePokemon: Pokemon = {
  id: 6,
  nombre: 'Charizard',
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
  tipo: 'Fuego',
  tipos: ['Fuego', 'Volador'],
  habitat: 'Montañas',
  caracteristicas: { peso: 90.5, altura: 1.7, fuerza: 84 },
  habilidades: ['Mar Llamas'],
  stats: { hp: 78, attack: 84, defense: 78, sp_attack: 109, sp_defense: 85, speed: 100 },
};

test('🧬 Mega: una megaevolución completa y bien formada es válida', () => {
  assert.deepEqual(validateMegaEvolutionZod(validMega), { valid: true });
});

test('🧬 Mega: un Pokémon con megaevoluciones válidas supera el validador del payload', () => {
  const body = { ...basePokemon, megaevoluciones: [validMega, { ...validMega, clave: 'charizard-mega-y' }] };
  assert.equal(validatePokemonPayload(body).valid, true);
});

test('🧬 Mega: un Pokémon sin megaevoluciones sigue siendo válido (campo opcional)', () => {
  assert.equal(validatePokemonPayload(basePokemon).valid, true);
  assert.equal(validatePokemonPayload({ ...basePokemon, megaevoluciones: [] }).valid, true);
});

test('🧬 Mega: rechaza claves fuera de la lista blanca (mass assignment), incluido un id propio', () => {
  for (const extra of [{ id: 10034 }, { isAdmin: true }, { __proto__: { polluted: true }, poder: 9000 }]) {
    const result = validateMegaEvolutionZod({ ...validMega, ...extra });
    assert.equal(result.valid, false, JSON.stringify(extra));
  }
});

test('🧬 Mega: rechaza campos obligatorios ausentes o con tipo incorrecto', () => {
  const required: Array<keyof MegaEvolution> = [
    'clave',
    'nombre',
    'imagen',
    'tipos',
    'habilidades',
    'stats',
    'peso',
    'altura',
  ];
  for (const field of required) {
    const copy: Record<string, unknown> = { ...validMega };
    delete copy[field];
    assert.equal(validateMegaEvolutionZod(copy).valid, false, `sin ${field}`);
  }
  assert.equal(validateMegaEvolutionZod({ ...validMega, tipos: 'Fuego' }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, peso: 'pesado' }).valid, false);
  assert.equal(validateMegaEvolutionZod(null).valid, false);
  assert.equal(validateMegaEvolutionZod([]).valid, false);
});

test('🧬 Mega: la clave solo admite el formato de slug', () => {
  for (const clave of ['', 'Charizard Mega', 'charizard_mega', '../etc/passwd', 'a'.repeat(61), '<script>']) {
    assert.equal(validateMegaEvolutionZod({ ...validMega, clave }).valid, false, clave);
  }
});

test('🧬 Mega: nombre sin HTML ni scripts (prevención XSS) y con longitud acotada', () => {
  assert.equal(validateMegaEvolutionZod({ ...validMega, nombre: '<img src=x onerror=alert(1)>' }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, nombre: 'x'.repeat(81) }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, habilidades: ['<script>alert(1)</script>'] }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, tipos: ['<b>Fuego</b>'] }).valid, false);
});

test('🧬 Mega: la imagen debe ser HTTPS o ruta relativa segura', () => {
  assert.equal(validateMegaEvolutionZod({ ...validMega, imagen: 'javascript:alert(1)' }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, imagen: 'http://example.com/a.png' }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, imagen: 'https://169.254.169.254/latest' }).valid, false);
});

test('🧬 Mega: tipos entre 1 y 2, habilidades entre 0 y 3 (PokeAPI aún no publica algunas)', () => {
  assert.equal(validateMegaEvolutionZod({ ...validMega, tipos: [] }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, tipos: ['Fuego', 'Agua', 'Hielo'] }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, habilidades: [] }).valid, true);
  assert.equal(validateMegaEvolutionZod({ ...validMega, habilidades: ['a', 'b', 'c', 'd'] }).valid, false);
});

test('🧬 Mega: las seis estadísticas son obligatorias y enteros entre 0 y 1000', () => {
  const { speed: _speed, ...fiveStats } = validMega.stats;
  assert.equal(validateMegaEvolutionZod({ ...validMega, stats: fiveStats }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, stats: { ...validMega.stats, hp: -1 } }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, stats: { ...validMega.stats, hp: 1001 } }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, stats: { ...validMega.stats, hp: 1.5 } }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, stats: { ...validMega.stats, extra: 5 } }).valid, false);
});

test('🧬 Mega: peso y altura positivos y acotados', () => {
  assert.equal(validateMegaEvolutionZod({ ...validMega, peso: 0 }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, peso: 10001 }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, altura: 0 }).valid, false);
  assert.equal(validateMegaEvolutionZod({ ...validMega, altura: 201 }).valid, false);
});

test('🧬 Mega: el payload rechaza más de 6 megaevoluciones, claves repetidas y no arreglos', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ ...validMega, clave: `charizard-mega-${i}` }));
  assert.equal(validatePokemonPayload({ ...basePokemon, megaevoluciones: many }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePokemon, megaevoluciones: [validMega, validMega] }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePokemon, megaevoluciones: validMega }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePokemon, megaevoluciones: 'mega' }).valid, false);
  assert.equal(
    validatePokemonPayload({ ...basePokemon, megaevoluciones: [{ ...validMega, nombre: '' }] }).valid,
    false,
  );
});
