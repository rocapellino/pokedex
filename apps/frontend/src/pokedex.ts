/**
 * Pokédex Pública - Visualizador Dinámico de Pokémon (TypeScript + DOMPurify)
 * Controlador de Vista Principal Modularizado (< 300 LOC)
 */

import { sanitizeHtml } from './sanitizer.js';
import type { Pokemon } from './types.js';
import {
  TYPE_COLORS,
  normalizeStr,
  getTypeColor,
  getGeneration,
  formatPokemonId,
  showToast,
  renderEmptyState,
  fetchAllPokemons,
  errorMessage,
} from './shared/index.js';
import { matchesCatalogFilters, type CatalogFilters } from './shared/catalog-filters.js';
import { parseFilterParams, serializeFilterParams, type FilterState } from './shared/filter-url.js';
import {
  isSortKey,
  isStatKey,
  MAX_STAT_MIN,
  sortPokemons,
  STAT_LABELS,
  type MinStat,
  type SortKey,
} from './shared/catalog-sort.js';
import {
  openDetailModal as openDetailModalComponent,
  closeDetailModal,
  renderPokemonCard,
  selectMegaTab,
  toggleMegaDisclosure,
} from './components/index.js';

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
let currentSort: SortKey = 'id';

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

    restoreFiltersFromUrl();
    applyFilters();
    showToast(`✅ Catálogo cargado: ${allPokemons.length} Pokémon listos.`);
  } catch (err) {
    console.error('Error al cargar datos:', err);
    showToast(`Error al cargar datos: ${errorMessage(err)}`, true);
    container.innerHTML = renderEmptyState({
      icon: '⚠️',
      title: 'Error al conectar con el backend',
      description: errorMessage(err),
      retryBtnId: 'btnRetryConnection',
      retryBtnText: 'Reintentar Conexión',
    }).toString();
  }
}

export function applyFilters(): void {
  const filters: CatalogFilters = currentFilterState();
  filteredPokemons = sortPokemons(
    allPokemons.filter((p) => matchesCatalogFilters(p, filters)),
    currentSort,
  );

  currentPage = 1;
  renderPokemons();
  updateStats(filteredPokemons);
  renderActiveFilters();
  syncFiltersToUrl();
}

function currentFilterState(): FilterState {
  return { searchQuery, types: selectedTypes, generation: currentGeneration, onlyWithMega, minStat, sort: currentSort };
}

/** Refleja los filtros activos en la URL sin crear entradas de historial. */
function syncFiltersToUrl(): void {
  const next = serializeFilterParams(currentFilterState());
  if (next === window.location.search) return;
  window.history.replaceState(null, '', `${window.location.pathname}${next}${window.location.hash}`);
}

/** Aplica al estado y a los controles los filtros que vienen en la URL (enlace compartido o recarga). */
export function restoreFiltersFromUrl(): void {
  const state = parseFilterParams(window.location.search);
  searchQuery = state.searchQuery;
  selectedTypes = state.types;
  currentGeneration = state.generation;
  onlyWithMega = state.onlyWithMega;
  minStat = state.minStat;
  currentSort = state.sort;

  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) input.value = searchQuery;
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  if (select) select.value = currentGeneration;
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = onlyWithMega;
  syncStatControls();
  const sortSelect = document.getElementById('sortFilter') as HTMLSelectElement | null;
  if (sortSelect) sortSelect.value = currentSort;
  syncTypePills();
}

function syncStatControls(): void {
  const key = document.getElementById('statFilter') as HTMLSelectElement | null;
  if (key) key.value = minStat?.key ?? '';
  const min = document.getElementById('statMin') as HTMLInputElement | null;
  if (min) min.value = minStat ? String(minStat.min) : '';
}

export function handleSortChange(): void {
  const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
  currentSort = isSortKey(select?.value) ? select.value : 'id';
  applyFilters();
}

/** Lee la estadística y el mínimo de los controles; sin ambos (o con mínimo 0) el filtro queda desactivado. */
export function handleStatFilterChange(): void {
  clearTimeout(statTimer);
  const key = (document.getElementById('statFilter') as HTMLSelectElement | null)?.value;
  const min = Number.parseInt((document.getElementById('statMin') as HTMLInputElement | null)?.value ?? '', 10);
  minStat = isStatKey(key) && min >= 1 ? { key, min: Math.min(min, MAX_STAT_MIN) } : null;
  applyFilters();
}

function handleStatMinDebounced(): void {
  clearTimeout(statTimer);
  statTimer = setTimeout(handleStatFilterChange, SEARCH_DEBOUNCE_MS);
}

export function handleSearch(): void {
  clearTimeout(searchTimer);
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  searchQuery = input ? input.value : '';
  applyFilters();
}

function handleSearchDebounced(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(handleSearch, SEARCH_DEBOUNCE_MS);
}

function syncTypePills(): void {
  const selected = new Set(selectedTypes.map(normalizeStr));
  document.querySelectorAll('.type-pill').forEach((btn) => {
    const btnType = btn.getAttribute('data-type') ?? '';
    const isActive = btnType === 'all' ? selected.size === 0 : selected.has(normalizeStr(btnType));
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
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
  syncTypePills();
  applyFilters();
}

export function hasActiveFilters(): boolean {
  return (
    Boolean(searchQuery.trim()) ||
    selectedTypes.length > 0 ||
    currentGeneration !== 'all' ||
    onlyWithMega ||
    minStat !== null
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

  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) input.value = '';
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  if (select) select.value = 'all';
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = false;
  syncStatControls();

  syncTypePills();
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

export function renderPokemons(): void {
  const container = document.getElementById('pokemonGrid');
  const paginationBar = document.getElementById('paginationBar');
  if (!container || !paginationBar) return;

  if (filteredPokemons.length === 0) {
    container.innerHTML = sanitizeHtml(`
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">No se encontraron Pokémon</h3>
        <p class="empty-subtitle">Intenta buscar con otro término, tipo o cambia de generación.</p>
        <button type="button" class="btn btn-primary mt-4" id="btnClearFiltersEmpty">Limpiar filtros</button>
      </div>
    `);
    paginationBar.classList.add('hidden');
    return;
  }

  const totalPages = Math.ceil(filteredPokemons.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredPokemons.length);
  const currentBatch = filteredPokemons.slice(startIndex, endIndex);

  const rawHtml = currentBatch.map(renderPokemonCard).join('');
  container.innerHTML = sanitizeHtml(rawHtml);

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
    window.scrollTo({ top: 350, behavior: 'smooth' });
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
      const fallback = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
      const img = target as HTMLImageElement;
      if (img.src !== fallback) {
        img.src = fallback;
      }
    }
  },
  true,
);

export function initInteractiveListeners(): void {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearchDebounced);
  }

  document.getElementById('btnClearFilters')?.addEventListener('click', clearAllFilters);

  document.getElementById('megaFilter')?.addEventListener('change', handleMegaFilterChange);
  document.getElementById('sortFilter')?.addEventListener('change', handleSortChange);
  document.getElementById('statFilter')?.addEventListener('change', handleStatFilterChange);
  document.getElementById('statMin')?.addEventListener('input', handleStatMinDebounced);

  const generationFilter = document.getElementById('generationFilter');
  if (generationFilter) {
    generationFilter.addEventListener('change', handleGenerationChange);
  }

  const typePillsContainer = document.getElementById('typePillsContainer');
  if (typePillsContainer) {
    typePillsContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const pill = target?.closest('.type-pill');
      if (pill) {
        e.preventDefault();
        const type = pill.getAttribute('data-type');
        if (type) toggleTypeFilter(type);
      }
    });
  }

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
