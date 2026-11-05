/**
 * Pokédex Pública - Visualizador Dinámico de Pokémon (TypeScript + DOMPurify)
 * Controlador de Vista Principal Modularizado (< 300 LOC)
 */

import {
  countAdvancedFilters,
  currentFilterState,
  getAllPokemons,
  getCurrentPage,
  getCurrentSort,
  getCurrentSortDir,
  getFilteredPokemons,
  ITEMS_PER_PAGE,
  setAllPokemons,
  setCurrentGeneration,
  setCurrentPage,
  setCurrentSort,
  setCurrentSortDir,
  setFilteredPokemons,
  setMinStat,
  setOnlyWithMega,
  setSearchQuery,
  setSelectedTypes,
  setClassification,
  setAbility,
  getAbilityIndex,
} from './components/catalog-state.js';
import {
  cancelDebounceTimers,
  registerApplyFilters,
  renderAbilityOptions,
  renderActiveFilters,
  renderSortDirection,
  syncAbilityControl,
  syncClassControl,
  syncSortControl,
  syncStatControls,
  syncTypeControl,
} from './components/catalog-controls.js';
import { setFiltersPanelOpen } from './components/filters-panel.js';
import { initInteractiveListeners as setupListeners } from './components/catalog-listeners.js';
import {
  closeDetailModal,
  openDetailModal as openDetailModalComponent,
  renderPokemonCard,
} from './components/index.js';
import { matchesCatalogFilters, type CatalogFilters } from './shared/catalog-filters.js';
import { sortPokemons } from './shared/catalog-sort.js';
import { commitFiltersToUrl, urlMatchesFilters, type HistoryMode } from './shared/filter-history.js';
import { parseFilterParams } from './shared/filter-url.js';
import {
  errorMessage,
  FALLBACK_IMAGE,
  fetchAllPokemons,
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

export * from './components/catalog-controls.js';
export { showToast, getTypeColor, getGeneration, normalizeStr, TYPE_COLORS, formatPokemonId, closeDetailModal };

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

// Registrar callback para que los controles invoquen applyFilters de forma desacoplada
registerApplyFilters(applyFilters);

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
  cancelDebounceTimers();
  applyFilters('replace', restoreFiltersFromUrl());
}

export function initInteractiveListeners(): void {
  setupListeners({
    loadPokemons,
    openDetailModal,
    closeDetailModal,
    changePage,
    handleHistoryNavigation,
  });
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
