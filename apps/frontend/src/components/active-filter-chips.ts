/**
 * Pokédex Pública - Componente de Chips y Resumen de Filtros Activos
 */

import { defaultSortDirection, STAT_LABELS } from '../shared/catalog-sort.js';
import {
  CLASSIFICATION_CHIP_LABELS,
  getAbility,
  getAllPokemons,
  getClassification,
  getCurrentGeneration,
  getCurrentSort,
  getCurrentSortDir,
  getFilteredPokemons,
  getMinStat,
  getOnlyWithMega,
  getSearchQuery,
  getSelectedTypes,
  hasCustomSortState,
  setAbility,
  setClassification,
  setCurrentSort,
  setCurrentSortDir,
  setMinStat,
} from './catalog-state.js';

export interface FilterChip {
  label: string;
  remove: () => void;
}

export interface ActiveFiltersCallbacks {
  handleSearch: () => void;
  toggleTypeFilter: (type: string) => void;
  handleGenerationChange: () => void;
  handleMegaFilterChange: () => void;
  syncAbilityControl: () => void;
  syncClassControl: () => void;
  syncStatControls: () => void;
  syncSortControl: () => void;
  applyFilters: () => void;
  hasActiveFilters: () => boolean;
  renderAdvancedFiltersCount: () => void;
}

export function collectActiveChips(callbacks: ActiveFiltersCallbacks): FilterChip[] {
  const chips: FilterChip[] = [];
  const query = getSearchQuery().trim();
  if (query) {
    chips.push({
      label: `Búsqueda: “${query}”`,
      remove: () => {
        const input = document.getElementById('searchInput') as HTMLInputElement | null;
        if (input) input.value = '';
        callbacks.handleSearch();
      },
    });
  }
  for (const type of getSelectedTypes()) {
    chips.push({ label: type, remove: () => callbacks.toggleTypeFilter(type) });
  }
  const currentGen = getCurrentGeneration();
  if (currentGen !== 'all') {
    const select = document.getElementById('generationFilter') as HTMLSelectElement | null;
    const label = select?.selectedOptions[0]?.textContent?.trim() || `Gen ${currentGen}`;
    chips.push({
      label,
      remove: () => {
        if (select) select.value = 'all';
        callbacks.handleGenerationChange();
      },
    });
  }
  if (getOnlyWithMega()) {
    chips.push({
      label: 'Con megaevolución',
      remove: () => {
        const checkbox = document.getElementById('megaFilter') as HTMLInputElement | null;
        if (checkbox) checkbox.checked = false;
        callbacks.handleMegaFilterChange();
      },
    });
  }
  const currentAbility = getAbility();
  if (currentAbility) {
    chips.push({
      label: `Habilidad: ${currentAbility}`,
      remove: () => {
        setAbility(null);
        callbacks.syncAbilityControl();
        callbacks.applyFilters();
      },
    });
  }
  const currentClassification = getClassification();
  if (currentClassification) {
    chips.push({
      label: CLASSIFICATION_CHIP_LABELS[currentClassification],
      remove: () => {
        setClassification(null);
        callbacks.syncClassControl();
        callbacks.applyFilters();
      },
    });
  }
  const stat = getMinStat();
  if (stat) {
    chips.push({
      label: `${STAT_LABELS[stat.key]} ≥ ${stat.min}`,
      remove: () => {
        setMinStat(null);
        callbacks.syncStatControls();
        callbacks.applyFilters();
      },
    });
  }
  if (hasCustomSortState()) {
    const select = document.getElementById('sortFilter') as HTMLSelectElement | null;
    const criterion = select?.selectedOptions[0]?.textContent?.trim() || getCurrentSort();
    chips.push({
      label: `Orden: ${criterion} ${getCurrentSortDir() === 'asc' ? '↑' : '↓'}`,
      remove: () => {
        setCurrentSort('id');
        setCurrentSortDir(defaultSortDirection('id'));
        callbacks.syncSortControl();
        callbacks.applyFilters();
      },
    });
  }
  return chips;
}

export function renderActiveFilterChips(callbacks: ActiveFiltersCallbacks): void {
  const summary = document.getElementById('resultsSummary');
  const chipList = document.getElementById('activeFilterChips');
  const clearBtn = document.getElementById('btnClearFilters');
  const filtered = getFilteredPokemons();
  const all = getAllPokemons();

  if (summary) {
    const n = filtered.length;
    summary.textContent = `${n} ${n === 1 ? 'resultado' : 'resultados'} de ${all.length} Pokémon`;
  }
  if (clearBtn) clearBtn.hidden = !callbacks.hasActiveFilters();
  callbacks.renderAdvancedFiltersCount();
  if (!chipList) return;

  chipList.replaceChildren(
    ...collectActiveChips(callbacks).map(({ label, remove }) => {
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
