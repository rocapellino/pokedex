import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPokemonCard } from '../../apps/frontend/src/components/pokemon-card.js';
import {
  renderDetailModalContent,
  renderSingleEvolutionNode,
} from '../../apps/frontend/src/components/modal-detail.js';
import { sanitizeHtml } from '../../apps/frontend/src/sanitizer.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/frontend');

const pikachu: Pokemon = {
  id: 25,
  nombre: 'Pikachu',
  tipo: 'Electrico',
  fuerza: 55,
  imagen: 'https://img.pokemondb.net/artwork/pikachu.jpg',
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque' },
};

function parse(html: string): Document {
  return new dom.window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

test('⌨️ Tarjeta: el nombre es un botón nativo dentro del encabezado, no el article', () => {
  const doc = parse(sanitizeHtml(renderPokemonCard(pikachu)));
  const card = doc.querySelector('article.pokemon-card');
  assert.ok(card, 'la tarjeta sigue siendo un <article>');
  assert.equal(card.getAttribute('role'), null, 'el article no debe ser role=button (aplanaría su contenido)');
  assert.equal(card.getAttribute('tabindex'), null);

  const button = doc.querySelector('h2.pokemon-name > button.card-open');
  assert.ok(button, 'debe existir h2.pokemon-name > button.card-open');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.textContent?.trim(), 'Pikachu', 'el nombre accesible es el nombre del Pokémon');
});

test('⌨️ Tarjeta: la pista táctil es decorativa para no duplicar el nombre accesible', () => {
  const doc = parse(sanitizeHtml(renderPokemonCard(pikachu)));
  assert.equal(doc.querySelector('.card-hint')?.getAttribute('aria-hidden'), 'true');
});

test('⌨️ Tarjeta: el nombre del Pokémon se escapa dentro del botón', () => {
  const doc = parse(sanitizeHtml(renderPokemonCard({ ...pikachu, nombre: '<img src=x onerror=alert(1)>' })));
  assert.equal(doc.querySelector('img[onerror]'), null);
  assert.ok(doc.querySelector('button.card-open')?.textContent?.includes('<img'));
});

test('⌨️ Nodo de evolución: es operable con teclado y el actual solo se marca con aria-current', () => {
  const catalog = [pikachu];
  const other = parse(sanitizeHtml(renderSingleEvolutionNode({ id: 25, nombre: 'Pikachu' }, 26, false, catalog)));
  const node = other.querySelector('.evolution-node-item');
  assert.equal(node?.getAttribute('role'), 'button');
  assert.equal(node?.getAttribute('tabindex'), '0');
  assert.equal(node?.getAttribute('aria-current'), null);

  const current = parse(sanitizeHtml(renderSingleEvolutionNode({ id: 25, nombre: 'Pikachu' }, 25, false, catalog)));
  const currentNode = current.querySelector('.evolution-node-item');
  assert.equal(currentNode?.getAttribute('aria-current'), 'true');
  assert.equal(currentNode?.getAttribute('role'), null, 'el nodo actual no navega a ninguna parte');
  assert.equal(currentNode?.getAttribute('tabindex'), null);
});

test('⌨️ Ficha: el título recibe el foco al cargar otra ficha (tabindex="-1")', () => {
  const doc = parse(sanitizeHtml(renderDetailModalContent(pikachu, [pikachu])));
  assert.equal(doc.querySelector('h2.pokedex-notched-title')?.getAttribute('tabindex'), '-1');
});

test('⌨️ Sanitizador: conserva tabindex, aria-current y aria-hidden pero sigue eliminando manejadores y style', () => {
  const doc = parse(
    sanitizeHtml(
      '<div tabindex="0" aria-current="true" aria-hidden="true" onclick="alert(1)" style="color:red">x</div>',
    ),
  );
  const el = doc.querySelector('div');
  assert.equal(el?.getAttribute('tabindex'), '0');
  assert.equal(el?.getAttribute('aria-current'), 'true');
  assert.equal(el?.getAttribute('aria-hidden'), 'true');
  assert.equal(el?.getAttribute('onclick'), null);
  assert.equal(el?.getAttribute('style'), null);
});

test('⌨️ CSS: la tarjeta entera es clicable y el foco es visible', () => {
  const css = fs.readFileSync(path.join(FRONTEND_DIR, 'public/css/style.css'), 'utf-8');
  assert.match(css, /\.card-open::after\s*{[^}]*inset:\s*0/, 'el botón debe cubrir la tarjeta con ::after');
  assert.match(css, /\.pokemon-card:has\(\.card-open:focus-visible\)\s*{[^}]*outline/, 'foco visible en la tarjeta');
  assert.match(css, /\.evolution-node-item:focus-visible\s*{[^}]*outline/, 'foco visible en el nodo de evolución');
});
