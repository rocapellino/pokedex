import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTableRows } from '../../apps/frontend/src/components/admin-table.js';
import { renderPokemonCard } from '../../apps/frontend/src/components/pokemon-card.js';
import { renderEmptyState, renderTypeBadge, renderTypeBadges } from '../../apps/frontend/src/shared/ui.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

void dom;

const SCRIPT = '<script>alert(1)</script>';
const IMG = '<img src=x onerror=alert(1)>';
const BREAKOUT = '" onmouseover="alert(1)" x="';
const EXECUTABLE_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);

/**
 * Pokémon cuyos campos numéricos (`fuerza`, `peso`, `altura`, `id`) llegan como texto hostil: el tipo
 * `number` de TypeScript no se comprueba en ejecución, así que el render no puede confiar en él.
 */
function hostile(overrides: Record<string, unknown> = {}): Pokemon {
  return {
    id: BREAKOUT,
    nombre: IMG,
    tipo: SCRIPT,
    fuerza: IMG,
    imagen: BREAKOUT,
    habilidades: [SCRIPT],
    caracteristicas: { peso: SCRIPT, altura: IMG, habitat: BREAKOUT },
    ...overrides,
  } as unknown as Pokemon;
}

/**
 * Se analiza el DOM resultante en lugar de buscar texto: el dato hostil sigue apareciendo como TEXTO
 * escapado (`&lt;img ... onerror=...&gt;`), y eso es correcto; lo que no puede ocurrir es que genere
 * elementos o atributos.
 */
function assertNeutralized(output: string, label: string): void {
  const doc = new dom.window.DOMParser().parseFromString(`<table><tbody>${output}</tbody></table>`, 'text/html');
  const elements = [...doc.querySelectorAll('*')];
  const executable = elements.filter((el) => EXECUTABLE_TAGS.has(el.tagName)).map((el) => el.tagName);
  assert.deepEqual(executable, [], `${label}: elementos ejecutables inyectados`);
  assert.equal(doc.querySelectorAll('img[src="x"]').length, 0, `${label}: <img> inyectada`);
  for (const el of elements) {
    const handlers = el.getAttributeNames().filter((name) => name.startsWith('on'));
    assert.deepEqual(handlers, [], `${label}: <${el.tagName.toLowerCase()}> con manejadores ${handlers.join(', ')}`);
  }
}

test('🛡️ Render: la tarjeta neutraliza campos hostiles, incluidos los numéricos', () => {
  assertNeutralized(String(renderPokemonCard(hostile())), 'tarjeta');
});

test('🛡️ Render: la tabla del backoffice neutraliza campos hostiles, incluidos id, fuerza, peso y altura', () => {
  const out = String(renderTableRows([hostile()]));
  assertNeutralized(out, 'tabla');
  assert.ok(out.includes('&lt;script&gt;'), 'el dato hostil debe quedar como texto escapado');
});

test('🛡️ Render: las insignias y el estado vacío neutralizan el texto recibido', () => {
  assertNeutralized(String(renderTypeBadge(SCRIPT)), 'insignia');
  assertNeutralized(String(renderTypeBadges(IMG, [SCRIPT, BREAKOUT])), 'insignias');
  assertNeutralized(
    String(
      renderEmptyState({ icon: IMG, title: SCRIPT, description: BREAKOUT, retryBtnId: BREAKOUT, retryBtnText: IMG }),
    ),
    'estado vacío',
  );
});

test('🛡️ Render: los datos legítimos con caracteres especiales se muestran sin doble escapado', () => {
  const out = String(
    renderPokemonCard({ id: 1, nombre: "Farfetch'd & Co", tipo: 'Normal', fuerza: 65 } as unknown as Pokemon),
  );
  assert.ok(out.includes('Farfetch&#039;d &amp; Co'), 'el nombre se escapa una sola vez');
  assert.ok(!out.includes('&amp;amp;') && !out.includes('&amp;#039;'), 'sin doble escapado');
});
