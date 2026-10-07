import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, setHtml, trustedHtml, type SafeHtml } from '../../apps/frontend/src/shared/html.js';
import { IMG, SCRIPT } from './html_assertions.js';

void dom;

const holder = (): HTMLElement => document.createElement('div');

test('🧱 setHtml inserta un fragmento legítimo conservando su estructura', () => {
  const el = holder();
  setHtml(el, html`<ul>${['a', 'b'].map((t) => html`<li class="x">${t}</li>`)}</ul>`);
  assert.equal(el.querySelectorAll('li.x').length, 2);
});

test('🛡️ setHtml sanea aunque el fragmento se marque como confiable por error', () => {
  const el = holder();
  setHtml(el, trustedHtml(`<p>ok</p>${SCRIPT}${IMG}<a href="javascript:alert(1)" onclick="x()">l</a>`));
  assert.equal(el.querySelector('script'), null);
  assert.equal(el.querySelector('img')?.getAttribute('onerror') ?? null, null);
  assert.equal(el.querySelector('a')?.getAttribute('onclick') ?? null, null);
  assert.equal(el.querySelector('a')?.getAttribute('href') ?? null, null);
  assert.ok(el.querySelector('p'), 'el contenido seguro se conserva');
});

test('🛡️ setHtml escapa los datos interpolados y los deja como texto', () => {
  const el = holder();
  setHtml(el, html`<p>${IMG}</p>`);
  assert.equal(el.querySelector('img'), null);
  assert.equal(el.textContent, IMG);
});

test('🛡️ setHtml reemplaza el contenido anterior', () => {
  const el = holder();
  el.innerHTML = '<span>viejo</span>';
  setHtml(el, html`<b>nuevo</b>`);
  assert.equal(el.querySelector('span'), null);
  assert.equal(el.textContent, 'nuevo');
});

test('🧱 setHtml no acepta una cadena sin marcar (comprobado por el compilador)', () => {
  const el = holder();
  // @ts-expect-error una `string` no es `SafeHtml`: el tipo obliga a pasar por `html` o `trustedHtml`
  const attempt = (): void => setHtml(el, '<b>sin marcar</b>');
  assert.equal(typeof attempt, 'function');
});

test('🛡️ setHtml rechaza en ejecución lo que no sea SafeHtml (llamadas sin tipos)', () => {
  const el = holder();
  assert.throws(() => setHtml(el, '<b>x</b>' as unknown as SafeHtml), TypeError);
  assert.equal(el.innerHTML, '', 'no se inserta nada');
});
