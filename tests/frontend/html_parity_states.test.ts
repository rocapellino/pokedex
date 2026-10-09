import { dom } from './mega_env.js';
import { assertHtmlSnapshot } from './html_snapshot.js';
import { test } from 'node:test';
import {
  renderEmptyTableRow,
  renderLoadErrorRow,
  renderLoadingRow,
} from '../../apps/frontend/src/components/admin-table.js';
import { renderNoResults } from '../../apps/frontend/src/pokedex.js';

/**
 * Paridad de los estados fijos (sin resultados, tabla vacía, cargando y error de carga): su salida
 * debe ser idéntica antes y después de pasar de literales a la plantilla `html`. Las instantáneas se generaron a
 * partir de los goldens capturados con las cadenas originales. Regenerar de forma deliberada con
 * `npm run test:snapshots:update`.
 */
void dom;

const CASES: Record<string, () => unknown> = {
  'state-no-results': () => renderNoResults(),
  'state-table-empty': () => renderEmptyTableRow(),
  'state-table-loading': () => renderLoadingRow(),
  'state-table-error': () => renderLoadErrorRow('API caída'),
  'state-table-error-special': () => renderLoadErrorRow(`<b>"x" & 'y'</b>`),
};

for (const [name, render] of Object.entries(CASES)) {
  test(`🧪 Paridad de estados: ${name} produce la misma salida que la versión anterior`, (t) => {
    assertHtmlSnapshot(t, render());
  });
}
