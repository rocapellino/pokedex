/**
 * Componente Tabla Administrativa y KPIs para Backoffice
 */

import { sanitizeHtml, escapeText } from '../sanitizer.js';
import type { Pokemon } from '../types.js';
import { formatPokemonId, normalizeStr } from '../shared/index.js';

export function renderTableRows(pokemons: Pokemon[]): string {
  return pokemons
    .map((p) => {
      const car = p.caracteristicas || {};
      const safeImg = p.imagen ? escapeText(p.imagen) : 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
      return `
        <tr>
          <td><span class="font-mono text-muted">#${formatPokemonId(p.id)}</span></td>
          <td>
            <div class="table-pokemon-cell">
              <img src="${safeImg}" alt="${escapeText(p.nombre)}" class="table-thumb" loading="lazy" crossorigin="anonymous">
              <span class="font-bold">${escapeText(p.nombre)}</span>
            </div>
          </td>
          <td>
            <span class="type-badge" data-type="${escapeText(normalizeStr(p.tipo))}">
              ${escapeText(p.tipo)}
            </span>
          </td>
          <td><span class="font-mono">${p.fuerza || 0} pts</span></td>
          <td>${car.peso || 0} kg</td>
          <td>${car.altura || 0} m</td>
          <td><span class="badge-region">${escapeText(car.habitat || 'Kanto')}</span></td>
          <td>
            <div class="table-actions">
              <button class="btn-action btn-edit" data-edit-id="${p.id}" title="Editar Pokémon" aria-label="Editar">
                ✏️
              </button>
              <button class="btn-action btn-delete" data-delete-id="${p.id}" title="Eliminar Pokémon" aria-label="Eliminar">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function computeKPIs(pokemons: Pokemon[], totalRecords: number): {
  total: number;
  avgForce: number;
  uniqueTypesCount: number;
} {
  if (pokemons.length === 0) {
    return { total: totalRecords, avgForce: 0, uniqueTypesCount: 0 };
  }
  const totalForce = pokemons.reduce((acc, p) => acc + (p.fuerza || 0), 0);
  const avgForce = Math.round(totalForce / pokemons.length);
  const uniqueTypes = new Set(pokemons.map((p) => p.tipo).filter(Boolean));

  return {
    total: totalRecords,
    avgForce,
    uniqueTypesCount: uniqueTypes.size,
  };
}

export function renderAdminTable(
  tbody: HTMLElement,
  pagination: HTMLElement | null,
  pokemons: Pokemon[],
  totalRecords: number,
  pageSize: number,
  currentPage: number
): void {
  if (pokemons.length === 0) {
    tbody.innerHTML = sanitizeHtml(`
      <tr>
        <td colspan="8" class="table-empty">
          🔍 No se encontraron registros con los filtros seleccionados.
        </td>
      </tr>
    `);
    if (pagination) pagination.style.display = 'none';
    return;
  }

  tbody.innerHTML = sanitizeHtml(renderTableRows(pokemons));

  const totalPages = Math.ceil(totalRecords / pageSize);
  if (pagination) {
    if (totalPages > 1) {
      pagination.style.display = 'flex';
      const pageInfo = document.getElementById('adminPageInfo');
      if (pageInfo) {
        pageInfo.innerText = `Página ${currentPage} de ${totalPages} (${totalRecords} registros)`;
      }
      const prevBtn = document.getElementById('adminBtnPrev') as HTMLButtonElement | null;
      const nextBtn = document.getElementById('adminBtnNext') as HTMLButtonElement | null;
      if (prevBtn) prevBtn.disabled = currentPage === 1;
      if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    } else {
      pagination.style.display = 'none';
    }
  }
}

export function renderKPIs(pokemons: Pokemon[], totalRecords: number): void {
  const kpis = computeKPIs(pokemons, totalRecords);
  const totalEl = document.getElementById('kpiTotal');
  if (totalEl) totalEl.innerText = String(kpis.total);

  const avgPowerEl = document.getElementById('kpiAvgPower') || document.getElementById('kpiAvgForce');
  if (avgPowerEl) avgPowerEl.innerText = `${kpis.avgForce} pts`;

  const typesEl = document.getElementById('kpiTypes') || document.getElementById('kpiTypesCount');
  if (typesEl) typesEl.innerText = String(kpis.uniqueTypesCount);
}
