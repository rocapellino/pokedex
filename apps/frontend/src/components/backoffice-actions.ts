/**
 * Acciones CRUD y Mutaciones de Datos para Pokédex Backoffice
 */

import { errorMessage, errorStatus, showToast, createPokemon, updatePokemon, deletePokemon } from '../shared/index.js';
import { isSessionActive, clearAdminSession, openAuthModal } from './modal-auth.js';
import { extractPokemonPayload, closeCrudModal, getPendingDeleteId, closeDeleteModal } from './modal-crud.js';
import { loadAdminData } from './backoffice-state.js';

export async function handleFormSubmit(e: Event): Promise<void> {
  e.preventDefault();

  if (!isSessionActive()) {
    showToast('⚠️ Se requiere autenticación de administrador para guardar cambios.', true);
    openAuthModal();
    return;
  }

  const { id, payload } = extractPokemonPayload();
  const submitBtn = document.getElementById('btnSubmitForm') as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.innerText = 'Guardando...';

  try {
    const isEdit = typeof id === 'number' && !Number.isNaN(id);
    if (isEdit) {
      await updatePokemon(id, payload);
    } else {
      await createPokemon(payload);
    }

    closeCrudModal();
    showToast(
      isEdit
        ? `✅ Pokémon "${payload.nombre}" actualizado con éxito.`
        : `🎉 Pokémon "${payload.nombre}" creado con éxito.`,
    );
    await loadAdminData();
  } catch (err) {
    if (errorStatus(err) === 401) {
      showToast('❌ Sesión de administrador expirada o inválida (401). Reautenticando...', true);
      await clearAdminSession();
      openAuthModal();
      return;
    }
    showToast(`Error al guardar: ${errorMessage(err)}`, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Guardar Registro';
  }
}

export async function executeDelete(): Promise<void> {
  const pendingId = getPendingDeleteId();
  if (!pendingId) return;

  if (!isSessionActive()) {
    showToast('⚠️ Se requiere autenticación de administrador para eliminar registros.', true);
    closeDeleteModal();
    openAuthModal();
    return;
  }

  const btn = document.getElementById('btnConfirmDelete') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerText = 'Eliminando...';

  try {
    await deletePokemon(pendingId);
    closeDeleteModal();
    showToast(`🗑️ Pokémon #${pendingId} eliminado del catálogo.`);
    await loadAdminData();
  } catch (err) {
    if (errorStatus(err) === 401) {
      showToast('❌ Sesión de administrador expirada o inválida (401). Reautenticando...', true);
      await clearAdminSession();
      closeDeleteModal();
      openAuthModal();
      return;
    }
    showToast(`Error al eliminar: ${errorMessage(err)}`, true);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Sí, Eliminar';
  }
}

export async function invalidateCache(): Promise<void> {
  showToast('⚡ Invalidando y sincronizando caché de Redis...');
  try {
    await loadAdminData();
    showToast('🎉 Caché sincronizada correctamente.');
  } catch (err) {
    showToast(`Error al sincronizar: ${errorMessage(err)}`, true);
  }
}
