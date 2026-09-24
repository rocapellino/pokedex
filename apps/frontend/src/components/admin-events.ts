/**
 * Gestor de Eventos del DOM para Backoffice
 */

export interface BackofficeHandlers {
  onFormSubmit: (e: Event) => Promise<void>;
  onAuthSubmit: (e: Event) => Promise<void>;
  onOpenAuth: () => void;
  onSyncCache: () => Promise<void>;
  onOpenCreate: () => void;
  onClearKey: () => Promise<void>;
  onConfirmDelete: () => Promise<void>;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSearch: () => void;
  onTypeFilter: () => void;
  onPageSizeChange: () => void;
  onCloseCrud: () => void;
  onCloseDelete: () => void;
  onCloseAuth: () => void;
  onEditClick: (id: number) => void;
  onDeleteClick: (id: number) => void;
}

export function bindBackofficeEvents(handlers: BackofficeHandlers): void {
  const crudForm = document.getElementById('crudForm');
  if (crudForm) crudForm.addEventListener('submit', handlers.onFormSubmit);

  const authForm = document.getElementById('authForm');
  if (authForm) authForm.addEventListener('submit', handlers.onAuthSubmit);

  const btnAdminAuth = document.getElementById('btnAdminAuth');
  if (btnAdminAuth) btnAdminAuth.addEventListener('click', handlers.onOpenAuth);

  const btnSyncCache = document.getElementById('btnSyncCache');
  if (btnSyncCache) btnSyncCache.addEventListener('click', handlers.onSyncCache);

  const btnOpenCreate = document.getElementById('btnOpenCreate');
  if (btnOpenCreate) btnOpenCreate.addEventListener('click', handlers.onOpenCreate);

  const btnClearKeyBtn = document.getElementById('btnClearKeyBtn');
  if (btnClearKeyBtn) btnClearKeyBtn.addEventListener('click', handlers.onClearKey);

  const btnConfirmDelete = document.getElementById('btnConfirmDelete');
  if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', handlers.onConfirmDelete);

  const adminBtnPrev = document.getElementById('adminBtnPrev');
  if (adminBtnPrev) adminBtnPrev.addEventListener('click', handlers.onPrevPage);

  const adminBtnNext = document.getElementById('adminBtnNext');
  if (adminBtnNext) adminBtnNext.addEventListener('click', handlers.onNextPage);

  const adminSearchInput = document.getElementById('adminSearch') || document.getElementById('adminSearchInput');
  if (adminSearchInput) adminSearchInput.addEventListener('input', handlers.onSearch);

  const adminTypeFilter = document.getElementById('adminTypeFilter');
  if (adminTypeFilter) adminTypeFilter.addEventListener('change', handlers.onTypeFilter);

  const adminPageSize = document.getElementById('adminPageSize');
  if (adminPageSize) adminPageSize.addEventListener('change', handlers.onPageSizeChange);

  document.querySelectorAll('[data-close-crud]').forEach((el) => {
    el.addEventListener('click', handlers.onCloseCrud);
  });

  document.querySelectorAll('[data-close-delete]').forEach((el) => {
    el.addEventListener('click', handlers.onCloseDelete);
  });

  document.querySelectorAll('[data-close-auth]').forEach((el) => {
    el.addEventListener('click', handlers.onCloseAuth);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      handlers.onCloseCrud();
      handlers.onCloseDelete();
      handlers.onCloseAuth();
    }
  });

  const tableBody = document.getElementById('adminTableBody') || document.getElementById('tableBody');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const editBtn = target?.closest('[data-edit-id]') as HTMLElement | null;
      if (editBtn) {
        const id = Number(editBtn.dataset.editId);
        if (!Number.isNaN(id)) handlers.onEditClick(id);
        return;
      }
      const deleteBtn = target?.closest('[data-delete-id]') as HTMLElement | null;
      if (deleteBtn) {
        const id = Number(deleteBtn.dataset.deleteId);
        if (!Number.isNaN(id)) handlers.onDeleteClick(id);
        return;
      }
    });
  }
}
