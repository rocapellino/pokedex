import { dom } from './mega_env.js';
import { assertHtmlSnapshot } from './html_snapshot.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderTableRows } from '../../apps/frontend/src/components/admin-table.js';
import { renderPokemonCard } from '../../apps/frontend/src/components/pokemon-card.js';
import { renderEmptyState, renderTypeBadge, renderTypeBadges } from '../../apps/frontend/src/shared/ui.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';
import { charizard, pikachu, sparse } from './html_fixtures.js';

/**
 * Paridad de salida (refactor del render HTML): cada `render*` migrado a la plantilla `html` debe
 * producir EXACTAMENTE la misma cadena que antes. Las instantáneas (`html_parity.test.ts.snapshot`) se generaron
 * a partir de los archivos golden capturados con el código previo a la migración. Para regenerarlas de forma
 * deliberada: `npm run test:snapshots:update`.
 */
void dom;

const CASES: Record<string, () => unknown> = {
  'card-pikachu': () => renderPokemonCard(pikachu),
  'card-charizard': () => renderPokemonCard(charizard),
  'card-sparse': () => renderPokemonCard(sparse),
  'card-legendario': () => renderPokemonCard({ ...pikachu, clasificacion: 'legendario' } as unknown as Pokemon),
  'card-mitico': () => renderPokemonCard({ ...pikachu, clasificacion: 'mitico' } as unknown as Pokemon),
  'rows-admin': () => renderTableRows([pikachu, charizard, sparse]),
  'rows-admin-empty': () => renderTableRows([]),
  'badge-single': () => renderTypeBadge('Eléctrico'),
  'badges-multi': () => renderTypeBadges('Fuego', ['Fuego', 'Volador']),
  'badges-fallback': () => renderTypeBadges('Agua'),
  'empty-state-retry': () =>
    renderEmptyState({
      title: 'Sin conexión',
      description: 'No se pudo <cargar>',
      retryBtnId: 'btnReintentar',
      retryBtnText: 'Reintentar',
    }),
  'empty-state-plain': () =>
    renderEmptyState({ icon: '🔍', title: 'Sin resultados', description: 'Prueba otro filtro' }),
};

for (const [name, render] of Object.entries(CASES)) {
  test(`🧪 Paridad de render: ${name} produce la misma salida que la versión anterior`, (t) => {
    const html = render();
    assert.notStrictEqual(html, undefined, 'el renderizador debe devolver una salida definida');
    assertHtmlSnapshot(t, html);
  });
}
