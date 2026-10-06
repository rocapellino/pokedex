import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Axe calcula el contraste con los colores computados en ese instante: con una transición CSS en curso
 * (hover del toggle o de la tarjeta, fondos semitransparentes) el resultado fluctúa y produce falsos
 * positivos intermitentes (~2-3% de las ejecuciones). Se analiza el estado estable, esperando a que
 * terminen las animaciones finitas; las infinitas (p. ej. el pulso del indicador de estado) se excluyen
 * porque nunca terminan.
 */
async function waitForSettledAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

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
    await waitForSettledAnimations(page);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Desactivar reglas que puedan depender de imágenes de assets externos si aplican
      .analyze();

    // Filtrar violaciones críticas o serias
    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
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

  test('El filtro "Con megaevolución" deja solo los Pokémon que tienen alguna', async ({ page }) => {
    await expect(page.locator('.pokemon-card').first()).toBeVisible({ timeout: 10000 });
    const total = await page.locator('.pokemon-card').count();

    await page.locator('#megaFilter').check();

    const cards = page.locator('.pokemon-card');
    await expect(cards.first()).toBeVisible();
    const filtered = await cards.count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    // Cada tarjeta que queda muestra la insignia y Charizard sigue presente.
    await expect(page.locator('.pokemon-card .mega-badge')).toHaveCount(filtered);
    await expect(page.locator('.pokemon-card[data-pokemon-id="6"]')).toBeVisible();
    await expect(page.locator('.pokemon-card[data-pokemon-id="25"]')).toHaveCount(0);

    await page.locator('#megaFilter').uncheck();
    await expect(cards).toHaveCount(total);
  });

  test('El detalle de Charizard muestra sus megaevoluciones y permite cambiar entre ellas', async ({ page }) => {
    await page.locator('.pokemon-card[data-pokemon-id="6"]').click();

    // Contraída por defecto: solo se ve el botón "Mega", entre el arte y los puntos de base.
    const toggle = page.getByRole('button', { name: 'Ver 2 megaevoluciones' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.mega-section')).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const section = page.locator('.mega-section');
    await expect(section).toBeVisible();
    await expect(section.getByRole('tab')).toHaveCount(2);
    await expect(section.getByRole('tab', { name: 'Mega-Charizard X' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#mega-panel-0')).toBeVisible();
    await expect(page.locator('#mega-panel-1')).toBeHidden();

    await section.getByRole('tab', { name: 'Mega-Charizard Y' }).click();

    await expect(section.getByRole('tab', { name: 'Mega-Charizard Y' })).toHaveAttribute('aria-selected', 'true');
    await expect(section.getByRole('tab', { name: 'Mega-Charizard X' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#mega-panel-1')).toBeVisible();
    await expect(page.locator('#mega-panel-0')).toBeHidden();
    await expect(page.locator('#mega-panel-1')).toContainText('Sequía');

    // El botón vuelve a contraer la sección.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(section).toBeHidden();
    await toggle.click();

    // Con el cursor encima, la pestaña activa conserva el texto claro (el hover no debe pisar su color).
    await section.getByRole('tab', { name: 'Mega-Charizard Y' }).hover();
    await expect(section.getByRole('tab', { name: 'Mega-Charizard Y' })).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('Un Pokémon sin megaevolución no muestra la sección en su detalle', async ({ page }) => {
    await page.locator('.pokemon-card[data-pokemon-id="25"]').click();

    await expect(page.locator('#detailContent')).toContainText(/Pikachu/i);
    await expect(page.locator('.mega-section')).toHaveCount(0);
    await expect(page.locator('.mega-toggle')).toHaveCount(0);
  });

  test('@a11y El detalle con megaevolución cumple WCAG (Axe-core)', async ({ page }) => {
    await page.locator('.pokemon-card[data-pokemon-id="6"]').click();
    await page.locator('.mega-toggle').click();
    await expect(page.locator('.mega-section')).toBeVisible();
    await waitForSettledAnimations(page);

    const results = await new AxeBuilder({ page })
      .include('.mega-section')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const seriousViolations = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(seriousViolations).toEqual([]);
  });

  test('@a11y El modal de detalle es un diálogo modal: foco atrapado y Escape', async ({ page }) => {
    const card = page.locator('.pokemon-card[data-pokemon-id="25"]');
    await card.click();

    const dialog = page.locator('dialog#detailModal');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(/\S/);

    // Tab nunca debe enfocar la página de fondo: queda inerte (el foco solo puede estar en el
    // diálogo o, al salir del documento, en el body/UI del navegador).
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const escaped = await page.evaluate(() => {
        const el = document.activeElement;
        return el !== document.body && !el?.closest('#detailModal');
      });
      expect(escaped).toBe(false);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
  });

  test('@a11y Las tarjetas se operan con teclado: Tab, Enter, Espacio y retorno del foco', async ({ page }) => {
    await page.waitForSelector('.pokemon-card', { timeout: 10000 });
    await page.locator('#searchInput').focus();

    // Tab debe alcanzar el botón de una tarjeta.
    let reached = false;
    for (let i = 0; i < 25 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.matches('.pokemon-card .card-open') ?? false);
    }
    expect(reached).toBe(true);

    const button = page.locator('.pokemon-card .card-open:focus');
    const name = (await button.textContent())?.trim() ?? '';
    expect(name).not.toBe('');
    const dialog = page.locator('dialog#detailModal');

    await page.keyboard.press('Enter');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog).toContainText(name);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(button).toBeFocused();

    await page.keyboard.press('Space');
    await expect(dialog).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  });

  test('@a11y Un nodo de evolución se abre con teclado y el foco pasa al título de la nueva ficha', async ({
    page,
  }) => {
    await page.locator('.pokemon-card[data-pokemon-id="6"] .card-open').focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('dialog#detailModal');
    await expect(dialog).toHaveAttribute('open', '');

    const title = dialog.locator('h2.pokedex-notched-title');
    const before = await title.textContent();
    const node = dialog.locator('.evolution-node-item[role="button"]').first();
    await node.focus();
    await page.keyboard.press('Enter');

    await expect(title).not.toHaveText(before ?? '');
    await expect(title).toBeFocused();
    await expect(dialog.locator('.evolution-node-item[aria-current="true"]')).toHaveCount(1);
  });

  test('@coep El arte de la megaevolución carga efectivamente (COEP require-corp)', async ({ page }) => {
    await page.locator('.pokemon-card[data-pokemon-id="6"]').click();
    await page.locator('.mega-toggle').click();
    const img = page.locator('#mega-panel-0 img');
    await expect(img).toBeVisible();

    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))
      .toBe(true);
  });
});
