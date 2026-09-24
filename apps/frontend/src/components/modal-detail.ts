/**
 * Componente Modal de Detalle de Pokémon
 * Renderiza atributos avanzados, debilidades, ecualizador de estadísticas y árbol de evoluciones.
 */

import { sanitizeHtml, escapeText } from '../sanitizer.js';
import type { Pokemon, EvolutionNode, PokemonStats } from '../types.js';
import { normalizeStr } from '../shared/index.js';

export const TYPE_WEAKNESSES: Record<string, string[]> = {
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

export function calculateWeaknesses(types: string[]): string[] {
  const weakSet = new Set<string>();
  types.forEach((t) => {
    const list = TYPE_WEAKNESSES[t] || [];
    list.forEach((w) => weakSet.add(w));
  });
  return Array.from(weakSet);
}

export function renderStatEqualizer(stats?: PokemonStats): string {
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

export function getTriggerIcon(metodo?: string | null): string {
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
  ) {
    return '💎';
  }
  if (m.includes('intercambio')) return '🔄';
  if (m.includes('amistad') || m.includes('felicidad')) return '💖';
  if (m.includes('movimiento') || m.includes('conociendo')) return '⚔️';
  if (m.includes('lluvia')) return '🌧️';
  if (m.includes('noche') || m.includes('sombras')) return '🌙';
  if (m.includes('día') || m.includes('solar')) return '☀️';
  return '⚡';
}

export function renderTransitionConnector(node?: EvolutionNode): string {
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

export function renderSingleEvolutionNode(
  node: EvolutionNode,
  currentId: number,
  showMethod = false,
  catalog: Pokemon[] = []
): string {
  const nodeId = Number(node.id) || 0;
  const isCurrent = nodeId === currentId;
  const formattedId = String(nodeId).padStart(4, '0');
  const targetPk = catalog.find((x) => x.id === nodeId);
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
        <img src="${safeImagen}" alt="${safeNombre}" class="evolution-circle-img" crossorigin="anonymous">
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

export function renderEvolutionSystem(evolData: any, currentId: number, catalog: Pokemon[] = []): string {
  if (Array.isArray(evolData)) {
    if (evolData.length <= 1) {
      return `
        <div class="pokedex-evolutions-official-panel">
          <div class="evolutions-panel-header">Evoluciones</div>
          <div class="evolutions-nodes-track">
            ${evolData.map((node) => renderSingleEvolutionNode(node, currentId, true, catalog)).join('')}
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
              return `${arrow}${renderSingleEvolutionNode(node, currentId, false, catalog)}`;
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
          ${renderSingleEvolutionNode(fallbackNode, currentId, false, catalog)}
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
          ${renderSingleEvolutionNode(root, currentId, false, catalog)}
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
            ${renderSingleEvolutionNode(root, currentId, false, catalog)}
          </div>
          <div class="branched-fork-indicator">
            <span class="fork-arrow-down">⬇️</span>
            <span>Evoluciones según atributo, piedra o método utilizado</span>
          </div>
          <div class="branched-children-grid">
            ${root.evolves_to.map((child) => renderSingleEvolutionNode(child, currentId, true, catalog)).join('')}
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
              return `${connector}${renderSingleEvolutionNode(node, currentId, false, catalog)}`;
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
              return `${connector}${renderSingleEvolutionNode(node, currentId, false, catalog)}`;
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
            ${branches.map((child) => renderSingleEvolutionNode(child, currentId, true, catalog)).join('')}
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;
}

export function renderDetailModalContent(pokemon: Pokemon, catalog: Pokemon[] = []): string {
  const car = pokemon.caracteristicas || {};
  const stats = pokemon.stats || { hp: 45, attack: 49, defense: 49, sp_attack: 65, sp_defense: 65, speed: 45 };
  const tipos = Array.isArray(pokemon.tipos) && pokemon.tipos.length > 0 ? pokemon.tipos : [pokemon.tipo || 'Normal'];
  const habilidades = Array.isArray(pokemon.habilidades) ? pokemon.habilidades : [pokemon.habilidades || 'Espesura'];
  const habilidadPrincipal = habilidades[0] || 'Espesura';
  const evoluciones = pokemon.evoluciones;
  const weaknesses = calculateWeaknesses(tipos);
  const formattedId = String(pokemon.id).padStart(4, '0');

  const desc =
    car.descripcion ||
    `${pokemon.nombre} es una especie de tipo ${tipos.join('/')} registrada en la Pokédex. Habita comúnmente en la región de ${
      car.habitat || 'Kanto'
    } y es reconocido por su desempeño en batalla.`;

  const evolutionsHtml = renderEvolutionSystem(evoluciones, pokemon.id, catalog);

  return `
    <div class="pokedex-notched-header">
      <h2 class="pokedex-notched-title">
        ${escapeText(pokemon.nombre)} <span class="pokedex-notched-number">N.º ${escapeText(formattedId)}</span>
      </h2>
      <button class="btn-icon modal-close-btn" aria-label="Cerrar modal">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="pokedex-entry-grid">
      <div class="pokedex-left-col">
        <div class="pokedex-artwork-box">
          <img src="${escapeText(pokemon.imagen || '')}" alt="${escapeText(pokemon.nombre)}" class="pokedex-artwork-img">
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
}

export function openDetailModal(id: number, catalog: Pokemon[]): void {
  const p = catalog.find((x) => x.id === id);
  if (!p) return;

  const detailTitle = document.getElementById('detailTitle');
  if (detailTitle?.parentElement) {
    detailTitle.parentElement.style.display = 'none';
  }

  const detailContent = document.getElementById('detailContent');
  if (!detailContent) return;

  const rawHtml = renderDetailModalContent(p, catalog);
  detailContent.innerHTML = sanitizeHtml(rawHtml);
  document.getElementById('detailModal')?.classList.add('active');
}

export function closeDetailModal(): void {
  document.getElementById('detailModal')?.classList.remove('active');
}
