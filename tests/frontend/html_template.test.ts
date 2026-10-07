import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SafeHtml, html, trustedHtml } from '../../apps/frontend/src/shared/html.js';

test('🧱 html: escapa por defecto el texto interpolado, también en atributos entre comillas', () => {
  const hostile = `<img src=x onerror="alert('x')">`;
  assert.equal(String(html`<p>${hostile}</p>`), '<p>&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt;</p>');

  const attr = String(html`<a title="${'" onmouseover="alert(1)'}" href='${"' onclick='x"}'>x</a>`);
  assert.ok(!attr.includes('"" onmouseover'), 'las comillas dobles no pueden cerrar el atributo');
  assert.match(attr, /title="&quot; onmouseover=&quot;alert\(1\)"/);
  assert.match(attr, /href='&#039; onclick=&#039;x'/);
  assert.match(String(html`<i>${'`x`'}</i>`), /&#96;x&#96;/, 'el acento grave también se escapa');
});

test('🧱 html: números, vacíos y valores nulos', () => {
  assert.equal(String(html`<b>${0}</b><b>${12.5}</b>`), '<b>0</b><b>12.5</b>');
  assert.equal(String(html`<b>${null}${undefined}${false}</b>`), '<b></b>', 'null, undefined y false no pintan nada');
  assert.equal(String(html`${'a'}${'&'}`), 'a&amp;');
});

test('🧱 html: un campo con tipo numérico pero valor hostil se escapa igual (el tipo no se comprueba en ejecución)', () => {
  const fuerza = '<script>alert(1)</script>' as unknown as number;
  assert.equal(String(html`<span>${fuerza || 0}</span>`), '<span>&lt;script&gt;alert(1)&lt;/script&gt;</span>');
});

test('🧱 html: los fragmentos SafeHtml pasan intactos y no se escapan dos veces', () => {
  const inner = html`<b>${'<'}</b>`;
  assert.ok(inner instanceof SafeHtml);
  assert.equal(String(html`<p>${inner}</p>`), '<p><b>&lt;</b></p>');
});

test('🧱 html: los arreglos se concatenan; cada elemento sigue su propia regla', () => {
  const items = ['<a>', 'b'].map((t) => html`<li>${t}</li>`);
  assert.equal(String(html`<ul>${items}</ul>`), '<ul><li>&lt;a&gt;</li><li>b</li></ul>');
  assert.equal(String(html`<ul>${['<x>', 'y']}</ul>`), '<ul>&lt;x&gt;y</ul>', 'las cadenas de un arreglo se escapan');
  assert.equal(String(html`<ul>${[]}</ul>`), '<ul></ul>');
  assert.equal(String(html`${[null, html`<i></i>`, undefined]}`), '<i></i>');
});

test('🧱 trustedHtml: marca de forma explícita un fragmento de confianza y solo ese', () => {
  const svg = trustedHtml('<svg viewBox="0 0 1 1"></svg>');
  assert.ok(svg instanceof SafeHtml);
  assert.equal(String(html`<span>${svg}</span>`), '<span><svg viewBox="0 0 1 1"></svg></span>');
  assert.equal(String(html`<span>${'<svg>'}</span>`), '<span>&lt;svg&gt;</span>', 'una cadena normal no se confía');
});

test('🧱 SafeHtml: se comporta como texto al concatenar, comparar y unir', () => {
  const fragment = html`<b>x</b>`;
  assert.equal(`${fragment}`, '<b>x</b>');
  assert.equal(fragment.toString(), '<b>x</b>');
  assert.equal([fragment, fragment].join(''), '<b>x</b><b>x</b>');
  assert.equal(String(html``), '');
});
