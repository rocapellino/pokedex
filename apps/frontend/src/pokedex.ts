/**
 * Pokédex Pública - Visualizador Dinámico de Pokémon (TypeScript + DOMPurify)
 * Controlador de Vista Principal Modularizado (< 300 LOC)
 */

import {
  countAdvancedFilters,
  currentFilterState,
  getAbility,
  getAbilityIndex,
  getAllPokemons,
  getClassification,
  getCurrentPage,
  getCurrentSort,
  getCurrentSortDir,
  getFilteredPokemons,
  getMinStat,
  getSelectedTypes,
  hasActiveFiltersState,
  ITEMS_PER_PAGE,
  resetFilterState,
  SEARCH_DEBOUNCE_MS,
  setAbility,
  setAbilityIndex,
  setAllPokemons,
  setClassification,
  setCurrentGeneration,
  setCurrentPage,
  setCurrentSort,
  setCurrentSortDir,
  setFilteredPokemons,
  setMinStat,
  setOnlyWithMega,
  setSearchQuery,
  setSelectedTypes,
} from './components/catalog-state.js';
import {
  initFiltersControls,
  renderFiltersCount,
  setFiltersPanelOpen,
  syncTypeDropdown,
} from './components/filters-panel.js';
import {
  closeDetailModal,
  openDetailModal as openDetailModalComponent,
  renderActiveFilterChips,
  renderPokemonCard,
  selectMegaTab,
  toggleMegaDisclosure,
} from './components/index.js';
import {
  collectAbilities,
  isClassificationFilter,
  matchesCatalogFilters,
  type CatalogFilters,
} from './shared/catalog-filters.js';
import { defaultSortDirection, isSortKey, isStatKey, MAX_STAT_MIN, sortPokemons } from './shared/catalog-sort.js';
import { commitFiltersToUrl, urlMatchesFilters, type HistoryMode } from './shared/filter-history.js';
import { parseFilterParams } from './shared/filter-url.js';
import {
  errorMessage,
  FALLBACK_IMAGE,
  fetchAllPokemons,
  focusFirstEnabledControl,
  formatPokemonId,
  getGeneration,
  getTypeColor,
  html,
  normalizeStr,
  pageAnnouncement,
  renderEmptyState,
  revealResults,
  type SafeHtml,
  setHtml,
  showToast,
  TYPE_COLORS,
} from './shared/index.js';
import { autoHideStickyHeader } from './shared/sticky-autohide.js';
import { trackStickyHeight } from './shared/sticky-header.js';

export { showToast, getTypeColor, getGeneration, normalizeStr, TYPE_COLORS, formatPokemonId, closeDetailModal };

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let statTimer: ReturnType<typeof setTimeout> | undefined;

export function openDetailModal(id: number): void {
  openDetailModalComponent(id, getAllPokemons());
}

export async function loadPokemons(): Promise<void> {
  const container = document.getElementById('pokemonGrid');
  if (!container) return;
  try {
    const pokemons = await fetchAllPokemons();
    pokemons.sort((a, b) => a.id - b.id);
    setAllPokemons(pokemons);

    renderAbilityOptions();
    applyFilters('replace', restoreFiltersFromUrl());
    showToast(`✅ Catálogo cargado: ${pokemons.length} Pokémon listos.`);
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
 * `history` decide si el cambio crea una entrada («atrás» lo deshace) o reescribe la actual.
 */
export function applyFilters(history: HistoryMode = 'push', page = 1): void {
  const all = getAllPokemons();
  const filters: CatalogFilters = currentFilterState();
  const sorted = sortPokemons(
    all.filter((p) => matchesCatalogFilters(p, filters)),
    getCurrentSort(),
    getCurrentSortDir(),
  );
  setFilteredPokemons(sorted);

  const newCurrentPage = Math.min(page, Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE)));
  setCurrentPage(newCurrentPage);
  renderPokemons();
  renderActiveFilters();
  renderSortDirection();
  commitFiltersToUrl(currentFilterState(), history);
}

/**
 * Aplica al estado y a los controles los filtros que vienen en la URL (enlace compartido o recarga).
 */
export function restoreFiltersFromUrl(): number {
  const state = parseFilterParams(window.location.search);
  setSearchQuery(state.searchQuery);
  setSelectedTypes(state.types);
  setCurrentGeneration(state.generation);
  setOnlyWithMega(state.onlyWithMega);
  setMinStat(state.minStat);
  setClassification(state.clasificacion);
  setAbility(state.habilidad ? (getAbilityIndex().get(state.habilidad) ?? null) : null);
  setCurrentSort(state.sort);
  setCurrentSortDir(state.dir);

  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) input.value = state.searchQuery;
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  if (select) select.value = state.generation;
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = state.onlyWithMega;
  syncStatControls();
  syncClassControl();
  syncAbilityControl();
  syncSortControl();
  syncTypeControl();
  if (countAdvancedFilters() > 0) setFiltersPanelOpen(true);
  return state.page;
}

function renderAdvancedFiltersCount(): void {
  renderFiltersCount(countAdvancedFilters());
}

/** Rellena el autocompletado con las habilidades del catálogo y reconstruye el índice de nombres. */
function renderAbilityOptions(): void {
  const names = collectAbilities(getAllPokemons());
  setAbilityIndex(new Map(names.map((name) => [normalizeStr(name), name])));
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
  input.value = getAbility() ?? '';
  input.removeAttribute('aria-invalid');
}

export function handleAbilityChange(): void {
  const input = document.getElementById('abilityFilter') as HTMLInputElement | null;
  const typed = input?.value.trim() ?? '';
  const match = getAbilityIndex().get(normalizeStr(typed)) ?? null;
  const changed = match !== getAbility();
  setAbility(match);
  if (input) {
    if (match && input.value !== match) input.value = match;
    if (typed && !match) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (changed) applyFilters();
}

function syncClassControl(): void {
  const select = document.getElementById('classFilter') as HTMLSelectElement | null;
  if (select) select.value = getClassification() ?? '';
}

export function handleClassFilterChange(): void {
  const select = document.getElementById('classFilter') as HTMLSelectElement | null;
  setClassification(isClassificationFilter(select?.value) ? select.value : null);
  applyFilters();
}

function syncStatControls(): void {
  const stat = getMinStat();
  const key = document.getElementById('statFilter') as HTMLSelectElement | null;
  if (key) key.value = stat?.key ?? '';
  const min = document.getElementById('statMin') as HTMLInputElement | null;
  if (min) min.value = stat ? String(stat.min) : '';
}

export function handleSortChange(): void {
  const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
  const newSort = isSortKey(select?.value) ? select.value : 'id';
  setCurrentSort(newSort);
  setCurrentSortDir(defaultSortDirection(newSort));
  applyFilters();
}

export function handleSortDirectionToggle(): void {
  setCurrentSortDir(getCurrentSortDir() === 'asc' ? 'desc' : 'asc');
  applyFilters();
}

function syncSortControl(): void {
  const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
  if (select) select.value = getCurrentSort();
}

function renderSortDirection(): void {
  const button = document.getElementById('sortDirection');
  if (!button) return;
  const dir = getCurrentSortDir();
  const text = dir === 'asc' ? 'Ascendente' : 'Descendente';
  button.textContent = `${dir === 'asc' ? '↑' : '↓'} ${text}`;
  button.setAttribute('aria-label', `Sentido del orden: ${text.toLowerCase()}. Pulsar para invertirlo`);
}

export function handleStatFilterChange(history: HistoryMode = 'push'): void {
  clearTimeout(statTimer);
  const key = (document.getElementById('statFilter') as HTMLSelectElement | null)?.value;
  const min = Number.parseInt((document.getElementById('statMin') as HTMLInputElement | null)?.value ?? '', 10);
  setMinStat(isStatKey(key) && min >= 1 ? { key, min: Math.min(min, MAX_STAT_MIN) } : null);
  applyFilters(history);
}

function handleStatMinDebounced(): void {
  clearTimeout(statTimer);
  statTimer = setTimeout(() => handleStatFilterChange('replace'), SEARCH_DEBOUNCE_MS);
}

export function handleSearch(history: HistoryMode = 'push'): void {
  clearTimeout(searchTimer);
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  setSearchQuery(input ? input.value : '');
  applyFilters(history);
}

function handleSearchDebounced(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => handleSearch('replace'), SEARCH_DEBOUNCE_MS);
}

function syncTypeControl(): void {
  syncTypeDropdown(getSelectedTypes());
}

export function toggleTypeFilter(type: string): void {
  let selected = getSelectedTypes();
  if (type === 'all') {
    selected = [];
  } else {
    const target = normalizeStr(type);
    const exists = selected.some((t) => normalizeStr(t) === target);
    selected = exists ? selected.filter((t) => normalizeStr(t) !== target) : [...selected, type];
  }
  setSelectedTypes(selected);
  syncTypeControl();
  applyFilters();
}

export function hasActiveFilters(): boolean {
  return hasActiveFiltersState();
}

export function clearAllFilters(): void {
  clearTimeout(searchTimer);
  clearTimeout(statTimer);
  resetFilterState();

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

export function renderActiveFilters(): void {
  renderActiveFilterChips({
    handleSearch,
    toggleTypeFilter,
    handleGenerationChange,
    handleMegaFilterChange,
    syncAbilityControl,
    syncClassControl,
    syncStatControls,
    syncSortControl,
    applyFilters,
    hasActiveFilters,
    renderAdvancedFiltersCount,
  });
}

export function handleMegaFilterChange(): void {
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  setOnlyWithMega(Boolean(checkbox?.checked));
  applyFilters();
}

export function handleGenerationChange(): void {
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  setCurrentGeneration(select ? select.value : 'all');
  applyFilters();
}

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

  const filtered = getFilteredPokemons();
  const page = getCurrentPage();

  if (filtered.length === 0) {
    setHtml(container, renderNoResults());
    paginationBar.classList.add('hidden');
    if (skipLink) skipLink.hidden = true;
    return;
  }

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filtered.length);
  const currentBatch = filtered.slice(startIndex, endIndex);

  setHtml(container, html`${currentBatch.map(renderPokemonCard)}`);

  if (skipLink) skipLink.hidden = totalPages <= 1;
  if (totalPages > 1) {
    paginationBar.classList.remove('hidden');
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
      pageInfo.textContent = `Página ${page} de ${totalPages} (${filtered.length} Pokémon)`;
    }
    const btnPrev = document.getElementById('btnPrevPage') as HTMLButtonElement | null;
    const btnNext = document.getElementById('btnNextPage') as HTMLButtonElement | null;
    if (btnPrev) btnPrev.disabled = page === 1;
    if (btnNext) btnNext.disabled = page === totalPages;
  } else {
    paginationBar.classList.add('hidden');
  }
}

export function changePage(delta: number): void {
  const filtered = getFilteredPokemons();
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const current = getCurrentPage();
  const newPage = current + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    setCurrentPage(newPage);
    renderPokemons();
    commitFiltersToUrl(currentFilterState(), 'push');
    const grid = document.getElementById('pokemonGrid');
    if (grid) revealResults(grid);
    const announcer = document.getElementById('pageAnnouncer');
    if (announcer) {
      const shown = Math.min(ITEMS_PER_PAGE, filtered.length - (newPage - 1) * ITEMS_PER_PAGE);
      announcer.textContent = pageAnnouncement(newPage, totalPages, shown);
    }
  }
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

function handleHistoryNavigation(): void {
  if (getAllPokemons().length === 0 || urlMatchesFilters(currentFilterState())) return;
  clearTimeout(searchTimer);
  clearTimeout(statTimer);
  applyFilters('replace', restoreFiltersFromUrl());
}

export function initInteractiveListeners(): void {
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
