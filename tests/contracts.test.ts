import test from 'node:test';
import assert from 'node:assert/strict';
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
