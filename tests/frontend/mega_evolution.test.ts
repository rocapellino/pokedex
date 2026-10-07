import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeStatDelta,
  renderMegaDisclosureBody,
  renderMegaToggle,
  renderMegaEvolutionSection,
  renderMegaStats,
  selectMegaTab,
  toggleMegaDisclosure,
} from '../../apps/frontend/src/components/modal-mega.js';
import { renderDetailModalContent } from '../../apps/frontend/src/components/modal-detail.js';
import { renderPokemonCard } from '../../apps/frontend/src/components/pokemon-card.js';
import { matchesCatalogFilters, type CatalogFilters } from '../../apps/frontend/src/shared/catalog-filters.js';
import { hasMegaEvolution } from '../../apps/frontend/src/shared/pokemon-types.js';
import { sanitizeHtml } from '../../apps/frontend/src/sanitizer.js';
import type { MegaEvolution, Pokemon } from '../../apps/frontend/src/types.js';

const megaX: MegaEvolution = {
  clave: 'charizard-mega-x',
  nombre: 'Mega-Charizard X',
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10034.png',
  tipos: ['Fuego', 'Dragón'],
  habilidades: ['Garra Dura'],
  stats: { hp: 78, attack: 130, defense: 111, sp_attack: 130, sp_defense: 85, speed: 100 },
  peso: 110.5,
  altura: 1.7,
};
const megaY: MegaEvolution = {
  ...megaX,
  clave: 'charizard-mega-y',
  nombre: 'Mega-Charizard Y',
  tipos: ['Fuego', 'Volador'],
  habilidades: ['Sequía'],
  stats: { hp: 78, attack: 104, defense: 78, sp_attack: 159, sp_defense: 115, speed: 100 },
};

const charizard: Pokemon = {
  id: 6,
  nombre: 'Charizard',
  imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
  tipo: 'Fuego',
  tipos: ['Fuego', 'Volador'],
  fuerza: 84,
  caracteristicas: { peso: 90.5, altura: 1.7, fuerza: 84, habitat: 'Montañas' },
  habilidades: ['Mar Llamas'],
  stats: { hp: 78, attack: 84, defense: 78, sp_attack: 109, sp_defense: 85, speed: 100 },
  megaevoluciones: [megaX, megaY],
};
const pikachu: Pokemon = { ...charizard, id: 25, nombre: 'Pikachu', megaevoluciones: undefined };

function mount(html: { toString(): string }): HTMLElement {
  const root = dom.window.document.getElementById('detailContent') as HTMLElement;
  root.innerHTML = sanitizeHtml(String(html));
  return root;
}

test('🧬 UI Mega: describeStatDelta indica subida, bajada, igualdad y ausencia de base', () => {
  assert.deepEqual(describeStatDelta(130, 84), { text: '+46', tone: 'up' });
  assert.deepEqual(describeStatDelta(104, 109), { text: '−5', tone: 'down' });
  assert.deepEqual(describeStatDelta(100, 100), { text: '=', tone: 'same' });
  assert.deepEqual(describeStatDelta(100, undefined), { text: '', tone: 'same' });
});

test('🧬 UI Mega: renderMegaStats compara cada estadística y el total con la forma base', () => {
  const html = String(renderMegaStats(megaX.stats, charizard.stats));

  assert.match(html, /base-stat-delta--up">\+46</, 'Ataque 130 frente a 84');
  assert.match(html, /base-stat-delta--same">=</, 'PS iguales');
  assert.match(html, /Total/);
  // Total de la mega X: 634 frente a 534 de la forma base.
  assert.match(html, /base-stat-total[\s\S]*base-stat-delta--up">\+100</);
});

test('🧬 UI Mega: sin estadísticas base no inventa diferencias', () => {
  const html = String(renderMegaStats(megaX.stats, undefined));

  assert.doesNotMatch(html, /base-stat-delta--(up|down)/);
});

test('🧬 UI Mega: un Pokémon sin megaevolución no renderiza la sección', () => {
  assert.equal(String(renderMegaEvolutionSection(pikachu)), '');
  assert.equal(String(renderMegaEvolutionSection({ ...pikachu, megaevoluciones: [] })), '');
  assert.doesNotMatch(String(renderDetailModalContent(pikachu)), /mega-section/);
});

test('🧬 UI Mega: varias formas generan una pestaña por forma y solo la primera visible', () => {
  const html = String(renderMegaEvolutionSection(charizard));

  assert.match(html, /Megaevoluciones/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 2);
  assert.match(html, /Mega-Charizard X/);
  assert.match(html, /Mega-Charizard Y/);
  assert.equal((html.match(/ hidden>/g) ?? []).length, 1, 'solo el segundo panel está oculto');
});

test('🧬 UI Mega: una sola forma no muestra pestañas y usa el título en singular', () => {
  const html = String(renderMegaEvolutionSection({ ...charizard, megaevoluciones: [megaX] }));

  assert.match(html, /Megaevolución/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.doesNotMatch(html, / hidden>/);
});

test('🧬 UI Mega: el detalle del Pokémon base incluye la sección de megaevolución', () => {
  const html = String(renderDetailModalContent(charizard));

  assert.match(html, /mega-section/);
  assert.match(html, /Mega-Charizard X/);
});

test('🧬 UI Mega: habilidades vacías se muestran como no publicadas', () => {
  const html = String(renderMegaEvolutionSection({ ...charizard, megaevoluciones: [{ ...megaX, habilidades: [] }] }));

  assert.match(html, /No publicada/);
});

test('🧬 UI Mega: el contenido escapa texto no confiable (XSS) en nombre y tipos', () => {
  const evil: MegaEvolution = { ...megaX, nombre: '<img src=x onerror=alert(1)>', tipos: ['<script>x</script>'] };
  const html = String(renderMegaEvolutionSection({ ...charizard, megaevoluciones: [evil] }));

  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script/i);
});

test('🧬 UI Mega: el sanitizador conserva los atributos de las pestañas accesibles', () => {
  const root = mount(renderMegaEvolutionSection(charizard));

  const tab = root.querySelector('.mega-tab') as HTMLElement;
  assert.equal(tab.getAttribute('role'), 'tab');
  assert.equal(tab.getAttribute('aria-selected'), 'true');
  assert.equal(tab.getAttribute('aria-controls'), 'mega-panel-0');
  assert.equal(tab.dataset.megaIndex, '0');
  assert.equal(root.querySelectorAll('.mega-panel[hidden]').length, 1, 'el atributo hidden sobrevive al saneado');
});

test('🧬 UI Mega: selectMegaTab alterna pestaña, aria-selected y panel visible', () => {
  const root = mount(renderMegaEvolutionSection(charizard));

  assert.equal(selectMegaTab(root, 1), true);

  const tabs = Array.from(root.querySelectorAll<HTMLElement>('.mega-tab'));
  assert.deepEqual(
    tabs.map((t) => t.getAttribute('aria-selected')),
    ['false', 'true'],
  );
  assert.deepEqual(
    tabs.map((t) => t.classList.contains('mega-tab--active')),
    [false, true],
  );
  const panels = Array.from(root.querySelectorAll<HTMLElement>('.mega-panel'));
  assert.deepEqual(
    panels.map((p) => p.hasAttribute('hidden')),
    [true, false],
  );
});

test('🧬 UI Mega: selectMegaTab con un índice inexistente no cambia nada y devuelve false', () => {
  const root = mount(renderMegaEvolutionSection(charizard));

  assert.equal(selectMegaTab(root, 7), false);
  assert.equal((root.querySelector('.mega-tab') as HTMLElement).getAttribute('aria-selected'), 'true');
  assert.equal(root.querySelectorAll('.mega-panel[hidden]').length, 1);
});

test('🧬 UI Mega: el botón Mega nace contraído y va debajo de las debilidades', () => {
  const html = String(renderDetailModalContent(charizard));

  assert.match(html, /class="mega-toggle" aria-expanded="false" aria-controls="mega-disclosure"/);
  assert.match(html, /id="mega-disclosure" hidden>/);
  const weaknesses = html.indexOf('Debilidad');
  const toggle = html.indexOf('mega-toggle');
  assert.ok(weaknesses > 0 && weaknesses < toggle, 'orden: debilidades, botón Mega');
});

test('🧬 UI Mega: el desplegable va a todo el ancho, fuera de las columnas y antes de Evoluciones', () => {
  const root = mount(renderDetailModalContent(charizard, [charizard]));

  const body = root.querySelector('.mega-disclosure-body') as HTMLElement;
  assert.equal(body.closest('.pokedex-entry-grid'), null, 'no está dentro de la rejilla de dos columnas');
  assert.equal(body.parentElement, root, 'es hijo directo del detalle, igual que Evoluciones');
  const toggle = root.querySelector('.pokedex-right-col .mega-toggle');
  assert.ok(toggle, 'el botón sí está en la columna derecha');
  assert.ok(
    body.compareDocumentPosition(root.querySelector('.evolutions-panel-header') as HTMLElement) &
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'el cuerpo va antes del bloque de evoluciones',
  );
});

test('🧬 UI Mega: sin megaevolución no hay botón ni despliegue', () => {
  assert.equal(String(renderMegaToggle(pikachu)), '');
  assert.equal(String(renderMegaDisclosureBody(pikachu)), '');
  assert.doesNotMatch(String(renderDetailModalContent(pikachu)), /mega-toggle|mega-disclosure/);
});

test('🧬 UI Mega: el botón nombra cuántas megaevoluciones despliega', () => {
  assert.match(String(renderMegaToggle(charizard)), /aria-label="Ver 2 megaevoluciones"/);
  assert.match(String(renderMegaToggle({ ...charizard, megaevoluciones: [megaX] })), /aria-label="Ver megaevolución"/);
});

test('🧬 UI Mega: toggleMegaDisclosure alterna aria-expanded y la visibilidad del cuerpo (sobrevive al saneado)', () => {
  const root = mount(`${renderMegaToggle(charizard)}${renderMegaDisclosureBody(charizard)}`);
  const toggle = root.querySelector('.mega-toggle') as HTMLElement;
  const body = root.querySelector('.mega-disclosure-body') as HTMLElement;

  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(body.hasAttribute('hidden'), true);

  assert.equal(toggleMegaDisclosure(root), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(body.hasAttribute('hidden'), false);

  assert.equal(toggleMegaDisclosure(root), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(body.hasAttribute('hidden'), true);
});

test('🧬 UI Mega: toggleMegaDisclosure sin botón devuelve null', () => {
  assert.equal(toggleMegaDisclosure(mount('<p>sin mega</p>')), null);
});

test('🧬 UI Mega: la tarjeta muestra la insignia Mega solo si hay megaevolución', () => {
  assert.match(String(renderPokemonCard(charizard)), /class="mega-badge"/);
  assert.doesNotMatch(String(renderPokemonCard(pikachu)), /mega-badge/);
});

test('🧬 UI Mega: hasMegaEvolution distingue ausente, vacío y presente', () => {
  assert.equal(hasMegaEvolution(charizard), true);
  assert.equal(hasMegaEvolution(pikachu), false);
  assert.equal(hasMegaEvolution({ megaevoluciones: [] }), false);
  assert.equal(hasMegaEvolution({}), false);
});

test('🧬 UI Mega: el filtro "con megaevolución" se combina con búsqueda, tipo y generación', () => {
  const base: CatalogFilters = { searchQuery: '', types: [], generation: 'all', onlyWithMega: false };

  assert.equal(matchesCatalogFilters(pikachu, base), true);
  assert.equal(matchesCatalogFilters(pikachu, { ...base, onlyWithMega: true }), false);
  assert.equal(matchesCatalogFilters(charizard, { ...base, onlyWithMega: true }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, onlyWithMega: true, searchQuery: 'chari' }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, onlyWithMega: true, searchQuery: 'pika' }), false);
  assert.equal(matchesCatalogFilters(charizard, { ...base, onlyWithMega: true, types: ['Volador'] }), true);
  assert.equal(matchesCatalogFilters(charizard, { ...base, onlyWithMega: true, generation: '2' }), false);
});

test('🌟 UI Clasificación: la tarjeta muestra la insignia solo para legendarios y míticos', () => {
  assert.match(
    String(renderPokemonCard({ ...pikachu, clasificacion: 'legendario' })),
    /class-badge class-badge--legendario"[^>]*>Legendario</,
  );
  assert.match(
    String(renderPokemonCard({ ...pikachu, clasificacion: 'mitico' })),
    /class-badge class-badge--mitico"[^>]*>Mítico</,
  );
  assert.doesNotMatch(String(renderPokemonCard(pikachu)), /class-badge/);

  // Un valor forjado no genera insignia ni inyecta marcado: se inspecciona el DOM, no el texto.
  const holder = dom.window.document.createElement('div');
  holder.innerHTML = String(renderPokemonCard({ ...pikachu, clasificacion: 'x"><SCRIPT>' } as unknown as Pokemon));
  assert.equal(holder.querySelector('.class-badge'), null);
  assert.equal(holder.querySelector('script'), null);
});
