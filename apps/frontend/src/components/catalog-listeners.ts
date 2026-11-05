/**
 * Pokédex Pública - Listeners Interactivos del DOM y Navegación
 */

import { autoHideStickyHeader } from '../shared/sticky-autohide.js';
import { trackStickyHeight } from '../shared/sticky-header.js';
import { focusFirstEnabledControl } from '../shared/index.js';
import { initFiltersControls } from './filters-panel.js';
import { selectMegaTab, toggleMegaDisclosure } from './index.js';
import {
  clearAllFilters,
  handleAbilityChange,
  handleClassFilterChange,
  handleGenerationChange,
  handleMegaFilterChange,
  handleSearchDebounced,
  handleSortChange,
  handleSortDirectionToggle,
  handleStatFilterChange,
  handleStatMinDebounced,
  toggleTypeFilter,
} from './catalog-controls.js';

export interface ListenerDependencies {
  loadPokemons: () => Promise<void>;
  openDetailModal: (id: number) => void;
  closeDetailModal: () => void;
  changePage: (delta: number) => void;
  handleHistoryNavigation: () => void;
}

export function initInteractiveListeners(deps: ListenerDependencies): void {
  window.addEventListener('popstate', deps.handleHistoryNavigation);
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
        void deps.loadPokemons();
        return;
      }
      if (target?.closest('#btnClearFiltersEmpty')) {
        clearAllFilters();
        return;
      }
      const card = target?.closest('.pokemon-card');
      if (card) {
        const id = Number(card.getAttribute('data-pokemon-id'));
        if (id) deps.openDetailModal(id);
      }
    });
  }

  const detailModal = document.getElementById('detailModal');
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target === detailModal || target?.closest('.btn-icon') || target?.closest('[data-close-modal]')) {
        deps.closeDetailModal();
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
        if (evolId) deps.openDetailModal(evolId);
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
      if (evolId) deps.openDetailModal(evolId);
    });
  }

  document.getElementById('skipToPagination')?.addEventListener('click', (e) => {
    e.preventDefault();
    focusFirstEnabledControl(document.getElementById('paginationBar'));
  });

  const btnPrev = document.getElementById('btnPrevPage');
  if (btnPrev) btnPrev.addEventListener('click', () => deps.changePage(-1));
  const btnNext = document.getElementById('btnNextPage');
  if (btnNext) btnNext.addEventListener('click', () => deps.changePage(1));
}
