import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * El panel de evoluciones tenía colores fijos (gris oscuro) y se veía igual en los dos temas. Ahora
 * toma su paleta de variables `--evo-*`: oscura por defecto y clara bajo `[data-theme="light"]`.
 */
const CSS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/frontend/public/css/style.css'),
  'utf-8',
);

function rule(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `no existe la regla ${selector}`);
  return CSS.slice(start, CSS.indexOf('}', start));
}

const variablesOf = (block: string): string[] => [...block.matchAll(/(--evo-[\w-]+):/g)].map((m) => m[1]);

test('🎨 Evoluciones: el tema claro redefine toda la paleta del panel', () => {
  const dark = variablesOf(rule('.pokedex-evolutions-official-panel'));
  const light = variablesOf(rule('[data-theme="light"] .pokedex-evolutions-official-panel'));
  assert.ok(dark.length > 0);
  assert.deepEqual([...light].sort(), [...dark].sort(), 'cada variable oscura necesita su par claro');
});

test('🎨 Evoluciones: los nodos y textos del panel usan las variables, no colores fijos', () => {
  for (const selector of [
    '.evolutions-panel-header',
    '.evolution-circle-frame',
    '.evolution-name-tag',
    '.evolution-number-sub',
    '.evolution-chevron-arrow',
    '.evolution-trigger-badge',
    '.evolution-method-tag',
    '.branched-fork-indicator',
  ]) {
    assert.match(rule(selector), /var\(--evo-/, `${selector} debe usar la paleta del panel`);
  }
});
