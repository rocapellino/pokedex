import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPokemonUpdates, buildPokemonFromPayload } from '../../apps/backend/src/controllers/pokemon-mapper.js';
import type { MegaEvolution, Pokemon } from '../../apps/backend/src/types.js';

const mega: MegaEvolution = {
  clave: 'charizard-mega-x',
  nombre: 'Mega-Charizard X',
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10034.png',
  tipos: ['Fuego', 'Dragón'],
  habilidades: ['Garra Dura'],
  stats: { hp: 78, attack: 130, defense: 111, sp_attack: 130, sp_defense: 85, speed: 100 },
  peso: 110.5,
  altura: 1.7,
};

const existing: Pokemon = {
  id: 6,
  nombre: 'Charizard',
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
  tipo: 'Fuego',
  tipos: ['Fuego', 'Volador'],
  habitat: 'Montañas',
  caracteristicas: { peso: 90.5, altura: 1.7, fuerza: 84 },
  habilidades: ['Mar Llamas'],
  stats: { hp: 78, attack: 84, defense: 78, sp_attack: 109, sp_defense: 85, speed: 100 },
  megaevoluciones: [mega],
};

test('🧬 Mega: editar un Pokémon conserva sus megaevoluciones (el PUT no las borra)', () => {
  const updated = applyPokemonUpdates(existing, { nombre: 'Charizard Editado' });

  assert.equal(updated.nombre, 'Charizard Editado');
  assert.deepEqual(updated.megaevoluciones, [mega]);
});

test('🧬 Mega: las megaevoluciones son de solo lectura: un cuerpo del cliente no las reemplaza', () => {
  const forged = { ...mega, clave: 'charizard-mega-forjada', nombre: 'Falsa' };

  assert.deepEqual(applyPokemonUpdates(existing, { megaevoluciones: [forged] }).megaevoluciones, [mega]);
  assert.deepEqual(applyPokemonUpdates(existing, { megaevoluciones: [] }).megaevoluciones, [mega]);
  assert.deepEqual(applyPokemonUpdates(existing, { megaevoluciones: null }).megaevoluciones, [mega]);
});

test('🧬 Mega: editar un Pokémon sin megaevoluciones no inventa el campo', () => {
  const { megaevoluciones: _omit, ...withoutMegas } = existing;
  const updated = applyPokemonUpdates(withoutMegas as Pokemon, { nombre: 'Otro' });

  assert.equal(updated.megaevoluciones, undefined);
});

test('🧬 Mega: crear un Pokémon ignora megaevoluciones enviadas por el cliente', () => {
  const created = buildPokemonFromPayload(2000, {
    nombre: 'Nuevomon',
    tipo: 'Normal',
    fuerza: 50,
    megaevoluciones: [mega],
  });

  assert.equal(created.megaevoluciones, undefined);
});
