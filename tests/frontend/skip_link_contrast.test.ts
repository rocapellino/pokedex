import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Axe no analiza el contraste del enlace de salto mientras está fuera de pantalla, así que se calcula
 * aquí con los colores declarados en la hoja de estilos: texto normal (4,5:1) y el enlace frente al
 * fondo de la página en ambos temas (3:1 para componentes de interfaz).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = fs.readFileSync(path.join(ROOT, 'apps/frontend/public/css/style.css'), 'utf-8');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Cuerpo de la regla cuyo selector es exactamente `selector`. */
function rule(selector: string): string {
  const start = CSS.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `falta la regla ${selector}`);
  return CSS.slice(start, CSS.indexOf('}', start));
}
function hex(body: string, prop: string): string {
  const at = body.indexOf(`${prop}:`);
  assert.ok(at >= 0, `falta ${prop}`);
  const match = /#[0-9a-fA-F]{6}/.exec(body.slice(at, at + 60));
  assert.ok(match, `${prop} debe ser un color hexadecimal explícito`);
  return match[0];
}
function themeBlock(theme: 'dark' | 'light'): string {
  const marker = theme === 'dark' ? ':root,\n[data-theme="dark"] {' : '[data-theme="light"] {';
  const start = CSS.indexOf(marker);
  assert.ok(start >= 0, `falta el tema ${theme}`);
  return CSS.slice(start, CSS.indexOf('}', start));
}

test('🎨 Enlace de salto: el texto supera 4,5:1 sobre su fondo', () => {
  const body = rule('.skip-link:focus-visible');
  assert.ok(contrast(hex(body, 'color'), hex(body, 'background')) >= 4.5);
});

test('🎨 Enlace de salto: el enlace se distingue (3:1) del fondo de la página en ambos temas', () => {
  const body = rule('.skip-link:focus-visible');
  const own = hex(body, 'background');
  const ring = hex(body, 'outline');
  for (const theme of ['dark', 'light'] as const) {
    const page = hex(themeBlock(theme), '--bg-primary');
    assert.ok(
      contrast(own, page) >= 3 || contrast(ring, page) >= 3,
      `${theme}: ni el fondo ni el contorno se distinguen`,
    );
  }
});

test('♿ Enlace de salto: respeta el atributo hidden y mide al menos 24 px de alto (WCAG 2.5.8)', () => {
  assert.match(CSS, /\.skip-link\[hidden\]\s*{\s*display:\s*none/);
  assert.match(rule('.skip-link:focus-visible'), /min-height:\s*(2[4-9]|[3-9]\d)px/);
});
