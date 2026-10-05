/**
 * Componente Modal de Detalle de Pokémon
 * Renderiza atributos avanzados, debilidades, estadísticas base y árbol de evoluciones.
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

/** Máximo teórico de una estadística base en los juegos principales. */
const STAT_SCALE_MAX = 255;

const BASE_STAT_DEFS = [
  { key: 'hp', label: 'PS', name: 'PS' },
  { key: 'attack', label: 'Ataque', name: 'Ataque' },
  { key: 'defense', label: 'Defensa', name: 'Defensa' },
  { key: 'sp_attack', label: 'At. Esp.', name: 'Ataque especial' },
  { key: 'sp_defense', label: 'Def. Esp.', name: 'Defensa especial' },
  { key: 'speed', label: 'Velocidad', name: 'Velocidad' },
] as const;

function statTier(value: number): 'low' | 'mid' | 'high' | 'top' {
  if (value < 50) return 'low';
  if (value < 80) return 'mid';
  if (value < 110) return 'high';
  return 'top';
}

/** Ancho de la barra en pasos de 5 % (clases `base-stat-fill--wN`); la CSP impide `style` inline. */
function statWidthStep(value: number): number {
  return Math.min(100, Math.max(0, Math.round((value / STAT_SCALE_MAX) * 20) * 5));
}

function isValidStat(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function renderBaseStats(stats?: PokemonStats): string {
  if (!stats || !BASE_STAT_DEFS.some((s) => isValidStat(stats[s.key]))) {
    return '<p class="stats-empty">Sin estadísticas registradas</p>';
  }

  let total = 0;
  let complete = true;

  const rows = BASE_STAT_DEFS.map((s) => {
    const raw = stats[s.key];
    if (!isValidStat(raw)) {
      complete = false;
      return `
      <div class="base-stat-row" aria-label="${s.name}: sin datos">
        <span class="base-stat-name">${s.label}</span>
        <span class="base-stat-value">—</span>
        <div class="base-stat-track"></div>
      </div>`;
    }

    const value = Math.round(raw);
    total += value;
    return `
      <div class="base-stat-row" aria-label="${s.name}: ${value}">
        <span class="base-stat-name">${s.label}</span>
        <span class="base-stat-value">${value}</span>
        <div class="base-stat-track"><div class="base-stat-fill base-stat-fill--w${statWidthStep(value)} base-stat-tier--${statTier(value)}"></div></div>
      </div>`;
  }).join('');

  const totalRow = complete
    ? `
      <div class="base-stat-row base-stat-total" aria-label="Total: ${total}">
        <span class="base-stat-name">Total</span>
        <span class="base-stat-value">${total}</span>
      </div>`
    : '';

  return `<div class="stats-list">${rows}${totalRow}</div>`;
}

const UNKNOWN = '—';

function formatMeasure(value: unknown, unit: string): string {
  return isValidStat(value) && value > 0 ? `${String(value).replace('.', ',')} ${unit}` : UNKNOWN;
}

export function renderDetailModalContent(pokemon: Pokemon, catalog: Pokemon[] = []): string {
  const car = pokemon.caracteristicas || {};
  const tipos = Array.isArray(pokemon.tipos) && pokemon.tipos.length > 0 ? pokemon.tipos : [pokemon.tipo || 'Normal'];
  const habilidades = (Array.isArray(pokemon.habilidades) ? pokemon.habilidades : [pokemon.habilidades])
    .map((h) => (typeof h === 'string' ? h.trim() : ''))
    .filter(Boolean);
  const evoluciones = pokemon.evoluciones;
  const weaknesses = calculateWeaknesses(tipos);
  const formattedId = String(pokemon.id).padStart(4, '0');

  const desc =
    car.descripcion ||
    `${pokemon.nombre} es una especie de tipo ${tipos.join('/')} registrada en la Pokédex.` +
      (car.habitat ? ` Su hábitat es ${car.habitat}.` : '');

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
          <div class="stats-panel-body">
            ${renderBaseStats(pokemon.stats)}
          </div>
        </div>
      </div>

      <div class="pokedex-right-col">
        <p class="pokedex-description-text">${escapeText(desc)}</p>

        <div class="pokedex-blue-card">
          <div class="blue-card-item">
            <span class="blue-card-label">Altura</span>
            <span class="blue-card-value">${formatMeasure(car.altura, 'm')}</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Categoría</span>
            <span class="blue-card-value">${escapeText(car.categoria || car.habitat || UNKNOWN)}</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">Peso</span>
            <span class="blue-card-value">${formatMeasure(car.peso, 'kg')}</span>
          </div>
          <div class="blue-card-item">
            <span class="blue-card-label">${habilidades.length > 1 ? 'Habilidades' : 'Habilidad'}</span>
            <span class="blue-card-value">${escapeText(habilidades.length > 0 ? habilidades.join(', ') : UNKNOWN)}</span>
          </div>
        </div>

        <div class="type-section-group">
          <h4 class="type-group-title">Tipo</h4>
          <div class="type-pill-badges-row">
            ${tipos
              .map(
                (t) =>
                  `<span class="official-type-pill" data-type="${escapeText(normalizeStr(t))}">${escapeText(t)}</span>`,
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
                  `<span class="official-type-pill" data-type="${escapeText(normalizeStr(w))}">${escapeText(w)}</span>`,
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
