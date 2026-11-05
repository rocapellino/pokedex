/**
 * Pokédex Pública - Controladores y Sincronización de Filtros del Catálogo
 * Modularizado para desacoplar el estado de la UI (< 300 LOC).
 */

import {
  countAdvancedFilters,
  getAbility,
  getAbilityIndex,
  getAllPokemons,
  getClassification,
  getCurrentSort,
  getCurrentSortDir,
  getMinStat,
  getSelectedTypes,
  hasActiveFiltersState,
  resetFilterState,
  SEARCH_DEBOUNCE_MS,
  setAbility,
  setAbilityIndex,
  setClassification,
  setCurrentGeneration,
  setCurrentSort,
  setCurrentSortDir,
  setMinStat,
  setOnlyWithMega,
  setSearchQuery,
  setSelectedTypes,
} from './catalog-state.js';
import { renderFiltersCount, syncTypeDropdown } from './filters-panel.js';
import { renderActiveFilterChips } from './active-filter-chips.js';
import { collectAbilities, isClassificationFilter } from '../shared/catalog-filters.js';
import { defaultSortDirection, isSortKey, isStatKey, MAX_STAT_MIN } from '../shared/catalog-sort.js';
import type { HistoryMode } from '../shared/filter-history.js';
import { normalizeStr } from '../shared/index.js';

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let statTimer: ReturnType<typeof setTimeout> | undefined;
let applyFiltersCallback: ((history?: HistoryMode, page?: number) => void) | undefined;

export function registerApplyFilters(fn: (history?: HistoryMode, page?: number) => void): void {
  applyFiltersCallback = fn;
}

function dispatchApplyFilters(history?: HistoryMode, page?: number): void {
  if (applyFiltersCallback) {
    applyFiltersCallback(history, page);
  }
}

export function renderAdvancedFiltersCount(): void {
  renderFiltersCount(countAdvancedFilters());
}

/** Rellena el autocompletado con las habilidades del catálogo y reconstruye el índice de nombres. */
export function renderAbilityOptions(): void {
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

export function syncAbilityControl(): void {
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
  if (changed) dispatchApplyFilters();
}

export function syncClassControl(): void {
  const select = document.getElementById('classFilter') as HTMLSelectElement | null;
  if (select) select.value = getClassification() ?? '';
}

export function handleClassFilterChange(): void {
  const select = document.getElementById('classFilter') as HTMLSelectElement | null;
  setClassification(isClassificationFilter(select?.value) ? select.value : null);
  dispatchApplyFilters();
}

export function syncStatControls(): void {
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
  dispatchApplyFilters();
}

export function handleSortDirectionToggle(): void {
  setCurrentSortDir(getCurrentSortDir() === 'asc' ? 'desc' : 'asc');
  dispatchApplyFilters();
}

export function syncSortControl(): void {
  const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
  if (select) select.value = getCurrentSort();
}

export function renderSortDirection(): void {
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
  dispatchApplyFilters(history);
}

export function handleStatMinDebounced(): void {
  clearTimeout(statTimer);
  statTimer = setTimeout(() => handleStatFilterChange('replace'), SEARCH_DEBOUNCE_MS);
}

export function handleSearch(history: HistoryMode = 'push'): void {
  clearTimeout(searchTimer);
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  setSearchQuery(input ? input.value : '');
  dispatchApplyFilters(history);
}

export function handleSearchDebounced(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => handleSearch('replace'), SEARCH_DEBOUNCE_MS);
}

export function syncTypeControl(): void {
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
  dispatchApplyFilters();
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
  dispatchApplyFilters();
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
    applyFilters: dispatchApplyFilters,
    hasActiveFilters,
    renderAdvancedFiltersCount,
  });
}

export function handleMegaFilterChange(): void {
  const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
  setOnlyWithMega(Boolean(checkbox?.checked));
  dispatchApplyFilters();
}

export function handleGenerationChange(): void {
  const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
  setCurrentGeneration(select ? select.value : 'all');
  dispatchApplyFilters();
}
