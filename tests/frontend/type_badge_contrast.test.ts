import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const CSS = read('apps/frontend/public/css/style.css');

/** WCAG 2.1 AA para texto normal (12,8 px, peso 600: no aplica la excepción del texto grande). */
const MIN_CONTRAST = 4.5;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

interface TypeRule {
  type: string;
  color?: string;
  fg?: string;
  official?: string;
  officialFg?: string;
}

/** Reglas `[data-type="x"] { --type-color: ...; ... }` de la hoja de estilos. */
function typeRules(): TypeRule[] {
  const prop = (body: string, name: string): string | undefined => {
    const start = body.indexOf(`--${name}:`);
    if (start < 0) return undefined;
    const value = body.slice(start + name.length + 3).trim();
    return /^#[0-9a-fA-F]{6}/.test(value) ? value.slice(0, 7) : undefined;
  };
  return [...CSS.matchAll(/\[data-type="([a-z]+)"\]\s*{([^}]*--type-color[^}]*)}/g)].map((m) => ({
    type: m[1] as string,
    color: prop(m[2] as string, 'type-color'),
    fg: prop(m[2] as string, 'type-fg'),
    official: prop(m[2] as string, 'type-official'),
    officialFg: prop(m[2] as string, 'official-fg'),
  }));
}

const rules = typeRules();

test('🎨 Contraste: existen las 18 reglas de tipo, cada una con sus cuatro colores declarados', () => {
  assert.equal(rules.length, 18);
  for (const r of rules) {
    assert.ok(
      r.color && r.fg && r.official && r.officialFg,
      `[data-type="${r.type}"] debe declarar los cuatro colores`,
    );
  }
});

for (const r of rules) {
  test(`🎨 Contraste: la insignia "${r.type}" cumple WCAG AA con su texto (type-color y type-official)`, () => {
    const badge = contrast(r.color as string, r.fg as string);
    const pill = contrast(r.official as string, r.officialFg as string);
    assert.ok(
      badge >= MIN_CONTRAST,
      `${r.type}: ${r.fg} sobre ${r.color} = ${badge.toFixed(2)}:1 (mínimo ${MIN_CONTRAST})`,
    );
    assert.ok(
      pill >= MIN_CONTRAST,
      `${r.type}: ${r.officialFg} sobre ${r.official} = ${pill.toFixed(2)}:1 (mínimo ${MIN_CONTRAST})`,
    );
  });
}

test('🎨 Contraste: las insignias usan el color de texto por tipo en lugar de blanco fijo', () => {
  // Se buscan solo las reglas posteriores al bloque de variables, que son las que pintan el color.
  const after = CSS.slice(CSS.indexOf('/* Variables de Color por Tipo'));
  const block = (selector: string): string => {
    const start = after.indexOf(`\n${selector} {`);
    return start < 0 ? '' : after.slice(start, after.indexOf('}', start));
  };
  assert.match(block('.type-badge'), /color:\s*var\(--type-fg,/);
  assert.match(block('.official-type-pill'), /color:\s*var\(--official-fg,/);
  assert.match(block('.evolution-type-mini'), /color:\s*var\(--official-fg,/);
});

test('🎨 Contraste: el degradado de la insignia Mega cumple WCAG AA con texto blanco en ambos extremos', () => {
  const rule = /\.mega-badge\s*{([^}]*)}/.exec(CSS)?.[1] ?? '';
  const stops = /linear-gradient\(135deg,\s*(#[0-9a-f]{6}) 0%,\s*(#[0-9a-f]{6}) 100%\)/i.exec(rule);
  assert.ok(stops, '.mega-badge debe tener un degradado de dos colores');
  for (const stop of [stops[1], stops[2]] as string[]) {
    assert.ok(
      contrast(stop, '#ffffff') >= MIN_CONTRAST,
      `${stop} con texto blanco = ${contrast(stop, '#ffffff').toFixed(2)}:1`,
    );
  }
});

test('🎨 Contraste: el escaneo E2E del backoffice ya no desactiva la regla color-contrast', () => {
  const spec = read('tests/e2e/backoffice.spec.ts');
  assert.ok(!/disableRules\(\[[^\]]*color-contrast/.test(spec), 'desactivar color-contrast ocultó este defecto');
});
