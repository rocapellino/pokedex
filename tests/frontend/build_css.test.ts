import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStyles } from '../../scripts/build-css.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STYLES_DIR = path.join(ROOT_DIR, 'apps/frontend/src/styles');
const OUTPUT_FILE = path.join(ROOT_DIR, 'apps/frontend/public/css/style.css');

test('🎨 Modular CSS (AUD-CODE-CSS-001): compileStyles genera el CSS concatenando todos los módulos', () => {
  const compiled = compileStyles();
  assert.ok(compiled.length > 0, 'El CSS compilado no debe estar vacío');

  const files = fs
    .readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith('.css'))
    .sort();
  assert.ok(files.length >= 14, `Se esperaban al menos 14 módulos de estilos, encontrados: ${files.length}`);

  // Verificar que el inicio y el final contienen las fuentes y evoluciones
  assert.match(compiled, /@font-face/, 'Debe contener declaraciones de fuentes');
  assert.match(compiled, /--type-color/, 'Debe contener variables de tipos Pokémon');
});

test('🎨 Modular CSS (AUD-CODE-CSS-001): public/css/style.css mantiene paridad estricta 1:1 con los módulos', () => {
  const compiled = compileStyles();
  const current = fs.readFileSync(OUTPUT_FILE, 'utf-8');

  assert.equal(
    current,
    compiled,
    'apps/frontend/public/css/style.css debe coincidir exactamente con la compilación de apps/frontend/src/styles/',
  );
});

test('🎨 Modular CSS (AUD-CODE-CSS-001): cada módulo individual cumple el límite de complejidad (< 600 líneas)', () => {
  const files = fs.readdirSync(STYLES_DIR).filter((f) => f.endsWith('.css'));

  for (const file of files) {
    const filePath = path.join(STYLES_DIR, file);
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').length;
    assert.ok(lines < 600, `El módulo ${file} supera el umbral de 600 líneas (${lines} líneas). Debe subdividirse.`);
  }
});
