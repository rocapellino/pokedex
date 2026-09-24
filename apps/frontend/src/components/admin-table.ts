/**
 * Componente Tabla Administrativa y KPIs para Backoffice
 */

import { sanitizeHtml, escapeText } from '../sanitizer.js';
import type { Pokemon } from '../types.js';
import { normalizeStr } from '../shared/index.js';

export function renderTableRows(pokemons: Pokemon[]): string {
  return pokemons
    .map((p) => {
      const car = p.caracteristicas || {};
      const maxBarWidth = Math.min(100, Math.round(((p.fuerza || 0) / 160) * 100));
      const safeImg = p.imagen ? escapeText(p.imagen) : 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
      const safeHab = Array.isArray(p.habilidades) ? p.habilidades.join(', ') : (p.habilidades || 'Ninguna');

      return `
      <tr>
        <td>
          <span class="id-tag">#${String(p.id).padStart(3, '0')}</span>
        </td>
        <td>
          <div class="avatar-cell">
            <img src="${safeImg}" alt="${escapeText(p.nombre)}" class="table-avatar">
          </div>
        </td>
        <td>
          <div class="name-cell">
            <strong class="pokemon-table-name">${escapeText(p.nombre)}</strong>
            <span class="habilidades-preview">${escapeText(safeHab)}</span>
          </div>
        </td>
        <td>
          <span class="type-badge" data-type="${escapeText(normalizeStr(p.tipo))}">
            ${escapeText(p.tipo)}
          </span>
        </td>
        <td>
          <div class="force-meter">
            <div class="force-bar-wrapper">
              <div class="force-bar" data-width="${maxBarWidth}"></div>
            </div>
            <span class="force-value">${p.fuerza || 0}</span>
          </div>
        </td>
        <td>
          <div class="weight-height-cell">
            <span>⚖️ ${car.peso || 0} kg</span>
            <span>📏 ${car.altura || 0} m</span>
          </div>
        </td>
        <td>
          <span class="habitat-tag">${escapeText(car.habitat || 'Kanto')}</span>
        </td>
        <td class="text-center">
          <div class="actions-group">
            <button class="btn-action btn-edit" title="Editar Pokémon" data-edit-id="${p.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              Editar
            </button>
            <button class="btn-action btn-delete" title="Eliminar Pokémon" data-delete-id="${p.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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

  tbody.querySelectorAll('.force-bar[data-width]').forEach((el) => {
    const bar = el as HTMLElement;
    setTimeout(() => {
      bar.style.width = bar.getAttribute('data-width') || '0%';
    }, 50);
  });

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
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
