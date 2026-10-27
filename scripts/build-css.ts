#!/usr/bin/env node
/**
 * =============================================================================
 * Compilador y Validador Canónico de Estilos Frontend [AUD-CODE-CSS-001]
 * =============================================================================
 *
 * `apps/frontend/src/styles/*.css` es el SSOT modular de los estilos del frontend.
 * `apps/frontend/public/css/style.css` es el artefacto GENERADO para distribución,
 * empaquetado Nginx Alpine, compresión gzip y cache-busting determinista.
 *
 * Operaciones:
 * 1. MODO COMPILACIÓN (por defecto):
 *    - `node scripts/build-css.ts` o `npm run build:css`
 *    - Concatena los módulos ordenados secuencialmente en `public/css/style.css`.
 *
 * 2. MODO VERIFICACIÓN (CI & Quality Gates):
 *    - `node scripts/build-css.ts --check` o `npm run build:css:check`
 *    - Comprueba paridad estricta 1:1 entre los módulos SSOT y el artefacto distribuido.
 *    - Falla con código 1 si existe drift no regenerado.
 * =============================================================================
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(fileURLToPath(import.meta.url), '../..');
const STYLES_DIR = resolve(ROOT_DIR, 'apps/frontend/src/styles');
const OUTPUT_FILE = resolve(ROOT_DIR, 'apps/frontend/public/css/style.css');

export function compileStyles(): string {
  const files = readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith('.css'))
    .sort();

  if (files.length === 0) {
    throw new Error(`No se encontraron archivos CSS en ${STYLES_DIR}`);
  }

  const sections = files.map((file) => {
    const filePath = resolve(STYLES_DIR, file);
    return readFileSync(filePath, 'utf-8');
  });

  return sections.join('\n');
}

export function run(args = process.argv.slice(2)): void {
  const isCheckMode = args.includes('--check');
  const compiled = compileStyles();

  if (isCheckMode) {
    let current = '';
    try {
      current = readFileSync(OUTPUT_FILE, 'utf-8');
    } catch {
      console.error(`❌ Error: El archivo destino ${OUTPUT_FILE} no existe.`);
      process.exit(1);
    }

    if (current !== compiled) {
      console.error(
        '❌ Drift detectado: apps/frontend/public/css/style.css no coincide con los módulos en apps/frontend/src/styles/.\n' +
          '➜ Ejecute "npm run build:css" para regenerar el artefacto compilado.',
      );
      process.exit(1);
    }

    console.log(
      '✅ PASS: apps/frontend/public/css/style.css mantiene paridad estricta 1:1 con apps/frontend/src/styles/.',
    );
    return;
  }

  writeFileSync(OUTPUT_FILE, compiled, 'utf-8');
  console.log(`✨ CSS compilado exitosamente desde ${STYLES_DIR} hacia ${OUTPUT_FILE}.`);
}

if (process.argv[1]?.endsWith('build-css.ts') || process.argv[1]?.endsWith('build-css.js')) {
  run();
}
