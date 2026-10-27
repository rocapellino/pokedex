import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { preparePrBody } from '../../scripts/prepare-pr-body.ts';
import { validatePrBody, discoverPrTemplate } from '../../scripts/validate-pr-body.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('📋 prepare-pr-body: genera un PR body válido que cumple estrictamente el contrato canónico', () => {
  const tmpOut = path.join(REPO_ROOT, 'tmp', 'test-prepare-pr-body.md');
  try {
    const res = preparePrBody({
      outputPath: tmpOut,
    });

    assert.equal(res.isValid, true, `Infracciones encontradas: ${res.issues.join(', ')}`);
    assert.ok(fs.existsSync(tmpOut), 'El archivo de salida debe existir');

    const content = fs.readFileSync(tmpOut, 'utf-8');

    // 1. No debe contener placeholders de tabla sin resolver
    assert.equal(/\|\s*—\s*\|/.test(content), false, 'No debe tener placeholders no resueltos');

    // 2. No debe contener comentarios crudos de tabla sin sustituir
    assert.equal(/<!-- INICIO TABLA GENERADA/.test(content), false, 'Comentario de directiva debe estar sustituido');

    // 3. Debe contener la tabla de CI Impact resuelta
    assert.ok(
      content.includes('| Dominio / Calidad | Impacto | Pipeline / Quality Gate |'),
      'Debe incluir la tabla de CI Impact',
    );

    // 4. Debe validar con validatePrBody directamente
    const templatePath = discoverPrTemplate(REPO_ROOT);
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const val = validatePrBody(templateContent, content, templatePath);
    assert.equal(val.isValid, true, `Validación directa falló: ${val.issues.map((i) => i.message).join('; ')}`);
  } finally {
    if (fs.existsSync(tmpOut)) {
      fs.unlinkSync(tmpOut);
    }
  }
});
