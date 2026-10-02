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
import { validateDocsGovernance } from '../../scripts/validate-docs-governance.ts';

test('📚 Gobernanza Documental: validateDocsGovernance() no reporta enlaces rotos, esquemas locales ni drift', () => {
  const violations = validateDocsGovernance();

  assert.strictEqual(
    violations.length,
    0,
    `Se detectaron ${violations.length} violaciones de gobernanza documental:\n` +
      violations.map((v) => `  - [${v.rule}] ${v.file}: ${v.message}`).join('\n')
  );
});
