import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { AAS_INTEGRITY, AAS_VERSION, validateAasGovernance } from '../../../scripts/aas-governance.js';
import { ROOT_DIR } from '../../helpers/repo.js';

function withFixture(
  mutate: (stack: Record<string, any>, review: Record<string, any>, root: string) => void,
): string[] {
  const root = join(tmpdir(), `pokedex-aas-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const directory = join(root, '.agents', 'aas');
  mkdirSync(directory, { recursive: true });
  cpSync(join(ROOT_DIR, '.agents/aas/aas-stack.json'), join(directory, 'aas-stack.json'));
  cpSync(join(ROOT_DIR, '.agents/aas/reviewed-selection.json'), join(directory, 'reviewed-selection.json'));
  cpSync(join(ROOT_DIR, '.agents/skills'), join(root, '.agents', 'skills'), { recursive: true });
  const stackPath = join(directory, 'aas-stack.json');
  const reviewPath = join(directory, 'reviewed-selection.json');
  const stack = JSON.parse(readFileSync(stackPath, 'utf8')) as Record<string, any>;
  const review = JSON.parse(readFileSync(reviewPath, 'utf8')) as Record<string, any>;
  try {
    mutate(stack, review, root);
    if (readFileSync(stackPath, 'utf8').trim() !== '{') writeFileSync(stackPath, `${JSON.stringify(stack)}\n`);
    writeFileSync(reviewPath, `${JSON.stringify(review)}\n`);
    return validateAasGovernance(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('la selección AAS cumple el contrato local', () => {
  assert.deepEqual(validateAasGovernance(ROOT_DIR), []);
});

test('AAS está fijado por versión y digest', () => {
  assert.equal(AAS_VERSION, '18.6.0');
  assert.equal(AAS_INTEGRITY, 'sha256-03db2fa823981728151843f4f278982b518c8e1e27d980e173218cb1f82025c0');
});

test('rechaza sustituir coordinadamente una skill en manifest y revisión', () => {
  const errors = withFixture((stack, review) => {
    stack.skills[0].id = 'architecture-review';
    review.approved[0].id = 'architecture-review';
  });
  assert.ok(errors.some((error) => error.includes('allowlist')));
});

test('rechaza una skill AAS cuyo responsable local no existe', () => {
  const errors = withFixture((_stack, _review, root) => {
    rmSync(join(root, '.agents', 'skills', 'repo-docs'), { recursive: true, force: true });
  });
  assert.deepEqual(errors, [
    'La skill local repo-docs, responsable de documentation-and-adrs, no existe en .agents/skills/.',
  ]);
});

test('rechaza riesgo, responsables y razón divergentes', () => {
  const errors = withFixture((_stack, review) => {
    review.approved[0].risk = 'safe';
    review.approved[0].governedBy = ['repo-lifecycle'];
    review.approved[0].reason = ' ';
  });
  assert.ok(errors.some((error) => error.includes('riesgo declarado')));
  assert.ok(errors.some((error) => error.includes('responsables locales')));
  assert.ok(errors.some((error) => error.includes('razón de aprobación')));
});

test('rechaza una novena skill y metadata ausente', () => {
  const errors = withFixture((stack, review) => {
    stack.skills.push({ id: 'architecture-review' });
    review.policy.maxSkills = 9;
    delete stack.schemaVersion;
  });
  assert.ok(errors.some((error) => error.includes('schemaVersion')));
  assert.ok(errors.some((error) => error.includes('maxSkills')));
  assert.ok(errors.some((error) => error.includes('allowlist')));
});

test('reporta JSON inválido como error gobernado', () => {
  const errors = withFixture((_stack, _review, root) => {
    writeFileSync(join(root, '.agents', 'aas', 'aas-stack.json'), '{');
  });
  assert.ok(errors.some((error) => error.includes('No se pudo leer el manifest AAS')));
  assert.ok(errors.some((error) => error.includes('estructura mínima')));
});

test('los scripts no exponen apply, recover ni install', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const aasScripts = Object.entries(pkg.scripts).filter(([name]) => name.startsWith('aas:'));
  assert.ok(aasScripts.length > 0);
  for (const [name, command] of aasScripts) {
    assert.doesNotMatch(command, /\b(?:apply|recover|install)\b/, `${name} habilita una operación prohibida`);
  }
});

test('🧭 SKILL-001: repo-lifecycle declara tantas etapas como enumera', () => {
  const skill = readFileSync(join(ROOT_DIR, '.agents/skills/repo-lifecycle/SKILL.md'), 'utf-8');

  // Hay dos diagramas en la skill: uno de 6 fases (ciclo de vida) y otro de 16
  // (flujo canónico de full-audit). Este último es el que debe coincidir con las
  // menciones textuales, y se localiza por su última etapa.
  const marker = skill.indexOf('consolidated report');
  assert.ok(marker > -1, 'repo-lifecycle debe contener la etapa `consolidated report`');
  const start = skill.lastIndexOf('```', marker);
  const end = skill.indexOf('```', marker);
  assert.ok(start > -1 && end > start, 'La etapa final debe estar dentro de un bloque cercado');
  const flow = skill.slice(start, end);

  const numbered = [...flow.matchAll(/(?:^|\s)(\d+)\.\s+\S/gm)].map((m) => Number(m[1]));
  const max = Math.max(...numbered);
  assert.equal(
    max,
    numbered.length,
    `La enumeración debe ser contigua: declara ${max} pero enumera ${numbered.length}`,
  );

  // Todas las menciones textuales deben coincidir con la enumeración real.
  const declared = [...skill.matchAll(/(\d+)\s*etapas/g)].map((m) => Number(m[1]));
  for (const count of declared) {
    assert.equal(
      count,
      numbered.length,
      `repo-lifecycle declara "${count} etapas" pero el flujo enumera ${numbered.length}`,
    );
  }
  assert.ok(declared.length > 0, 'repo-lifecycle debe declarar el número de etapas');
});

test('📚 SKILL-001: las skills no citan workflows con la extensión .yml obsoleta', () => {
  const offenders: string[] = [];
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.name.endsWith('.md')) out.push(full);
    }
    return out;
  };

  for (const file of walk(join(ROOT_DIR, '.agents'))) {
    const content = readFileSync(file, 'utf-8');
    const match = content.match(/workflows\/\*\.yml|workflows\/[a-z0-9-]+\.yml/);
    if (match) offenders.push(`${relative(ROOT_DIR, file)} -> ${match[0]}`);
  }

  assert.deepEqual(offenders, [], `Skills con referencias .yml obsoletas: ${offenders.join('; ')}`);
});
