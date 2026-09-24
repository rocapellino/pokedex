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
} from './shared/index.js';
import {
  openDetailModal as openDetailModalComponent,
  closeDetailModal,
  renderPokemonCard,
} from './components/index.js';

export { showToast, getTypeColor, getGeneration, normalizeStr, TYPE_COLORS, formatPokemonId, closeDetailModal };

let allPokemons: Pokemon[] = [];
let filteredPokemons: Pokemon[] = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 48;
let currentType = 'all';
let currentGeneration = 'all';
let searchQuery = '';

export function openDetailModal(id: number): void {
  openDetailModalComponent(id, allPokemons);
}

export async function loadPokemons(): Promise<void> {
  const container = document.getElementById('pokemonGrid');
  if (!container) return;
  try {
    allPokemons = await fetchAllPokemons();
    allPokemons.sort((a, b) => a.id - b.id);

    applyFilters();
    showToast(`✅ Catálogo cargado: ${allPokemons.length} Pokémon listos.`);
  } catch (err: any) {
    console.error('Error al cargar datos:', err);
    showToast(`Error al cargar datos: ${err?.message || err}`, true);
    container.innerHTML = renderEmptyState({
      icon: '⚠️',
      title: 'Error al conectar con el backend',
      description: err?.message || String(err),
      retryBtnId: 'btnRetryConnection',
      retryBtnText: 'Reintentar Conexión',
    });
  }
}

export function applyFilters(): void {
  const term = normalizeStr(searchQuery);
  const targetType = normalizeStr(currentType);

  filteredPokemons = allPokemons.filter((p) => {
    const matchesSearch =
      !term ||
      normalizeStr(p.nombre).includes(term) ||
      normalizeStr(p.tipo).includes(term) ||
      (Array.isArray(p.tipos) && p.tipos.some((t) => normalizeStr(t).includes(term))) ||
      (Array.isArray(p.habilidades) && p.habilidades.some((h) => normalizeStr(h).includes(term))) ||
      (typeof p.habilidades === 'string' && normalizeStr(p.habilidades).includes(term)) ||
      (p.caracteristicas?.habitat && normalizeStr(p.caracteristicas.habitat).includes(term)) ||
      (typeof p.habitat === 'string' && normalizeStr(p.habitat).includes(term)) ||
      String(p.id).includes(term);

    const matchesType =
      currentType === 'all' ||
      normalizeStr(p.tipo) === targetType ||
      (Array.isArray(p.tipos) && p.tipos.some((t) => normalizeStr(t) === targetType));

    const gen = getGeneration(p.id);
    const matchesGen = currentGeneration === 'all' || gen === Number.parseInt(currentGeneration, 10);

    return matchesSearch && matchesType && matchesGen;
  });

  currentPage = 1;
  renderPokemons();
  updateStats(filteredPokemons);
}

export function handleSearch(): void {
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  searchQuery = input ? input.value : '';
  applyFilters();
}

export function selectTypeFilter(type: string): void {
  currentType = type;
  const targetTypeNorm = normalizeStr(type);
  document.querySelectorAll('.type-pill').forEach((btn) => {
    const btnType = btn.getAttribute('data-type');
    const isActive = (type === 'all' && btnType === 'all') || normalizeStr(btnType) === targetTypeNorm;
    btn.classList.toggle('active', isActive);
  });
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
  true
);

export function initInteractiveListeners(): void {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
    searchInput.addEventListener('keyup', handleSearch);
    searchInput.addEventListener('search', handleSearch);
  }

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
        if (type) selectTypeFilter(type);
      }
    });
  }

  const pokemonGrid = document.getElementById('pokemonGrid');
  if (pokemonGrid) {
    pokemonGrid.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const retryBtn = target?.closest('#btnRetryConnection');
      if (retryBtn) {
        loadPokemons();
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
      const node = target?.closest('.evolution-node-item');
      if (node) {
        const evolId = Number(node.getAttribute('data-evol-id'));
        if (evolId) openDetailModal(evolId);
      }
    });
  }

  const btnPrev = document.getElementById('btnPrevPage');
  if (btnPrev) btnPrev.addEventListener('click', () => changePage(-1));
  const btnNext = document.getElementById('btnNextPage');
  if (btnNext) btnNext.addEventListener('click', () => changePage(1));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailModal();
  });
}

// Inicialización
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initInteractiveListeners();
    loadPokemons();
  });
} else {
  initInteractiveListeners();
  loadPokemons();
}
