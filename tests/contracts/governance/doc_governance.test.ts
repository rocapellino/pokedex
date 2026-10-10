import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * AUD-GOV-ID-001 — Los identificadores de hallazgo deben llevar namespace.
 *
 * Los IDs planos (`DOC-001`, `WF-002`) colisionan entre auditorías sucesivas:
 * en este repositorio `DOC-001` designó "referencias históricas .yml" en una
 * pasada y "ambigüedad Active vs Cloud-Ready" en otra. Una referencia posterior
 * deja de ser unívoca, lo que contradice el principio *Evidence-First*.
 *
 * Este test blinda que la convención siga declarada y que ambas fuentes
 * (methodology.md y finding.md) no se desincronicen entre sí.
 */
test('🔖 Gobernanza de Hallazgos: la convención de IDs con namespace está declarada y es coherente', () => {
  const sharedDir = path.join(ROOT_DIR, '.agents', 'skills', '_shared');
  const methodology = fs.readFileSync(path.join(sharedDir, 'methodology.md'), 'utf-8');
  const finding = fs.readFileSync(path.join(sharedDir, 'finding.md'), 'utf-8');

  // 1. La convención vive en la metodología, que es la fuente de verdad.
  assert.match(
    methodology,
    /AUD-<ÁMBITO>-<CLAVE>-<NNN>/,
    'methodology.md debe declarar el formato AUD-<ÁMBITO>-<CLAVE>-<NNN>',
  );
  assert.match(
    methodology,
    /Identificadores de Hallazgo con Namespace/,
    'methodology.md debe tener una regla explícita sobre identificadores de hallazgo',
  );

  // 2. La plantilla de hallazgo la referencia y da ejemplos válidos e inválidos.
  assert.match(finding, /AUD-<ÁMBITO>-<CLAVE>-<NNN>/, 'finding.md debe declarar el formato de ID con namespace');
  assert.match(finding, /Inválidos/, 'finding.md debe advertir contra los IDs planos');

  // 3. Ambas fuentes concuerdan en el prefijo: si methodology cambia el prefijo y
  //    finding no, la convención queda contradictoria sin que nada lo detecte.
  const prefixIn = (text: string) => /\bAUD-/.test(text);
  assert.equal(
    prefixIn(methodology),
    prefixIn(finding),
    'methodology.md y finding.md deben usar el mismo prefijo de namespace',
  );

  // 4. El campo de trazabilidad de reemisión existe en la plantilla atómica.
  assert.match(
    finding,
    /Supersedes \/ Reemitido como/,
    'finding.md debe permitir citar el ID de la auditoría previa que se reemite',
  );

  // 5. Ninguna skill puede reintroducir el formato plano como si fuera válido.
  //    El patrón exige que el ID NO esté precedido por letra, dígito ni guion:
  //    así `README-SEC-001` (identificador de CONTRATO documental, namespace
  //    propio y legítimo) no se confunde con un ID de hallazgo plano.
  const skillDir = path.join(ROOT_DIR, '.agents', 'skills');
  const offenders: string[] = [];
  for (const name of fs.readdirSync(skillDir)) {
    const skillFile = path.join(skillDir, name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const content = fs.readFileSync(skillFile, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      if (/Inválid/i.test(line)) continue;
      // ID de hallazgo plano: DOC-001, WF-002, TST-003...
      if (/(?<![A-Za-z0-9_-])\b(?:DOC|WF|TST|SEC|INF)-\d{3}\b/.test(line)) {
        offenders.push(`${name}: ${line.trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Las skills no deben emitir IDs de hallazgo planos sin namespace:\n${offenders.join('\n')}`,
  );
});

test('📚 Gobernanza Documental: validación contractual de la regla transversal y políticas normativas en repo-docs', () => {
  const rootDir = ROOT_DIR;
  const ruleFile = path.join(rootDir, '.agents', 'rules', 'documentation-governance.md');
  const docsDir = path.join(rootDir, '.agents', 'skills', 'repo-docs');
  const contractFile = path.join(docsDir, 'references', 'documentation-contract.yaml');

  // 1. Verificación de existencia de la regla transversal
  assert.ok(fs.existsSync(ruleFile), '.agents/rules/documentation-governance.md debe existir');
  const ruleContent = fs.readFileSync(ruleFile, 'utf-8');
  assert.ok(ruleContent.includes('Gobernanza Documental Transversal'), 'Debe declarar título de Gobernanza Documental');
  assert.ok(ruleContent.includes('npm run lint:md'), 'Debe declarar el Markdown Quality Gate obligatorio');

  // 2. Verificación de existencia de documentation-contract.yaml en repo-docs
  assert.ok(fs.existsSync(contractFile), 'documentation-contract.yaml debe existir en repo-docs/references/');
  const contractContent = fs.readFileSync(contractFile, 'utf-8');
  assert.ok(
    contractContent.includes('framework: "documentation-governance"'),
    'Debe declarar framework documentation-governance',
  );
  assert.ok(contractContent.includes('README.md:'), 'Debe definir contrato para README.md');
  assert.ok(contractContent.includes('SECURITY.md:'), 'Debe definir contrato para SECURITY.md');
  assert.ok(contractContent.includes('README-ARCH-001'), 'Debe contener regla README-ARCH-001');

  // 3. Verificación de referencias normativas requeridas en repo-docs
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
    const policyPath = path.join(docsDir, 'references', policy);
    assert.ok(fs.existsSync(policyPath), `Referencia normativa ${policy} debe existir en repo-docs/references/`);
  }

  // 4. Verificación de registro en AGENTS.md
  const agentsFile = path.join(rootDir, 'AGENTS.md');
  const agentsContent = fs.readFileSync(agentsFile, 'utf-8');
  assert.ok(agentsContent.includes('`repo-docs`'), 'AGENTS.md debe registrar repo-docs en el catalogo de skills');
  assert.ok(
    agentsContent.includes('documentation-governance.md'),
    'AGENTS.md debe referenciar la regla documentation-governance.md',
  );
  assert.ok(
    !agentsContent.includes('`repo-doc-governance`'),
    'AGENTS.md no debe contener la skill retirada repo-doc-governance',
  );
});

/**
 * Retención de `docs/audits/`.
 *
 * `max_active_snapshots` cuenta baselines (directorios con `baseline.md`). Los informes auxiliares de un ciclo
 * (plan, remediación) solo se conservan hasta que el siguiente baseline los absorba, así que un directorio sin
 * `baseline.md` debe ser posterior al baseline vigente. Sin esto, el límite de 1 se leería como violado por cada
 * plan de mejora, o se ignoraría y los informes ya absorbidos se acumularían.
 */
test('📚 Gobernanza Documental: docs/audits conserva un baseline y solo informes posteriores a él', () => {
  const auditsDir = path.join(ROOT_DIR, 'docs', 'audits');
  const contract = yaml.load(
    fs.readFileSync(path.join(ROOT_DIR, '.agents/skills/repo-docs/references/documentation-contract.yaml'), 'utf-8'),
  ) as { budget: { audits: { max_active_snapshots: number; auxiliary_reports: string } } };

  const cycles = fs.readdirSync(auditsDir).filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
  const baselines = cycles.filter((cycle) => fs.existsSync(path.join(auditsDir, cycle, 'baseline.md'))).sort();
  const auxiliary = cycles.filter((cycle) => !baselines.includes(cycle));

  assert.equal(contract.budget.audits.auxiliary_reports, 'until-next-baseline');
  assert.ok(baselines.length >= 1, 'debe haber un baseline vigente en docs/audits/');
  assert.ok(
    baselines.length <= contract.budget.audits.max_active_snapshots,
    `docs/audits conserva ${baselines.length} baselines (${baselines.join(', ')}); el contrato permite ${contract.budget.audits.max_active_snapshots}`,
  );

  const current = baselines[baselines.length - 1];
  const absorbed = auxiliary.filter((cycle) => cycle <= current);
  assert.deepEqual(
    absorbed,
    [],
    `los informes de ${absorbed.join(', ')} son anteriores o de la fecha del baseline vigente (${current}): ya fueron absorbidos y deben podarse`,
  );

  // Todo documento del directorio es evidencia histórica y lo declara.
  for (const cycle of cycles) {
    for (const file of fs.readdirSync(path.join(auditsDir, cycle)).filter((f) => f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(auditsDir, cycle, file), 'utf-8');
      assert.match(
        content,
        /^> \*\*Estado:\*\* Histórico/m,
        `docs/audits/${cycle}/${file} debe declarar Estado: Histórico`,
      );
    }
  }
});
