/**
 * Pokédex Pública - Visualizador Dinámico de Pokémon
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

    let stageBadge = '';
    if (p.evoluciones) {
      if (Array.isArray(p.evoluciones) && p.evoluciones.length > 0) {
        const myNode = p.evoluciones.find(x => x.id === p.id);
        if (myNode && myNode.etapa) {
          stageBadge = `<span class="stage-badge">${escapeHTML(myNode.etapa)}</span>`;
        }
      } else if (p.evoluciones.arbol) {
        const findStageInTree = (n) => {
          if (!n) return null;
          if (n.id === p.id) return n.etapa;
          for (const c of (n.evolves_to || [])) {
            const res = findStageInTree(c);
            if (res) return res;
          }
          return null;
        };
        const stage = findStageInTree(p.evoluciones.arbol);
        if (stage) {
          stageBadge = `<span class="stage-badge">${escapeHTML(stage)}</span>`;
        }
      }
    }

    return `
      <article class="pokemon-card" style="--type-color: ${typeColor}; --card-glow: ${typeColor}25;" onclick="openDetailModal(${p.id})">
        <div class="card-header">
          <span class="pokemon-id">#${formattedId}</span>
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            ${stageBadge}
            <span class="gen-badge">Gen ${getGeneration(p.id)}</span>
          </div>
        </div>

        <div class="image-container">
          <img src="${escapeHTML(p.imagen)}" alt="${escapeHTML(p.nombre)}" class="pokemon-img" loading="lazy" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'">
        </div>

        <h2 class="pokemon-name">${escapeHTML(p.nombre)}</h2>
        
        <div style="text-align: center; margin-bottom: 0.5rem;">
          <span class="type-badge" style="background-color: ${typeColor};">
            ${escapeHTML(p.tipo)}
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
            <span class="stat-item-val">${escapeHTML(car.habitat || 'Kanto')}</span>
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

  const maxForce = list.reduce((max, p) => {
    const val = p.fuerza || p.caracteristicas?.fuerza || p.stats?.attack || 0;
    return Math.max(max, val);
  }, 0);
  const totalWeight = list.reduce((acc, p) => acc + (p.caracteristicas?.peso || 0), 0);
  const avgWeight = (totalWeight / list.length).toFixed(1);
  const uniqueTypes = new Set(list.map(p => p.tipo).filter(Boolean));

  document.getElementById('statMaxForce').innerText = maxForce;
  document.getElementById('statAvgWeight').innerText = `${avgWeight} kg`;
  document.getElementById('statTypesCount').innerText = uniqueTypes.size;
}

const OFFICIAL_TYPE_COLORS = {
  'Planta': '#78c850',
  'Veneno': '#a040a0',
  'Fuego': '#f08030',
  'Agua': '#6890f0',
  'Eléctrico': '#f8d030',
  'Hielo': '#98d8d8',
  'Lucha': '#c03028',
  'Tierra': '#e0c068',
  'Volador': '#a890f0',
  'Psíquico': '#f85888',
  'Psíquica': '#f85888',
  'Bicho': '#a8b820',
  'Roca': '#b8a038',
  'Fantasma': '#705898',
  'Dragón': '#7038f8',
  'Acero': '#b8b8d0',
  'Siniestro': '#705848',
  'Hada': '#ee99ac',
  'Normal': '#a8a878'
};

const TYPE_WEAKNESSES = {
  'Normal': ['Lucha'],
  'Fuego': ['Agua', 'Tierra', 'Roca'],
  'Agua': ['Planta', 'Eléctrico'],
  'Planta': ['Fuego', 'Volador', 'Hielo', 'Veneno', 'Bicho'],
  'Eléctrico': ['Tierra'],
  'Hielo': ['Fuego', 'Lucha', 'Roca', 'Acero'],
  'Lucha': ['Volador', 'Psíquico', 'Hada'],
  'Veneno': ['Tierra', 'Psíquico'],
  'Tierra': ['Agua', 'Planta', 'Hielo'],
  'Volador': ['Eléctrico', 'Hielo', 'Roca'],
  'Psíquico': ['Bicho', 'Fantasma', 'Siniestro'],
  'Psíquica': ['Bicho', 'Fantasma', 'Siniestro'],
  'Bicho': ['Fuego', 'Volador', 'Roca'],
  'Roca': ['Agua', 'Planta', 'Lucha', 'Tierra', 'Acero'],
  'Fantasma': ['Fantasma', 'Siniestro'],
  'Dragón': ['Hielo', 'Dragón', 'Hada'],
  'Acero': ['Fuego', 'Lucha', 'Tierra'],
  'Siniestro': ['Lucha', 'Bicho', 'Hada'],
  'Hada': ['Veneno', 'Acero']
};

function getOfficialTypeColor(type) {
  return OFFICIAL_TYPE_COLORS[type] || '#68a090';
}

function calculateWeaknesses(types) {
  const weakSet = new Set();
  types.forEach(t => {
    const list = TYPE_WEAKNESSES[t] || [];
    list.forEach(w => weakSet.add(w));
  });
  return Array.from(weakSet);
}

function renderStatEqualizer(stats) {
  const statDefs = [
    { key: 'hp', label: 'PS', max: 140 },
    { key: 'attack', label: 'Ataque', max: 140 },
    { key: 'defense', label: 'Defensa', max: 140 },
    { key: 'sp_attack', label: 'Ataque<br>Especial', max: 140 },
    { key: 'sp_defense', label: 'Defensa<br>Especial', max: 140 },
    { key: 'speed', label: 'Velocidad', max: 140 }
  ];

  return statDefs.map(s => {
    const val = stats ? (stats[s.key] || 50) : 50;
    const activeSegments = Math.min(15, Math.max(1, Math.round((val / s.max) * 15)));
    
    let segmentsHtml = '';
    for (let i = 1; i <= 15; i++) {
      const isActive = i <= activeSegments;
      segmentsHtml += `<div class="equalizer-segment ${isActive ? 'active' : ''}"></div>`;
    }

    return `
      <div class="equalizer-col">
        <div class="equalizer-bar-stack">
          ${segmentsHtml}
        </div>
        <div class="equalizer-label">${s.label}</div>
      </div>
    `;
  }).join('');
}

function getTriggerIcon(metodo) {
  if (!metodo) return '⬆️';
  const m = metodo.toLowerCase();
  if (m.includes('nivel')) return '📈';
  if (m.includes('piedra') || m.includes('usar') || m.includes('mineral') || m.includes('bloque') || m.includes('manzana') || m.includes('tetera') || m.includes('cuenco')) return '💎';
  if (m.includes('intercambio')) return '🔄';
  if (m.includes('amistad') || m.includes('felicidad')) return '💖';
  if (m.includes('movimiento') || m.includes('conociendo')) return '⚔️';
  if (m.includes('lluvia')) return '🌧️';
  if (m.includes('noche') || m.includes('sombras')) return '🌙';
  if (m.includes('día') || m.includes('solar')) return '☀️';
  return '⚡';
}

function renderTransitionConnector(node) {
  if (!node || !node.metodo) {
    return `<div class="evolution-transition-connector"><div class="evolution-chevron-arrow">&gt;</div></div>`;
  }
  return `
    <div class="evolution-transition-connector">
      <div class="evolution-trigger-badge" title="${node.metodo}">
        <span>${getTriggerIcon(node.metodo)}</span>
        <span>${node.metodo}</span>
      </div>
      <div class="evolution-chevron-arrow">&gt;</div>
    </div>
  `;
}

function renderSingleEvolutionNode(node, currentId, showMethod = false) {
  const isCurrent = (node.id === currentId);
  const formattedId = String(node.id).padStart(4, '0');
  const targetPk = allPokemons.find(x => x.id === node.id);
  const nodeTypes = targetPk && targetPk.tipos ? targetPk.tipos : (targetPk ? [targetPk.tipo] : ['Normal']);

  const methodBadge = (showMethod && node.metodo) 
    ? `<div class="evolution-method-tag" title="${node.metodo}">${getTriggerIcon(node.metodo)} ${node.metodo}</div>` 
    : '';

  return `
    <div class="evolution-node-item ${isCurrent ? 'active-current' : ''}" onclick="openDetailModal(${node.id})" title="${isCurrent ? 'Estás viendo a ' + node.nombre : 'Ver ficha de ' + node.nombre}">
      <div class="evolution-circle-frame">
        <img src="${node.imagen}" alt="${node.nombre}" class="evolution-circle-img" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'">
      </div>
      <div class="evolution-name-tag">
        ${node.nombre} <span class="evolution-number-sub">N.º ${formattedId}</span>
      </div>
      ${methodBadge}
      <div class="evolution-types-row">
        ${nodeTypes.map(t => `<span class="evolution-type-mini" style="background-color: ${getOfficialTypeColor(t)}">${t}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderEvolutionSystem(evolData, currentId) {
  // Manejo de compatibilidad si evolData es array antiguo o formato objeto nuevo
  if (Array.isArray(evolData)) {
    if (evolData.length <= 1) {
      return `
        <div class="pokedex-evolutions-official-panel">
          <div class="evolutions-panel-header">Evoluciones</div>
          <div class="evolutions-nodes-track">
            ${evolData.map(node => renderSingleEvolutionNode(node, currentId, true)).join('')}
          </div>
        </div>
      `;
    }
    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${evolData.map((node, idx) => {
            const arrow = idx > 0 ? renderTransitionConnector(node) : '';
            return `${arrow}${renderSingleEvolutionNode(node, currentId)}`;
          }).join('')}
        </div>
      </div>
    `;
  }

  if (!evolData || !evolData.arbol) {
    const fallbackNode = { id: currentId, nombre: 'Pokémon', imagen: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${currentId}.png` };
    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${renderSingleEvolutionNode(fallbackNode, currentId)}
        </div>
      </div>
    `;
  }

  const root = evolData.arbol;
  const isBranched = evolData.es_ramificada;

  // 1. Forma Única / Sin Evoluciones
  if (!root.evolves_to || root.evolves_to.length === 0) {
    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${renderSingleEvolutionNode(root, currentId)}
        </div>
      </div>
    `;
  }

  // 2. Cadena Ramificada Directa (ej: Eevee, Tyrogue, Applin)
  if (root.evolves_to.length > 1 && (!root.evolves_to[0].evolves_to || root.evolves_to[0].evolves_to.length === 0)) {
    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="branched-evolution-container">
          <div class="branched-parent-row">
            ${renderSingleEvolutionNode(root, currentId)}
          </div>
          <div class="branched-fork-indicator">
            <span class="fork-arrow-down">⬇️</span>
            <span>Evoluciones según atributo, piedra o método utilizado</span>
          </div>
          <div class="branched-children-grid">
            ${root.evolves_to.map(child => renderSingleEvolutionNode(child, currentId, true)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 3. Cadena Lineal (ej: Bulbasaur -> Ivysaur -> Venusaur)
  if (!isBranched) {
    const linearList = [];
    let cur = root;
    while (cur) {
      linearList.push(cur);
      cur = (cur.evolves_to && cur.evolves_to.length > 0) ? cur.evolves_to[0] : null;
    }

    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${linearList.map((node, idx) => {
            const connector = idx > 0 ? renderTransitionConnector(node) : '';
            return `${connector}${renderSingleEvolutionNode(node, currentId)}`;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 4. Ramificación en Fase Intermedia (ej: Gloom -> Vileplume/Bellossom, Poliwhirl -> Poliwrath/Politoed)
  const linearPrefix = [];
  let cur = root;
  while (cur && cur.evolves_to && cur.evolves_to.length === 1) {
    linearPrefix.push(cur);
    cur = cur.evolves_to[0];
  }
  if (cur) linearPrefix.push(cur);

  const branches = cur ? (cur.evolves_to || []) : [];

  return `
    <div class="pokedex-evolutions-official-panel">
      <div class="evolutions-panel-header">Evoluciones</div>
      <div class="branched-evolution-container">
        <div class="evolutions-nodes-track">
          ${linearPrefix.map((node, idx) => {
            const connector = idx > 0 ? renderTransitionConnector(node) : '';
            return `${connector}${renderSingleEvolutionNode(node, currentId)}`;
          }).join('')}
        </div>
        ${branches.length > 0 ? `
          <div class="branched-fork-indicator">
            <span class="fork-arrow-down">⬇️</span>
            <span>Evoluciones alternativas</span>
          </div>
          <div class="branched-children-grid">
            ${branches.map(child => renderSingleEvolutionNode(child, currentId, true)).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function openDetailModal(id) {
  const p = allPokemons.find(x => x.id === id);
  if (!p) return;

  const car = p.caracteristicas || {};
  const stats = p.stats || { hp: 45, attack: 49, defense: 49, sp_attack: 65, sp_defense: 65, speed: 45 };
  const tipos = Array.isArray(p.tipos) && p.tipos.length > 0 ? p.tipos : [p.tipo || 'Normal'];
  const habilidades = Array.isArray(p.habilidades) ? p.habilidades : [p.habilidades || 'Espesura'];
  const habilidadPrincipal = habilidades[0] || 'Espesura';
  const evoluciones = p.evoluciones;
  const weaknesses = calculateWeaknesses(tipos);
  const formattedId = String(p.id).padStart(4, '0');

  // Descripción oficial / Lore
  const desc = car.descripcion || `${p.nombre} es una especie de tipo ${tipos.join('/')} registrada en la Pokédex. Habita comúnmente en la región de ${p.habitat || 'Kanto'} y es reconocido por su desempeño en batalla.`;

  // Construcción del panel de evoluciones oficial
  const evolutionsHtml = renderEvolutionSystem(evoluciones, p.id);

  // Ocultar header genérico del modal para usar el header estilizado
  document.getElementById('detailTitle').parentElement.style.display = 'none';

  document.getElementById('detailContent').innerHTML = `
    <!-- Top Header Notched Bar -->
    <div class="pokedex-notched-header">
      <h2 class="pokedex-notched-title">
        ${escapeHTML(p.nombre)} <span class="pokedex-notched-number">N.º ${escapeHTML(formattedId)}</span>
      </h2>
      <button class="btn-icon" style="position: absolute; right: 1rem;" onclick="closeDetailModal()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- 2-Column Main Layout -->
    <div class="pokedex-entry-grid">
      <!-- Columna Izquierda: Arte y Puntos de Base -->
      <div class="pokedex-left-col">
        <div class="pokedex-artwork-box">
          <img src="${escapeHTML(p.imagen)}" alt="${escapeHTML(p.nombre)}" class="pokedex-artwork-img">
        </div>

        <div class="pokedex-stats-panel">
          <div class="stats-panel-title">Puntos de base</div>
          <div class="stats-equalizer-grid">
            ${renderStatEqualizer(stats)}
          </div>
        </div>
      </div>

      <!-- Columna Derecha: Lore, Info Azul, Tipos y Debilidades -->
      <div class="pokedex-right-col">
        <p class="pokedex-description-text">${escapeHTML(desc)}</p>

        <!-- Tarjeta Azul de Atributos -->
        <div class="pokedex-blue-card">
          <div class="blue-card-item">
            <span class="blue-card-label">Altura</span>
            <span class="blue-card-value">${(car.altura || 0.7).toString().replace('.', ',')} m</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Categoría</span>
            <span class="blue-card-value">${escapeHTML(car.categoria || p.habitat || 'Kanto')}</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Peso</span>
            <span class="blue-card-value">${(car.peso || 6.9).toString().replace('.', ',')} kg</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Habilidad</span>
            <span class="blue-card-value">
              ${escapeHTML(habilidadPrincipal)}
            </span>
          </div>
          <div class="blue-card-item" style="grid-column: 1 / -1;">
            <span class="blue-card-label">Género</span>
            <span class="gender-symbols">♂ ♀</span>
          </div>
        </div>

        <!-- Sección Tipo -->
        <div class="type-section-group">
          <h4 class="type-group-title">Tipo</h4>
          <div class="type-pill-badges-row">
            ${tipos.map(t => `<span class="official-type-pill" style="background-color: ${getOfficialTypeColor(t)}">${escapeHTML(t)}</span>`).join('')}
          </div>
        </div>

        <!-- Sección Debilidad -->
        <div class="type-section-group">
          <h4 class="type-group-title">Debilidad</h4>
          <div class="type-pill-badges-row">
            ${weaknesses.map(w => `<span class="official-type-pill" style="background-color: ${getOfficialTypeColor(w)}">${escapeHTML(w)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Panel Inferior Completo de Evoluciones -->
    ${evolutionsHtml}
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
