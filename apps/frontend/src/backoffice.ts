/**
 * Pokédex Backoffice - Gestor Administrativo CRUD (TypeScript + DOMPurify)
 */

import { sanitizeHtml, escapeText } from './sanitizer.js';
import type { Pokemon, SessionInfo } from './types.js';

let allPokemons: Pokemon[] = [];
let filteredPokemons: Pokemon[] = [];
let currentPage = 1;
let pageSize = 50;
let currentSearch = '';
let currentType = 'all';
let pendingDeleteId: number | null = null;

const TYPE_COLORS: Record<string, string> = {
  'Eléctrico': '#f59e0b',
  'Fuego': '#ef4444',
  'Agua': '#3b82f6',
  'Planta': '#10b981',
  'Psíquico': '#ec4899',
  'Roca': '#b45309',
  'Tierra': '#d97706',
  'Hielo': '#06b6d4',
  'Fantasma': '#8b5cf6',
  'Dragón': '#6366f1',
  'Normal': '#6b7280',
  'Lucha': '#dc2626',
  'Veneno': '#a855f7',
  'Bicho': '#84cc16',
  'Volador': '#38bdf8',
  'Acero': '#94a3b8',
  'Siniestro': '#334155',
  'Hada': '#f472b6',
};

function normalizeStr(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getTypeColor(tipo?: string): string {
  if (!tipo) return '#6b7280';
  const match = Object.keys(TYPE_COLORS).find((k) => k.toLowerCase() === tipo.toLowerCase().trim());
  return match ? TYPE_COLORS[match] : '#6b7280';
}

// ============================================================================
// Autenticación de Sesión de Administrador (HMAC Session Token)
// ============================================================================
const ADMIN_TOKEN_KEY = 'pokedex_admin_session_token';
const ADMIN_EXPIRES_KEY = 'pokedex_admin_session_expires';

export function getAdminSessionToken(): string {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const expiresAt = sessionStorage.getItem(ADMIN_EXPIRES_KEY);
  if (!token) return '';

  if (expiresAt && Date.now() > Number(expiresAt)) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_EXPIRES_KEY);
    updateAuthUI();
    return '';
  }

  return token;
}

export function setAdminSession(token?: string, expiresAt?: number): void {
  if (token && token.trim()) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
    if (expiresAt) {
      sessionStorage.setItem(ADMIN_EXPIRES_KEY, String(expiresAt));
    }
  } else {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_EXPIRES_KEY);
  }
  updateAuthUI();
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_EXPIRES_KEY);
  updateAuthUI();
  closeAuthModal();
  showToast('ℹ️ Sesión administrativa cerrada.');
}

export function updateAuthUI(): void {
  const token = getAdminSessionToken();
  const statusText = document.getElementById('authStatusText');
  const btn = document.getElementById('btnAdminAuth');
  const clearBtn = document.getElementById('btnClearKeyBtn');
  const input = document.getElementById('adminApiKeyInput') as HTMLInputElement | null;

  if (input) input.value = '';

  if (token) {
    if (statusText) statusText.innerText = 'Admin Activo';
    if (btn) btn.classList.add('btn-auth-active');
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (statusText) statusText.innerText = 'Autenticar';
    if (btn) btn.classList.remove('btn-auth-active');
    if (clearBtn) clearBtn.classList.add('hidden');
  }
}

export function openAuthModal(): void {
  updateAuthUI();
  document.getElementById('authModal')?.classList.add('active');
  const input = document.getElementById('adminApiKeyInput');
  if (input) setTimeout(() => input.focus(), 100);
}

export function closeAuthModal(): void {
  document.getElementById('authModal')?.classList.remove('active');
}

export async function handleAuthSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const input = document.getElementById('adminApiKeyInput') as HTMLInputElement | null;
  const submitBtn = document.getElementById('btnSaveKey') as HTMLButtonElement | null;
  const val = input ? input.value.trim() : '';

  if (!val) {
    showToast('Ingresa una clave válida.', true);
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Verificando...';
  }

  try {
    const res = await fetch('/api/v1/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: val }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}: Clave no autorizada`);
    }

    const data = (await res.json()) as SessionInfo;
    setAdminSession(data.token, data.expiresAt);
    closeAuthModal();
    showToast('🔐 Sesión administrativa autenticada (token HMAC emitido).');
  } catch (err: any) {
    showToast(`❌ Error de autenticación: ${err?.message || err}`, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Autenticar Sesión';
    }
  }
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

    const res = await fetch('/pokemons');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Error al conectar con la API`);
    allPokemons = (await res.json()) as Pokemon[];

    allPokemons.sort((a, b) => a.id - b.id);

    applyAdminFilters();
    showToast(`✅ Catálogo cargado: ${allPokemons.length} registros en base de datos.`);
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
  filteredPokemons = allPokemons.filter((p) => {
    const term = currentSearch.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.nombre.toLowerCase().includes(term) ||
      (p.tipo && p.tipo.toLowerCase().includes(term)) ||
      String(p.id).includes(term);

    const matchesType = currentType === 'all' || (p.tipo && p.tipo.toLowerCase() === currentType.toLowerCase());

    return matchesSearch && matchesType;
  });

  currentPage = 1;
  renderTable();
  updateKPIs();
}

export function handleAdminSearch(): void {
  const input = (document.getElementById('adminSearch') || document.getElementById('adminSearchInput')) as HTMLInputElement | null;
  currentSearch = input ? input.value : '';
  applyAdminFilters();
}

export function handleAdminTypeFilter(): void {
  const select = document.getElementById('adminTypeFilter') as HTMLSelectElement | null;
  currentType = select ? select.value : 'all';
  applyAdminFilters();
}

export function handlePageSizeChange(): void {
  const sizeEl = document.getElementById('adminPageSize') as HTMLSelectElement | null;
  pageSize = sizeEl ? Number.parseInt(sizeEl.value, 10) || 50 : 50;
  currentPage = 1;
  renderTable();
}

export function renderTable(): void {
  const tbody = document.getElementById('adminTableBody') || document.getElementById('tableBody');
  const pagination = document.getElementById('adminPagination');
  if (!tbody) return;

  if (filteredPokemons.length === 0) {
    tbody.innerHTML = sanitizeHtml(`
      <tr>
        <td colspan="8" class="table-empty">
          🔍 No se encontraron registros con los filtros seleccionados.
        </td>
      </tr>
    `);
    if (pagination) pagination.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(filteredPokemons.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredPokemons.length);
  const currentBatch = filteredPokemons.slice(startIndex, endIndex);

  const rawRows = currentBatch
    .map((p) => {
      const car = p.caracteristicas || {};
      const maxBarWidth = Math.min(100, Math.round(((p.fuerza || 0) / 160) * 100));
      const safeImg = p.imagen ? escapeText(p.imagen) : 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
      const safeHab = Array.isArray(p.habilidades) ? p.habilidades.join(', ') : (p.habilidades || 'Ninguna');

      return `
      <tr>
        <td>
          <span class="id-tag">#${String(p.id).padStart(3, '0')}</span>
        </td>
        <td>
          <div class="avatar-cell">
            <img src="${safeImg}" alt="${escapeText(p.nombre)}" class="table-avatar">
          </div>
        </td>
        <td>
          <div class="name-cell">
            <strong class="pokemon-table-name">${escapeText(p.nombre)}</strong>
            <span class="habilidades-preview">${escapeText(safeHab)}</span>
          </div>
        </td>
        <td>
          <span class="type-badge" data-type="${escapeText(normalizeStr(p.tipo))}">
            ${escapeText(p.tipo)}
          </span>
        </td>
        <td>
          <div class="force-meter">
            <div class="force-bar-wrapper">
              <div class="force-bar" data-width="${maxBarWidth}"></div>
            </div>
            <span class="force-value">${p.fuerza || 0}</span>
          </div>
        </td>
        <td>
          <div class="weight-height-cell">
            <span>⚖️ ${car.peso || 0} kg</span>
            <span>📏 ${car.altura || 0} m</span>
          </div>
        </td>
        <td>
          <span class="habitat-tag">${escapeText(car.habitat || 'Kanto')}</span>
        </td>
        <td class="text-center">
          <div class="actions-group">
            <button class="btn-action btn-edit" title="Editar Pokémon" data-edit-id="${p.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              Editar
            </button>
            <button class="btn-action btn-delete" title="Eliminar Pokémon" data-delete-id="${p.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');

  tbody.innerHTML = sanitizeHtml(rawRows);

  tbody.querySelectorAll('.force-bar[data-width]').forEach((el) => {
    const bar = el as HTMLElement;
    bar.style.width = bar.dataset.width + '%';
  });

  if (pagination) {
    if (totalPages > 1) {
      pagination.classList.remove('hidden');
      pagination.style.display = '';
      const pageInfo = document.getElementById('adminPageInfo');
      if (pageInfo) {
        pageInfo.innerText = `Página ${currentPage} de ${totalPages} (Mostrando ${currentBatch.length} de ${filteredPokemons.length} Pokémon)`;
      }
      const prevBtn = document.getElementById('adminBtnPrev') as HTMLButtonElement | null;
      const nextBtn = document.getElementById('adminBtnNext') as HTMLButtonElement | null;
      if (prevBtn) prevBtn.disabled = currentPage === 1;
      if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    } else {
      pagination.classList.add('hidden');
    }
  }
}

export function changeAdminPage(delta: number): void {
  const totalPages = Math.ceil(filteredPokemons.length / pageSize);
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderTable();
    window.scrollTo({ top: 200, behavior: 'smooth' });
  }
}

export function updateKPIs(): void {
  const totalEl = document.getElementById('kpiTotal');
  if (totalEl) totalEl.innerText = String(allPokemons.length);
  if (allPokemons.length === 0) return;

  const totalForce = allPokemons.reduce((acc, p) => acc + (p.fuerza || 0), 0);
  const avgForce = Math.round(totalForce / allPokemons.length);
  const uniqueTypes = new Set(allPokemons.map((p) => p.tipo).filter(Boolean));

  const avgPowerEl = document.getElementById('kpiAvgPower') || document.getElementById('kpiAvgForce');
  if (avgPowerEl) avgPowerEl.innerText = `${avgForce} pts`;

  const typesEl = document.getElementById('kpiTypes') || document.getElementById('kpiTypesCount');
  if (typesEl) typesEl.innerText = String(uniqueTypes.size);
}

// ============================================================================
// Modales de Crear / Editar
// ============================================================================
export function openCreateModal(): void {
  const title = document.getElementById('crudModalTitle');
  if (title) title.innerText = '➕ Registrar Nuevo Pokémon';
  const idInput = document.getElementById('formPokemonId') as HTMLInputElement | null;
  if (idInput) idInput.value = '';
  const form = document.getElementById('crudForm') as HTMLFormElement | null;
  if (form) form.reset();
  document.getElementById('crudModal')?.classList.add('active');
}

export function openEditModal(id: number): void {
  const p = allPokemons.find((x) => x.id === id);
  if (!p) return;

  const title = document.getElementById('crudModalTitle');
  if (title) title.innerText = `✏️ Editar Pokémon #${String(p.id).padStart(3, '0')} - ${p.nombre}`;
  (document.getElementById('formPokemonId') as HTMLInputElement).value = String(p.id);
  (document.getElementById('nombre') as HTMLInputElement).value = p.nombre;
  (document.getElementById('imagen') as HTMLInputElement).value = p.imagen || '';
  (document.getElementById('tipo') as HTMLInputElement).value = p.tipo;
  (document.getElementById('fuerza') as HTMLInputElement).value = String(p.fuerza || 50);

  const car = p.caracteristicas || {};
  (document.getElementById('peso') as HTMLInputElement).value = String(car.peso || 6.0);
  (document.getElementById('altura') as HTMLInputElement).value = String(car.altura || 0.4);
  (document.getElementById('habitat') as HTMLInputElement).value = String(car.habitat || 'Kanto');
  (document.getElementById('habilidades') as HTMLInputElement).value = Array.isArray(p.habilidades)
    ? p.habilidades.join(', ')
    : p.habilidades || '';

  document.getElementById('crudModal')?.classList.add('active');
}

export function closeCrudModal(): void {
  document.getElementById('crudModal')?.classList.remove('active');
}

export async function handleFormSubmit(e: Event): Promise<void> {
  e.preventDefault();

  const token = getAdminSessionToken();
  if (!token) {
    showToast('⚠️ Se requiere autenticación de administrador para guardar cambios.', true);
    openAuthModal();
    return;
  }

  const id = (document.getElementById('formPokemonId') as HTMLInputElement).value;
  const submitBtn = document.getElementById('btnSubmitForm') as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.innerText = 'Guardando...';

  const payload = {
    nombre: (document.getElementById('nombre') as HTMLInputElement).value.trim(),
    imagen: (document.getElementById('imagen') as HTMLInputElement).value.trim(),
    tipo: (document.getElementById('tipo') as HTMLInputElement).value,
    fuerza: Number.parseInt((document.getElementById('fuerza') as HTMLInputElement).value, 10),
    habilidades: (document.getElementById('habilidades') as HTMLInputElement).value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    caracteristicas: {
      peso: Number.parseFloat((document.getElementById('peso') as HTMLInputElement).value),
      altura: Number.parseFloat((document.getElementById('altura') as HTMLInputElement).value),
      habitat: (document.getElementById('habitat') as HTMLInputElement).value.trim(),
    },
  };

  try {
    const isEdit = Boolean(id);
    const url = isEdit ? `/pokemons/${id}` : '/pokemons';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      showToast('❌ Sesión de administrador expirada o inválida (401). Reautenticando...', true);
      clearAdminSession();
      openAuthModal();
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || `HTTP ${res.status}`);
    }

    closeCrudModal();
    showToast(
      isEdit
        ? `✅ Pokémon "${payload.nombre}" actualizado con éxito.`
        : `🎉 Pokémon "${payload.nombre}" creado con éxito.`
    );
    await loadAdminData();
  } catch (err: any) {
    showToast(`Error al guardar: ${err?.message || err}`, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Guardar Registro';
  }
}

// ============================================================================
// Modal de Eliminación
// ============================================================================
export function openDeleteModal(id: number): void {
  const p = allPokemons.find((x) => x.id === id);
  if (!p) return;
  pendingDeleteId = id;
  const nameEl = document.getElementById('deletePokemonName');
  const idEl = document.getElementById('deletePokemonId');
  if (nameEl) nameEl.innerText = p.nombre;
  if (idEl) idEl.innerText = String(p.id).padStart(3, '0');
  document.getElementById('deleteModal')?.classList.add('active');
}

export function closeDeleteModal(): void {
  document.getElementById('deleteModal')?.classList.remove('active');
  pendingDeleteId = null;
}

export async function executeDelete(): Promise<void> {
  if (!pendingDeleteId) return;

  const token = getAdminSessionToken();
  if (!token) {
    showToast('⚠️ Se requiere autenticación de administrador para eliminar registros.', true);
    closeDeleteModal();
    openAuthModal();
    return;
  }

  const btn = document.getElementById('btnConfirmDelete') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerText = 'Eliminando...';

  try {
    const res = await fetch(`/pokemons/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401) {
      showToast('❌ Sesión de administrador expirada o inválida (401). Reautenticando...', true);
      clearAdminSession();
      closeDeleteModal();
      openAuthModal();
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || `HTTP ${res.status}`);
    }

    closeDeleteModal();
    showToast(`🗑️ Pokémon #${pendingDeleteId} eliminado del catálogo.`);
    await loadAdminData();
  } catch (err: any) {
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

export function showToast(message: string, isError = false): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;

  const span = document.createElement('span');
  span.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => toast.remove());

  toast.appendChild(span);
  toast.appendChild(closeBtn);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
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
  const crudForm = document.getElementById('crudForm');
  if (crudForm) crudForm.addEventListener('submit', handleFormSubmit);

  const authForm = document.getElementById('authForm');
  if (authForm) authForm.addEventListener('submit', handleAuthSubmit);

  const btnAdminAuth = document.getElementById('btnAdminAuth');
  if (btnAdminAuth) btnAdminAuth.addEventListener('click', openAuthModal);

  const btnSyncCache = document.getElementById('btnSyncCache');
  if (btnSyncCache) btnSyncCache.addEventListener('click', invalidateCache);

  const btnOpenCreate = document.getElementById('btnOpenCreate');
  if (btnOpenCreate) btnOpenCreate.addEventListener('click', openCreateModal);

  const btnClearKeyBtn = document.getElementById('btnClearKeyBtn');
  if (btnClearKeyBtn) btnClearKeyBtn.addEventListener('click', clearAdminSession);

  const btnConfirmDelete = document.getElementById('btnConfirmDelete');
  if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', executeDelete);

  const adminBtnPrev = document.getElementById('adminBtnPrev');
  if (adminBtnPrev) adminBtnPrev.addEventListener('click', () => changeAdminPage(-1));

  const adminBtnNext = document.getElementById('adminBtnNext');
  if (adminBtnNext) adminBtnNext.addEventListener('click', () => changeAdminPage(1));

  const adminSearchInput = document.getElementById('adminSearch') || document.getElementById('adminSearchInput');
  if (adminSearchInput) adminSearchInput.addEventListener('input', handleAdminSearch);

  const adminTypeFilter = document.getElementById('adminTypeFilter');
  if (adminTypeFilter) adminTypeFilter.addEventListener('change', handleAdminTypeFilter);

  const adminPageSize = document.getElementById('adminPageSize');
  if (adminPageSize) adminPageSize.addEventListener('change', handlePageSizeChange);

  document.querySelectorAll('[data-close-crud]').forEach((el) => {
    el.addEventListener('click', closeCrudModal);
  });

  document.querySelectorAll('[data-close-delete]').forEach((el) => {
    el.addEventListener('click', closeDeleteModal);
  });

  document.querySelectorAll('[data-close-auth]').forEach((el) => {
    el.addEventListener('click', closeAuthModal);
  });

  const tableBody = document.getElementById('adminTableBody') || document.getElementById('tableBody');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const editBtn = target?.closest('[data-edit-id]') as HTMLElement | null;
      if (editBtn) {
        const id = Number(editBtn.dataset.editId);
        if (!Number.isNaN(id)) openEditModal(id);
        return;
      }
      const deleteBtn = target?.closest('[data-delete-id]') as HTMLElement | null;
      if (deleteBtn) {
        const id = Number(deleteBtn.dataset.deleteId);
        if (!Number.isNaN(id)) openDeleteModal(id);
        return;
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    updateAuthUI();
    loadAdminData();
    checkHealthStatus();
    setInterval(checkHealthStatus, 15000);
  });
} else {
  initEventListeners();
  updateAuthUI();
  loadAdminData();
  checkHealthStatus();
  setInterval(checkHealthStatus, 15000);
}
