/**
 * Pokédex Backoffice - Gestor Administrativo CRUD (TypeScript + DOMPurify)
 * Controlador de Vista de Administración Modularizado (< 200 LOC)
 */

import { FALLBACK_IMAGE, TYPE_COLORS, normalizeStr, getTypeColor, formatPokemonId, showToast } from './shared/index.js';
import {
  openCreateModal as openCreateModalComponent,
  openEditModal as openEditModalComponent,
  closeCrudModal as closeCrudModalComponent,
  openDeleteModal as openDeleteModalComponent,
  closeDeleteModal as closeDeleteModalComponent,
  openAuthModal as openAuthModalComponent,
  closeAuthModal as closeAuthModalComponent,
  checkAdminSession,
  isSessionActive,
  setAdminSessionActive,
  clearAdminSession,
  updateAuthUI,
  handleAuthSubmit,
  bindBackofficeEvents,
  checkHealthStatus,
  loadAdminData,
  applyAdminFilters,
  handleAdminSearch,
  handleAdminTypeFilter,
  handlePageSizeChange,
  changeAdminPage,
  renderTable,
  updateKPIs,
  getBackofficePokemons,
  handleFormSubmit,
  executeDelete,
  invalidateCache,
} from './components/index.js';

export {
  checkAdminSession,
  isSessionActive,
  setAdminSessionActive,
  clearAdminSession,
  updateAuthUI,
  handleAuthSubmit,
  showToast,
  getTypeColor,
  normalizeStr,
  TYPE_COLORS,
  formatPokemonId,
  checkHealthStatus,
  loadAdminData,
  applyAdminFilters,
  handleAdminSearch,
  handleAdminTypeFilter,
  handlePageSizeChange,
  changeAdminPage,
  renderTable,
  updateKPIs,
  handleFormSubmit,
  executeDelete,
  invalidateCache,
};

export function openAuthModal(): void {
  openAuthModalComponent();
}

export function closeAuthModal(): void {
  closeAuthModalComponent();
}

export function openCreateModal(): void {
  openCreateModalComponent();
}

export function openEditModal(id: number): void {
  openEditModalComponent(id, getBackofficePokemons());
}

export function closeCrudModal(): void {
  closeCrudModalComponent();
}

export function openDeleteModal(id: number): void {
  openDeleteModalComponent(id, getBackofficePokemons());
}

export function closeDeleteModal(): void {
  closeDeleteModalComponent();
}

window.addEventListener(
  'error',
  (event) => {
    const target = event.target as HTMLElement | null;
    if (target && target.tagName === 'IMG') {
      const fallback = FALLBACK_IMAGE;
      const img = target as HTMLImageElement;
      if (img.src !== fallback) {
        img.src = fallback;
      }
    }
  },
  true,
);

export function initEventListeners(): void {
  bindBackofficeEvents({
    onFormSubmit: handleFormSubmit,
    onAuthSubmit: handleAuthSubmit,
    onOpenAuth: openAuthModal,
    onSyncCache: invalidateCache,
    onOpenCreate: openCreateModal,
    onClearKey: clearAdminSession,
    onConfirmDelete: executeDelete,
    onPrevPage: () => changeAdminPage(-1),
    onNextPage: () => changeAdminPage(1),
    onSearch: handleAdminSearch,
    onTypeFilter: handleAdminTypeFilter,
    onPageSizeChange: handlePageSizeChange,
    onCloseCrud: closeCrudModal,
    onCloseDelete: closeDeleteModal,
    onCloseAuth: closeAuthModal,
    onEditClick: (id) => openEditModal(id),
    onDeleteClick: (id) => openDeleteModal(id),
  });
}

export function bootstrap(): void {
  initEventListeners();
  void checkAdminSession();
  void loadAdminData();
  void checkHealthStatus();
  setInterval(() => {
    void checkHealthStatus();
  }, 15000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
