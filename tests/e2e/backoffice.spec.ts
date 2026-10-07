import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const TEST_ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'test-admin-e2e-token-secret-1234567890';

test.describe('Pokédex Backoffice E2E & Admin Suite ([TST-001])', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/backoffice');
  });

  test('La interfaz del Backoffice carga con KPIs, branding y tabla administrativa', async ({ page }) => {
    await expect(page).toHaveTitle(/Pokédex Backoffice/i);
    await expect(page.locator('.brand-title')).toHaveText('Pokédex Backoffice');
    await expect(page.locator('.brand-badge')).toHaveText('Panel CRUD');

    // Validar visualización de KPIs operativos
    await expect(page.locator('#kpiTotal')).toBeVisible();
    await expect(page.locator('#kpiTypes')).toBeVisible();
    await expect(page.locator('#kpiAvgPower')).toBeVisible();
    await expect(page.locator('#kpiCacheStatus')).toBeVisible();

    // Validar carga de tabla de registros (esperar que se sustituya el spinner de carga por datos reales)
    const tableBody = page.locator('#adminTableBody');
    await expect(tableBody).toBeVisible();
    const rows = tableBody.locator('.pokemon-table-name');
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('El buscador administrativo filtra registros en la tabla por nombre', async ({ page }) => {
    const searchInput = page.locator('#adminSearch');
    await expect(searchInput).toBeVisible();

    // Esperar carga inicial de filas de Pokémon
    await expect(page.locator('.pokemon-table-name').first()).toBeVisible({ timeout: 15000 });

    // Filtrar por Bulbasaur
    await searchInput.fill('Bulbasaur');

    // Esperar que la tabla procese la búsqueda y renderice el Pokémon filtrado
    const filteredName = page.locator('#adminTableBody .pokemon-table-name').first();
    await expect(filteredName).toBeVisible({ timeout: 15000 });
    await expect(filteredName).toContainText(/Bulbasaur/i);
  });

  test('El modal de creación de Pokémon se abre y cierra correctamente', async ({ page }) => {
    const createBtn = page.locator('#btnOpenCreate');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    const crudModal = page.locator('#crudModal');
    await expect(crudModal).toBeVisible();
    await expect(crudModal).toHaveAttribute('open', '');
    await expect(page.locator('#crudModalTitle')).toHaveText(/Registrar Nuevo Pokémon/i);

    // Validar visibilidad del botón de cierre y cerrar modal vía interacción de teclado (Escape / A11y)
    const closeBtn = page.locator('#crudModal [data-close-crud]').first();
    await expect(closeBtn).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(crudModal).not.toHaveAttribute('open');
  });

  test('El flujo de autenticación administrativa valida credenciales y actualiza la UI', async ({ page }) => {
    const authBtn = page.locator('#btnAdminAuth');
    await expect(authBtn).toBeVisible();
    await authBtn.click({ force: true });

    const authModal = page.locator('#authModal');
    await expect(authModal).toHaveAttribute('open', '');

    const apiKeyInput = page.locator('#adminApiKeyInput');
    await expect(apiKeyInput).toBeVisible();

    // Intento con clave inválida
    await apiKeyInput.fill('clave-invalida-para-test');
    await page.locator('#btnSaveKey').click({ force: true });
    await page.waitForTimeout(500);

    // El modal debe permanecer abierto tras fallo de autenticación
    await expect(authModal).toHaveAttribute('open', '');

    // Intento con clave válida de test
    await apiKeyInput.fill(TEST_ADMIN_KEY);
    await page.locator('#btnSaveKey').click({ force: true });

    // Modal debe cerrarse y el estado debe reflejarse en la UI
    await expect(authModal).not.toHaveAttribute('open', { timeout: 10000 });
    await expect(page.locator('#authStatusText')).toHaveText('Admin Activo');
    await expect(authBtn).toHaveClass(/btn-auth-active/);
  });

  test('@a11y El modal de autenticación enfoca la clave y devuelve el foco al cerrarse con Escape', async ({
    page,
  }) => {
    const authBtn = page.locator('#btnAdminAuth');
    await authBtn.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog', { name: /Autenticación/ })).toBeVisible();
    await expect(page.locator('#adminApiKeyInput')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#authModal')).not.toHaveAttribute('open');
    await expect(authBtn).toBeFocused();
  });

  test('@a11y Auditoría de accesibilidad WCAG en Backoffice', async ({ page }) => {
    await page.waitForSelector('.pokemon-table-name', { timeout: 15000 });

    // color-contrast permanece activo: desactivarlo ocultó que 13 de 18 insignias de tipo incumplían 4,5:1.
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(seriousViolations).toEqual([]);
  });
});
