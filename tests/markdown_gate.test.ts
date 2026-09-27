import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lintMarkdown, parseIgnorePatterns, findMarkdownFiles } from '../scripts/lint-markdown.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('📚 Markdown Gate: una ruta explícita inexistente debe fallar (fail-closed, CI-006)', async () => {
  // Regresión: `lint:md` filtraba silenciosamente las rutas inexistentes con
  // `if (fs.existsSync(...))`. Podar un documento (p. ej. una auditoría) hacía que
  // el gate dejara de validarlo sin emitir error, degradiándose a un falso verde.
  await assert.rejects(
    () => lintMarkdown({ files: ['docs/audits/no-existe/nunca-existira.md'] }),
    /no se encontraron los archivos solicitados/,
    'Una ruta Markdown inexistente debe producir error, no un PASS silencioso'
  );
});

test('📚 Markdown Gate: falla aunque solo una de varias rutas sea inexistente', async () => {
  await assert.rejects(
    () => lintMarkdown({ files: ['README.md', 'docs/audits/no-existe/x.md'] }),
    /no se encontraron los archivos solicitados/,
    'Una sola ruta inexistente debe hacer fallar el gate completo'
  );
});

test('📚 Markdown Gate: valida un archivo existente real y reporta 0 errores', async () => {
  const report = await lintMarkdown({ files: ['README.md'] });

  assert.equal(report.filesChecked, 1, 'Debe validar exactamente el archivo solicitado');
  assert.equal(report.passed, true, 'README.md debe pasar el Markdown Quality Gate');
  assert.equal(report.finalErrors, 0, 'README.md no debe tener errores MDxxx');
});

test('📚 Markdown Gate: un directorio existente se expande recursivamente', async () => {
  const report = await lintMarkdown({ files: ['docs/architecture'] });

  assert.ok(report.filesChecked > 0, 'Debe descubrir Markdown dentro del directorio');
  assert.equal(report.passed, true, 'docs/architecture debe pasar el Quality Gate');
  assert.equal(report.finalErrors, 0, 'docs/architecture no debe tener errores MDxxx');
});

test('📚 Markdown Gate: sin archivos explícitos valida el repositorio completo', async () => {
  const report = await lintMarkdown();

  assert.ok(report.filesChecked > 50, `Debe cubrir el árbol documental completo, cubiertos: ${report.filesChecked}`);
  assert.equal(report.passed, true, 'El repositorio completo debe pasar el Quality Gate');
  assert.equal(report.finalErrors, 0, 'No debe haber errores MDxxx pendientes en el repositorio');
});

test('📚 Markdown Gate: parseIgnorePatterns ignora comentarios y líneas vacías', () => {
  const patterns = parseIgnorePatterns(path.join(ROOT_DIR, '.markdownlintignore'));

  assert.ok(Array.isArray(patterns));
  assert.ok(patterns.includes('node_modules/'), 'Debe preservar patrones reales');
  assert.ok(!patterns.some((p) => p.startsWith('#')), 'No debe devolver comentarios');
  assert.ok(!patterns.includes(''), 'No debe devolver líneas vacías');
});

test('📚 Markdown Gate: findMarkdownFiles respeta el directorio .markdownlintignore', () => {
  const ignorePatterns = parseIgnorePatterns(path.join(ROOT_DIR, '.markdownlintignore'));
  const found = findMarkdownFiles(ROOT_DIR, ROOT_DIR, ignorePatterns);

  assert.ok(found.length > 0, 'Debe encontrar archivos Markdown');
  assert.ok(
    !found.some((f) => f.replace(/\\/g, '/').includes('node_modules')),
    'No debe incluir archivos bajo node_modules'
  );
  assert.ok(
    found.every((f) => f.endsWith('.md')),
    'Solo debe devolver archivos .md'
  );
});
