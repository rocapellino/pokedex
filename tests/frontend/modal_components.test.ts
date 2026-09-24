import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeaknesses,
  renderStatEqualizer,
  getTriggerIcon,
  renderDetailModalContent,
  TYPE_WEAKNESSES,
} from '../../apps/frontend/src/components/modal-detail.js';
import { renderPokemonCard } from '../../apps/frontend/src/components/pokemon-card.js';
import { renderTableRows, computeKPIs } from '../../apps/frontend/src/components/admin-table.js';
import {
  getPendingDeleteId,
  setPendingDeleteId,
  closeDeleteModal,
} from '../../apps/frontend/src/components/modal-crud.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const mockBulbasaur: Pokemon = {
  id: 1,
  nombre: 'Bulbasaur',
  tipo: 'Planta',
  tipos: ['Planta', 'Veneno'],
  fuerza: 49,
  imagen: 'https://img.pokemondb.net/artwork/bulbasaur.jpg',
  habilidades: ['Espesura', 'Clorofila'],
  caracteristicas: {
    peso: 6.9,
    altura: 0.7,
    habitat: 'Pradera',
    descripcion: 'Una semilla rara en su lomo que crece con él.',
  },
  stats: {
    hp: 45,
    attack: 49,
    defense: 49,
    sp_attack: 65,
    sp_defense: 65,
    speed: 45,
  },
  evoluciones: [
    { id: 1, nombre: 'Bulbasaur', etapa: 'Básico' },
    { id: 2, nombre: 'Ivysaur', etapa: 'Fase 1', metodo: 'Nivel 16' },
    { id: 3, nombre: 'Venusaur', etapa: 'Fase 2', metodo: 'Nivel 32' },
  ],
};

const mockCharmander: Pokemon = {
  id: 4,
  nombre: 'Charmander',
  tipo: 'Fuego',
  fuerza: 52,
  imagen: 'https://img.pokemondb.net/artwork/charmander.jpg',
  caracteristicas: {
    peso: 8.5,
    altura: 0.6,
    habitat: 'Montaña',
  },
};

test('🧩 Modal Detail: calculateWeaknesses calcula debilidades elementales correctamente', () => {
  const fireWeaknesses = calculateWeaknesses(['Fuego']);
  assert.ok(fireWeaknesses.includes('Agua'));
  assert.ok(fireWeaknesses.includes('Tierra'));
  assert.ok(fireWeaknesses.includes('Roca'));

  // Planta + Veneno (combinación dual)
  const dualWeaknesses = calculateWeaknesses(['Planta', 'Veneno']);
  assert.ok(dualWeaknesses.includes('Fuego')); // De Planta
  assert.ok(dualWeaknesses.includes('Psíquico')); // De Veneno
});

test('🧩 Modal Detail: renderStatEqualizer genera columnas y segmentos proporcionales', () => {
  const html = renderStatEqualizer(mockBulbasaur.stats);
  assert.ok(html.includes('equalizer-col'));
  assert.ok(html.includes('equalizer-segment active'));
  assert.ok(html.includes('PS'));
  assert.ok(html.includes('Ataque'));
  assert.ok(html.includes('Velocidad'));
});

test('🧩 Modal Detail: getTriggerIcon devuelve iconos representativos según método', () => {
  assert.equal(getTriggerIcon('Nivel 16'), '📈');
  assert.equal(getTriggerIcon('Piedra Fuego'), '💎');
  assert.equal(getTriggerIcon('Intercambio'), '🔄');
  assert.equal(getTriggerIcon('Amistad alta'), '💖');
  assert.equal(getTriggerIcon(null), '⬆️');
});

test('🧩 Modal Detail: renderDetailModalContent genera markup semántico y sanitizado', () => {
  const catalog = [mockBulbasaur, mockCharmander];
  const html = renderDetailModalContent(mockBulbasaur, catalog);

  assert.ok(html.includes('Bulbasaur'));
  assert.ok(html.includes('N.º 0001'));
  assert.ok(html.includes('Espesura'));
  assert.ok(html.includes('0,7 m'));
  assert.ok(html.includes('6,9 kg'));
  assert.ok(html.includes('Evoluciones'));
  assert.ok(html.includes('Ivysaur'));
});

test('🧩 Pokemon Card: renderPokemonCard genera article semántico con identificadores seguros', () => {
  const cardHtml = renderPokemonCard(mockBulbasaur);

  assert.ok(cardHtml.includes('article class="pokemon-card"'));
  assert.ok(cardHtml.includes('data-pokemon-id="1"'));
  assert.ok(cardHtml.includes('#001'));
  assert.ok(cardHtml.includes('Gen 1'));
  assert.ok(cardHtml.includes('Bulbasaur'));
  assert.ok(cardHtml.includes('6.9 kg'));
});

test('🧩 Admin Table: renderTableRows genera celdas y botones de acción data-attributes', () => {
  const rowsHtml = renderTableRows([mockBulbasaur, mockCharmander]);

  assert.ok(rowsHtml.includes('data-edit-id="1"'));
  assert.ok(rowsHtml.includes('data-delete-id="1"'));
  assert.ok(rowsHtml.includes('data-edit-id="4"'));
  assert.ok(rowsHtml.includes('data-delete-id="4"'));
  assert.ok(rowsHtml.includes('pokemon-table-name'));
  assert.ok(rowsHtml.includes('Bulbasaur'));
  assert.ok(rowsHtml.includes('Charmander'));
});

test('🧩 Admin Table: computeKPIs agrega métricas de catálogo deterministamente', () => {
  const kpis = computeKPIs([mockBulbasaur, mockCharmander], 2);

  assert.equal(kpis.total, 2);
  // (49 + 52) / 2 = 50.5 -> 51
  assert.equal(kpis.avgForce, 51);
  assert.equal(kpis.uniqueTypesCount, 2); // Planta y Fuego
});

test('🧩 Modal CRUD: gestión de estado de borrado pendiente', () => {
  setPendingDeleteId(25);
  assert.equal(getPendingDeleteId(), 25);

  closeDeleteModal();
  assert.equal(getPendingDeleteId(), null);
});
