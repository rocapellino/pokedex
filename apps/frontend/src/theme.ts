/**
 * Pokédex Theme Manager (TypeScript)
 * Soporta 'light', 'dark', 'system' (se adapta dinámicamente al SO)
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'pokedex_theme_mode';

export function getSavedThemePreference(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
}

export function resolveEffectiveTheme(preference: ThemeMode): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference === 'light' ? 'light' : 'dark';
}

export function updateThemeUI(preference: ThemeMode, effectiveTheme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  document.documentElement.setAttribute('data-theme-preference', preference);

  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach((btn) => {
    const btnTheme = btn.getAttribute('data-theme-val');
    if (btnTheme === preference) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });
}

export function setTheme(theme: ThemeMode): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  const effective = resolveEffectiveTheme(theme);
  updateThemeUI(theme, effective);
}

export function initTheme(): void {
  const pref = getSavedThemePreference();
  const effective = resolveEffectiveTheme(pref);
  updateThemeUI(pref, effective);
}

// Exponer en window para compatibilidad con código o scripts externos
declare global {
  interface Window {
    setTheme: (theme: ThemeMode) => void;
    initTheme: () => void;
  }
}
window.setTheme = setTheme;
window.initTheme = initTheme;

// Escuchar cambios de preferencia de color del sistema operativo
try {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemChange = (e: MediaQueryListEvent) => {
    const currentPref = getSavedThemePreference();
    if (currentPref === 'system') {
      const effective = e.matches ? 'dark' : 'light';
      updateThemeUI('system', effective);
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemChange);
  }
} catch (err) {
  console.warn('System color scheme listener not supported', err);
}

// Inicializar inmediatamente para evitar FOUC
initTheme();

function setupThemeClickHandlers(): void {
  initTheme();
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const theme = btn.getAttribute('data-theme-val') as ThemeMode | null;
      if (theme) {
        setTheme(theme);
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupThemeClickHandlers);
} else {
  setupThemeClickHandlers();
}
