import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('📚 Gobernanza Documental: validación contractual de la skill repo-doc-governance y políticas normativas', () => {
  const rootDir = process.cwd();
  const governanceDir = path.join(rootDir, '.agents', 'skills', 'repo-doc-governance');
  const skillFile = path.join(governanceDir, 'SKILL.md');
  const contractFile = path.join(governanceDir, 'references', 'documentation-contract.yaml');

  // 1. Verificación de existencia de SKILL.md y frontmatter
  assert.ok(fs.existsSync(skillFile), 'repo-doc-governance/SKILL.md debe existir');
  const skillContent = fs.readFileSync(skillFile, 'utf-8');
  assert.ok(skillContent.includes('name: repo-doc-governance'), 'SKILL.md debe declarar name: repo-doc-governance');

  // 2. Verificación de existencia de documentation-contract.yaml
  assert.ok(fs.existsSync(contractFile), 'documentation-contract.yaml debe existir');
  const contractContent = fs.readFileSync(contractFile, 'utf-8');
  assert.ok(contractContent.includes('framework: "repo-doc-governance"'), 'Debe declarar framework repo-doc-governance');
  assert.ok(contractContent.includes('README.md:'), 'Debe definir contrato para README.md');
  assert.ok(contractContent.includes('SECURITY.md:'), 'Debe definir contrato para SECURITY.md');
  assert.ok(contractContent.includes('README-ARCH-001'), 'Debe contener regla README-ARCH-001');

  // 3. Verificación de referencias normativas requeridas
  const requiredPolicies = [
    'documentation-boundaries.md',
    'readme-policy.md',
    'security-policy.md',
    'documentation-drift-policy.md',
    'documentation-update-policy.md',
    'documentation-retirement-policy.md',
    'documentation-evidence-policy.md',
  ];

  for (const policy of requiredPolicies) {
    const policyPath = path.join(governanceDir, 'references', policy);
    assert.ok(fs.existsSync(policyPath), `Referencia normativa ${policy} debe existir en references/`);
  }

  // 4. Verificación de registro en AGENTS.md
  const agentsFile = path.join(rootDir, 'AGENTS.md');
  const agentsContent = fs.readFileSync(agentsFile, 'utf-8');
  assert.ok(agentsContent.includes('`repo-doc-governance`'), 'AGENTS.md debe registrar repo-doc-governance en el catalogo de skills');
});
