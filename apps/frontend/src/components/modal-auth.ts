/**
 * Componente Modal y Gestor de Autenticación de Administrador para Backoffice
 * Gestiona ciclo de vida de la sesión (cookie HttpOnly), UI de estado y diálogo de login.
 */

import { getSessionStatus, loginWithApiKey, logoutSession, showToast } from '../shared/index.js';

let isAdminActive = false;
let adminSessionExpiresAt: number | null = null;

export async function checkAdminSession(): Promise<boolean> {
  try {
    const data = await getSessionStatus();
    isAdminActive = Boolean(data.authenticated);
    adminSessionExpiresAt = data.expiresAt ? Number(data.expiresAt) : null;
  } catch {
    isAdminActive = false;
    adminSessionExpiresAt = null;
  }
  updateAuthUI();
  return isAdminActive;
}

export function isSessionActive(): boolean {
  if (!isAdminActive) return false;
  if (adminSessionExpiresAt && Date.now() > adminSessionExpiresAt) {
    isAdminActive = false;
    adminSessionExpiresAt = null;
    updateAuthUI();
    return false;
  }
  return true;
}

export function setAdminSessionActive(active: boolean, expiresAt?: number): void {
  isAdminActive = active;
  adminSessionExpiresAt = expiresAt ? Number(expiresAt) : null;
  updateAuthUI();
}

export async function clearAdminSession(): Promise<void> {
  isAdminActive = false;
  adminSessionExpiresAt = null;
  try {
    await logoutSession();
  } catch {
    // Ignorar fallos de red en logout
  }
  updateAuthUI();
  closeAuthModal();
  showToast('ℹ️ Sesión administrativa cerrada.');
}

export function updateAuthUI(): void {
  const active = isSessionActive();
  const statusText = document.getElementById('authStatusText');
  const btn = document.getElementById('btnAdminAuth');
  const clearBtn = document.getElementById('btnClearKeyBtn');
  const input = document.getElementById('adminApiKeyInput') as HTMLInputElement | null;

  if (input) input.value = '';

  if (active) {
    if (statusText) statusText.innerText = 'Admin Activo';
    if (btn) btn.classList.add('btn-auth-active');
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (statusText) statusText.innerText = 'Autenticar';
    if (btn) btn.classList.remove('btn-auth-active');
    if (clearBtn) clearBtn.classList.add('hidden');
  }
}

export function openAuthModal(): void {
  updateAuthUI();
  document.getElementById('authModal')?.classList.add('active');
  const input = document.getElementById('adminApiKeyInput');
  if (input) {
    setTimeout(() => input.focus(), 100);
  }
}

export function closeAuthModal(): void {
  document.getElementById('authModal')?.classList.remove('active');
}

export function getAuthInputApiKey(): string {
  const input = document.getElementById('adminApiKeyInput') as HTMLInputElement | null;
  return input ? input.value.trim() : '';
}

export async function handleAuthSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const val = getAuthInputApiKey();
  const submitBtn = document.getElementById('btnSaveKey') as HTMLButtonElement | null;

  if (!val) {
    showToast('Ingresa una clave válida.', true);
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Verificando...';
  }

  try {
    const data = await loginWithApiKey(val);
    setAdminSessionActive(true, data.expiresAt);
    closeAuthModal();
    showToast('🔐 Sesión administrativa autenticada (cookie HttpOnly emitida).');
  } catch (err: any) {
    showToast(`❌ Error de autenticación: ${err?.message || err}`, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Autenticar Sesión';
    }
  }
}
