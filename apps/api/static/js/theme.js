/**
 * Pokédex Theme Manager
 * Supports: 'light', 'dark', 'system' (matches OS preference dynamically)
 */
(function () {
  const THEME_STORAGE_KEY = 'pokedex_theme_mode';

  function getSavedThemePreference() {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
  }

  function resolveEffectiveTheme(preference) {
    if (preference === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return preference === 'light' ? 'light' : 'dark';
  }

  function updateThemeUI(preference, effectiveTheme) {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.documentElement.setAttribute('data-theme-preference', preference);
    
    // Update theme toggle buttons state
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

  window.setTheme = function (theme) {
    if (!['light', 'dark', 'system'].includes(theme)) {
      theme = 'system';
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const effective = resolveEffectiveTheme(theme);
    updateThemeUI(theme, effective);
  };

  window.initTheme = function () {
    const pref = getSavedThemePreference();
    const effective = resolveEffectiveTheme(pref);
    updateThemeUI(pref, effective);
  };

  // Listen for system theme changes in real-time
  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e) => {
      const currentPref = getSavedThemePreference();
      if (currentPref === 'system') {
        const effective = e.matches ? 'dark' : 'light';
        updateThemeUI('system', effective);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemChange);
    }
  } catch (err) {
    console.warn('System color scheme listener not supported', err);
  }

  // Initial apply
  window.initTheme();

  // Re-sync UI when DOM is fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initTheme);
  }
})();
