/**
 * Pokédex Pública - Visualizador Dinámico de Pokémon (TypeScript + DOMPurify)
 * Controlador de Vista Principal Modularizado (< 300 LOC)
 */

import type { Pokemon } from './types.js';
import {
  FALLBACK_IMAGE,
  TYPE_COLORS,
  normalizeStr,
  getTypeColor,
  getGeneration,
  formatPokemonId,
  showToast,
  renderEmptyState,
  fetchAllPokemons,
  errorMessage,
  focusFirstEnabledControl,
  pageAnnouncement,
  revealResults,
  html,
  setHtml,
  type SafeHtml,
} from './shared/index.js';
import {
  collectAbilities,
  isClassificationFilter,
  matchesCatalogFilters,
  type CatalogFilters,
  type ClassificationFilter,
} from './shared/catalog-filters.js';
import { commitFiltersToUrl, urlMatchesFilters, type HistoryMode } from './shared/filter-history.js';
import { autoHideStickyHeader } from './shared/sticky-autohide.js';
import { trackStickyHeight } from './shared/sticky-header.js';
import { parseFilterParams, type FilterState } from './shared/filter-url.js';
import {
  defaultSortDirection,
  isSortKey,
  isStatKey,
  MAX_STAT_MIN,
  sortPokemons,
  STAT_LABELS,
  type MinStat,
  type SortDirection,
  type SortKey,
} from './shared/catalog-sort.js';
import {
  openDetailModal as openDetailModalComponent,
  closeDetailModal,
  renderPokemonCard,
  selectMegaTab,
  toggleMegaDisclosure,
} from './components/index.js';
import {
  initFiltersControls,
  renderFiltersCount,
  setFiltersPanelOpen,
  syncTypeDropdown,
} from './components/filters-panel.js';

export { showToast, getTypeColor, getGeneration, normalizeStr, TYPE_COLORS, formatPokemonId, closeDetailModal };

let allPokemons: Pokemon[] = [];
let filteredPokemons: Pokemon[] = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 48;
let selectedTypes: string[] = [];
let currentGeneration = 'all';
let onlyWithMega = false;
let searchQuery = '';
let minStat: MinStat | null = null;
let classification: ClassificationFilter | null = null;
let ability: string | null = null;
/** Habilidad normalizada (sin tildes ni mayúsculas) a su nombre real; alimenta el autocompletado. */
let abilityIndex = new Map<string, string>();
let currentSort: SortKey = 'id';
let currentSortDir: SortDirection = 'asc';

const CLASSIFICATION_CHIP_LABELS: Record<ClassificationFilter, string> = {
  legendario: 'Legendarios',
  mitico: 'Míticos',
  especial: 'Legendarios y míticos',
};

const SEARCH_DEBOUNCE_MS = 150;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let statTimer: ReturnType<typeof setTimeout> | undefined;

export function openDetailModal(id: number): void {
  openDetailModalComponent(id, allPokemons);
}

export async function loadPokemons(): Promise<void> {
  const container = document.getElementById('pokemonGrid');
  if (!container) return;
  try {
    allPokemons = await fetchAllPokemons();
    allPokemons.sort((a, b) => a.id - b.id);

    renderAbilityOptions();
    applyFilters('replace', restoreFiltersFromUrl());
    showToast(`✅ Catálogo cargado: ${allPokemons.length} Pokémon listos.`);
  } catch (err) {
    console.error('Error al cargar datos:', err);
    showToast(`Error al cargar datos: ${errorMessage(err)}`, true);
    setHtml(
      container,
      renderEmptyState({
        icon: '⚠️',
        title: 'Error al conectar con el backend',
        description: errorMessage(err),
        retryBtnId: 'btnRetryConnection',
        retryBtnText: 'Reintentar Conexión',
      }),
    );
  }
}

/**
 * `history` decide si el cambio crea una entrada («atrás» lo deshace) o reescribe la actual. Un cambio de
 * filtros vuelve a la primera página; solo la restauración desde la URL indica otra (`page`), que se
 * ajusta al total de páginas que dejan los filtros.
 */
export function applyFilters(history: HistoryMode = 'push', page = 1): void {
  const filters: CatalogFilters = currentFilterState();
  filteredPokemons = sortPokemons(
    allPokemons.filter((p) => matchesCatalogFilters(p, filters)),
    currentSort,
    currentSortDir,
  );

  currentPage = Math.min(page, Math.max(1, Math.ceil(filteredPokemons.length / ITEMS_PER_PAGE)));
  renderPokemons();
  updateStats(filteredPokemons);
  renderActiveFilters();
  renderSortDirection();
  commitFiltersToUrl(currentFilterState(), history);
}

function currentFilterState(): FilterState {
  return {
    searchQuery,
    types: selectedTypes,
    generation: currentGeneration,
    onlyWithMega,
    minStat,
    clasificacion: classification,
    habilidad: ability,
    sort: currentSort,
    dir: currentSortDir,
    page: currentPage,
  };
}

/**
 * Aplica al estado y a los controles los filtros que vienen en la URL (enlace compartido o recarga).
 * Devuelve la página pedida, que `applyFilters` ajusta cuando ya hay catálogo filtrado.
 */
export function restoreFiltersFromUrl(): number {
  const state = parseFilterParams(window.location.search);
  searchQuery = state.searchQuery;
  selectedTypes = state.types;
  currentGeneration = state.generation;
  onlyWithMega = state.onlyWithMega;
  minStat = state.minStat;
  classification = state.clasificacion;
  ability = state.habilidad ? (abilityIndex.get(state.habilidad) ?? null) : null;
  currentSort = state.sort;
  currentSortDir = state.dir;

  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) input.value = searchQuery;
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  if (select) select.value = currentGeneration;
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = onlyWithMega;
  syncStatControls();
  syncClassControl();
  syncAbilityControl();
  syncSortControl();
  syncTypeControl();
  // Un filtro del panel activo no puede quedar oculto tras un panel cerrado (enlace compartido o recarga).
  if (countAdvancedFilters() > 0) setFiltersPanelOpen(true);
  return state.page;
}

/** Filtros que viven dentro del panel "Filtros" (buscador y orden están siempre visibles). Los tipos cuentan como uno. */
function countAdvancedFilters(): number {
  return (
    (currentGeneration !== 'all' ? 1 : 0) +
    (onlyWithMega ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (classification ? 1 : 0) +
    (minStat ? 1 : 0) +
    (ability ? 1 : 0)
  );
}

function renderAdvancedFiltersCount(): void {
  renderFiltersCount(countAdvancedFilters());
}

/** Rellena el autocompletado con las habilidades del catálogo y reconstruye el índice de nombres. */
function renderAbilityOptions(): void {
  const names = collectAbilities(allPokemons);
  abilityIndex = new Map(names.map((name) => [normalizeStr(name), name]));
  const list = document.getElementById('abilityOptions');
  if (!list) return;
  list.replaceChildren(
    ...names.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    }),
  );
}

function syncAbilityControl(): void {
  const input = document.getElementById('abilityFilter') as HTMLInputElement | null;
  if (!input) return;
  input.value = ability ?? '';
  input.removeAttribute('aria-invalid');
}

/**
 * El filtro solo se aplica cuando lo escrito coincide con una habilidad del catálogo (se elige de la
 * lista o se escribe completa, sin importar tildes ni mayúsculas); mientras tanto no filtra y el campo
 * se marca como no válido. La búsqueda de texto ya cubre las coincidencias parciales.
 */
export function handleAbilityChange(): void {
  const input = document.getElementById('abilityFilter') as HTMLInputElement | null;
  const typed = input?.value.trim() ?? '';
  const match = abilityIndex.get(normalizeStr(typed)) ?? null;
  const changed = match !== ability;
  ability = match;
  if (input) {
    if (match && input.value !== match) input.value = match;
    if (typed && !match) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (changed) applyFilters();
}

function syncClassControl(): void {
  const select = document.getElementById('classFilter') as HTMLSelectElement | null;
  if (select) select.value = classification ?? '';
}

export function handleClassFilterChange(): void {
  const select = document.getElementById('classFilter') as HTMLSelectElement | null;
  classification = isClassificationFilter(select?.value) ? select.value : null;
  applyFilters();
}

function syncStatControls(): void {
  const key = document.getElementById('statFilter') as HTMLSelectElement | null;
  if (key) key.value = minStat?.key ?? '';
  const min = document.getElementById('statMin') as HTMLInputElement | null;
  if (min) min.value = minStat ? String(minStat.min) : '';
}

/** Al cambiar de criterio se vuelve a su sentido natural; invertirlo es una decisión posterior. */
export function handleSortChange(): void {
  const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
  currentSort = isSortKey(select?.value) ? select.value : 'id';
  currentSortDir = defaultSortDirection(currentSort);
  applyFilters();
}

export function handleSortDirectionToggle(): void {
  currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
  applyFilters();
}

function syncSortControl(): void {
  const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
  if (select) select.value = currentSort;
}

/** El orden natural es por número y ascendente; cualquier otro (criterio o sentido) se ofrece como chip. */
function hasCustomSort(): boolean {
  return currentSort !== 'id' || currentSortDir !== defaultSortDirection('id');
}

function renderSortDirection(): void {
  const button = document.getElementById('sortDirection');
  if (!button) return;
  const text = currentSortDir === 'asc' ? 'Ascendente' : 'Descendente';
  button.textContent = `${currentSortDir === 'asc' ? '↑' : '↓'} ${text}`;
  button.setAttribute('aria-label', `Sentido del orden: ${text.toLowerCase()}. Pulsar para invertirlo`);
}

/** Lee la estadística y el mínimo de los controles; sin ambos (o con mínimo 0) el filtro queda desactivado. */
export function handleStatFilterChange(history: HistoryMode = 'push'): void {
  clearTimeout(statTimer);
  const key = (document.getElementById('statFilter') as HTMLSelectElement | null)?.value;
  const min = Number.parseInt((document.getElementById('statMin') as HTMLInputElement | null)?.value ?? '', 10);
  minStat = isStatKey(key) && min >= 1 ? { key, min: Math.min(min, MAX_STAT_MIN) } : null;
  applyFilters(history);
}

function handleStatMinDebounced(): void {
  clearTimeout(statTimer);
  statTimer = setTimeout(() => handleStatFilterChange('replace'), SEARCH_DEBOUNCE_MS);
}

export function handleSearch(history: HistoryMode = 'push'): void {
  clearTimeout(searchTimer);
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  searchQuery = input ? input.value : '';
  applyFilters(history);
}

function handleSearchDebounced(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => handleSearch('replace'), SEARCH_DEBOUNCE_MS);
}

function syncTypeControl(): void {
  syncTypeDropdown(selectedTypes);
}

/** Alterna un tipo en la selección; `all` limpia la selección de tipos. */
export function toggleTypeFilter(type: string): void {
  if (type === 'all') {
    selectedTypes = [];
  } else {
    const target = normalizeStr(type);
    const exists = selectedTypes.some((t) => normalizeStr(t) === target);
    selectedTypes = exists ? selectedTypes.filter((t) => normalizeStr(t) !== target) : [...selectedTypes, type];
  }
  syncTypeControl();
  applyFilters();
}

export function hasActiveFilters(): boolean {
  return (
    Boolean(searchQuery.trim()) ||
    selectedTypes.length > 0 ||
    currentGeneration !== 'all' ||
    onlyWithMega ||
    minStat !== null ||
    classification !== null ||
    ability !== null
  );
}

export function clearAllFilters(): void {
  clearTimeout(searchTimer);
  clearTimeout(statTimer);
  searchQuery = '';
  selectedTypes = [];
  currentGeneration = 'all';
  onlyWithMega = false;
  minStat = null;
  classification = null;
  ability = null;

  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) input.value = '';
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  if (select) select.value = 'all';
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = false;
  syncStatControls();
  syncClassControl();
  syncAbilityControl();

  syncTypeControl();
  applyFilters();
}

interface FilterChip {
  label: string;
  remove: () => void;
}

function collectActiveChips(): FilterChip[] {
  const chips: FilterChip[] = [];
  const query = searchQuery.trim();
  if (query) {
    chips.push({
      label: `Búsqueda: “${query}”`,
      remove: () => {
        const input = document.getElementById('searchInput') as HTMLInputElement | null;
        if (input) input.value = '';
        handleSearch();
      },
    });
  }
  for (const type of selectedTypes) chips.push({ label: type, remove: () => toggleTypeFilter(type) });
  if (currentGeneration !== 'all') {
    const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
    const label = select?.selectedOptions[0]?.textContent?.trim() || `Gen ${currentGeneration}`;
    chips.push({
      label,
      remove: () => {
        if (select) select.value = 'all';
        handleGenerationChange();
      },
    });
  }
  if (onlyWithMega) {
    chips.push({
      label: 'Con megaevolución',
      remove: () => {
        const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
        if (checkbox) checkbox.checked = false;
        handleMegaFilterChange();
      },
    });
  }
  if (ability) {
    chips.push({
      label: `Habilidad: ${ability}`,
      remove: () => {
        ability = null;
        syncAbilityControl();
        applyFilters();
      },
    });
  }
  if (classification) {
    chips.push({
      label: CLASSIFICATION_CHIP_LABELS[classification],
      remove: () => {
        classification = null;
        syncClassControl();
        applyFilters();
      },
    });
  }
  if (minStat) {
    chips.push({
      label: `${STAT_LABELS[minStat.key]} ≥ ${minStat.min}`,
      remove: () => {
        minStat = null;
        syncStatControls();
        applyFilters();
      },
    });
  }
  if (hasCustomSort()) {
    const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
    const criterion = select?.selectedOptions[0]?.textContent?.trim() || currentSort;
    chips.push({
      label: `Orden: ${criterion} ${currentSortDir === 'asc' ? '↑' : '↓'}`,
      remove: () => {
        currentSort = 'id';
        currentSortDir = defaultSortDirection('id');
        syncSortControl();
        applyFilters();
      },
    });
  }
  return chips;
}

/** Actualiza el contador de resultados, los chips de filtros activos y el botón de limpiar. */
export function renderActiveFilters(): void {
  const summary = document.getElementById('resultsSummary');
  const chipList = document.getElementById('activeFilterChips');
  const clearBtn = document.getElementById('btnClearFilters');

  if (summary) {
    const n = filteredPokemons.length;
    summary.textContent = `${n} ${n === 1 ? 'resultado' : 'resultados'} de ${allPokemons.length} Pokémon`;
  }
  if (clearBtn) clearBtn.hidden = !hasActiveFilters();
  renderAdvancedFiltersCount();
  if (!chipList) return;

  chipList.replaceChildren(
    ...collectActiveChips().map(({ label, remove }) => {
      const li = document.createElement('li');
      li.className = 'filter-chip';
      const text = document.createElement('span');
      text.textContent = label;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip-remove';
      btn.textContent = '✕';
      btn.setAttribute('aria-label', `Quitar filtro ${label}`);
      btn.addEventListener('click', remove);
      li.append(text, btn);
      return li;
    }),
  );
}

export function handleMegaFilterChange(): void {
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  onlyWithMega = Boolean(checkbox?.checked);
  applyFilters();
}

export function handleGenerationChange(): void {
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  currentGeneration = select ? select.value : 'all';
  applyFilters();
}

/** Estado del catálogo cuando ningún Pokémon cumple los filtros activos. */
export function renderNoResults(): SafeHtml {
  return html`
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">No se encontraron Pokémon</h3>
        <p class="empty-subtitle">Prueba con otro término o quita alguno de los filtros activos.</p>
        <button type="button" class="btn btn-primary mt-4" id="btnClearFiltersEmpty">Limpiar filtros</button>
      </div>
    `;
}

export function renderPokemons(): void {
  const container = document.getElementById('pokemonGrid');
  const paginationBar = document.getElementById('paginationBar');
  const skipLink = document.getElementById('skipToPagination');
  if (!container || !paginationBar) return;

  if (filteredPokemons.length === 0) {
    setHtml(container, renderNoResults());
    paginationBar.classList.add('hidden');
    if (skipLink) skipLink.hidden = true;
    return;
  }

  const totalPages = Math.ceil(filteredPokemons.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredPokemons.length);
  const currentBatch = filteredPokemons.slice(startIndex, endIndex);

  setHtml(container, html`${currentBatch.map(renderPokemonCard)}`);

  if (skipLink) skipLink.hidden = totalPages <= 1;
  if (totalPages > 1) {
    paginationBar.classList.remove('hidden');
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
      pageInfo.innerText = `Página ${currentPage} de ${totalPages} (${filteredPokemons.length} Pokémon)`;
    }
    const btnPrev = document.getElementById('btnPrevPage') as HTMLButtonElement | null;
    const btnNext = document.getElementById('btnNextPage') as HTMLButtonElement | null;
    if (btnPrev) btnPrev.disabled = currentPage === 1;
    if (btnNext) btnNext.disabled = currentPage === totalPages;
  } else {
    paginationBar.classList.add('hidden');
  }
}

export function changePage(delta: number): void {
  const totalPages = Math.ceil(filteredPokemons.length / ITEMS_PER_PAGE);
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderPokemons();
    commitFiltersToUrl(currentFilterState(), 'push');
    const grid = document.getElementById('pokemonGrid');
    if (grid) revealResults(grid);
    const announcer = document.getElementById('pageAnnouncer');
    if (announcer) {
      const shown = Math.min(ITEMS_PER_PAGE, filteredPokemons.length - (currentPage - 1) * ITEMS_PER_PAGE);
      announcer.textContent = pageAnnouncement(currentPage, totalPages, shown);
    }
  }
}

export function updateStats(list: Pokemon[]): void {
  const elTotal = document.getElementById('statTotal');
  const elMaxForce = document.getElementById('statMaxForce');
  const elAvgWeight = document.getElementById('statAvgWeight');
  const elTypesCount = document.getElementById('statTypesCount');

  if (elTotal) elTotal.innerText = String(list.length);
  if (list.length === 0) {
    if (elMaxForce) elMaxForce.innerText = '0';
    if (elAvgWeight) elAvgWeight.innerText = '0 kg';
    if (elTypesCount) elTypesCount.innerText = '0';
    return;
  }

  const maxForce = list.reduce((max, p) => {
    const val = p.fuerza || (p.caracteristicas?.fuerza as number) || p.stats?.attack || 0;
    return Math.max(max, val);
  }, 0);
  const totalWeight = list.reduce((acc, p) => acc + ((p.caracteristicas?.peso as number) || 0), 0);
  const avgWeight = (totalWeight / list.length).toFixed(1);
  const uniqueTypes = new Set(list.map((p) => p.tipo).filter(Boolean));

  if (elMaxForce) elMaxForce.innerText = String(maxForce);
  if (elAvgWeight) elAvgWeight.innerText = `${avgWeight} kg`;
  if (elTypesCount) elTypesCount.innerText = String(uniqueTypes.size);
}

window.addEventListener(
  'error',
  (event) => {
    const target = event.target as HTMLElement | null;
    if (target && target.tagName === 'IMG') {
      const fallback = FALLBACK_IMAGE;
      const img = target as HTMLImageElement;
      if (img.src !== fallback) {
        img.src = fallback;
      }
    }
  },
  true,
);

/**
 * «Atrás» y «adelante» restauran los filtros de la entrada de historial. Se ignora si la URL ya los
 * describe (un cambio de ancla) y se cancelan las escrituras pendientes para que no las reapliquen.
 */
function handleHistoryNavigation(): void {
  if (allPokemons.length === 0 || urlMatchesFilters(currentFilterState())) return;
  clearTimeout(searchTimer);
  clearTimeout(statTimer);
  applyFilters('replace', restoreFiltersFromUrl());
}

export function initInteractiveListeners(): void {
  // La misma referencia: registrar los listeners más de una vez no duplica el manejador.
  window.addEventListener('popstate', handleHistoryNavigation);
  trackStickyHeight();
  autoHideStickyHeader();

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearchDebounced);
  }

  document.getElementById('btnClearFilters')?.addEventListener('click', clearAllFilters);

  document.getElementById('megaFilter')?.addEventListener('change', handleMegaFilterChange);
  document.getElementById('classFilter')?.addEventListener('change', handleClassFilterChange);
  document.getElementById('abilityFilter')?.addEventListener('input', handleAbilityChange);
  document.getElementById('sortFilter')?.addEventListener('change', handleSortChange);
  document.getElementById('sortDirection')?.addEventListener('click', handleSortDirectionToggle);
  document.getElementById('statFilter')?.addEventListener('change', () => handleStatFilterChange());
  document.getElementById('statMin')?.addEventListener('input', handleStatMinDebounced);

  const generationFilter = document.getElementById('generationFilter');
  if (generationFilter) {
    generationFilter.addEventListener('change', handleGenerationChange);
  }

  initFiltersControls(toggleTypeFilter);

  const pokemonGrid = document.getElementById('pokemonGrid');
  if (pokemonGrid) {
    pokemonGrid.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const retryBtn = target?.closest('#btnRetryConnection');
      if (retryBtn) {
        void loadPokemons();
        return;
      }
      if (target?.closest('#btnClearFiltersEmpty')) {
        clearAllFilters();
        return;
      }
      const card = target?.closest('.pokemon-card');
      if (card) {
        const id = Number(card.getAttribute('data-pokemon-id'));
        if (id) openDetailModal(id);
      }
    });
  }

  const detailModal = document.getElementById('detailModal');
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target === detailModal || target?.closest('.btn-icon') || target?.closest('[data-close-modal]')) {
        closeDetailModal();
      }
    });
  }

  const detailContent = document.getElementById('detailContent');
  if (detailContent) {
    detailContent.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.mega-toggle')) {
        toggleMegaDisclosure(detailContent);
        return;
      }
      const megaTab = target?.closest('.mega-tab');
      if (megaTab) {
        selectMegaTab(detailContent, Number(megaTab.getAttribute('data-mega-index')));
        return;
      }
      const node = target?.closest('.evolution-node-item');
      if (node) {
        const evolId = Number(node.getAttribute('data-evol-id'));
        if (evolId) openDetailModal(evolId);
      }
    });
  }

  if (detailContent) {
    detailContent.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const node = (e.target as HTMLElement | null)?.closest('.evolution-node-item[role="button"]');
      if (!node) return;
      e.preventDefault();
      const evolId = Number(node.getAttribute('data-evol-id'));
      if (evolId) openDetailModal(evolId);
    });
  }

  // El salto mueve el foco con JavaScript y no navega al ancla: `replaceState` conserva el hash.
  document.getElementById('skipToPagination')?.addEventListener('click', (e) => {
    e.preventDefault();
    focusFirstEnabledControl(document.getElementById('paginationBar'));
  });

  const btnPrev = document.getElementById('btnPrevPage');
  if (btnPrev) btnPrev.addEventListener('click', () => changePage(-1));
  const btnNext = document.getElementById('btnNextPage');
  if (btnNext) btnNext.addEventListener('click', () => changePage(1));
}

// Inicialización
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initInteractiveListeners();
    void loadPokemons();
  });
} else {
  initInteractiveListeners();
  void loadPokemons();
}
