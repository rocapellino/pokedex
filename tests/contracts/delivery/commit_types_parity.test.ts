import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT_DIR } from '../../helpers/repo.js';

test('🛡️ Contrato de Commits: commitlint.config.js y .pre-commit-config.yaml mantienen paridad estricta en sus tipos', () => {
  const rootDir = ROOT_DIR;
  const commitlintPath = path.join(rootDir, 'commitlint.config.js');
  const preCommitPath = path.join(rootDir, '.pre-commit-config.yaml');

  assert.ok(fs.existsSync(commitlintPath), 'commitlint.config.js debe existir');
  assert.ok(fs.existsSync(preCommitPath), '.pre-commit-config.yaml debe existir');

  const commitlintRaw = fs.readFileSync(commitlintPath, 'utf-8');
  assert.ok(commitlintRaw.includes("'type-enum'"), 'commitlint.config.js debe declarar la regla type-enum');
  const typeEnumBlock = commitlintRaw.slice(commitlintRaw.indexOf("'type-enum'"));
  const arrayStart = typeEnumBlock.indexOf('[');
  const innerArrayStart = typeEnumBlock.indexOf('[', arrayStart + 1);
  const innerArrayEnd = typeEnumBlock.indexOf(']', innerArrayStart);
  const commitlintTypes = typeEnumBlock
    .slice(innerArrayStart + 1, innerArrayEnd)
    .split(',')
    .map((t) => t.replace(/['"\s\r\n]/g, ''))
    .filter(Boolean);

  const preCommitRaw = fs.readFileSync(preCommitPath, 'utf-8');
  const preCommitMatch = preCommitRaw.match(/id:\s*conventional-pre-commit[\s\S]*?args:\s*\[(.*?)\]/);
  assert.ok(preCommitMatch, '.pre-commit-config.yaml debe declarar conventional-pre-commit con args');
  const preCommitTypes = preCommitMatch[1]
    .split(',')
    .map((t) => t.replace(/['"\s\r\n]/g, ''))
    .filter(Boolean);

  assert.deepEqual(
    commitlintTypes.sort(),
    preCommitTypes.sort(),
    'Los tipos de commit permitidos en commitlint.config.js y .pre-commit-config.yaml deben ser idénticos',
  );
  assert.ok(commitlintTypes.length >= 8, 'Debe haber al menos 8 tipos estándar configurados');
});
