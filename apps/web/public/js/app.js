let allPokemons = [];

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

async function loadPokemons() {
  try {
    const res = await fetch('/pokemons');
    if (!res.ok) throw new Error('Error al conectar con la API');
    allPokemons = await res.json();
    renderPokemons(allPokemons);
    updateStats(allPokemons);
  } catch (err) {
    showToast(`Error al cargar datos: ${err.message}`, true);
    document.getElementById('pokemonGrid').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3 class="empty-title">Error al conectar con el servidor</h3>
        <p class="empty-subtitle">${err.message}</p>
      </div>
    `;
  }
}

function renderPokemons(list) {
  const container = document.getElementById('pokemonGrid');
  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">No se encontraron Pokémon</h3>
        <p class="empty-subtitle">Intenta buscar con otro término o agrega un nuevo Pokémon al catálogo.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(p => {
    const typeColor = getTypeColor(p.tipo);
    const habilidades = Array.isArray(p.habilidades) ? p.habilidades : [p.habilidades];
    const car = p.caracteristicas || {};

    return `
      <article class="pokemon-card" style="--type-color: ${typeColor}; --card-glow: ${typeColor}25;">
        <div class="card-header">
          <span class="pokemon-id">#${String(p.id).padStart(3, '0')}</span>
          <div class="card-actions">
            <button class="btn-icon" title="Editar" onclick="openModal('edit', ${p.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Eliminar" onclick="deletePokemon(${p.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        <div class="image-container">
          <img src="${p.imagen}" alt="${p.nombre}" class="pokemon-img" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'">
        </div>

        <h2 class="pokemon-name">${p.nombre}</h2>
        <div>
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
            <span class="stat-item-val">${car.fuerza || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Hábitat</span>
            <span class="stat-item-val">${p.habitat || '-'}</span>
          </div>
        </div>

        <div class="skills-container">
          ${habilidades.map(h => `<span class="skill-pill">⚡ ${h}</span>`).join('')}
        </div>
      </article>
    `;
  }).join('');
}

function updateStats(pokemons) {
  document.getElementById('statTotal').innerText = pokemons.length;
  if (pokemons.length === 0) {
    document.getElementById('statMaxForce').innerText = 0;
    document.getElementById('statAvgWeight').innerText = '0 kg';
    document.getElementById('statTypesCount').innerText = 0;
    return;
  }

  const maxForce = Math.max(...pokemons.map(p => (p.caracteristicas?.fuerza || 0)));
  const avgWeight = (pokemons.reduce((acc, p) => acc + (p.caracteristicas?.peso || 0), 0) / pokemons.length).toFixed(1);
  const uniqueTypes = new Set(pokemons.map(p => p.tipo));

  document.getElementById('statMaxForce').innerText = maxForce;
  document.getElementById('statAvgWeight').innerText = `${avgWeight} kg`;
  document.getElementById('statTypesCount').innerText = uniqueTypes.size;
}

function filterPokemons() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderPokemons(allPokemons);
    return;
  }

  const filtered = allPokemons.filter(p => {
    const nombre = (p.nombre || '').toLowerCase();
    const tipo = (p.tipo || '').toLowerCase();
    const habs = (p.habilidades || []).join(' ').toLowerCase();
    return nombre.includes(q) || tipo.includes(q) || habs.includes(q);
  });

  renderPokemons(filtered);
}

function openModal(mode, id = null) {
  const modal = document.getElementById('pokemonModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('pokemonForm');
  form.reset();

  if (mode === 'create') {
    title.innerText = 'Nuevo Pokémon';
    document.getElementById('pokemonId').value = '';
  } else if (mode === 'edit' && id) {
    title.innerText = 'Editar Pokémon';
    const p = allPokemons.find(item => item.id === id);
    if (p) {
      document.getElementById('pokemonId').value = p.id;
      document.getElementById('nombre').value = p.nombre;
      document.getElementById('imagen').value = p.imagen;
      document.getElementById('tipo').value = p.tipo;
      document.getElementById('habitat').value = p.habitat;
      document.getElementById('peso').value = p.caracteristicas?.peso || '';
      document.getElementById('altura').value = p.caracteristicas?.altura || '';
      document.getElementById('fuerza').value = p.caracteristicas?.fuerza || '';
      document.getElementById('edad').value = p.caracteristicas?.edad || '';
      document.getElementById('habilidades').value = (p.habilidades || []).join(', ');
    }
  }

  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('pokemonModal').classList.remove('active');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('pokemonId').value;
  const habsInput = document.getElementById('habilidades').value;
  const habsArray = habsInput.split(',').map(s => s.trim()).filter(Boolean);

  const payload = {
    nombre: document.getElementById('nombre').value,
    imagen: document.getElementById('imagen').value,
    tipo: document.getElementById('tipo').value,
    habitat: document.getElementById('habitat').value,
    caracteristicas: {
      peso: parseFloat(document.getElementById('peso').value),
      altura: parseFloat(document.getElementById('altura').value),
      fuerza: parseInt(document.getElementById('fuerza').value),
      edad: parseInt(document.getElementById('edad').value)
    },
    habilidades: habsArray
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/pokemons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/pokemons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error procesando solicitud');
    }

    showToast(id ? 'Pokémon actualizado con éxito' : 'Pokémon creado con éxito');
    closeModal();
    loadPokemons();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deletePokemon(id) {
  if (!confirm(`¿Estás seguro de eliminar el Pokémon con ID #${id}?`)) return;

  try {
    const res = await fetch(`/pokemons/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar Pokémon');

    showToast(`Pokémon #${id} eliminado correctamente`);
    loadPokemons();
  } catch (err) {
    showToast(err.message, true);
  }
}

function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `
    <span>${isError ? '⚠️' : '✅'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

document.addEventListener('DOMContentLoaded', loadPokemons);
