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
});
