/**
 * Componente Modal de Detalle de Pokémon
 * Renderiza atributos avanzados, debilidades, ecualizador de estadísticas y árbol de evoluciones.
 */

import { sanitizeHtml, escapeText } from '../sanitizer.js';
import type { Pokemon, PokemonStats } from '../types.js';
import { normalizeStr } from '../shared/index.js';

import { TYPE_WEAKNESSES, calculateWeaknesses } from '../shared/pokemon-types.js';
import {
  getTriggerIcon,
  renderTransitionConnector,
  renderSingleEvolutionNode,
  renderEvolutionSystem,
} from './modal-evolution.js';

// Re-exportar utilidades y constantes para retrocompatibilidad total
export {
  TYPE_WEAKNESSES,
  calculateWeaknesses,
  getTriggerIcon,
  renderTransitionConnector,
  renderSingleEvolutionNode,
  renderEvolutionSystem,
};

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
