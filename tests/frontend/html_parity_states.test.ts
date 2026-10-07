import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderEmptyTableRow,
  renderLoadErrorRow,
  renderLoadingRow,
} from '../../apps/frontend/src/components/admin-table.js';
import { renderNoResults } from '../../apps/frontend/src/pokedex.js';

/**
 * Paridad de los estados fijos (sin resultados, tabla vacía, cargando y error de carga): su salida
 * debe ser idéntica antes y después de pasar de literales a la plantilla `html`. Los goldens se
 * capturaron con las cadenas originales. Regenerar de forma deliberada con:
 *   UPDATE_GOLDEN=1 npx tsx --test tests/frontend/html_parity_states.test.ts
 */
void dom;

const normalize = (value: string): string => value.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
const GOLDEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'golden');

const CASES: Record<string, () => unknown> = {
  'state-no-results': () => renderNoResults(),
  'state-table-empty': () => renderEmptyTableRow(),
  'state-table-loading': () => renderLoadingRow(),
  'state-table-error': () => renderLoadErrorRow('API caída'),
  'state-table-error-special': () => renderLoadErrorRow(`<b>"x" & 'y'</b>`),
};

for (const [name, render] of Object.entries(CASES)) {
  test(`🧪 Paridad de estados: ${name} produce la misma salida que la versión anterior`, () => {
    const actual = normalize(String(render()));
    const file = path.join(GOLDEN_DIR, `${name}.html`);
    if (process.env.UPDATE_GOLDEN === '1') fs.writeFileSync(file, `${actual}\n`, 'utf-8');
    assert.ok(fs.existsSync(file), `falta el golden ${name}.html: generarlo con UPDATE_GOLDEN=1`);
    assert.equal(actual, normalize(fs.readFileSync(file, 'utf-8')));
  });
}
