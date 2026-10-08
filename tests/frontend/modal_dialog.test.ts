import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/frontend');

/** Modales que cada página debe declarar como `<dialog>` modal nativo. */
const MODALS = [
  { page: 'index.html', ids: ['detailModal'] },
  { page: 'backoffice.html', ids: ['crudModal', 'deleteModal', 'authModal'] },
];

function loadPage(page: string): Document {
  const html = fs.readFileSync(path.join(FRONTEND_DIR, page), 'utf-8');
  return new JSDOM(html).window.document;
}

for (const { page, ids } of MODALS) {
  for (const id of ids) {
    test(`♿ Modal ${id} (${page}): es un <dialog> con nombre accesible`, () => {
      const modal = loadPage(page).getElementById(id);
      assert.ok(modal, `${page} debe declarar #${id}`);
      assert.equal(modal.tagName, 'DIALOG', `#${id} debe ser <dialog> (foco, Escape e inert nativos)`);

      const labelledBy = modal.getAttribute('aria-labelledby');
      const label = modal.getAttribute('aria-label');
      assert.ok(labelledBy || label, `#${id} debe tener aria-labelledby o aria-label`);
      if (labelledBy) {
        assert.ok(modal.ownerDocument.getElementById(labelledBy), `#${id}: aria-labelledby apunta a un id inexistente`);
      }
    });
  }
}

test('♿ Modal detalle: el nombre del diálogo es un título solo para lectores y no hay cabecera estática', () => {
  const page = loadPage('index.html');
  const title = page.querySelector('#detailTitle');
  assert.ok(title?.classList.contains('sr-only'), 'el título estático solo da nombre al diálogo');
  assert.ok(title?.textContent?.trim());
  assert.equal(page.querySelector('#detailModal .modal-header'), null, 'la cabecera estática estaba oculta por JS');
  assert.equal(page.querySelector('#detailModal .btn-icon'), null, 'el botón de cierre real lo renderiza la ficha');
});

test('♿ Modal detalle: el botón de cierre que renderiza la ficha tiene nombre accesible', async () => {
  const dom = new JSDOM('<body></body>');
  (globalThis as Record<string, unknown>).document = dom.window.document;
  const { renderDetailModalContent } = await import('../../apps/frontend/src/components/modal-detail.js');
  const pokemon = { id: 1, nombre: 'Bulbasaur', tipo: 'Planta', fuerza: 49 } as Parameters<
    typeof renderDetailModalContent
  >[0];
  const host = dom.window.document.createElement('div');
  host.innerHTML = String(renderDetailModalContent(pokemon, [pokemon]));
  assert.ok(
    host.querySelector('.modal-close-btn')?.getAttribute('aria-label'),
    'el botón de solo icono necesita aria-label',
  );
});

test('♿ Modales: ya no se abren con la clase .active', () => {
  const css = fs.readFileSync(path.join(FRONTEND_DIR, 'public/css/style.css'), 'utf-8');
  assert.ok(!/\.modal-overlay\.active/.test(css), 'el estado abierto lo define [open], no .active');
  assert.match(css, /\.modal-overlay\[open\]/);
});

test('♿ Modales: openModal/closeModal usan showModal() y close() cuando existen', async () => {
  const dom = new JSDOM('<dialog id="m"></dialog>');
  (globalThis as Record<string, unknown>).document = dom.window.document;
  const { openModal, closeModal } = await import('../../apps/frontend/src/shared/ui.js');

  const calls: string[] = [];
  const el = dom.window.document.getElementById('m') as HTMLDialogElement;
  el.showModal = () => {
    calls.push('showModal');
    el.setAttribute('open', '');
  };
  el.close = () => {
    calls.push('close');
    el.removeAttribute('open');
  };

  openModal('m');
  openModal('m'); // ya abierto: no debe volver a invocar showModal() (lanzaría InvalidStateError)
  assert.deepEqual(calls, ['showModal']);
  assert.equal(el.hasAttribute('open'), true);

  closeModal('m');
  closeModal('m');
  assert.deepEqual(calls, ['showModal', 'close']);
  assert.equal(el.hasAttribute('open'), false);
});

test('♿ Modales: openModal/closeModal degradan a [open] si el entorno no implementa <dialog>', async () => {
  const dom = new JSDOM('<div id="legacy"></div>');
  (globalThis as Record<string, unknown>).document = dom.window.document;
  const { openModal, closeModal } = await import('../../apps/frontend/src/shared/ui.js');
  const el = dom.window.document.getElementById('legacy') as HTMLElement;

  openModal('legacy');
  assert.equal(el.hasAttribute('open'), true);
  closeModal('legacy');
  assert.equal(el.hasAttribute('open'), false);

  assert.doesNotThrow(() => openModal('no-existe'));
  assert.doesNotThrow(() => closeModal('no-existe'));
});
