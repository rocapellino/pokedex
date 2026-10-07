import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guardas del punto único de inserción de HTML. Son una comprobación de texto, no un análisis de
 * flujo (no detectan `el['inner' + 'HTML']`): la barrera real es el tipo `SafeHtml` más DOMPurify
 * dentro de `setHtml`. Estas pruebas evitan que alguien reintroduzca las vías antiguas por descuido.
 * Cada excepción se declara por archivo, y añadir una exige tocar esta prueba y justificarla.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/frontend/src');

function listSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Quita comentarios para que una mención en la documentación no cuente como uso. */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = listSources(SRC).map((file) => ({
  name: path.relative(SRC, file).split(path.sep).join('/'),
  code: stripComments(fs.readFileSync(file, 'utf-8')),
}));

function offenders(pattern: RegExp, allowed: string[]): string[] {
  return files.filter((f) => !allowed.includes(f.name) && pattern.test(f.code)).map((f) => f.name);
}

test('🛡️ Guarda: solo shared/html.ts asigna HTML al DOM', () => {
  const sinks = /\.(innerHTML|outerHTML)\s*(\+|=(?!=))|insertAdjacentHTML\s*\(|document\.write(ln)?\s*\(/;
  assert.deepEqual(offenders(sinks, ['shared/html.ts']), []);
});

test('🛡️ Guarda: escapeText solo se usa dentro de html.ts y sanitizer.ts', () => {
  assert.deepEqual(offenders(/\bescapeText\b/, ['shared/html.ts', 'sanitizer.ts']), []);
});

test('🛡️ Guarda: sanitizeHtml solo se importa en html.ts y sanitizer.ts', () => {
  assert.deepEqual(offenders(/\bsanitizeHtml\b/, ['shared/html.ts', 'sanitizer.ts', 'shared/ui.ts']), []);
});

test('🛡️ Guarda: trustedHtml solo lo usan html.ts y shared/ui.ts', () => {
  assert.deepEqual(offenders(/\btrustedHtml\s*\(/, ['shared/html.ts', 'shared/ui.ts']), []);
});

test('🛡️ Guarda: la detección encuentra las vías antiguas (la prueba no es un falso verde)', () => {
  const sinks = /\.(innerHTML|outerHTML)\s*(\+|=(?!=))|insertAdjacentHTML\s*\(|document\.write(ln)?\s*\(/;
  for (const sample of [
    'a.innerHTML = x',
    'a.innerHTML += x',
    'a.outerHTML=x',
    'a.insertAdjacentHTML(',
    'document.write(',
  ]) {
    assert.ok(sinks.test(sample), sample);
  }
  assert.ok(!sinks.test('if (a.innerHTML === "")'), 'una comparación no es una asignación');
  assert.equal(stripComments('// escapeText()\nconst a = 1;').includes('escapeText'), false);
});
