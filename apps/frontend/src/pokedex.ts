/**
 * Pokédex Pública - Visualizador Dinámico de Pokémon (TypeScript + DOMPurify)
 */

import { sanitizeHtml, escapeText } from './sanitizer.js';
import type { Pokemon, EvolutionNode, PokemonStats } from './types.js';

/**
 * Normaliza cadenas removiendo acentos, espacios y convirtiendo a minúsculas.
 */
function normalizeStr(str: unknown): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

let allPokemons: Pokemon[] = [];
let filteredPokemons: Pokemon[] = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 48;
let currentType = 'all';
let currentGeneration = 'all';
let searchQuery = '';

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

function getTypeColor(tipo?: string): string {
  if (!tipo) return '#6b7280';
  const match = Object.keys(TYPE_COLORS).find((k) => normalizeStr(k) === normalizeStr(tipo));
  return match ? TYPE_COLORS[match] : '#6b7280';
}

function getGeneration(id: number): number {
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

export async function loadPokemons(): Promise<void> {
  const container = document.getElementById('pokemonGrid');
  if (!container) return;
  try {
    const res = await fetch('/pokemons');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Error al conectar con la API`);
    allPokemons = (await res.json()) as Pokemon[];

    allPokemons.sort((a, b) => a.id - b.id);

    applyFilters();
    showToast(`✅ Catálogo cargado: ${allPokemons.length} Pokémon listos.`);
  } catch (err: any) {
    console.error('Error al cargar datos:', err);
    showToast(`Error al cargar datos: ${err?.message || err}`, true);
    container.innerHTML = sanitizeHtml(`
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3 class="empty-title">Error al conectar con el backend</h3>
        <p class="error-detail">${escapeText(err?.message || err)}</p>
        <button class="btn btn-primary mt-4" id="btnRetryConnection">Reintentar Conexión</button>
      </div>
    `);
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

  const rawHtml = currentBatch
    .map((p) => {
      const car = p.caracteristicas || {};
      const formattedId = String(p.id).padStart(3, '0');

      let stageBadge = '';
      if (p.evoluciones) {
        if (Array.isArray(p.evoluciones) && p.evoluciones.length > 0) {
          const myNode = p.evoluciones.find((x) => x.id === p.id);
          if (myNode && myNode.etapa) {
            stageBadge = `<span class="stage-badge">${escapeText(myNode.etapa)}</span>`;
          }
        } else if ((p.evoluciones as any).arbol) {
          const findStageInTree = (n?: EvolutionNode): string | null => {
            if (!n) return null;
            if (n.id === p.id && n.etapa) return n.etapa;
            for (const c of n.evolves_to || []) {
              const res = findStageInTree(c);
              if (res) return res;
            }
            return null;
          };
          const stage = findStageInTree((p.evoluciones as any).arbol);
          if (stage) {
            stageBadge = `<span class="stage-badge">${escapeText(stage)}</span>`;
          }
        }
      }

      const normType = normalizeStr(p.tipo || 'normal');
      const safeImg = p.imagen ? escapeText(p.imagen) : 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
      return `
        <article class="pokemon-card" data-pokemon-id="${p.id}" data-type="${escapeText(normType)}">
          <div class="card-header">
            <span class="pokemon-id">#${formattedId}</span>
            <div class="flex-center-gap">
              ${stageBadge}
              <span class="gen-badge">Gen ${getGeneration(p.id)}</span>
            </div>
          </div>

          <div class="image-container">
            <img src="${safeImg}" alt="${escapeText(p.nombre)}" class="pokemon-img" loading="lazy">
          </div>

          <h2 class="pokemon-name">${escapeText(p.nombre)}</h2>
          
          <div class="text-center mb-2">
            <span class="type-badge" data-type="${escapeText(normType)}">
              ${escapeText(p.tipo)}
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
              <span class="stat-item-val">${escapeText(car.habitat || 'Kanto')}</span>
            </div>
          </div>

          <div class="card-hint">
            <span>Toca para ver detalles completos</span>
          </div>
        </article>
      `;
    })
    .join('');

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

const TYPE_WEAKNESSES: Record<string, string[]> = {
  Normal: ['Lucha'],
  Fuego: ['Agua', 'Tierra', 'Roca'],
  Agua: ['Planta', 'Eléctrico'],
  Planta: ['Fuego', 'Volador', 'Hielo', 'Veneno', 'Bicho'],
  Eléctrico: ['Tierra'],
  Hielo: ['Fuego', 'Lucha', 'Roca', 'Acero'],
  Lucha: ['Volador', 'Psíquico', 'Hada'],
  Veneno: ['Tierra', 'Psíquico'],
  Tierra: ['Agua', 'Planta', 'Hielo'],
  Volador: ['Eléctrico', 'Hielo', 'Roca'],
  Psíquico: ['Bicho', 'Fantasma', 'Siniestro'],
  Psíquica: ['Bicho', 'Fantasma', 'Siniestro'],
  Bicho: ['Fuego', 'Volador', 'Roca'],
  Roca: ['Agua', 'Planta', 'Lucha', 'Tierra', 'Acero'],
  Fantasma: ['Fantasma', 'Siniestro'],
  Dragón: ['Hielo', 'Dragón', 'Hada'],
  Acero: ['Fuego', 'Lucha', 'Tierra'],
  Siniestro: ['Lucha', 'Bicho', 'Hada'],
  Hada: ['Veneno', 'Acero'],
};

function calculateWeaknesses(types: string[]): string[] {
  const weakSet = new Set<string>();
  types.forEach((t) => {
    const list = TYPE_WEAKNESSES[t] || [];
    list.forEach((w) => weakSet.add(w));
  });
  return Array.from(weakSet);
}

function renderStatEqualizer(stats?: PokemonStats): string {
  const statDefs = [
    { key: 'hp', label: 'PS', max: 140 },
    { key: 'attack', label: 'Ataque', max: 140 },
    { key: 'defense', label: 'Defensa', max: 140 },
    { key: 'sp_attack', label: 'Ataque<br>Especial', max: 140 },
    { key: 'sp_defense', label: 'Defensa<br>Especial', max: 140 },
    { key: 'speed', label: 'Velocidad', max: 140 },
  ];

  return statDefs
    .map((s) => {
      const val = stats ? (stats[s.key] ?? 50) : 50;
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
    })
    .join('');
}

function getTriggerIcon(metodo?: string | null): string {
  if (!metodo) return '⬆️';
  const m = metodo.toLowerCase();
  if (m.includes('nivel')) return '📈';
  if (
    m.includes('piedra') ||
    m.includes('usar') ||
    m.includes('mineral') ||
    m.includes('bloque') ||
    m.includes('manzana') ||
    m.includes('tetera') ||
    m.includes('cuenco')
  )
    return '💎';
  if (m.includes('intercambio')) return '🔄';
  if (m.includes('amistad') || m.includes('felicidad')) return '💖';
  if (m.includes('movimiento') || m.includes('conociendo')) return '⚔️';
  if (m.includes('lluvia')) return '🌧️';
  if (m.includes('noche') || m.includes('sombras')) return '🌙';
  if (m.includes('día') || m.includes('solar')) return '☀️';
  return '⚡';
}

function renderTransitionConnector(node?: EvolutionNode): string {
  if (!node || !node.metodo) {
    return `<div class="evolution-transition-connector"><div class="evolution-chevron-arrow">&gt;</div></div>`;
  }
  const safeMetodo = escapeText(node.metodo);
  return `
    <div class="evolution-transition-connector">
      <div class="evolution-trigger-badge" title="${safeMetodo}">
        <span>${getTriggerIcon(node.metodo)}</span>
        <span>${safeMetodo}</span>
      </div>
      <div class="evolution-chevron-arrow">&gt;</div>
    </div>
  `;
}

function renderSingleEvolutionNode(node: EvolutionNode, currentId: number, showMethod = false): string {
  const nodeId = Number(node.id) || 0;
  const isCurrent = nodeId === currentId;
  const formattedId = String(nodeId).padStart(4, '0');
  const targetPk = allPokemons.find((x) => x.id === nodeId);
  const nodeTypes = targetPk && targetPk.tipos ? targetPk.tipos : targetPk ? [targetPk.tipo] : ['Normal'];
  const safeNombre = escapeText(node.nombre || 'Pokémon');
  const safeImagen = escapeText(
    node.imagen || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'
  );
  const safeMetodo = node.metodo ? escapeText(node.metodo) : '';

  const methodBadge =
    showMethod && node.metodo
      ? `<div class="evolution-method-tag" title="${safeMetodo}">${getTriggerIcon(node.metodo)} ${safeMetodo}</div>`
      : '';

  return `
    <div class="evolution-node-item ${isCurrent ? 'active-current' : ''}" data-evol-id="${nodeId}" title="${
      isCurrent ? 'Estás viendo a ' + safeNombre : 'Ver ficha de ' + safeNombre
    }">
      <div class="evolution-circle-frame">
        <img src="${safeImagen}" alt="${safeNombre}" class="evolution-circle-img">
      </div>
      <div class="evolution-name-tag">
        ${safeNombre} <span class="evolution-number-sub">N.º ${escapeText(formattedId)}</span>
      </div>
      ${methodBadge}
      <div class="evolution-types-row">
        ${nodeTypes
          .map((t) => `<span class="evolution-type-mini" data-type="${escapeText(normalizeStr(t))}">${escapeText(t)}</span>`)
          .join('')}
      </div>
    </div>
  `;
}

function renderEvolutionSystem(evolData: any, currentId: number): string {
  if (Array.isArray(evolData)) {
    if (evolData.length <= 1) {
      return `
        <div class="pokedex-evolutions-official-panel">
          <div class="evolutions-panel-header">Evoluciones</div>
          <div class="evolutions-nodes-track">
            ${evolData.map((node) => renderSingleEvolutionNode(node, currentId, true)).join('')}
          </div>
        </div>
      `;
    }
    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${evolData
            .map((node, idx) => {
              const arrow = idx > 0 ? renderTransitionConnector(node) : '';
              return `${arrow}${renderSingleEvolutionNode(node, currentId)}`;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  if (!evolData || !evolData.arbol) {
    const fallbackNode: EvolutionNode = {
      id: currentId,
      nombre: 'Pokémon',
      imagen: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${currentId}.png`,
    };
    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${renderSingleEvolutionNode(fallbackNode, currentId)}
        </div>
      </div>
    `;
  }

  const root: EvolutionNode = evolData.arbol;
  const isBranched = evolData.es_ramificada;

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
            ${root.evolves_to.map((child) => renderSingleEvolutionNode(child, currentId, true)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  if (!isBranched) {
    const linearList: EvolutionNode[] = [];
    let cur: EvolutionNode | null = root;
    while (cur) {
      linearList.push(cur);
      cur = cur.evolves_to && cur.evolves_to.length > 0 ? cur.evolves_to[0] : null;
    }

    return `
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${linearList
            .map((node, idx) => {
              const connector = idx > 0 ? renderTransitionConnector(node) : '';
              return `${connector}${renderSingleEvolutionNode(node, currentId)}`;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  const linearPrefix: EvolutionNode[] = [];
  let cur: EvolutionNode | null = root;
  while (cur && cur.evolves_to && cur.evolves_to.length === 1) {
    linearPrefix.push(cur);
    cur = cur.evolves_to[0];
  }
  if (cur) linearPrefix.push(cur);

  const branches = cur ? cur.evolves_to || [] : [];

  return `
    <div class="pokedex-evolutions-official-panel">
      <div class="evolutions-panel-header">Evoluciones</div>
      <div class="branched-evolution-container">
        <div class="evolutions-nodes-track">
          ${linearPrefix
            .map((node, idx) => {
              const connector = idx > 0 ? renderTransitionConnector(node) : '';
              return `${connector}${renderSingleEvolutionNode(node, currentId)}`;
            })
            .join('')}
        </div>
        ${
          branches.length > 0
            ? `
          <div class="branched-fork-indicator">
            <span class="fork-arrow-down">⬇️</span>
            <span>Evoluciones alternativas</span>
          </div>
          <div class="branched-children-grid">
            ${branches.map((child) => renderSingleEvolutionNode(child, currentId, true)).join('')}
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;
}

export function openDetailModal(id: number): void {
  const p = allPokemons.find((x) => x.id === id);
  if (!p) return;

  const car = p.caracteristicas || {};
  const stats = p.stats || { hp: 45, attack: 49, defense: 49, sp_attack: 65, sp_defense: 65, speed: 45 };
  const tipos = Array.isArray(p.tipos) && p.tipos.length > 0 ? p.tipos : [p.tipo || 'Normal'];
  const habilidades = Array.isArray(p.habilidades) ? p.habilidades : [p.habilidades || 'Espesura'];
  const habilidadPrincipal = habilidades[0] || 'Espesura';
  const evoluciones = p.evoluciones;
  const weaknesses = calculateWeaknesses(tipos);
  const formattedId = String(p.id).padStart(4, '0');

  const desc =
    car.descripcion ||
    `${p.nombre} es una especie de tipo ${tipos.join('/')} registrada en la Pokédex. Habita comúnmente en la región de ${
      car.habitat || 'Kanto'
    } y es reconocido por su desempeño en batalla.`;

  const evolutionsHtml = renderEvolutionSystem(evoluciones, p.id);

  const detailTitle = document.getElementById('detailTitle');
  if (detailTitle?.parentElement) {
    detailTitle.parentElement.style.display = 'none';
  }

  const detailContent = document.getElementById('detailContent');
  if (!detailContent) return;

  const rawModalHtml = `
    <div class="pokedex-notched-header">
      <h2 class="pokedex-notched-title">
        ${escapeText(p.nombre)} <span class="pokedex-notched-number">N.º ${escapeText(formattedId)}</span>
      </h2>
      <button class="btn-icon modal-close-btn" aria-label="Cerrar modal">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="pokedex-entry-grid">
      <div class="pokedex-left-col">
        <div class="pokedex-artwork-box">
          <img src="${escapeText(p.imagen || '')}" alt="${escapeText(p.nombre)}" class="pokedex-artwork-img">
        </div>

        <div class="pokedex-stats-panel">
          <div class="stats-panel-title">Puntos de base</div>
          <div class="stats-equalizer-grid">
            ${renderStatEqualizer(stats)}
          </div>
        </div>
      </div>

      <div class="pokedex-right-col">
        <p class="pokedex-description-text">${escapeText(desc)}</p>

        <div class="pokedex-blue-card">
          <div class="blue-card-item">
            <span class="blue-card-label">Altura</span>
            <span class="blue-card-value">${((car.altura as number) || 0.7).toString().replace('.', ',')} m</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Categoría</span>
            <span class="blue-card-value">${escapeText(car.categoria || car.habitat || 'Kanto')}</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Peso</span>
            <span class="blue-card-value">${((car.peso as number) || 6.9).toString().replace('.', ',')} kg</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Habilidad</span>
            <span class="blue-card-value">
              ${escapeText(habilidadPrincipal)}
            </span>
          </div>
          <div class="blue-card-item col-span-full">
            <span class="blue-card-label">Género</span>
            <span class="gender-symbols">♂ ♀</span>
          </div>
        </div>

        <div class="type-section-group">
          <h4 class="type-group-title">Tipo</h4>
          <div class="type-pill-badges-row">
            ${tipos
              .map(
                (t) =>
                  `<span class="official-type-pill" data-type="${escapeText(normalizeStr(t))}">${escapeText(t)}</span>`
              )
              .join('')}
          </div>
        </div>

        <div class="type-section-group">
          <h4 class="type-group-title">Debilidad</h4>
          <div class="type-pill-badges-row">
            ${weaknesses
              .map(
                (w) =>
                  `<span class="official-type-pill" data-type="${escapeText(normalizeStr(w))}">${escapeText(w)}</span>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>

    ${evolutionsHtml}
  `;

  detailContent.innerHTML = sanitizeHtml(rawModalHtml);
  document.getElementById('detailModal')?.classList.add('active');
}

export function closeDetailModal(): void {
  document.getElementById('detailModal')?.classList.remove('active');
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
