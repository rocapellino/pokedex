import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeaknesses,
  renderStatEqualizer,
  getTriggerIcon,
  renderTransitionConnector,
  renderSingleEvolutionNode,
  renderEvolutionSystem,
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

test('🧩 Modal Evolution: getTriggerIcon cubre todas las ramas de métodos evolutivos', () => {
  assert.equal(getTriggerIcon('mineral evolutivo'), '💎');
  assert.equal(getTriggerIcon('manzana ácida'), '💎');
  assert.equal(getTriggerIcon('conociendo movimiento rayo'), '⚔️');
  assert.equal(getTriggerIcon('bajo la lluvia'), '🌧️');
  assert.equal(getTriggerIcon('durante la noche'), '🌙');
  assert.equal(getTriggerIcon('durante el día'), '☀️');
  assert.equal(getTriggerIcon('condición especial'), '⚡');
});

test('🧩 Modal Evolution: renderTransitionConnector genera chevrons y badges según contexto', () => {
  const withoutMethod = renderTransitionConnector();
  assert.ok(withoutMethod.includes('evolution-chevron-arrow'));
  assert.ok(!withoutMethod.includes('evolution-trigger-badge'));

  const withMethod = renderTransitionConnector({ id: 2, nombre: 'Ivysaur', metodo: 'Nivel 16' });
  assert.ok(withMethod.includes('evolution-trigger-badge'));
  assert.ok(withMethod.includes('Nivel 16'));
  assert.ok(withMethod.includes('📈'));
});

test('🧩 Modal Evolution: renderSingleEvolutionNode maneja nodos actuales, alternos y catálogos', () => {
  const catalog = [mockBulbasaur, mockCharmander];

  // Nodo actual
  const currentNodeHtml = renderSingleEvolutionNode({ id: 1, nombre: 'Bulbasaur' }, 1, false, catalog);
  assert.ok(currentNodeHtml.includes('active-current'));
  assert.ok(currentNodeHtml.includes('Estás viendo a Bulbasaur'));
  assert.ok(currentNodeHtml.includes('evolution-type-mini'));

  // Nodo diferente con método visible
  const nextNodeHtml = renderSingleEvolutionNode(
    { id: 2, nombre: 'Ivysaur', metodo: 'Nivel 16' },
    1,
    true,
    catalog
  );
  assert.ok(!nextNodeHtml.includes('active-current'));
  assert.ok(nextNodeHtml.includes('Ver ficha de Ivysaur'));
  assert.ok(nextNodeHtml.includes('evolution-method-tag'));
  assert.ok(nextNodeHtml.includes('Nivel 16'));
});

test('🧩 Modal Evolution: renderEvolutionSystem cubre arrays planos y fallbacks', () => {
  const catalog = [mockBulbasaur];

  // 1. Array vacío o de un elemento
  const singleHtml = renderEvolutionSystem([{ id: 1, nombre: 'Bulbasaur' }], 1, catalog);
  assert.ok(singleHtml.includes('pokedex-evolutions-official-panel'));
  assert.ok(!singleHtml.includes('evolution-transition-connector'));

  // 2. Array lineal de múltiples elementos
  const multiArrayHtml = renderEvolutionSystem(
    [
      { id: 1, nombre: 'Bulbasaur' },
      { id: 2, nombre: 'Ivysaur', metodo: 'Nivel 16' },
      { id: 3, nombre: 'Venusaur', metodo: 'Nivel 32' },
    ],
    1,
    catalog
  );
  assert.ok(multiArrayHtml.includes('evolution-transition-connector'));

  // 3. Objeto sin árbol (fallback)
  const fallbackHtml = renderEvolutionSystem(null, 25, catalog);
  assert.ok(fallbackHtml.includes('official-artwork/25.png'));

  // 4. Árbol con raíz sin evoluciones
  const rootOnlyHtml = renderEvolutionSystem({ arbol: { id: 132, nombre: 'Ditto', evolves_to: [] } }, 132, catalog);
  assert.ok(rootOnlyHtml.includes('Ditto'));
  assert.ok(!rootOnlyHtml.includes('branched-evolution-container'));
});

test('🧩 Modal Evolution: renderEvolutionSystem cubre árboles ramificados y lineales', () => {
  const catalog = [mockBulbasaur];

  // 1. Ramificación inmediata en raíz (tipo Eevee)
  const eeveeTree = {
    es_ramificada: true,
    arbol: {
      id: 133,
      nombre: 'Eevee',
      evolves_to: [
        { id: 134, nombre: 'Vaporeon', metodo: 'Piedra Agua' },
        { id: 135, nombre: 'Jolteon', metodo: 'Piedra Trueno' },
        { id: 136, nombre: 'Flareon', metodo: 'Piedra Fuego' },
      ],
    },
  };
  const eeveeHtml = renderEvolutionSystem(eeveeTree, 133, catalog);
  assert.ok(eeveeHtml.includes('branched-fork-indicator'));
  assert.ok(eeveeHtml.includes('branched-children-grid'));
  assert.ok(eeveeHtml.includes('Vaporeon'));
  assert.ok(eeveeHtml.includes('Jolteon'));

  // 2. Árbol estrictamente lineal no ramificado
  const linearTree = {
    es_ramificada: false,
    arbol: {
      id: 1,
      nombre: 'Bulbasaur',
      evolves_to: [
        {
          id: 2,
          nombre: 'Ivysaur',
          metodo: 'Nivel 16',
          evolves_to: [{ id: 3, nombre: 'Venusaur', metodo: 'Nivel 32' }],
        },
      ],
    },
  };
  const linearTreeHtml = renderEvolutionSystem(linearTree, 1, catalog);
  assert.ok(linearTreeHtml.includes('evolution-transition-connector'));
  assert.ok(linearTreeHtml.includes('Ivysaur'));
  assert.ok(linearTreeHtml.includes('Venusaur'));

  // 3. Ramificación posterior tras prefijo lineal (tipo Oddish -> Gloom -> [Vileplume, Bellossom])
  const gloomBranchTree = {
    es_ramificada: true,
    arbol: {
      id: 43,
      nombre: 'Oddish',
      evolves_to: [
        {
          id: 44,
          nombre: 'Gloom',
          metodo: 'Nivel 21',
          evolves_to: [
            { id: 45, nombre: 'Vileplume', metodo: 'Piedra Hoja' },
            { id: 182, nombre: 'Bellossom', metodo: 'Piedra Solar' },
          ],
        },
      ],
    },
  };
  const gloomBranchHtml = renderEvolutionSystem(gloomBranchTree, 44, catalog);
  assert.ok(gloomBranchHtml.includes('Evoluciones alternativas'));
  assert.ok(gloomBranchHtml.includes('Vileplume'));
  assert.ok(gloomBranchHtml.includes('Bellossom'));
});

test('🧩 Pokemon Types: calculateWeaknesses cubre tipos desconocidos y matrices compuestas', () => {
  assert.deepEqual(calculateWeaknesses(['TipoInexistente']), []);
  assert.deepEqual(calculateWeaknesses([]), []);

  // Probar varios tipos elementales para máxima cobertura
  const iceWeak = calculateWeaknesses(['Hielo']);
  assert.ok(iceWeak.includes('Fuego'));
  assert.ok(iceWeak.includes('Lucha'));

  const dragonWeak = calculateWeaknesses(['Dragón']);
  assert.ok(dragonWeak.includes('Hada'));
  assert.ok(dragonWeak.includes('Hielo'));
});

