/**
 * =============================================================================
 * Gate de Gobernanza Documental Integral [DOC-G01/G02/G03]
 * =============================================================================
 *
 * Valida de forma contractual y fail-closed que:
 *   1. Ningún archivo Markdown contenga URLs con esquema local `file:///`.
 *   2. Todos los enlaces relativos resuelvan a archivos existentes en disco.
 *   3. Todo documento en categorías activas esté indexado en docs/README.md.
 *   4. La versión de package.json y los contratos normativos no presenten drift.
 * =============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateDocsGovernance } from '../../scripts/validate-docs-governance.ts';

test('📚 Gobernanza Documental: el gate detecta enlaces rotos dentro de .agents/ y AGENTS.md', () => {
  // Regresión: la consolidación de ADR-022 en ADR-005 (#483) dejó un enlace roto en
  // .agents/skills/repo-security/SKILL.md que el gate no veía por limitarse a docs/.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-gate-'));
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.mkdirSync(path.join(root, '.agents', 'skills', 'repo-x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.0.0' }));
    fs.writeFileSync(
      path.join(root, '.agents', 'skills', 'repo-x', 'SKILL.md'),
      '[ADR retirado](../../../docs/decisions/ADR-999-retirado.md)\n',
    );
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '[regla](.agents/rules/inexistente.md)\n');

    const broken = validateDocsGovernance(root)
      .filter((v) => v.rule === 'DOC-G02-BROKEN-RELATIVE-LINK')
      .map((v) => v.file)
      .sort();

    assert.deepEqual(broken, ['.agents/skills/repo-x/SKILL.md', 'AGENTS.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('📚 Gobernanza Documental: validateDocsGovernance() no reporta enlaces rotos, esquemas locales ni drift', () => {
  const violations = validateDocsGovernance();

  assert.strictEqual(
    violations.length,
    0,
    `Se detectaron ${violations.length} violaciones de gobernanza documental:\n` +
      violations.map((v) => `  - [${v.rule}] ${v.file}: ${v.message}`).join('\n'),
  );
});
