import { dom } from './mega_env.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initInteractiveListeners, loadPokemons, openDetailModal } from '../../apps/frontend/src/pokedex.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const doc = dom.window.document;

const mk = (id: number, nombre: string, extra: Partial<Pokemon> = {}): Pokemon => ({
  id,
  nombre,
  tipo: 'Electrico',
  fuerza: 50,
  imagen: '',
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque' },
  ...extra,
});

const catalog: Pokemon[] = [
  mk(172, 'Pichu'),
  mk(25, 'Pikachu', {
    evoluciones: [
      { id: 172, nombre: 'Pichu', etapa: 'Bebé' },
      { id: 25, nombre: 'Pikachu', etapa: 'Fase 1', metodo: 'Amistad' },
      { id: 26, nombre: 'Raichu', etapa: 'Fase 2', metodo: 'Piedra trueno' },
    ],
  }),
  mk(26, 'Raichu'),
];

const originalFetch = globalThis.fetch;

function title(): string {
  return doc.querySelector('#detailContent .pokedex-notched-title')?.textContent?.trim() ?? '';
}

function press(target: Element, key: string): KeyboardEvent {
  const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

before(async () => {
  // Deja que se dispare el DOMContentLoaded de la carga inicial del módulo antes de montar el DOM de la prueba.
  await new Promise((resolve) => setTimeout(resolve, 20));

  doc.body.innerHTML = `
    <dialog id="detailModal"><div><h3 id="detailTitle"></h3></div><div id="detailContent"></div></dialog>
    <div id="pokemonGrid"></div><div id="paginationBar" class="hidden"></div><div id="toastContainer"></div>`;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify(catalog), { headers: { 'X-Total-Count': String(catalog.length) } })) as typeof fetch;

  await loadPokemons();
  initInteractiveListeners();
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('⌨️ Ficha: la primera apertura no roba el foco al título', () => {
  openDetailModal(25);
  assert.equal(doc.getElementById('detailModal')?.hasAttribute('open'), true);
  assert.match(title(), /Pikachu/);
  assert.notEqual(doc.activeElement?.className, 'pokedex-notched-title');
});

test('⌨️ Nodo de evolución: Enter abre la otra ficha y el foco pasa a su título', () => {
  openDetailModal(25);
  const node = doc.querySelector('#detailContent .evolution-node-item[data-evol-id="26"]');
  assert.ok(node, 'debe existir el nodo de Raichu');

  const event = press(node, 'Enter');

  assert.equal(event.defaultPrevented, true, 'Enter se consume para no desplazar la página');
  assert.match(title(), /Raichu/);
  assert.equal(doc.activeElement?.classList.contains('pokedex-notched-title'), true);
});

test('⌨️ Nodo de evolución: la barra espaciadora también abre la otra ficha', () => {
  openDetailModal(25);
  const node = doc.querySelector('#detailContent .evolution-node-item[data-evol-id="172"]');
  assert.ok(node);

  const event = press(node, ' ');

  assert.equal(event.defaultPrevented, true);
  assert.match(title(), /Pichu/);
});

test('⌨️ Nodo de evolución: otras teclas y el nodo actual no navegan', () => {
  openDetailModal(25);

  const other = doc.querySelector('#detailContent .evolution-node-item[data-evol-id="26"]');
  assert.ok(other);
  assert.equal(press(other, 'Tab').defaultPrevented, false);
  assert.match(title(), /Pikachu/);

  const current = doc.querySelector('#detailContent .evolution-node-item[aria-current="true"]');
  assert.ok(current, 'el nodo actual se marca con aria-current');
  assert.equal(press(current, 'Enter').defaultPrevented, false, 'el nodo actual no es un botón');
  assert.match(title(), /Pikachu/);

  assert.equal(press(doc.querySelector('#detailContent h2') as Element, 'Enter').defaultPrevented, false);
});
