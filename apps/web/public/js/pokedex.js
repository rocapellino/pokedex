/**
 * Pokédex Pública - Visualizador Dinámico de Pokémon
 */

let allPokemons = [];
let filteredPokemons = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 48; // Rendimiento óptimo para renderizar en cuadrícula
let currentType = 'all';
let currentGeneration = 'all';
let searchQuery = '';

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

function getGeneration(id) {
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  if (id <= 386) return 3;
  if (id <= 493) return 4;
  if (id <= 649) return 5;
  if (id <= 721) return 6;
  if (id <= 809) return 7;
  if (id <= 905) return 8;
  return 9;
}

document.addEventListener('DOMContentLoaded', () => {
  loadPokemons();
});

async function loadPokemons() {
  const container = document.getElementById('pokemonGrid');
  try {
    const res = await fetch('/pokemons');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Error al conectar con la API`);
    allPokemons = await res.json();
    
    // Ordenar por ID ascendente
    allPokemons.sort((a, b) => a.id - b.id);
    
    applyFilters();
    showToast(`✅ Catálogo cargado: ${allPokemons.length} Pokémon listos.`);
  } catch (err) {
    console.error('Error al cargar datos:', err);
    showToast(`Error al cargar datos: ${err.message}`, true);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3 class="empty-title">Error al conectar con el backend</h3>
        <p class="empty-subtitle">${err.message}</p>
        <button class="btn btn-primary" onclick="loadPokemons()" style="margin-top: 1rem;">Reintentar Conexión</button>
      </div>
    `;
  }
}

function applyFilters() {
  filteredPokemons = allPokemons.filter(p => {
    // 1. Filtro de búsqueda
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = !term || 
      p.nombre.toLowerCase().includes(term) ||
      (p.tipo && p.tipo.toLowerCase().includes(term)) ||
      (Array.isArray(p.habilidades) && p.habilidades.some(h => h.toLowerCase().includes(term))) ||
      (p.caracteristicas && p.caracteristicas.habitat && p.caracteristicas.habitat.toLowerCase().includes(term)) ||
      String(p.id).includes(term);

    // 2. Filtro de tipo
    const matchesType = currentType === 'all' || (p.tipo && p.tipo.toLowerCase() === currentType.toLowerCase());

    // 3. Filtro de generación
    const gen = getGeneration(p.id);
    const matchesGen = currentGeneration === 'all' || gen === parseInt(currentGeneration, 10);

    return matchesSearch && matchesType && matchesGen;
  });

  currentPage = 1;
  renderPokemons();
  updateStats(filteredPokemons);
}

function handleSearch() {
  searchQuery = document.getElementById('searchInput').value;
  applyFilters();
}

function selectTypeFilter(type) {
  currentType = type;
  document.querySelectorAll('.type-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-type') === type);
  });
  applyFilters();
}

function handleGenerationChange() {
  currentGeneration = document.getElementById('generationFilter').value;
  applyFilters();
}

function renderPokemons() {
  const container = document.getElementById('pokemonGrid');
  const paginationBar = document.getElementById('paginationBar');

  if (filteredPokemons.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">No se encontraron Pokémon</h3>
        <p class="empty-subtitle">Intenta buscar con otro término, tipo o cambia de generación.</p>
      </div>
    `;
    paginationBar.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(filteredPokemons.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredPokemons.length);
  const currentBatch = filteredPokemons.slice(startIndex, endIndex);

  container.innerHTML = currentBatch.map(p => {
    const typeColor = getTypeColor(p.tipo);
    const car = p.caracteristicas || {};
    const formattedId = String(p.id).padStart(3, '0');

    return `
      <article class="pokemon-card" style="--type-color: ${typeColor}; --card-glow: ${typeColor}25;" onclick="openDetailModal(${p.id})">
        <div class="card-header">
          <span class="pokemon-id">#${formattedId}</span>
          <span class="gen-badge">Gen ${getGeneration(p.id)}</span>
        </div>

        <div class="image-container">
          <img src="${p.imagen}" alt="${p.nombre}" class="pokemon-img" loading="lazy" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'">
        </div>

        <h2 class="pokemon-name">${p.nombre}</h2>
        
        <div style="text-align: center; margin-bottom: 0.5rem;">
          <span class="type-badge" style="background-color: ${typeColor};">
            ${p.tipo}
          </span>
        </div>

        <div class="stats-matrix">
          <div class="stat-item">
            <span class="stat-item-label">Peso</span>
            <span class="stat-item-val">${car.peso || 0} kg</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Altura</span>
            <span class="stat-item-val">${car.altura || 0} m</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Fuerza</span>
            <span class="stat-item-val">${p.fuerza || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Región</span>
            <span class="stat-item-val">${car.habitat || 'Kanto'}</span>
          </div>
        </div>

        <div class="card-hint">
          <span>Toca para ver detalles completos</span>
        </div>
      </article>
    `;
  }).join('');

  // Actualizar controles de paginación
  if (totalPages > 1) {
    paginationBar.style.display = 'flex';
    document.getElementById('pageInfo').innerText = `Página ${currentPage} de ${totalPages} (${filteredPokemons.length} Pokémon)`;
    document.getElementById('btnPrevPage').disabled = (currentPage === 1);
    document.getElementById('btnNextPage').disabled = (currentPage === totalPages);
  } else {
    paginationBar.style.display = 'none';
  }
}

function changePage(delta) {
  const totalPages = Math.ceil(filteredPokemons.length / ITEMS_PER_PAGE);
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderPokemons();
    window.scrollTo({ top: 350, behavior: 'smooth' });
  }
}

function updateStats(list) {
  document.getElementById('statTotal').innerText = list.length;
  if (list.length === 0) {
    document.getElementById('statMaxForce').innerText = '0';
    document.getElementById('statAvgWeight').innerText = '0 kg';
    document.getElementById('statTypesCount').innerText = '0';
    return;
  }

  const maxForce = Math.max(...list.map(p => p.fuerza || 0));
  const totalWeight = list.reduce((acc, p) => acc + (p.caracteristicas?.peso || 0), 0);
  const avgWeight = (totalWeight / list.length).toFixed(1);
  const uniqueTypes = new Set(list.map(p => p.tipo).filter(Boolean));

  document.getElementById('statMaxForce').innerText = maxForce;
  document.getElementById('statAvgWeight').innerText = `${avgWeight} kg`;
  document.getElementById('statTypesCount').innerText = uniqueTypes.size;
}

function openDetailModal(id) {
  const p = allPokemons.find(x => x.id === id);
  if (!p) return;

  const typeColor = getTypeColor(p.tipo);
  const car = p.caracteristicas || {};
  const habilidades = Array.isArray(p.habilidades) ? p.habilidades : [p.habilidades || 'Ninguna'];

  document.getElementById('detailTitle').innerHTML = `#${String(p.id).padStart(3, '0')} - ${p.nombre}`;
  document.getElementById('detailContent').innerHTML = `
    <div class="detail-container">
      <div class="detail-hero" style="background: radial-gradient(circle, ${typeColor}30 0%, transparent 70%);">
        <img src="${p.imagen}" alt="${p.nombre}" class="detail-img">
      </div>
      
      <div class="detail-info">
        <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem;">
          <span class="type-badge" style="background-color: ${typeColor}; font-size: 0.95rem; padding: 0.35rem 0.9rem;">
            ${p.tipo}
          </span>
          <span class="gen-badge" style="font-size: 0.85rem;">Generación ${getGeneration(p.id)}</span>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-item-title">💪 Fuerza de Combate</span>
            <span class="detail-item-value">${p.fuerza || 0} pts</span>
          </div>
          <div class="detail-item">
            <span class="detail-item-title">⚖️ Peso</span>
            <span class="detail-item-value">${car.peso || 0} kg</span>
          </div>
          <div class="detail-item">
            <span class="detail-item-title">📏 Altura</span>
            <span class="detail-item-value">${car.altura || 0} m</span>
          </div>
          <div class="detail-item">
            <span class="detail-item-title">🏞️ Hábitat / Región</span>
            <span class="detail-item-value">${car.habitat || 'Kanto'}</span>
          </div>
        </div>

        <div style="margin-top: 1.25rem;">
          <span class="detail-item-title">⚡ Habilidades Especiales</span>
          <div class="abilities-list" style="margin-top: 0.4rem;">
            ${habilidades.map(h => `<span class="ability-pill">⚡ ${h}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
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
