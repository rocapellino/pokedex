import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'apps/frontend');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

/** Archivos que declaran la CSP de la aplicación (cada uno debe permanecer sincronizado). */
const CSP_SOURCES = [
  'apps/frontend/nginx.conf.template',
  'apps/frontend/nginx.conf',
  'apps/backend/server.ts',
  'infra/helm/pokedex/values.yaml',
  'infra/helm/pokedex/values.prod.yaml',
];

/** Extrae el valor de una directiva (`style-src`, `font-src`) de cada CSP del archivo. */
function directives(content: string, name: string): string[] {
  return [...content.matchAll(new RegExp(`Content-Security-Policy[\\s\\S]{0,400}?${name} ([^;"\\n]*)`, 'g'))].map((m) =>
    (m[1] ?? '').trim(),
  );
}

test('🔤 Fuentes: ninguna página ni hoja de estilo depende de Google Fonts', () => {
  for (const rel of ['index.html', 'backoffice.html', 'public/css/style.css', 'public/css/backoffice.css']) {
    const content = fs.readFileSync(path.join(FRONTEND, rel), 'utf-8');
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(content), `${rel} no debe referenciar Google Fonts`);
  }
});

test('🔤 Fuentes: los .woff2 declarados en @font-face existen y son archivos WOFF2 válidos', () => {
  const css = fs.readFileSync(path.join(FRONTEND, 'public/css/style.css'), 'utf-8');
  const urls = [...css.matchAll(/url\(['"]?(\/fonts\/[^'")]+\.woff2)['"]?\)/g)].map((m) => m[1] as string);
  assert.ok(urls.length >= 2, 'Outfit y Space Grotesk deben declararse con @font-face');

  for (const url of urls) {
    const file = path.join(FRONTEND, 'public', url);
    assert.ok(fs.existsSync(file), `${url} debe existir en apps/frontend/public`);
    assert.equal(fs.readFileSync(file).subarray(0, 4).toString('ascii'), 'wOF2', `${url} debe ser WOFF2`);
  }
  assert.match(css, /font-display:\s*swap/);
});

test('🔤 Fuentes: las familias usadas por el CSS están declaradas con @font-face', () => {
  const css = fs.readFileSync(path.join(FRONTEND, 'public/css/style.css'), 'utf-8');
  for (const family of ['Outfit', 'Space Grotesk']) {
    assert.match(css, new RegExp(`@font-face\\s*{[^}]*font-family:\\s*'${family}'`), `falta @font-face de ${family}`);
  }
});

test('🔤 CSP: style-src y font-src son solo \'self\' en todas las fuentes de la política', () => {
  for (const rel of CSP_SOURCES) {
    const content = read(rel);
    for (const name of ['style-src', 'font-src']) {
      const found = directives(content, name);
      assert.ok(found.length > 0, `${rel} debe declarar ${name}`);
      for (const value of found) {
        assert.equal(value, "'self'", `${rel}: ${name} debe ser 'self' (sin orígenes de fuentes externos), no "${value}"`);
      }
    }
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(content), `${rel} no debe permitir Google Fonts`);
  }
});
