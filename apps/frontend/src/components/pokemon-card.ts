/**
 * Componente Tarjeta de Pokémon para el Catálogo Público
 */

import type { Pokemon, EvolutionNode } from '../types.js';
import {
  FALLBACK_IMAGE,
  CLASSIFICATION_LABELS,
  getClassification,
  getGeneration,
  hasMegaEvolution,
  html,
  normalizeStr,
  type SafeHtml,
} from '../shared/index.js';

export function renderPokemonCard(p: Pokemon): SafeHtml {
  const car = p.caracteristicas || {};
  const formattedId = String(p.id).padStart(3, '0');

  let stageBadge = html``;
  if (p.evoluciones) {
    if (Array.isArray(p.evoluciones) && p.evoluciones.length > 0) {
      const myNode = p.evoluciones.find((x) => x.id === p.id);
      if (myNode?.etapa) {
        stageBadge = html`<span class="stage-badge">${myNode.etapa}</span>`;
      }
    } else if ((p.evoluciones as { arbol?: EvolutionNode }).arbol) {
      const findStageInTree = (n?: EvolutionNode): string | null => {
        if (!n) return null;
        if (n.id === p.id && n.etapa) return n.etapa;
        for (const c of n.evolves_to || []) {
          const res = findStageInTree(c);
          if (res) return res;
        }
        return null;
      };
      const stage = findStageInTree((p.evoluciones as { arbol?: EvolutionNode }).arbol);
      if (stage) {
        stageBadge = html`<span class="stage-badge">${stage}</span>`;
      }
    }
  }

  const megaBadge = hasMegaEvolution(p)
    ? html`<span class="mega-badge" title="Tiene megaevolución">Mega</span>`
    : html``;

  const clase = getClassification(p);
  const classBadge = clase
    ? html`<span class="class-badge class-badge--${clase}" title="Pokémon ${CLASSIFICATION_LABELS[clase].toLowerCase()}">${CLASSIFICATION_LABELS[clase]}</span>`
    : html``;

  const normType = normalizeStr(p.tipo || 'normal');
  const safeImg = p.imagen || FALLBACK_IMAGE;

  return html`
    <article class="pokemon-card" data-pokemon-id="${p.id}" data-type="${normType}">
      <div class="card-header">
        <span class="pokemon-id">#${formattedId}</span>
        <div class="flex-center-gap">
          ${stageBadge}
          ${megaBadge}
          ${classBadge}
          <span class="gen-badge">Gen ${getGeneration(p.id)}</span>
        </div>
      </div>

      <div class="image-container">
        <img src="${safeImg}" alt="${p.nombre}" class="pokemon-img" loading="lazy" crossorigin="anonymous">
      </div>

      <h2 class="pokemon-name"><button type="button" class="card-open">${p.nombre}</button></h2>

      <div class="text-center mb-2">
        <span class="type-badge" data-type="${normType}">
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

      <div class="card-hint" aria-hidden="true">
        <span>Toca para ver detalles completos</span>
      </div>
    </article>
  `;
}
