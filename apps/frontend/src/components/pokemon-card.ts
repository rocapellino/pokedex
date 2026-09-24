/**
 * Componente Tarjeta de Pokémon para el Catálogo Público
 */

import { escapeText } from '../sanitizer.js';
import type { Pokemon, EvolutionNode } from '../types.js';
import { normalizeStr, getGeneration } from '../shared/index.js';

export function renderPokemonCard(p: Pokemon): string {
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
        <img src="${safeImg}" alt="${escapeText(p.nombre)}" class="pokemon-img" loading="lazy" crossorigin="anonymous">
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
}
