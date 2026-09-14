import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Pokédex Web Application E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('La interfaz principal carga con branding y catálogo de Pokémon', async ({ page }) => {
    await expect(page).toHaveTitle(/Pokédex/i);
    await expect(page.locator('.brand-title')).toHaveText('Pokédex');

    // Esperar a que el catálogo cargue los Pokémon
    const grid = page.locator('#pokemonGrid');
    await expect(grid).toBeVisible();

    // Validar que se renderizan tarjetas de Pokémon
    const cards = grid.locator('.pokemon-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('El buscador en tiempo real filtra los Pokémon por nombre', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible();

    // Esperar carga inicial
    await expect(page.locator('.pokemon-card').first()).toBeVisible({ timeout: 10000 });

    // Filtrar por Pikachu
    await searchInput.fill('Pikachu');
    await page.waitForTimeout(400); // debounce

    // Validar que la tarjeta mostrada corresponde a Pikachu
    const visibleCards = page.locator('.pokemon-card:visible');
    await expect(visibleCards.first()).toContainText(/Pikachu/i);
  });

  test('El alternador de tema modifica data-theme en el documento', async ({ page }) => {
    const darkBtn = page.locator('button[data-theme-val="dark"]');
    await darkBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const lightBtn = page.locator('button[data-theme-val="light"]');
    await lightBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('@a11y Auditoría de accesibilidad WCAG con Axe-core', async ({ page }) => {
    // Esperar que la interfaz esté completamente lista
    await page.waitForSelector('.pokemon-card', { timeout: 10000 });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Desactivar reglas que puedan depender de imágenes de assets externos si aplican
      .analyze();

    // Filtrar violaciones críticas o serias
    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(seriousViolations).toEqual([]);
  });

  test('@coep Las imágenes de Pokémon cargan efectivamente (COEP require-corp)', async ({ page }) => {
    // Verificar que COEP: require-corp no bloquea silenciosamente las imágenes cross-origin.
    // GitHub raw content expone Access-Control-Allow-Origin: * y crossorigin="anonymous"
    // está presente en los <img>, por lo que el navegador debe cargarlas sin bloqueo.
    await page.waitForSelector('.pokemon-card', { timeout: 10000 });

    // Evaluar naturalWidth en la primera imagen de tarjeta visible
    // naturalWidth === 0 indica que el navegador bloqueó o falló la carga del recurso.
    const firstImgLoaded = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('.pokemon-img');
      if (!img) return false;
      // Si la imagen ya completó su carga, verificar naturalWidth directamente
      if (img.complete) return img.naturalWidth > 0;
      // Si aún está cargando, esperar el evento load
      return new Promise<boolean>((resolve) => {
        img.addEventListener('load', () => resolve(img.naturalWidth > 0));
        img.addEventListener('error', () => resolve(false));
      });
    });

    expect(firstImgLoaded, 'La imagen de Pokémon fue bloqueada (COEP/CORS) o no cargó. naturalWidth = 0.').toBe(true);
  });
});
