import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderBaseStats,
  renderDetailModalContent,
  renderEvolutionSystem,
  renderSingleEvolutionNode,
  renderTransitionConnector,
} from '../../apps/frontend/src/components/modal-detail.js';
import {
  renderMegaDisclosureBody,
  renderMegaEvolutionSection,
  renderMegaStats,
  renderMegaToggle,
} from '../../apps/frontend/src/components/modal-mega.js';
import type { EvolutionNode, MegaEvolution, Pokemon } from '../../apps/frontend/src/types.js';
import { BREAKOUT, IMG, SCRIPT, assertNeutralized } from './html_assertions.js';

void dom;

/**
 * Los modales muestran muchos textos de la API (nombres, métodos, etapas, imágenes, hábitat...) y
 * números que TypeScript da por `number` sin que se compruebe en ejecución. Cada uno llega aquí como
 * marcado hostil: el render debe dejarlo como texto, sin generar elementos ni atributos.
 */
const hostileNode = (extra: Partial<EvolutionNode> = {}): EvolutionNode => ({
  id: BREAKOUT as unknown as number,
  nombre: IMG,
  etapa: SCRIPT,
  metodo: BREAKOUT,
  imagen: BREAKOUT,
  ...extra,
});

const hostileMega = {
  clave: BREAKOUT,
  nombre: IMG,
  imagen: BREAKOUT,
  tipos: [SCRIPT, BREAKOUT],
  habilidades: [IMG, SCRIPT],
  stats: { hp: IMG, attack: SCRIPT, defense: BREAKOUT },
  peso: SCRIPT,
  altura: IMG,
} as unknown as MegaEvolution;

const hostile = {
  id: BREAKOUT,
  nombre: IMG,
  tipo: SCRIPT,
  tipos: [SCRIPT, IMG],
  imagen: BREAKOUT,
  habilidades: [SCRIPT, BREAKOUT],
  caracteristicas: { peso: SCRIPT, altura: IMG, habitat: BREAKOUT, categoria: IMG, descripcion: SCRIPT },
  stats: { hp: IMG, attack: SCRIPT, defense: BREAKOUT },
  evoluciones: [hostileNode(), hostileNode({ id: 2 })],
  megaevoluciones: [hostileMega, { ...hostileMega, nombre: SCRIPT }],
} as unknown as Pokemon;

test('🛡️ Modales: el modal de detalle completo neutraliza todos los campos hostiles', () => {
  assertNeutralized(String(renderDetailModalContent(hostile, [hostile])), 'detalle');
});

test('🛡️ Modales: los nodos y conectores de evolución neutralizan nombre, método, imagen e id', () => {
  assertNeutralized(String(renderSingleEvolutionNode(hostileNode(), 7, true, [hostile])), 'nodo');
  assertNeutralized(String(renderSingleEvolutionNode(hostileNode({ id: 7 }), 7, true, [])), 'nodo actual');
  assertNeutralized(String(renderTransitionConnector(hostileNode())), 'conector');
});

test('🛡️ Modales: todas las variantes de la cadena evolutiva neutralizan los nodos hostiles', () => {
  const nodes = [hostileNode({ id: 1 }), hostileNode({ id: 2 }), hostileNode({ id: 3 })];
  const variants: Array<[string, Pokemon['evoluciones']]> = [
    ['plana de uno', [hostileNode()]],
    ['plana', nodes],
    ['lineal', { arbol: { ...nodes[0], evolves_to: [{ ...nodes[1], evolves_to: [nodes[2] as EvolutionNode] }] } }],
    [
      'ramificada de hojas',
      {
        arbol: { ...nodes[0], evolves_to: [nodes[1] as EvolutionNode, nodes[2] as EvolutionNode] },
        es_ramificada: true,
      },
    ],
    [
      'ramificada con prefijo',
      {
        arbol: {
          ...nodes[0],
          evolves_to: [{ ...nodes[1], evolves_to: [nodes[2] as EvolutionNode, hostileNode({ id: 4 })] }],
        },
        es_ramificada: true,
      },
    ],
    ['un nodo', { arbol: nodes[0] }],
  ];
  for (const [name, evolData] of variants) {
    assertNeutralized(String(renderEvolutionSystem(evolData, 2, [hostile])), `cadena ${name}`);
  }
});

test('🛡️ Modales: las megaevoluciones neutralizan nombre, imagen, tipos, habilidades y estadísticas', () => {
  assertNeutralized(String(renderMegaEvolutionSection(hostile)), 'sección mega');
  assertNeutralized(
    String(renderMegaEvolutionSection({ ...hostile, megaevoluciones: [hostileMega] })),
    'sección de una mega',
  );
  assertNeutralized(String(renderMegaDisclosureBody(hostile)), 'cuerpo mega');
  assertNeutralized(String(renderMegaToggle(hostile)), 'botón mega');
  assertNeutralized(String(renderMegaStats(hostileMega.stats, hostile.stats)), 'estadísticas mega');
});

test('🛡️ Modales: las estadísticas base con valores no numéricos no inyectan marcado', () => {
  assertNeutralized(String(renderBaseStats(hostile.stats)), 'estadísticas');
});

test('🛡️ Modales: los datos legítimos con caracteres especiales no se escapan dos veces', () => {
  const node = renderSingleEvolutionNode({ id: 7, nombre: `Mr. Mime & "Co"`, metodo: `Nivel 'x'` }, 1, true, []);
  const out = String(node);
  assert.ok(out.includes('Mr. Mime &amp; &quot;Co&quot;'), 'el nombre se escapa una sola vez');
  assert.ok(out.includes('Nivel &#039;x&#039;'), 'el método se escapa una sola vez');
  assert.ok(
    !out.includes('&amp;amp;') && !out.includes('&amp;quot;') && !out.includes('&amp;#039;'),
    'sin doble escapado',
  );
});
