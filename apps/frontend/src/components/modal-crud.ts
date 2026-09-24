/**
 * Componente Modal CRUD para Backoffice
 * Gestiona apertura, renderizado, población y cierre de formularios de creación, edición y confirmación de borrado.
 */

import type { Pokemon } from '../types.js';
import { formatPokemonId } from '../shared/index.js';

let pendingDeleteId: number | null = null;

export function getPendingDeleteId(): number | null {
  return pendingDeleteId;
}

export function setPendingDeleteId(id: number | null): void {
  pendingDeleteId = id;
}

export function openCreateModal(): void {
  if (typeof document === 'undefined') return;
  const title = document.getElementById('crudModalTitle');
  if (title) title.innerText = '➕ Registrar Nuevo Pokémon';
  const idInput = document.getElementById('formPokemonId') as HTMLInputElement | null;
  if (idInput) idInput.value = '';
  const form = document.getElementById('crudForm') as HTMLFormElement | null;
  if (form) form.reset();
  document.getElementById('crudModal')?.classList.add('active');
}

export function openEditModal(id: number, catalog: Pokemon[]): Pokemon | null {
  const p = catalog.find((x) => x.id === id);
  if (!p) return null;

  if (typeof document !== 'undefined') {
    const title = document.getElementById('crudModalTitle');
    if (title) title.innerText = `✏️ Editar Pokémon ${formatPokemonId(p.id)} - ${p.nombre}`;

    const formId = document.getElementById('formPokemonId') as HTMLInputElement | null;
    if (formId) formId.value = String(p.id);

    const nombre = document.getElementById('nombre') as HTMLInputElement | null;
    if (nombre) nombre.value = p.nombre;

    const imagen = document.getElementById('imagen') as HTMLInputElement | null;
    if (imagen) imagen.value = p.imagen || '';

    const tipo = document.getElementById('tipo') as HTMLInputElement | null;
    if (tipo) tipo.value = p.tipo;

    const fuerza = document.getElementById('fuerza') as HTMLInputElement | null;
    if (fuerza) fuerza.value = String(p.fuerza || 50);

    const car = p.caracteristicas || {};
    const peso = document.getElementById('peso') as HTMLInputElement | null;
    if (peso) peso.value = String(car.peso || 6.0);

    const altura = document.getElementById('altura') as HTMLInputElement | null;
    if (altura) altura.value = String(car.altura || 0.4);

    const habitat = document.getElementById('habitat') as HTMLInputElement | null;
    if (habitat) habitat.value = String(car.habitat || 'Kanto');

    const habilidades = document.getElementById('habilidades') as HTMLInputElement | null;
    if (habilidades) {
      habilidades.value = Array.isArray(p.habilidades)
        ? p.habilidades.join(', ')
        : p.habilidades || '';
    }

    document.getElementById('crudModal')?.classList.add('active');
  }
  return p;
}

export function closeCrudModal(): void {
  if (typeof document !== 'undefined') {
    document.getElementById('crudModal')?.classList.remove('active');
  }
}

export function openDeleteModal(id: number, catalog: Pokemon[]): Pokemon | null {
  const p = catalog.find((x) => x.id === id);
  if (!p) return null;
  pendingDeleteId = id;

  if (typeof document !== 'undefined') {
    const nameEl = document.getElementById('deletePokemonName');
    const idEl = document.getElementById('deletePokemonId');
    if (nameEl) nameEl.innerText = p.nombre;
    if (idEl) idEl.innerText = formatPokemonId(p.id);

    document.getElementById('deleteModal')?.classList.add('active');
  }
  return p;
}

export function closeDeleteModal(): void {
  if (typeof document !== 'undefined') {
    document.getElementById('deleteModal')?.classList.remove('active');
  }
  pendingDeleteId = null;
}

export function extractPokemonPayload(): {
  id?: number;
  payload: {
    nombre: string;
    imagen: string;
    tipo: string;
    fuerza: number;
    habilidades: string[];
    caracteristicas: {
      peso: number;
      altura: number;
      habitat: string;
    };
  };
} {
  const idInput = (document.getElementById('formPokemonId') as HTMLInputElement | null)?.value;
  const nombre = ((document.getElementById('nombre') as HTMLInputElement | null)?.value || '').trim();
  const imagen = ((document.getElementById('imagen') as HTMLInputElement | null)?.value || '').trim();
  const tipo = (document.getElementById('tipo') as HTMLInputElement | null)?.value || 'Normal';
  const fuerza = Number.parseInt((document.getElementById('fuerza') as HTMLInputElement | null)?.value || '50', 10);
  const habilidades = ((document.getElementById('habilidades') as HTMLInputElement | null)?.value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const peso = Number.parseFloat((document.getElementById('peso') as HTMLInputElement | null)?.value || '6.0');
  const altura = Number.parseFloat((document.getElementById('altura') as HTMLInputElement | null)?.value || '0.4');
  const habitat = ((document.getElementById('habitat') as HTMLInputElement | null)?.value || 'Kanto').trim();

  return {
    id: idInput ? Number(idInput) : undefined,
    payload: {
      nombre,
      imagen,
      tipo,
      fuerza,
      habilidades,
      caracteristicas: {
        peso,
        altura,
        habitat,
      },
    },
  };
}
