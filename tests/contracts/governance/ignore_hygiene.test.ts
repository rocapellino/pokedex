import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT_DIR } from '../../helpers/repo.js';

test('🧹 Configuration Hygiene: check-ignore-hygiene.ts existe y está registrado en package.json', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/check-ignore-hygiene.ts');
  assert.ok(fs.existsSync(scriptPath), 'El script scripts/check-ignore-hygiene.ts debe existir');

  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(pkgJson.scripts['lint:ignore'], 'package.json debe registrar el script lint:ignore');
  assert.ok(pkgJson.scripts['lint:ignore:strict'], 'package.json debe registrar el script lint:ignore:strict');
  assert.ok(pkgJson.scripts['lint:ignore:fix'], 'package.json debe registrar el script lint:ignore:fix');
  assert.match(pkgJson.scripts.validate, /lint:ignore/, 'El script validate debe incluir lint:ignore');
});

test('🧹 Configuration Hygiene: descubrimiento dinámico y auditoría estricta de todos los archivos .ignore', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/check-ignore-hygiene.ts');
  const stdout = execSync(`npx tsx "${scriptPath}" --json --strict`, {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
  });

  const report = JSON.parse(stdout);
  assert.equal(report.valid, true, 'El reporte global de configuration hygiene debe ser válido');
  // Un umbral numérico fallaba al retirar exclusiones huérfanas (las .trivyignore de
  // AWS, ADR-030); se exige el núcleo que debe descubrirse siempre.
  const discovered = new Set(report.files.map((f: { file: string }) => f.file.replace(/\\/g, '/')));
  for (const required of [
    '.gitignore',
    '.dockerignore',
    'apps/backend/.dockerignore',
    'apps/frontend/.dockerignore',
    'infra/helm/pokedex/.helmignore',
  ]) {
    assert.ok(discovered.has(required), `El descubrimiento dinámico debe incluir ${required}`);
  }

  for (const fileReport of report.files) {
    assert.equal(fileReport.valid, true, `El archivo ${fileReport.file} debe ser válido`);
    assert.equal(fileReport.duplicates.length, 0, `No debe haber duplicados en ${fileReport.file}`);
    assert.equal(
      fileReport.securityRulesMissing.length,
      0,
      `No debe faltar ninguna regla de seguridad en ${fileReport.file}`,
    );
    assert.equal(
      fileReport.unjustifiedRules.length,
      0,
      `No debe haber reglas de excepción sin justificar en ${fileReport.file}`,
    );
    assert.equal(
      fileReport.obsoleteRules.length,
      0,
      `No debe haber reglas de herramientas retiradas en ${fileReport.file}`,
    );
  }
});

test('📐 Extension Governance: la regla de extensión YAML está incorporada en la suite de skills', () => {
  const skillsDir = path.join(ROOT_DIR, '.agents', 'skills');
  const read = (rel: string) => fs.readFileSync(path.join(skillsDir, rel), 'utf-8');

  // repo-quality: estándar de ingeniería para archivos nuevos
  const quality = read('repo-quality/SKILL.md');
  assert.match(quality, /\.yaml/, 'repo-quality debe declarar la extensión canónica .yaml');
  assert.match(quality, /lint:yaml/, 'repo-quality debe referenciar el gate de enforcement');

  // repo-ci: todo workflow nuevo se crea en .yaml
  const ci = read('repo-ci/SKILL.md');
  assert.match(ci, /Extensión Canónica de Workflows/, 'repo-ci debe declarar la extensión canónica de workflows');

  // repo-maintenance: higiene y detección de regresión
  const maintenance = read('repo-maintenance/SKILL.md');
  assert.match(maintenance, /Extensión YAML/, 'repo-maintenance debe verificar la extensión YAML');

  // _shared/methodology.md: contexto común a toda skill
  const methodology = read('_shared/methodology.md');
  assert.match(methodology, /Extensión YAML/, 'methodology.md debe declarar la convención de extensión');

  // Contrato declarativo normativo (en repo-docs tras consolidación)
  const contract = read('repo-docs/references/documentation-contract.yaml');
  assert.match(contract, /id:\s*"YAML-EXT-001"/, 'El contrato debe declarar la regla YAML-EXT-001');
});

test('📐 Extension Governance: las skills no citan workflows con la extensión .yml obsoleta', () => {
  const workflows = [
    'ci',
    'infra',
    'security-gitleaks',
    'security-trivy',
    'security-dast-zap',
    'performance-k6',
    'dr-simulation',
    'change-impact',
    'release-tag',
    'web',
    'sonar-linear-sync',
    'renovate-linear-sync',
    'security-code-scanning',
    'ghcr-retention',
    'github-security-linear-sync',
  ];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.name.endsWith('.md')) out.push(full);
    }
    return out;
  };

  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT_DIR, '.agents'))) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const wf of workflows) {
      if (content.includes(`${wf}.yml`)) {
        offenders.push(`${path.relative(ROOT_DIR, file)} cita ${wf}.yml`);
      }
    }
  }

  assert.deepEqual(offenders, [], `Las skills no deben citar workflows renombrados: ${offenders.join('; ')}`);
});

test('📚 YAML Reference Integrity (DOC-002): no hay referencias a archivos .yml obsoletas', () => {
  // Contrato fail-closed: la documentacion no debe citar archivos .yml propios
  // que ya no existen en disco. Sin este gate, una wave de migracion puede
  // renombrar archivos y dejar la documentacion apuntando a rutas muertas.
  const stdout = execSync('npx tsx scripts/check-yaml-extension.ts --refs', {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
  });

  const match = stdout.match(/RESUMEN: obsoletas=(\d+)/);
  assert.ok(match, 'El scanner debe emitir el resumen de referencias obsoletas');
  assert.equal(match[1], '0', `La documentacion no debe citar archivos .yml obsoletas:\n${stdout.slice(0, 2000)}`);
});

test('📚 YAML Reference Integrity: el scanner esta registrado y declara sus excepciones', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/check-yaml-extension.ts');
  assert.ok(fs.existsSync(scriptPath), 'scripts/check-yaml-extension.ts debe existir');

  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.ok(pkgJson.scripts['lint:docs:refs'], 'package.json debe registrar lint:docs:refs');
  assert.ok(pkgJson.scripts['lint:docs:refs:fix'], 'package.json debe registrar lint:docs:refs:fix');

  const ciContent = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  assert.match(ciContent, /npm run lint:docs:refs/, 'ci.yaml debe invocar el gate de integridad de referencias YAML');

  // Las excepciones deben seguir declaradas explicitamente, no borradas en silencio.
  const scanner = fs.readFileSync(scriptPath, 'utf-8');
  assert.match(scanner, /\.travis\\\.yml/, 'El scanner debe declarar la excepcion .travis.yml');
  assert.match(scanner, /sigstore/, 'El scanner debe declarar la excepcion del literal upstream de Gitsign');
});

test('🛡️ Configuration Hygiene: workflow de CI integra el paso de auditoría de archivos .ignore', () => {
  const ciWorkflowPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  const ciContent = fs.readFileSync(ciWorkflowPath, 'utf-8');

  assert.match(ciContent, /Configuration Hygiene/, 'ci.yaml debe declarar un paso para Configuration Hygiene');
  assert.match(ciContent, /npm run lint:ignore:strict/, 'ci.yaml debe invocar npm run lint:ignore:strict');
});

test('🧹 Repository Hygiene: regla /tmp/ presente en .gitignore y patrón no sobre-extensivo', () => {
  const gitignoreContent = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf-8');
  assert.match(gitignoreContent, /^\/tmp\/$/m, '.gitignore debe declarar exactamente la regla /tmp/ anclada a la raíz');

  // Validar que no se usó una regla genérica "tmp/" desanclada
  const lines = gitignoreContent.split(/\r?\n/).map((l) => l.trim());
  assert.ok(!lines.includes('tmp/'), '.gitignore no debe incluir la regla relativa desanclada tmp/');
});

test('🧹 Repository Hygiene: la regla /tmp/ ignora efectivamente archivos en tmp/ y no fuera de tmp/', () => {
  const checkIgnored = (probePath: string): { ignored: boolean; rule: string } => {
    try {
      const out = execSync(`git check-ignore -v "${probePath}"`, { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
      const parts = out.split(/\t/);
      return { ignored: true, rule: parts[0] || '' };
    } catch {
      return { ignored: false, rule: '' };
    }
  };

  const inside = checkIgnored('tmp/test-file.tmp');
  assert.equal(inside.ignored, true, 'tmp/test-file.tmp debe quedar ignorado');
  assert.match(inside.rule, /\/tmp\/$/, 'tmp/test-file.tmp debe ser ignorado por la regla /tmp/');

  const outside = checkIgnored('apps/backend/tmp/test-file.txt');
  assert.equal(outside.ignored, false, 'apps/backend/tmp/test-file.txt no debe ser ignorado por /tmp/');
});

test('🧹 Repository Hygiene: la regla transversal repository-hygiene.md existe y rige AGENTS.md y skills', () => {
  const rulePath = path.join(ROOT_DIR, '.agents/rules/repository-hygiene.md');
  assert.ok(fs.existsSync(rulePath), '.agents/rules/repository-hygiene.md debe existir');

  const ruleContent = fs.readFileSync(rulePath, 'utf-8');
  assert.match(
    ruleContent,
    /<repository-root>\/tmp\//,
    'repository-hygiene.md debe definir la ubicación canónica <repository-root>/tmp/',
  );

  const agentsMd = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf-8');
  assert.match(agentsMd, /repository-hygiene\.md/, 'AGENTS.md debe referenciar repository-hygiene.md');
  assert.match(agentsMd, /`tmp\/`/, 'AGENTS.md debe referenciar el directorio temporal tmp/');

  const maintenanceSkill = fs.readFileSync(path.join(ROOT_DIR, '.agents/skills/repo-maintenance/SKILL.md'), 'utf-8');
  assert.match(maintenanceSkill, /repository-hygiene\.md/, 'repo-maintenance debe referenciar repository-hygiene.md');

  const lifecycleSkill = fs.readFileSync(path.join(ROOT_DIR, '.agents/skills/repo-lifecycle/SKILL.md'), 'utf-8');
  assert.match(lifecycleSkill, /repository-hygiene\.md/, 'repo-lifecycle debe referenciar repository-hygiene.md');
});

test('🧹 Repository Hygiene: política obligatoria universal cubre todos los agentes de IA y mecanismos', () => {
  const ruleContent = fs.readFileSync(path.join(ROOT_DIR, '.agents/rules/repository-hygiene.md'), 'utf-8');
  const agentsMd = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf-8');

  // Cobertura universal de agentes
  for (const agent of ['Antigravity', 'Claude Code', 'Cursor', 'Copilot']) {
    assert.match(ruleContent, new RegExp(agent, 'i'), `repository-hygiene.md debe cubrir explícitamente a ${agent}`);
    assert.match(agentsMd, new RegExp(agent, 'i'), `AGENTS.md debe cubrir explícitamente a ${agent}`);
  }

  // Mecanismos de ejecución cubiertos
  for (const mechanism of ['IDE', 'terminal', 'scripts', 'shell', 'MCP', 'APIs', 'contenedores', 'CI']) {
    assert.match(
      ruleContent,
      new RegExp(mechanism, 'i'),
      `repository-hygiene.md debe cubrir el mecanismo de ejecución ${mechanism}`,
    );
    assert.match(agentsMd, new RegExp(mechanism, 'i'), `AGENTS.md debe cubrir el mecanismo de ejecución ${mechanism}`);
  }
});

test('🧹 Repository Hygiene: directivas de herramientas, scripts y Model Context Protocol (MCP)', () => {
  const ruleContent = fs.readFileSync(path.join(ROOT_DIR, '.agents/rules/repository-hygiene.md'), 'utf-8');
  const agentsMd = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf-8');
  const mcpRule = fs.readFileSync(path.join(ROOT_DIR, '.agents/rules/mcp-governance.md'), 'utf-8');

  // Mínimo directorio en filesystem para MCP
  assert.match(
    ruleContent,
    /mínimo directorio necesario/i,
    'repository-hygiene.md debe exigir mínimo directorio para MCP',
  );
  assert.match(agentsMd, /mínimo directorio necesario/i, 'AGENTS.md debe exigir mínimo directorio para MCP');
  assert.match(
    mcpRule,
    /mínimo directorio necesario/i,
    'mcp-governance.md debe exigir mínimo directorio en filesystem',
  );

  // Principio de no asunción pasiva en MCP
  assert.match(
    ruleContent,
    /asumir que un servidor MCP cumple/i,
    'repository-hygiene.md debe declarar no asunción pasiva',
  );
  assert.match(agentsMd, /asumir que un servidor MCP cumple/i, 'AGENTS.md debe declarar no asunción pasiva');
  assert.match(mcpRule, /asumir que un servidor MCP cumple/i, 'mcp-governance.md debe declarar no asunción pasiva');

  // Excepción de temporales del SO
  assert.match(
    ruleContent,
    /sistema operativo/i,
    'repository-hygiene.md debe contemplar directorios temporales del SO',
  );
  assert.match(agentsMd, /sistema operativo/i, 'AGENTS.md debe contemplar directorios temporales del SO');
});

test('🧹 Repository Hygiene: excepciones formalizadas y protocolo obligatorio de verificación final', () => {
  const ruleContent = fs.readFileSync(path.join(ROOT_DIR, '.agents/rules/repository-hygiene.md'), 'utf-8');
  const agentsMd = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf-8');

  // Excepciones funcionales (permanentes en ubicación definitiva, sin mover cachés de paquetes)
  assert.match(
    ruleContent,
    /ubicación definitiva/i,
    'repository-hygiene.md debe formalizar archivos en ubicación definitiva',
  );
  assert.match(agentsMd, /ubicación definitiva/i, 'AGENTS.md debe formalizar archivos en ubicación definitiva');
  assert.match(ruleContent, /gestores de paquetes/i, 'repository-hygiene.md no debe mover cachés de paquetes');
  assert.match(agentsMd, /gestores de paquetes/i, 'AGENTS.md no debe mover cachés de paquetes');

  // Protocolo de verificación al finalizar
  assert.match(ruleContent, /git status --short/, 'repository-hygiene.md debe exigir verificar git status --short');
  assert.match(agentsMd, /git status --short/, 'AGENTS.md debe exigir verificar git status --short');
  assert.match(ruleContent, /reporte final/i, 'repository-hygiene.md debe exigir reportar excepciones');
  assert.match(agentsMd, /reporte final/i, 'AGENTS.md debe exigir reportar excepciones');
});
