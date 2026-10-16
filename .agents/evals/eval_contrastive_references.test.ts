/**
 * ==============================================================================
 * .agents/evals/eval_contrastive_references.test.ts
 * ==============================================================================
 * Evaluación conductual: Conformidad del Patrón Contrastivo de Referencias.
 *
 * Reglas evaluadas:
 *   1. Existencia del índice maestro .agents/references/_sections.md.
 *   2. Toda guía en .agents/references/ cumple la estructura canónica de 4 bloques:
 *      - ## 1. Por qué importa (Why It Matters)
 *      - ## 2. Incorrecto (Incorrect)
 *      - ## 3. Correcto (Correct)
 *      - ## 4. Referencias
 *   3. Todo archivo en .agents/references/ está indexado en _sections.md.
 * ==============================================================================
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const REFERENCES_DIR = path.join(ROOT_DIR, '.agents', 'references');

test('🤖 Eval Referencias: El índice maestro _sections.md existe y no está vacío', () => {
  const indexPath = path.join(REFERENCES_DIR, '_sections.md');
  assert.ok(fs.existsSync(indexPath), '_sections.md debe existir en .agents/references/');
  const content = fs.readFileSync(indexPath, 'utf-8');
  assert.ok(content.length > 100, '_sections.md debe tener contenido documentado');
});

test('🤖 Eval Referencias: Todas las guías de referencia cumplen la estructura canónica de 4 bloques contrastivos', () => {
  assert.ok(fs.existsSync(REFERENCES_DIR), 'Directorio .agents/references/ debe existir');
  const files = fs.readdirSync(REFERENCES_DIR).filter((f) => f.endsWith('.md') && f !== '_sections.md');
  assert.ok(files.length > 0, 'Debe haber guías de referencia en .agents/references/');

  const indexContent = fs.readFileSync(path.join(REFERENCES_DIR, '_sections.md'), 'utf-8');

  for (const file of files) {
    const content = fs.readFileSync(path.join(REFERENCES_DIR, file), 'utf-8');

    // 1. Debe estar referenciado en el índice maestro
    assert.ok(indexContent.includes(file), `La guía ${file} debe estar indexada en .agents/references/_sections.md`);

    // 2. Bloque 1: Por qué importa
    assert.match(
      content,
      /##\s*1\.\s*Por qué importa\s*\(\s*Why It Matters\s*\)/i,
      `${file} debe contener la sección "## 1. Por qué importa (Why It Matters)"`,
    );

    // 3. Bloque 2: Incorrecto
    assert.match(
      content,
      /##\s*2\.\s*Incorrecto\s*\(\s*Incorrect\s*\)/i,
      `${file} debe contener la sección "## 2. Incorrecto (Incorrect)"`,
    );

    // 4. Bloque 3: Correcto
    assert.match(
      content,
      /##\s*3\.\s*Correcto\s*\(\s*Correct\s*\)/i,
      `${file} debe contener la sección "## 3. Correcto (Correct)"`,
    );

    // 5. Bloque 4: Referencias
    assert.match(content, /##\s*4\.\s*Referencias/i, `${file} debe contener la sección "## 4. Referencias"`);
  }
});
