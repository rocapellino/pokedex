import { dom } from './mega_env.js';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initFiltersControls,
  isFiltersPanelOpen,
  renderFiltersCount,
  setFiltersPanelOpen,
  setTypeListOpen,
  summarizeTypes,
  syncTypeDropdown,
} from '../../apps/frontend/src/components/filters-panel.js';

const doc = dom.window.document;
const toggled: string[] = [];

const byId = (id: string) => doc.getElementById(id) as HTMLElement;
const box = (type: string) => doc.querySelector(`#typeFilterList input[value="${type}"]`) as HTMLInputElement;

function mount(): void {
  doc.body.innerHTML = `
    <button type="button" id="filtersToggle" aria-expanded="false" aria-controls="moreFilters">
      <span class="filters-toggle-icon">+</span><span>Filtros</span><span id="moreFiltersCount" hidden></span>
    </button>
    <section id="moreFilters" hidden>
      <div id="typeFilterField">
        <button type="button" id="typeFilterToggle" aria-expanded="false"><span id="typeFilterSummary">Cualquier tipo</span></button>
        <div id="typeFilterList" hidden>
          <label><input type="checkbox" value="Fuego">Fuego</label>
          <label><input type="checkbox" value="Eléctrico">Eléctrico</label>
          <label><input type="checkbox" value="Planta">Planta</label>
        </div>
      </div>
    </section>
    <button type="button" id="outside">Fuera</button>`;
}

mount();
initFiltersControls((type) => toggled.push(type));

beforeEach(() => {
  setFiltersPanelOpen(false);
  toggled.length = 0;
  syncTypeDropdown([]);
});

test('📂 Panel: abrir y cerrar actualiza hidden, aria-expanded y el icono', () => {
  assert.equal(isFiltersPanelOpen(), false);

  setFiltersPanelOpen(true);
  assert.equal(isFiltersPanelOpen(), true);
  assert.equal(byId('moreFilters').hidden, false);
  assert.equal(byId('filtersToggle').getAttribute('aria-expanded'), 'true');
  assert.equal(doc.querySelector('.filters-toggle-icon')?.textContent, '−');

  setFiltersPanelOpen(false);
  assert.equal(byId('moreFilters').hidden, true);
  assert.equal(byId('filtersToggle').getAttribute('aria-expanded'), 'false');
  assert.equal(doc.querySelector('.filters-toggle-icon')?.textContent, '+');
});

test('📂 Panel: el botón alterna el panel y al cerrarlo se pliega también el desplegable de tipos', () => {
  byId('filtersToggle').click();
  assert.equal(isFiltersPanelOpen(), true);

  byId('typeFilterToggle').click();
  assert.equal(byId('typeFilterList').hidden, false);

  byId('filtersToggle').click();
  assert.equal(isFiltersPanelOpen(), false);
  assert.equal(byId('typeFilterList').hidden, true);
  assert.equal(byId('typeFilterToggle').getAttribute('aria-expanded'), 'false');
});

test('📂 Panel: el contador y el nombre accesible reflejan cuántos filtros hay activos', () => {
  renderFiltersCount(0);
  assert.equal(byId('moreFiltersCount').hidden, true);
  assert.equal(byId('filtersToggle').getAttribute('aria-label'), 'Filtros');

  renderFiltersCount(3);
  assert.equal(byId('moreFiltersCount').hidden, false);
  assert.equal(byId('moreFiltersCount').textContent, '3');
  assert.equal(byId('filtersToggle').getAttribute('aria-label'), 'Filtros, 3 activos');
});

test('🏷️ Tipos: summarizeTypes muestra uno o dos nombres y cuenta a partir de tres', () => {
  assert.equal(summarizeTypes([]), 'Cualquier tipo');
  assert.equal(summarizeTypes(['Fuego']), 'Fuego');
  assert.equal(summarizeTypes(['Fuego', 'Volador']), 'Fuego, Volador');
  assert.equal(summarizeTypes(['Fuego', 'Volador', 'Agua']), '3 tipos');
});

test('🏷️ Tipos: syncTypeDropdown marca las casillas sin distinguir tildes y actualiza el texto', () => {
  syncTypeDropdown(['electrico', 'Fuego']);
  assert.equal(box('Eléctrico').checked, true);
  assert.equal(box('Fuego').checked, true);
  assert.equal(box('Planta').checked, false);
  assert.equal(byId('typeFilterSummary').textContent, 'electrico, Fuego');

  syncTypeDropdown([]);
  assert.equal(box('Fuego').checked, false);
  assert.equal(byId('typeFilterSummary').textContent, 'Cualquier tipo');
});

test('🏷️ Tipos: el botón abre y cierra la lista y mantiene aria-expanded', () => {
  byId('typeFilterToggle').click();
  assert.equal(byId('typeFilterList').hidden, false);
  assert.equal(byId('typeFilterToggle').getAttribute('aria-expanded'), 'true');

  byId('typeFilterToggle').click();
  assert.equal(byId('typeFilterList').hidden, true);
  assert.equal(byId('typeFilterToggle').getAttribute('aria-expanded'), 'false');
});

test('🏷️ Tipos: marcar una casilla avisa con el valor del tipo', () => {
  setTypeListOpen(true);
  box('Eléctrico').click();
  box('Fuego').click();
  assert.deepEqual(toggled, ['Eléctrico', 'Fuego']);
});

test('🏷️ Tipos: Escape cierra la lista y devuelve el foco al botón, y con la lista cerrada sigue su camino', () => {
  // jsdom 30.1.2 ya no enfoca elementos dentro de un ancestro `hidden`, como un navegador real: el
  // panel debe estar abierto para que el foco llegue a la casilla y de vuelta al botón.
  setFiltersPanelOpen(true);
  setTypeListOpen(true);
  box('Fuego').focus();
  box('Fuego').dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  assert.equal(byId('typeFilterList').hidden, true);
  assert.equal(doc.activeElement, byId('typeFilterToggle'));

  let reached = false;
  doc.addEventListener('keydown', () => {
    reached = true;
  });
  byId('typeFilterToggle').dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  assert.equal(reached, true, 'con la lista cerrada, Escape sigue su camino (p. ej. cerrar un modal)');
});

test('🏷️ Tipos: pulsar fuera o sacar el foco cierra la lista, pero pulsar dentro no', () => {
  setTypeListOpen(true);
  box('Fuego').click();
  assert.equal(byId('typeFilterList').hidden, false, 'pulsar una casilla no cierra la lista');

  byId('outside').click();
  assert.equal(byId('typeFilterList').hidden, true);

  setTypeListOpen(true);
  box('Fuego').dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true, relatedTarget: byId('outside') }));
  assert.equal(byId('typeFilterList').hidden, true);

  setTypeListOpen(true);
  box('Fuego').dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true, relatedTarget: box('Planta') }));
  assert.equal(byId('typeFilterList').hidden, false, 'mover el foco dentro del desplegable no lo cierra');
});

test('📂 Panel: sin los elementos en el DOM las funciones no fallan', () => {
  doc.body.innerHTML = '';
  assert.doesNotThrow(() => {
    setFiltersPanelOpen(true);
    renderFiltersCount(2);
    setTypeListOpen(true);
    syncTypeDropdown(['Fuego']);
  });
  assert.equal(isFiltersPanelOpen(), false);
  mount();
});
