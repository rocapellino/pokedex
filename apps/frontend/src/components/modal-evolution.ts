/**
 * Componente de Evoluciones para Modal de Detalle
 * Renderiza el sistema de evoluciones oficial, lineal y ramificado.
 */

import type { Pokemon, EvolutionNode } from '../types.js';
import { FALLBACK_IMAGE, normalizeStr, html, type SafeHtml } from '../shared/index.js';

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

export function renderTransitionConnector(node?: EvolutionNode): SafeHtml {
  if (!node?.metodo) {
    return html`<div class="evolution-transition-connector"><div class="evolution-chevron-arrow">&gt;</div></div>`;
  }
  return html`
    <div class="evolution-transition-connector">
      <div class="evolution-trigger-badge" title="${node.metodo}">
        <span>${getTriggerIcon(node.metodo)}</span>
        <span>${node.metodo}</span>
      </div>
      <div class="evolution-chevron-arrow">&gt;</div>
    </div>
  `;
}

export function renderSingleEvolutionNode(
  node: EvolutionNode,
  currentId: number,
  showMethod = false,
  catalog: Pokemon[] = [],
): SafeHtml {
  const nodeId = Number(node.id) || 0;
  const isCurrent = nodeId === currentId;
  const formattedId = String(nodeId).padStart(4, '0');
  const targetPk = catalog.find((x) => x.id === nodeId);
  const nodeTypes = targetPk?.tipos ? targetPk.tipos : targetPk ? [targetPk.tipo] : ['Normal'];
  const nombre = node.nombre || 'Pokémon';
  const imagen = node.imagen || FALLBACK_IMAGE;

  const methodBadge =
    showMethod && node.metodo
      ? html`<div class="evolution-method-tag" title="${node.metodo}">${getTriggerIcon(node.metodo)} ${node.metodo}</div>`
      : html``;

  return html`
    <div class="evolution-node-item ${isCurrent ? 'active-current' : ''}" data-evol-id="${nodeId}"${
      isCurrent ? html` aria-current="true"` : html` role="button" tabindex="0"`
    } title="${isCurrent ? `Estás viendo a ${nombre}` : `Ver ficha de ${nombre}`}">
      <div class="evolution-circle-frame">
        <img src="${imagen}" alt="${nombre}" class="evolution-circle-img" crossorigin="anonymous">
      </div>
      <div class="evolution-name-tag">
        ${nombre} <span class="evolution-number-sub">N.º ${formattedId}</span>
      </div>
      ${methodBadge}
      <div class="evolution-types-row">
        ${nodeTypes.map((t) => html`<span class="evolution-type-mini" data-type="${normalizeStr(t)}">${t}</span>`)}
      </div>
    </div>
  `;
}

export function renderEvolutionSystem(
  evolData: Pokemon['evoluciones'],
  currentId: number,
  catalog: Pokemon[] = [],
): SafeHtml {
  if (Array.isArray(evolData)) {
    if (evolData.length <= 1) {
      return html`
        <div class="pokedex-evolutions-official-panel">
          <div class="evolutions-panel-header">Evoluciones</div>
          <div class="evolutions-nodes-track">
            ${evolData.map((node) => renderSingleEvolutionNode(node, currentId, true, catalog))}
          </div>
        </div>
      `;
    }
    return html`
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${evolData.map((node, idx) => {
            const arrow = idx > 0 ? renderTransitionConnector(node) : html``;
            return html`${arrow}${renderSingleEvolutionNode(node, currentId, false, catalog)}`;
          })}
        </div>
      </div>
    `;
  }

  if (!evolData?.arbol) {
    const fallbackNode: EvolutionNode = {
      id: currentId,
      nombre: 'Pokémon',
      imagen: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${currentId}.png`,
    };
    return html`
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
    return html`
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${renderSingleEvolutionNode(root, currentId, false, catalog)}
        </div>
      </div>
    `;
  }

  if (root.evolves_to.length > 1 && (!root.evolves_to[0].evolves_to || root.evolves_to[0].evolves_to.length === 0)) {
    return html`
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
            ${root.evolves_to.map((child) => renderSingleEvolutionNode(child, currentId, true, catalog))}
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

    return html`
      <div class="pokedex-evolutions-official-panel">
        <div class="evolutions-panel-header">Evoluciones</div>
        <div class="evolutions-nodes-track">
          ${linearList.map((node, idx) => {
            const connector = idx > 0 ? renderTransitionConnector(node) : html``;
            return html`${connector}${renderSingleEvolutionNode(node, currentId, false, catalog)}`;
          })}
        </div>
      </div>
    `;
  }

  const linearPrefix: EvolutionNode[] = [];
  let cur: EvolutionNode | null = root;
  while (cur?.evolves_to && cur.evolves_to.length === 1) {
    linearPrefix.push(cur);
    cur = cur.evolves_to[0];
  }
  if (cur) linearPrefix.push(cur);

  const branches = cur ? cur.evolves_to || [] : [];

  return html`
    <div class="pokedex-evolutions-official-panel">
      <div class="evolutions-panel-header">Evoluciones</div>
      <div class="branched-evolution-container">
        <div class="evolutions-nodes-track">
          ${linearPrefix.map((node, idx) => {
            const connector = idx > 0 ? renderTransitionConnector(node) : html``;
            return html`${connector}${renderSingleEvolutionNode(node, currentId, false, catalog)}`;
          })}
        </div>
        ${
          branches.length > 0
            ? html`
          <div class="branched-fork-indicator">
            <span class="fork-arrow-down">⬇️</span>
            <span>Evoluciones alternativas</span>
          </div>
          <div class="branched-children-grid">
            ${branches.map((child) => renderSingleEvolutionNode(child, currentId, true, catalog))}
          </div>
        `
            : html``
        }
      </div>
    </div>
  `;
}
