import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTableRows } from '../../apps/frontend/src/components/admin-table.js';
import { renderPokemonCard } from '../../apps/frontend/src/components/pokemon-card.js';
import { renderEmptyState, renderTypeBadge, renderTypeBadges } from '../../apps/frontend/src/shared/ui.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';
import { BREAKOUT, IMG, SCRIPT, assertNeutralized } from './html_assertions.js';

void dom;

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
