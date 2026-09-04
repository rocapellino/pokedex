/**
 * Pokédex Backoffice - Gestor Administrativo CRUD
 */

/**
 * Sanitiza una cadena para evitar XSS al insertar datos del backend en innerHTML.
 * Siempre usar esta función en template literals con datos del servidor.
 */
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let allPokemons = [];
let filteredPokemons = [];
let currentPage = 1;
let pageSize = 50;
let currentSearch = '';
let currentType = 'all';
let pendingDeleteId = null;

const TYPE_COLORS = {
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
  'Hada': '#f472b6'
};

function getTypeColor(tipo) {
  if (!tipo) return '#6b7280';
  const match = Object.keys(TYPE_COLORS).find(k => k.toLowerCase() === tipo.toLowerCase().trim());
  return match ? TYPE_COLORS[match] : '#6b7280';
}

// ============================================================================
// Autenticación de Sesión (ADMIN_API_KEY)
// ============================================================================
const ADMIN_STORAGE_KEY = 'pokedex_admin_api_key';

function getAdminApiKey() {
  return sessionStorage.getItem(ADMIN_STORAGE_KEY) || '';
}

function setAdminApiKey(key) {
  if (key && key.trim()) {
    sessionStorage.setItem(ADMIN_STORAGE_KEY, key.trim());
  } else {
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  }
  updateAuthUI();
}

function clearAdminApiKey() {
  sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  updateAuthUI();
  closeAuthModal();
  showToast('ℹ️ Sesión administrativa cerrada.');
}

function updateAuthUI() {
  const key = getAdminApiKey();
  const statusText = document.getElementById('authStatusText');
  const btn = document.getElementById('btnAdminAuth');
  const clearBtn = document.getElementById('btnClearKeyBtn');
  const input = document.getElementById('adminApiKeyInput');

  if (key) {
    if (statusText) statusText.innerText = 'Admin Activo';
    if (btn) {
      btn.style.borderColor = '#10b981';
      btn.style.color = '#10b981';
    }
    if (clearBtn) clearBtn.style.display = 'inline-block';
    if (input) input.value = key;
  } else {
    if (statusText) statusText.innerText = 'Autenticar';
    if (btn) {
      btn.style.borderColor = '';
      btn.style.color = '';
    }
    if (clearBtn) clearBtn.style.display = 'none';
    if (input) input.value = '';
  }
}

function openAuthModal() {
  updateAuthUI();
  document.getElementById('authModal').classList.add('active');
  const input = document.getElementById('adminApiKeyInput');
  if (input) setTimeout(() => input.focus(), 100);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('adminApiKeyInput');
  const val = input ? input.value.trim() : '';
  if (!val) {
    showToast('Ingresa una clave válida.', true);
    return;
  }
  setAdminApiKey(val);
  closeAuthModal();
  showToast('🔐 Clave de administrador guardada en sesión activa.');
}

document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  loadAdminData();
  checkHealthStatus();
  setInterval(checkHealthStatus, 15000);
});

async function checkHealthStatus() {
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
  } catch (err) {
    statusEl.innerText = `Fallo en Healthcheck: ${err.message}`;
    dotEl.style.backgroundColor = '#ef4444';
    dotEl.style.boxShadow = '0 0 8px #ef4444';
  }
}

async function loadAdminData() {
  const tbody = document.getElementById('tableBody');
  try {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-loading">
          <div class="spinner"></div>
          <span>Cargando registros desde PostgreSQL...</span>
        </td>
      </tr>
    `;

    const res = await fetch('/pokemons');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Error al conectar con la API`);
    allPokemons = await res.json();
    
    // Ordenar por ID ascendente
    allPokemons.sort((a, b) => a.id - b.id);

    applyAdminFilters();
    showToast(`✅ Catálogo cargado: ${allPokemons.length} registros en base de datos.`);
  } catch (err) {
    console.error('Error al conectar con la API:', err);
    showToast(`Error al cargar datos: ${err.message}`, true);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty">
          <div style="color: #ef4444; font-size: 1.5rem; margin-bottom: 0.5rem;">⚠️</div>
          <strong>Error de conexión con la API</strong>
          <p class="text-muted">${err.message}</p>
        </td>
      </tr>
    `;
  }
}

function applyAdminFilters() {
  filteredPokemons = allPokemons.filter(p => {
    const term = currentSearch.toLowerCase().trim();
    const matchesSearch = !term ||
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

function handleAdminSearch() {
  currentSearch = document.getElementById('adminSearchInput').value;
  applyAdminFilters();
}

function handleAdminTypeFilter() {
  currentType = document.getElementById('adminTypeFilter').value;
  applyAdminFilters();
}

function handlePageSizeChange() {
  pageSize = parseInt(document.getElementById('adminPageSize').value, 10);
  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const pagination = document.getElementById('adminPagination');

  if (filteredPokemons.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty">
          🔍 No se encontraron registros con los filtros seleccionados.
        </td>
      </tr>
    `;
    pagination.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(filteredPokemons.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredPokemons.length);
  const currentBatch = filteredPokemons.slice(startIndex, endIndex);

  tbody.innerHTML = currentBatch.map(p => {
    const typeColor = getTypeColor(p.tipo);
    const car = p.caracteristicas || {};
    const maxBarWidth = Math.min(100, Math.round(((p.fuerza || 0) / 160) * 100));

    return `
      <tr>
        <td>
          <span class="id-tag">#${String(p.id).padStart(3, '0')}</span>
        </td>
        <td>
          <div class="avatar-cell">
            <img src="${escapeHTML(p.imagen)}" alt="${escapeHTML(p.nombre)}" class="table-avatar" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'">
          </div>
        </td>
        <td>
          <div class="name-cell">
            <strong class="pokemon-table-name">${escapeHTML(p.nombre)}</strong>
            <span class="habilidades-preview">${escapeHTML(Array.isArray(p.habilidades) ? p.habilidades.join(', ') : (p.habilidades || 'Ninguna'))}</span>
          </div>
        </td>
        <td>
          <span class="type-badge" style="background-color: ${typeColor};">
            ${escapeHTML(p.tipo)}
          </span>
        </td>
        <td>
          <div class="force-meter">
            <div class="force-bar-wrapper">
              <div class="force-bar" style="width: ${maxBarWidth}%;"></div>
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
          <span class="habitat-tag">${escapeHTML(car.habitat || 'Kanto')}</span>
        </td>
        <td style="text-align: center;">
          <div class="actions-group">
            <button class="btn-action btn-edit" title="Editar Pokémon" onclick="openEditModal(${p.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              Editar
            </button>
            <button class="btn-action btn-delete" title="Eliminar Pokémon" onclick="openDeleteModal(${p.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (totalPages > 1) {
    pagination.style.display = 'flex';
    document.getElementById('adminPageInfo').innerText = `Página ${currentPage} de ${totalPages} (Mostrando ${currentBatch.length} de ${filteredPokemons.length} Pokémon)`;
    document.getElementById('adminBtnPrev').disabled = (currentPage === 1);
    document.getElementById('adminBtnNext').disabled = (currentPage === totalPages);
  } else {
    pagination.style.display = 'none';
  }
}

function changeAdminPage(delta) {
  const totalPages = Math.ceil(filteredPokemons.length / pageSize);
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderTable();
    window.scrollTo({ top: 200, behavior: 'smooth' });
  }
}

function updateKPIs() {
  document.getElementById('kpiTotal').innerText = allPokemons.length;
  if (allPokemons.length === 0) return;

  const totalForce = allPokemons.reduce((acc, p) => acc + (p.fuerza || 0), 0);
  const avgForce = Math.round(totalForce / allPokemons.length);
  const uniqueTypes = new Set(allPokemons.map(p => p.tipo).filter(Boolean));

  document.getElementById('kpiAvgForce').innerText = `${avgForce} pts`;
  document.getElementById('kpiTypesCount').innerText = uniqueTypes.size;
}

// ============================================================================
// Modales de Crear / Editar
// ============================================================================
function openCreateModal() {
  document.getElementById('crudModalTitle').innerText = '➕ Registrar Nuevo Pokémon';
  document.getElementById('formPokemonId').value = '';
  document.getElementById('crudForm').reset();
  document.getElementById('crudModal').classList.add('active');
}

function openEditModal(id) {
  const p = allPokemons.find(x => x.id === id);
  if (!p) return;

  document.getElementById('crudModalTitle').innerText = `✏️ Editar Pokémon #${String(p.id).padStart(3, '0')} - ${p.nombre}`;
  document.getElementById('formPokemonId').value = p.id;
  document.getElementById('nombre').value = p.nombre;
  document.getElementById('imagen').value = p.imagen;
  document.getElementById('tipo').value = p.tipo;
  document.getElementById('fuerza').value = p.fuerza || 50;

  const car = p.caracteristicas || {};
  document.getElementById('peso').value = car.peso || 6.0;
  document.getElementById('altura').value = car.altura || 0.4;
  document.getElementById('habitat').value = car.habitat || 'Kanto';
  document.getElementById('habilidades').value = Array.isArray(p.habilidades) ? p.habilidades.join(', ') : (p.habilidades || '');

  document.getElementById('crudModal').classList.add('active');
}

function closeCrudModal() {
  document.getElementById('crudModal').classList.remove('active');
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const adminKey = getAdminApiKey();
  if (!adminKey) {
    showToast('⚠️ Se requiere autenticación de administrador para guardar cambios.', true);
    openAuthModal();
    return;
  }

  const id = document.getElementById('formPokemonId').value;
  const submitBtn = document.getElementById('btnSubmitForm');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Guardando...';

  const payload = {
    nombre: document.getElementById('nombre').value.trim(),
    imagen: document.getElementById('imagen').value.trim(),
    tipo: document.getElementById('tipo').value,
    fuerza: parseInt(document.getElementById('fuerza').value, 10),
    habilidades: document.getElementById('habilidades').value.split(',').map(s => s.trim()).filter(Boolean),
    caracteristicas: {
      peso: parseFloat(document.getElementById('peso').value),
      altura: parseFloat(document.getElementById('altura').value),
      habitat: document.getElementById('habitat').value.trim()
    }
  };

  try {
    const isEdit = Boolean(id);
    const url = isEdit ? `/pokemons/${id}` : '/pokemons';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': adminKey
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 401) {
      showToast('❌ Clave de administrador inválida o no configurada (401). Reautenticando...', true);
      clearAdminApiKey();
      openAuthModal();
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || `HTTP ${res.status}`);
    }

    closeCrudModal();
    showToast(isEdit ? `✅ Pokémon "${payload.nombre}" actualizado con éxito.` : `🎉 Pokémon "${payload.nombre}" creado con éxito.`);
    await loadAdminData();
  } catch (err) {
    showToast(`Error al guardar: ${err.message}`, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Guardar Registro';
  }
}

// ============================================================================
// Modal de Eliminación
// ============================================================================
function openDeleteModal(id) {
  const p = allPokemons.find(x => x.id === id);
  if (!p) return;
  pendingDeleteId = id;
  document.getElementById('deletePokemonName').innerText = p.nombre;
  document.getElementById('deletePokemonId').innerText = String(p.id).padStart(3, '0');
  document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('active');
  pendingDeleteId = null;
}

async function executeDelete() {
  if (!pendingDeleteId) return;

  const adminKey = getAdminApiKey();
  if (!adminKey) {
    showToast('⚠️ Se requiere autenticación de administrador para eliminar registros.', true);
    closeDeleteModal();
    openAuthModal();
    return;
  }

  const btn = document.getElementById('btnConfirmDelete');
  btn.disabled = true;
  btn.innerText = 'Eliminando...';

  try {
    const res = await fetch(`/pokemons/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': adminKey
      }
    });

    if (res.status === 401) {
      showToast('❌ Clave de administrador inválida o no configurada (401). Reautenticando...', true);
      clearAdminApiKey();
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
  } catch (err) {
    showToast(`Error al eliminar: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Sí, Eliminar';
  }
}

async function invalidateCache() {
  showToast('⚡ Invalidando y sincronizando caché de Redis...');
  try {
    await loadAdminData();
    showToast('🎉 Caché sincronizada correctamente.');
  } catch (err) {
    showToast(`Error al sincronizar: ${err.message}`, true);
  }
}

function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
