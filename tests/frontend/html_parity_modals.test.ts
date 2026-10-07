import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import type { Pokemon } from '../../apps/frontend/src/types.js';
import {
  CATALOG,
  EVOLUTIONS,
  charizardMega,
  charizardOneMega,
  eevee,
  megaX,
  pikachu,
  sparse,
} from './html_fixtures.js';

/**
 * Paridad de salida de los renderizadores del modal de detalle: cada función migrada a la plantilla
 * `html` debe producir EXACTAMENTE la misma cadena que antes. Los archivos `golden/modal-*.html` se
 * generaron con el código previo a la migración. Para regenerarlos de forma deliberada:
 *   UPDATE_GOLDEN=1 npx tsx --test tests/frontend/html_parity_modals.test.ts
 */
void dom;

/** Los hooks de pre-commit recortan espacios finales y fijan el salto de línea final: no cambia el HTML. */
const normalize = (html: string): string => html.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
const GOLDEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'golden');

const evolution = (key: string, currentId: number) => () => renderEvolutionSystem(EVOLUTIONS[key], currentId, CATALOG);

const CASES: Record<string, () => unknown> = {
  'base-stats-full': () => renderBaseStats(pikachu.stats),
  'base-stats-partial': () => renderBaseStats({ hp: 45, attack: 49 }),
  'base-stats-none': () => renderBaseStats(undefined),

  'connector-method': () => renderTransitionConnector({ id: 26, nombre: 'Raichu', metodo: 'Piedra trueno' }),
  'connector-plain': () => renderTransitionConnector({ id: 26, nombre: 'Raichu' }),
  'connector-undefined': () => renderTransitionConnector(undefined),

  'node-current': () => renderSingleEvolutionNode({ id: 25, nombre: 'Pikachu' }, 25, false, CATALOG),
  'node-other-method': () =>
    renderSingleEvolutionNode({ id: 26, nombre: 'Raichu', metodo: 'Piedra trueno' }, 25, true, CATALOG),
  'node-catalog-types': () => renderSingleEvolutionNode({ id: 45, nombre: 'Vileplume' }, 44, false, CATALOG),
  'node-bare': () => renderSingleEvolutionNode({ id: 999 }, 1, true, []),
  'node-special-chars': () =>
    renderSingleEvolutionNode({ id: 7, nombre: `Mr. <Mime> & "Co"`, metodo: `Nivel "16"` }, 1, true, []),

  'evolution-flat-1': evolution('flat-1', 132),
  'evolution-flat-3': evolution('flat-3', 25),
  'evolution-linear-tree': evolution('linear-tree', 5),
  'evolution-branched-leaves': evolution('branched-leaves', 133),
  'evolution-branched-prefix': evolution('branched-prefix', 44),
  'evolution-single-tree': evolution('single-tree', 132),
  'evolution-no-tree': evolution('no-tree', 77),
  'evolution-undefined': evolution('undefined', 78),

  'mega-stats-with-base': () => renderMegaStats(megaX.stats, charizardMega.stats),
  'mega-stats-no-base': () => renderMegaStats(megaX.stats),
  'mega-section-two': () => renderMegaEvolutionSection(charizardMega),
  'mega-section-one': () => renderMegaEvolutionSection(charizardOneMega),
  'mega-toggle-two': () => renderMegaToggle(charizardMega),
  'mega-toggle-one': () => renderMegaToggle(charizardOneMega),
  'mega-toggle-none': () => renderMegaToggle(pikachu),
  'mega-body-two': () => renderMegaDisclosureBody(charizardMega),
  'mega-body-none': () => renderMegaDisclosureBody(pikachu),

  'detail-pikachu': () => renderDetailModalContent(pikachu, CATALOG),
  'detail-charizard-mega': () => renderDetailModalContent(charizardMega, CATALOG),
  'detail-eevee': () => renderDetailModalContent(eevee, CATALOG),
  'detail-sparse': () => renderDetailModalContent(sparse as Pokemon, []),
};

for (const [name, render] of Object.entries(CASES)) {
  test(`🧪 Paridad de render (modal): ${name} produce la misma salida que la versión anterior`, () => {
    const actual = normalize(String(render()));
    const file = path.join(GOLDEN_DIR, `modal-${name}.html`);
    if (process.env.UPDATE_GOLDEN === '1') {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
      fs.writeFileSync(file, `${actual}\n`, 'utf-8');
    }
    assert.ok(fs.existsSync(file), `falta el golden modal-${name}.html: generarlo con UPDATE_GOLDEN=1`);
    assert.equal(actual, normalize(fs.readFileSync(file, 'utf-8')));
  });
}
