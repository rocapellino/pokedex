/**
 * Pokédex Backoffice - Gestor Administrativo CRUD (TypeScript + DOMPurify)
 * Controlador de Vista de Administración Modularizado (< 300 LOC)
 */

import { sanitizeHtml, escapeText } from './sanitizer.js';
import type { Pokemon } from './types.js';
import {
  TYPE_COLORS,
  normalizeStr,
  getTypeColor,
  formatPokemonId,
  showToast,
  fetchPokemonsWithCount,
  createPokemon,
  updatePokemon,
  deletePokemon,
} from './shared/index.js';
import {
  openCreateModal as openCreateModalComponent,
  openEditModal as openEditModalComponent,
  closeCrudModal as closeCrudModalComponent,
  openDeleteModal as openDeleteModalComponent,
  closeDeleteModal as closeDeleteModalComponent,
  getPendingDeleteId,
  extractPokemonPayload,
  openAuthModal as openAuthModalComponent,
  closeAuthModal as closeAuthModalComponent,
  checkAdminSession,
  isSessionActive,
  setAdminSessionActive,
  clearAdminSession,
  updateAuthUI,
  handleAuthSubmit,
  renderAdminTable,
  renderKPIs,
  bindBackofficeEvents,
} from './components/index.js';

export {
  checkAdminSession,
  isSessionActive,
  setAdminSessionActive,
  clearAdminSession,
  updateAuthUI,
  handleAuthSubmit,
  showToast,
  getTypeColor,
  normalizeStr,
  TYPE_COLORS,
  formatPokemonId,
};

let currentPokemons: Pokemon[] = [];
let totalRecords = 0;
let currentPage = 1;
let pageSize = 50;
let currentSearch = '';
let currentType = 'all';
let searchDebounceTimeout: any = null;

export function openAuthModal(): void {
  openAuthModalComponent();
}

export function closeAuthModal(): void {
  closeAuthModalComponent();
}

export async function checkHealthStatus(): Promise<void> {
  const statusEl = document.getElementById('backendStatus');
  const dotEl = document.getElementById('statusDot');
  if (!statusEl || !dotEl) return;

  const startTime = performance.now();
  try {
    const res = await fetch('/healthz');
    const elapsed = Math.round(performance.now() - startTime);
    if (res.ok) {
      statusEl.innerText = `Kubernetes & Backend Saludables (${elapsed}ms)`;
      dotEl.style.backgroundColor = '#10b981';
      dotEl.style.boxShadow = '0 0 8px #10b981';
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err: any) {
    statusEl.innerText = `Fallo en Healthcheck: ${err?.message || err}`;
    dotEl.style.backgroundColor = '#ef4444';
    dotEl.style.boxShadow = '0 0 8px #ef4444';
  }
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
  } catch (err: any) {
    console.error('Error al conectar con la API:', err);
    showToast(`Error al cargar datos: ${err?.message || err}`, true);
    if (tbody) {
      tbody.innerHTML = sanitizeHtml(`
        <tr>
          <td colspan="8" class="table-empty">
            <div class="text-danger text-2xl mb-2">⚠️</div>
            <strong>Error de conexión con la API</strong>
            <p class="text-muted">${escapeText(err?.message || err)}</p>
          </td>
        </tr>
      `);
    }
  }
}

export function applyAdminFilters(): void {
  currentPage = 1;
  loadAdminData();
}

export function handleAdminSearch(): void {
  const input = (document.getElementById('adminSearch') || document.getElementById('adminSearchInput')) as HTMLInputElement | null;
  currentSearch = input ? input.value : '';
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    currentPage = 1;
    loadAdminData();
  }, 300);
}

export function handleAdminTypeFilter(): void {
  const select = document.getElementById('adminTypeFilter') as HTMLSelectElement | null;
  currentType = select ? select.value : 'all';
  currentPage = 1;
  loadAdminData();
}

export function handlePageSizeChange(): void {
  const sizeEl = document.getElementById('adminPageSize') as HTMLSelectElement | null;
  pageSize = sizeEl ? Number.parseInt(sizeEl.value, 10) || 50 : 50;
  currentPage = 1;
  loadAdminData();
}

export function renderTable(): void {
  const tbody = document.getElementById('adminTableBody') || document.getElementById('tableBody');
  const pagination = document.getElementById('adminPagination');
  if (tbody) {
    renderAdminTable(tbody, pagination, currentPokemons, totalRecords, pageSize, currentPage);
  }
}

export function changeAdminPage(delta: number): void {
  const totalPages = Math.ceil(totalRecords / pageSize);
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    loadAdminData();
    window.scrollTo({ top: 200, behavior: 'smooth' });
  }
}

export function updateKPIs(): void {
  renderKPIs(currentPokemons, totalRecords);
}

export function openCreateModal(): void {
  openCreateModalComponent();
}

export function openEditModal(id: number): void {
  openEditModalComponent(id, currentPokemons);
}

export function closeCrudModal(): void {
  closeCrudModalComponent();
}

export async function handleFormSubmit(e: Event): Promise<void> {
  e.preventDefault();

  if (!isSessionActive()) {
    showToast('⚠️ Se requiere autenticación de administrador para guardar cambios.', true);
    openAuthModal();
    return;
  }

  const { id, payload } = extractPokemonPayload();
  const submitBtn = document.getElementById('btnSubmitForm') as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.innerText = 'Guardando...';

  try {
    const isEdit = typeof id === 'number' && !Number.isNaN(id);
    if (isEdit) {
      await updatePokemon(id, payload);
    } else {
      await createPokemon(payload);
    }

    closeCrudModal();
    showToast(
      isEdit
        ? `✅ Pokémon "${payload.nombre}" actualizado con éxito.`
        : `🎉 Pokémon "${payload.nombre}" creado con éxito.`
    );
    await loadAdminData();
  } catch (err: any) {
    if (err?.status === 401) {
      showToast('❌ Sesión de administrador expirada o inválida (401). Reautenticando...', true);
      clearAdminSession();
      openAuthModal();
      return;
    }
    showToast(`Error al guardar: ${err?.message || err}`, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Guardar Registro';
  }
}

export function openDeleteModal(id: number): void {
  openDeleteModalComponent(id, currentPokemons);
}

export function closeDeleteModal(): void {
  closeDeleteModalComponent();
}

export async function executeDelete(): Promise<void> {
  const pendingId = getPendingDeleteId();
  if (!pendingId) return;

  if (!isSessionActive()) {
    showToast('⚠️ Se requiere autenticación de administrador para eliminar registros.', true);
    closeDeleteModal();
    openAuthModal();
    return;
  }

  const btn = document.getElementById('btnConfirmDelete') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerText = 'Eliminando...';

  try {
    await deletePokemon(pendingId);
    closeDeleteModal();
    showToast(`🗑️ Pokémon #${pendingId} eliminado del catálogo.`);
    await loadAdminData();
  } catch (err: any) {
    if (err?.status === 401) {
      showToast('❌ Sesión de administrador expirada o inválida (401). Reautenticando...', true);
      clearAdminSession();
      closeDeleteModal();
      openAuthModal();
      return;
    }
    showToast(`Error al eliminar: ${err?.message || err}`, true);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Sí, Eliminar';
  }
}

export async function invalidateCache(): Promise<void> {
  showToast('⚡ Invalidando y sincronizando caché de Redis...');
  try {
    await loadAdminData();
    showToast('🎉 Caché sincronizada correctamente.');
  } catch (err: any) {
    showToast(`Error al sincronizar: ${err?.message || err}`, true);
  }
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

export function initEventListeners(): void {
  bindBackofficeEvents({
    onFormSubmit: handleFormSubmit,
    onAuthSubmit: handleAuthSubmit,
    onOpenAuth: openAuthModal,
    onSyncCache: invalidateCache,
    onOpenCreate: openCreateModal,
    onClearKey: clearAdminSession,
    onConfirmDelete: executeDelete,
    onPrevPage: () => changeAdminPage(-1),
    onNextPage: () => changeAdminPage(1),
    onSearch: handleAdminSearch,
    onTypeFilter: handleAdminTypeFilter,
    onPageSizeChange: handlePageSizeChange,
    onCloseCrud: closeCrudModal,
    onCloseDelete: closeDeleteModal,
    onCloseAuth: closeAuthModal,
    onEditClick: (id) => openEditModal(id),
    onDeleteClick: (id) => openDeleteModal(id),
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    checkAdminSession();
    loadAdminData();
    checkHealthStatus();
    setInterval(checkHealthStatus, 15000);
  });
} else {
  initEventListeners();
  checkAdminSession();
  loadAdminData();
  checkHealthStatus();
  setInterval(checkHealthStatus, 15000);
}
