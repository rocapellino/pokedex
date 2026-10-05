/**
 * Gestor de Estado, Filtros y Paginación para Pokédex Backoffice
 */

import { sanitizeHtml, escapeText } from '../sanitizer.js';
import type { Pokemon } from '../types.js';
import { errorMessage, fetchPokemonsWithCount, showToast } from '../shared/index.js';
import { renderAdminTable, renderKPIs } from './admin-table.js';

let currentPokemons: Pokemon[] = [];
let totalRecords = 0;
let currentPage = 1;
let pageSize = 50;
let currentSearch = '';
let currentType = 'all';
let searchDebounceTimeout: number | undefined;

export function getBackofficePokemons(): Pokemon[] {
  return currentPokemons;
}

export function setBackofficePokemons(pokemons: Pokemon[], total?: number): void {
  currentPokemons = pokemons;
  if (typeof total === 'number') totalRecords = total;
}

export function getTotalRecords(): number {
  return totalRecords;
}

export function getCurrentPage(): number {
  return currentPage;
}

export function setCurrentPage(page: number): void {
  currentPage = page;
}

export function getPageSize(): number {
  return pageSize;
}

export function setPageSize(size: number): void {
  pageSize = size;
}

export function getCurrentSearch(): string {
  return currentSearch;
}

export function setCurrentSearch(search: string): void {
  currentSearch = search;
}

export function getCurrentType(): string {
  return currentType;
}

export function setCurrentType(type: string): void {
  currentType = type;
}

export function renderTable(): void {
  const tbody = document.getElementById('adminTableBody') || document.getElementById('tableBody');
  const pagination = document.getElementById('adminPagination');
  if (tbody) {
    renderAdminTable(tbody, pagination, currentPokemons, totalRecords, pageSize, currentPage);
  }
}

export function updateKPIs(): void {
  renderKPIs(currentPokemons, totalRecords);
}

export async function loadAdminData(): Promise<void> {
  const tbody = document.getElementById('adminTableBody') || document.getElementById('tableBody');
  if (!tbody) return;
  try {
    tbody.innerHTML = sanitizeHtml(`
      <tr>
        <td colspan="8" class="table-loading">
          <div class="spinner"></div>
          <span>Cargando registros desde PostgreSQL...</span>
        </td>
      </tr>
    `);

    const offset = (currentPage - 1) * pageSize;
    const { pokemons, total } = await fetchPokemonsWithCount({
      limit: pageSize,
      offset,
      nombre: currentSearch.trim(),
      tipo: currentType,
    });
    currentPokemons = pokemons;
    totalRecords = total;

    renderTable();
    updateKPIs();
    showToast(`✅ Catálogo cargado: ${currentPokemons.length} de ${totalRecords} registros.`);
  } catch (err) {
    console.error('Error al conectar con la API:', err);
    showToast(`Error al cargar datos: ${errorMessage(err)}`, true);
    if (tbody) {
      tbody.innerHTML = sanitizeHtml(`
        <tr>
          <td colspan="8" class="table-empty">
            <div class="text-danger text-2xl mb-2">⚠️</div>
            <strong>Error de conexión con la API</strong>
            <p class="text-muted">${escapeText(errorMessage(err))}</p>
          </td>
        </tr>
      `);
    }
  }
}

export function applyAdminFilters(): void {
  currentPage = 1;
  void loadAdminData();
}

export function handleAdminSearch(): void {
  const input = (document.getElementById('adminSearch') ||
    document.getElementById('adminSearchInput')) as HTMLInputElement | null;
  currentSearch = input ? input.value : '';
  window.clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = window.setTimeout(() => {
    currentPage = 1;
    void loadAdminData();
  }, 300);
}

export function handleAdminTypeFilter(): void {
  const select = document.getElementById('adminTypeFilter') as HTMLSelectElement | null;
  currentType = select ? select.value : 'all';
  currentPage = 1;
  void loadAdminData();
}

export function handlePageSizeChange(): void {
  const sizeEl = document.getElementById('adminPageSize') as HTMLSelectElement | null;
  pageSize = sizeEl ? Number.parseInt(sizeEl.value, 10) || 50 : 50;
  currentPage = 1;
  void loadAdminData();
}

export function changeAdminPage(delta: number): void {
  const totalPages = Math.ceil(totalRecords / pageSize);
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    void loadAdminData();
    window.scrollTo({ top: 200, behavior: 'smooth' });
  }
}
