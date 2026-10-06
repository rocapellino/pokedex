/**
 * Sección de Megaevolución del modal de detalle.
 *
 * Las megaevoluciones no tienen número de Pokédex propio: se presentan dentro del Pokémon base,
 * con una pestaña por forma (X/Y/Z, macho/hembra...) y las estadísticas comparadas con la forma normal.
 */

import { escapeText } from '../sanitizer.js';
import type { MegaEvolution, Pokemon, PokemonStats } from '../types.js';
import { BASE_STAT_DEFS, isValidStat, statTier, statWidthStep } from '../shared/base-stats.js';
import { hasMegaEvolution, normalizeStr } from '../shared/index.js';

const MEGA_NAME_FALLBACK = 'Megaevolución';

function formatMeasure(value: number, unit: string): string {
  return isValidStat(value) && value > 0 ? `${String(value).replace('.', ',')} ${unit}` : '—';
}

/** Texto y clase de la diferencia de una estadística respecto de la forma base. */
export function describeStatDelta(
  mega: number,
  base: number | undefined,
): { text: string; tone: 'up' | 'down' | 'same' } {
  if (!isValidStat(base)) return { text: '', tone: 'same' };
  const delta = Math.round(mega) - Math.round(base);
  if (delta > 0) return { text: `+${delta}`, tone: 'up' };
  if (delta < 0) return { text: `−${Math.abs(delta)}`, tone: 'down' };
  return { text: '=', tone: 'same' };
}

function renderDeltaCell(mega: number, base: number | undefined): string {
  const { text, tone } = describeStatDelta(mega, base);
  return `<span class="base-stat-delta base-stat-delta--${tone}">${escapeText(text)}</span>`;
}

/** Estadísticas de la megaevolución con la diferencia frente a la forma base. */
export function renderMegaStats(stats: PokemonStats, base?: PokemonStats): string {
  let total = 0;
  let baseTotal = 0;
  let baseComplete = Boolean(base);

  const rows = BASE_STAT_DEFS.map((def) => {
    const raw = stats[def.key];
    const value = isValidStat(raw) ? Math.round(raw) : 0;
    total += value;
    const baseValue = base?.[def.key];
    if (isValidStat(baseValue)) baseTotal += Math.round(baseValue);
    else baseComplete = false;

    return `
      <div class="base-stat-row base-stat-row--delta" aria-label="${def.name}: ${value}">
        <span class="base-stat-name">${def.label}</span>
        <span class="base-stat-value">${value}</span>
        <div class="base-stat-track"><div class="base-stat-fill base-stat-fill--w${statWidthStep(value)} base-stat-tier--${statTier(value)}"></div></div>
        ${renderDeltaCell(value, baseValue)}
      </div>`;
  }).join('');

  const totalRow = `
      <div class="base-stat-row base-stat-row--delta base-stat-total" aria-label="Total: ${total}">
        <span class="base-stat-name">Total</span>
        <span class="base-stat-value">${total}</span>
        <span></span>
        ${baseComplete ? renderDeltaCell(total, baseTotal) : '<span></span>'}
      </div>`;

  return `<div class="stats-list">${rows}${totalRow}</div>`;
}

function renderMegaPanel(mega: MegaEvolution, base: Pokemon, index: number, active: boolean): string {
  const nombre = escapeText(mega.nombre || MEGA_NAME_FALLBACK);
  const habilidades = (mega.habilidades ?? []).filter(Boolean);
  const habilidadesLabel = habilidades.length > 1 ? 'Habilidades' : 'Habilidad';

  return `
    <div class="mega-panel${active ? ' mega-panel--active' : ''}" role="tabpanel" id="mega-panel-${index}" aria-label="${nombre}" data-mega-index="${index}"${active ? '' : ' hidden'}>
      <div class="mega-panel-grid">
        <div class="mega-artwork-box">
          <img src="${escapeText(mega.imagen || '')}" alt="${nombre}" class="pokedex-artwork-img" loading="lazy" crossorigin="anonymous">
        </div>

        <div class="mega-panel-info">
          <div class="pokedex-blue-card">
            <div class="blue-card-item">
              <span class="blue-card-label">Altura</span>
              <span class="blue-card-value">${formatMeasure(mega.altura, 'm')}</span>
            </div>
            <div class="blue-card-item">
              <span class="blue-card-label">Peso</span>
              <span class="blue-card-value">${formatMeasure(mega.peso, 'kg')}</span>
            </div>
            <div class="blue-card-item">
              <span class="blue-card-label">${habilidadesLabel}</span>
              <span class="blue-card-value">${habilidades.length > 0 ? escapeText(habilidades.join(', ')) : 'No publicada'}</span>
            </div>
          </div>

          <div class="type-section-group">
            <h4 class="type-group-title">Tipo</h4>
            <div class="type-pill-badges-row">
              ${(mega.tipos ?? [])
                .map(
                  (t) =>
                    `<span class="official-type-pill" data-type="${escapeText(normalizeStr(t))}">${escapeText(t)}</span>`,
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="pokedex-stats-panel">
        <div class="stats-panel-title">Puntos de base <span class="mega-stats-hint">frente a ${escapeText(base.nombre)}</span></div>
        <div class="stats-panel-body">
          ${renderMegaStats(mega.stats, base.stats)}
        </div>
      </div>
    </div>`;
}

/**
 * Sección de megaevolución del Pokémon base. Devuelve cadena vacía si no tiene ninguna.
 * Con una sola forma no hay pestañas; con varias, una por forma.
 */
export function renderMegaEvolutionSection(pokemon: Pokemon): string {
  if (!hasMegaEvolution(pokemon)) return '';
  const megas = pokemon.megaevoluciones as MegaEvolution[];
  const title = megas.length > 1 ? 'Megaevoluciones' : 'Megaevolución';

  const tabs =
    megas.length > 1
      ? `<div class="mega-tabs" role="tablist" aria-label="Megaevoluciones de ${escapeText(pokemon.nombre)}">
          ${megas
            .map(
              (mega, i) =>
                `<button type="button" class="mega-tab${i === 0 ? ' mega-tab--active' : ''}" role="tab" id="mega-tab-${i}" aria-selected="${i === 0}" aria-controls="mega-panel-${i}" data-mega-index="${i}">${escapeText(mega.nombre)}</button>`,
            )
            .join('')}
        </div>`
      : `<p class="mega-single-name">${escapeText(megas[0].nombre)}</p>`;

  return `
    <section class="mega-section" aria-label="${title}">
      <h3 class="mega-section-title">
        <span class="mega-title-mark" aria-hidden="true">M</span> ${title}
      </h3>
      ${tabs}
      ${megas.map((mega, i) => renderMegaPanel(mega, pokemon, i, i === 0)).join('')}
    </section>`;
}

/**
 * Activa la pestaña `index` dentro de `root`: marca la pestaña seleccionada y muestra solo su panel.
 * Devuelve `false` si el índice no corresponde a ninguna pestaña.
 */
export function selectMegaTab(root: ParentNode, index: number): boolean {
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('.mega-tab'));
  if (!tabs.some((tab) => Number(tab.dataset.megaIndex) === index)) return false;

  for (const tab of tabs) {
    const active = Number(tab.dataset.megaIndex) === index;
    tab.classList.toggle('mega-tab--active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const panel of Array.from(root.querySelectorAll<HTMLElement>('.mega-panel'))) {
    const active = Number(panel.dataset.megaIndex) === index;
    panel.classList.toggle('mega-panel--active', active);
    panel.toggleAttribute('hidden', !active);
  }
  return true;
}
