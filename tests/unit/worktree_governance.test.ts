import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createWorktree, safeRollbackWorktree } from '../../scripts/worktree/creator.js';
import {
  auditAutomationSurface,
  checkUngovernedWorktreeCalls,
  runWorktreeDoctor,
} from '../../scripts/worktree/doctor.js';
import { listWorktrees, pruneWorktrees, removeWorktreeSafely } from '../../scripts/worktree/manager.js';
import {
  ALLOWED_TASK_TYPES,
  generateCanonicalNaming,
  sanitizeSlug,
  sanitizeTicketId,
  validateGitRef,
} from '../../scripts/worktree/naming.js';
import {
  assertNoEscapingSymlinks,
  isWithinCanonicalBase,
  resolveCanonicalWorktreeBase,
  resolveMainRepoRoot,
  verifyWorktreePostCreation,
} from '../../scripts/worktree/resolver.js';

test('🌲 Worktree Governance: sanitizeSlug normaliza caracteres, acentos y espacios', () => {
  assert.equal(sanitizeSlug('Nueva Funcionalidad 123!'), 'nueva-funcionalidad-123');
  assert.equal(sanitizeSlug('Módulos de Configuración/Extensión'), 'modulos-de-configuracion-extension');
  assert.equal(sanitizeSlug('---multiples----guiones---'), 'multiples-guiones');
  assert.equal(sanitizeSlug('camelCaseAndSnake_case'), 'camelcaseandsnake_case');
});

test('🌲 Worktree Governance: sanitizeTicketId normaliza identificadores a mayúsculas seguras', () => {
  assert.equal(sanitizeTicketId('aud-sec-001'), 'AUD-SEC-001');
  assert.equal(sanitizeTicketId('per-123'), 'PER-123');
  assert.equal(sanitizeTicketId(''), undefined);
  assert.equal(sanitizeTicketId(undefined), undefined);
});

test('🌲 Worktree Governance: generateCanonicalNaming genera ramas y carpetas normalizadas', () => {
  const naming1 = generateCanonicalNaming({
    type: 'feat',
    slug: 'add-worktree-governance',
  });
  assert.equal(naming1.branchName, 'feat/add-worktree-governance');
  assert.equal(naming1.folderName, 'feat--add-worktree-governance');

  const naming2 = generateCanonicalNaming({
    type: 'fix',
    scope: 'ci',
    slug: 'repair-runner-pipeline',
  });
  assert.equal(naming2.branchName, 'fix/ci-repair-runner-pipeline');
  assert.equal(naming2.folderName, 'fix--ci-repair-runner-pipeline');

  const naming3 = generateCanonicalNaming({
    type: 'chore',
    ticketId: 'AUD-SEC-001',
    slug: 'vault-secret-rotation',
  });
  assert.equal(naming3.branchName, 'chore/aud-sec-001-vault-secret-rotation');
  assert.equal(naming3.folderName, 'chore--aud-sec-001-vault-secret-rotation');
  assert.equal(naming3.ticketId, 'AUD-SEC-001');
});

test('🌲 Worktree Governance: generateCanonicalNaming rechaza tipos no autorizados y slugs vacíos', () => {
  assert.throws(
    () => generateCanonicalNaming({ type: 'invalid-type', slug: 'tarea' }),
    /Tipo de tarea 'invalid-type' inválido/,
  );
  assert.throws(
    () => generateCanonicalNaming({ type: 'feat', slug: '   ' }),
    /El slug o descripción de la tarea no puede estar vacío/,
  );
});

test('🌲 Worktree Governance: isWithinCanonicalBase detecta y bloquea path traversal', () => {
  const base = path.resolve('/tmp/test-base/.worktrees/pokedex');

  assert.equal(isWithinCanonicalBase(path.join(base, 'feat--test'), base), true);
  assert.equal(isWithinCanonicalBase(path.join(base, 'sub', 'folder'), base), true);

  // Escapes
  assert.equal(isWithinCanonicalBase(base, base), false); // Mismo directorio no es un hijo
  assert.equal(isWithinCanonicalBase(path.resolve('/tmp/test-base/.worktrees/other'), base), false);
  assert.equal(isWithinCanonicalBase(path.resolve('/etc/passwd'), base), false);
  assert.equal(isWithinCanonicalBase(path.join(base, '..', 'escape'), base), false);
});

test('🌲 Worktree Governance: operaciones aisladas en un repositorio Git simulado', (t) => {
  // Crear repositorio temporal aislado
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-wt-test-'));
  const testRepoDir = path.join(tempDir, 'pokedex');
  fs.mkdirSync(testRepoDir, { recursive: true });

  execSync('git init -b main', { cwd: testRepoDir });
  execSync('git config user.email "test@pokedex.local"', { cwd: testRepoDir });
  execSync('git config user.name "Pokedex Tester"', { cwd: testRepoDir });

  // Crear commit inicial en main
  fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test Repository\n');
  execSync('git add README.md && git commit -m "chore: initial commit"', { cwd: testRepoDir });

  const canonicalBase = path.join(tempDir, '.worktrees', 'pokedex');

  t.after(() => {
    try {
      // Limpieza segura de sandbox
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza temporal en SO
    }
  });

  // 1. Probar resolución desde el repo principal
  const resolvedMain = resolveMainRepoRoot(testRepoDir);
  assert.equal(path.resolve(resolvedMain).toLowerCase(), path.resolve(testRepoDir).toLowerCase());

  const resolvedBase = resolveCanonicalWorktreeBase(testRepoDir);
  assert.equal(path.resolve(resolvedBase).toLowerCase(), path.resolve(canonicalBase).toLowerCase());

  // 2. Probar creación de worktree gobernado
  const created = createWorktree(
    {
      type: 'feat',
      slug: 'awesome-feature',
      scope: 'backend',
    },
    { cwd: testRepoDir, createNodeModulesJunction: false },
  );

  assert.equal(created.branch, 'feat/backend-awesome-feature');
  assert.equal(created.folderName, 'feat--backend-awesome-feature');
  assert.equal(
    path.resolve(created.path).toLowerCase(),
    path.resolve(canonicalBase, 'feat--backend-awesome-feature').toLowerCase(),
  );
  assert.ok(fs.existsSync(created.path), 'El directorio del worktree debe existir físicamente');

  // 3. Probar resolución de raíz desde dentro del worktree creado
  const resolvedFromInside = resolveMainRepoRoot(created.path);
  assert.equal(
    path.resolve(resolvedFromInside).toLowerCase(),
    path.resolve(testRepoDir).toLowerCase(),
    'Debe resolver el repo principal incluso ejecutado desde el worktree hijo',
  );

  // 4. Probar listado de worktrees
  const wts = listWorktrees(testRepoDir);
  assert.equal(wts.length, 2);
  const childWt = wts.find((w) => w.branch === 'feat/backend-awesome-feature');
  assert.ok(childWt, 'El worktree hijo debe figurar en la lista');
  assert.equal(childWt?.isCompliant, true, 'El worktree creado debe ser compliant');

  // 5. Probar colisiones (crear nuevamente el mismo debe fallar)
  assert.throws(
    () =>
      createWorktree(
        { type: 'feat', slug: 'awesome-feature', scope: 'backend' },
        { cwd: testRepoDir, createNodeModulesJunction: false },
      ),
    /Colisión detectada/,
  );

  // 6. Probar protección contra eliminación de worktree con cambios sin confirmar
  fs.writeFileSync(path.join(created.path, 'cambio.txt'), 'trabajo pendiente');
  assert.throws(
    () => removeWorktreeSafely(created.path, { cwd: testRepoDir, force: false }),
    /archivos sin seguimiento/,
  );

  // 7. Probar doctor
  const docReport = runWorktreeDoctor(testRepoDir);
  assert.equal(docReport.totalWorktrees, 2);
  assert.equal(docReport.compliantWorktrees, 1);
  assert.equal(docReport.nonCompliantWorktrees, 0);

  // 8. Eliminación forzada segura
  const removeRes = removeWorktreeSafely(created.path, { cwd: testRepoDir, force: true });
  assert.equal(removeRes.success, true);
  assert.equal(fs.existsSync(created.path), false, 'El directorio debe haberse eliminado');

  // 9. Prune
  pruneWorktrees(testRepoDir);
  const wtsAfter = listWorktrees(testRepoDir);
  assert.equal(wtsAfter.length, 1);
});

test('🌲 Worktree Governance: validateGitRef valida referencias legales y bloquea inyecciones de flags y metacaracteres', () => {
  // Referencias legales
  assert.equal(validateGitRef('main'), 'main');
  assert.equal(validateGitRef('feat/nueva-pantalla'), 'feat/nueva-pantalla');
  assert.equal(validateGitRef('chore/aud-sec-001'), 'chore/aud-sec-001');
  assert.equal(validateGitRef('v1.0.0'), 'v1.0.0');

  // Bloqueo de flag injection (comienzo con '-')
  assert.throws(() => validateGitRef('--upload-pack=exploit'), /no puede comenzar con '-'/);
  assert.throws(() => validateGitRef('-b'), /no puede comenzar con '-'/);
  assert.throws(() => validateGitRef('--force'), /no puede comenzar con '-'/);

  // Bloqueo de metacaracteres de shell y comandos concatenados
  assert.throws(() => validateGitRef('main; touch /tmp/pwn'), /contiene caracteres no permitidos/);
  assert.throws(() => validateGitRef('main && whoami'), /contiene caracteres no permitidos/);
  assert.throws(() => validateGitRef('main | cat'), /contiene caracteres no permitidos/);
  assert.throws(() => validateGitRef('main$(id)'), /contiene caracteres no permitidos/);
  assert.throws(() => validateGitRef('branch with spaces'), /contiene caracteres no permitidos/);

  // Bloqueo de reglas canónicas de Git
  assert.throws(() => validateGitRef('bad..ref'), /viola las reglas canónicas de Git/);
  assert.throws(() => validateGitRef('branch//nested'), /viola las reglas canónicas de Git/);
  assert.throws(() => validateGitRef('ref@{1}'), /viola las reglas canónicas de Git/);
  assert.throws(() => validateGitRef('branch/'), /viola las reglas canónicas de Git/);
  assert.throws(() => validateGitRef('/branch'), /viola las reglas canónicas de Git/);
  assert.throws(() => validateGitRef('branch.lock'), /viola las reglas canónicas de Git/);
  assert.throws(() => validateGitRef(''), /el valor no puede estar vacío/);
});

test('🌲 Worktree Governance: createWorktree rechaza inyección de argumentos mediante baseBranch', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-wt-inj-'));
  const testRepoDir = path.join(tempDir, 'pokedex');
  fs.mkdirSync(testRepoDir, { recursive: true });

  execSync('git init -b main', { cwd: testRepoDir });
  execSync('git config user.email "test@pokedex.local"', { cwd: testRepoDir });
  execSync('git config user.name "Pokedex Tester"', { cwd: testRepoDir });
  fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test\n');
  execSync('git add README.md && git commit -m "chore: init"', { cwd: testRepoDir });

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  // Intento de inyectar comandos de shell o flags
  assert.throws(
    () =>
      createWorktree(
        { type: 'feat', slug: 'injection-test' },
        { cwd: testRepoDir, baseBranch: 'main; touch injected.txt' },
      ),
    /Referencia Git inválida para baseBranch/,
  );

  assert.throws(
    () =>
      createWorktree(
        { type: 'feat', slug: 'injection-test' },
        { cwd: testRepoDir, baseBranch: '--upload-pack=dangerous' },
      ),
    /Referencia Git inválida para baseBranch/,
  );

  // Verificar que ningún archivo inyectado haya sido creado
  assert.equal(fs.existsSync(path.join(testRepoDir, 'injected.txt')), false);
});

test('🌲 Worktree Governance: isWithinCanonicalBase detecta y bloquea escapes mediante enlaces simbólicos', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-wt-symlink-'));
  const canonicalBase = path.join(tempDir, '.worktrees', 'pokedex');
  const externalDir = path.join(tempDir, 'external-secret-dir');

  fs.mkdirSync(canonicalBase, { recursive: true });
  fs.mkdirSync(externalDir, { recursive: true });

  const linkInside = path.join(canonicalBase, 'symlink-escape');
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(externalDir, linkInside, symlinkType);

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  // 1. Apuntar directamente a un enlace que apunta afuera
  assert.equal(isWithinCanonicalBase(linkInside, canonicalBase), false);

  // 2. Apuntar a una subcarpeta dentro del enlace que apunta afuera
  const targetViaLink = path.join(linkInside, 'feat--stolen');
  assert.equal(isWithinCanonicalBase(targetViaLink, canonicalBase), false);

  // 3. Carpeta normal no vinculada debe ser permitida
  const validPath = path.join(canonicalBase, 'feat--normal-task');
  assert.equal(isWithinCanonicalBase(validPath, canonicalBase), true);
});

test('🌲 Worktree Governance: nomenclatura está alineada con el hook conventional-pre-commit de .pre-commit-config.yaml', () => {
  const root = resolveMainRepoRoot(process.cwd());
  const preCommitConfigPath = path.join(root, '.pre-commit-config.yaml');

  assert.ok(fs.existsSync(preCommitConfigPath), 'El archivo .pre-commit-config.yaml debe existir');
  const content = fs.readFileSync(preCommitConfigPath, 'utf-8');

  // Extraer los args del hook conventional-pre-commit
  const match = content.match(/id:\s*conventional-pre-commit[\s\S]*?args:\s*\[([^\]]+)\]/);
  assert.ok(match, 'Debe encontrarse la sección del hook conventional-pre-commit con sus args');

  const configuredTypes = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Verificar que todos los tipos de ALLOWED_TASK_TYPES coincidan con el hook de pre-commit
  assert.deepEqual(
    [...ALLOWED_TASK_TYPES].sort(),
    [...configuredTypes].sort(),
    'Los tipos de ALLOWED_TASK_TYPES deben ser idénticos a los del hook conventional-pre-commit',
  );
});

test('🌲 Worktree Governance: cumplimiento de puntos de entrada y ausencia de regresiones en scripts y skills', () => {
  const root = resolveMainRepoRoot(process.cwd());
  const regressions = checkUngovernedWorktreeCalls(root);

  assert.equal(
    regressions.length,
    0,
    `Se detectaron llamadas directas no autorizadas a 'git worktree add': ${JSON.stringify(regressions)}`,
  );
});

test('🌲 Worktree Governance: detecta y bloquea cuando .worktrees es un enlace simbólico que desvía fuera del padre antes de existir el slug', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-wt-parent-symlink-'));
  const parentDir = path.join(tempDir, 'repo_parent');
  const testRepoDir = path.join(parentDir, 'pokedex');
  const outsideDir = path.join(tempDir, 'outside_forbidden');

  fs.mkdirSync(testRepoDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  execSync('git init -b main', { cwd: testRepoDir });
  execSync('git config user.email "test@pokedex.local"', { cwd: testRepoDir });
  execSync('git config user.name "Pokedex Tester"', { cwd: testRepoDir });
  fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test\n');
  execSync('git add README.md && git commit -m "chore: init"', { cwd: testRepoDir });

  // Crear .worktrees como un symlink hacia outsideDir ANTES de que exista .worktrees/pokedex
  const wtSymlinkPath = path.join(parentDir, '.worktrees');
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(outsideDir, wtSymlinkPath, symlinkType);

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const canonicalBaseExpected = path.join(wtSymlinkPath, 'pokedex');
  assert.equal(fs.existsSync(canonicalBaseExpected), false, 'El directorio del slug pokedex no debe existir aún');

  // 1. assertNoEscapingSymlinks debe detectar que .worktrees desvía fuera de parentDir
  assert.throws(
    () => assertNoEscapingSymlinks(canonicalBaseExpected, parentDir),
    /Violación de seguridad.*es un enlace simbólico que resuelve.*fuera de la ubicación aprobada/,
  );

  // 2. resolveCanonicalWorktreeBase debe fallar al resolver la base
  assert.throws(
    () => resolveCanonicalWorktreeBase(testRepoDir),
    /Violación de seguridad.*es un enlace simbólico que resuelve.*fuera de la ubicación aprobada/,
  );

  // 3. isWithinCanonicalBase debe rechazar el destino
  const targetPath = path.join(canonicalBaseExpected, 'feat--stolen-task');
  assert.equal(isWithinCanonicalBase(targetPath, canonicalBaseExpected), false);

  // 4. createWorktree debe bloquear la creación
  assert.throws(
    () => createWorktree({ type: 'feat', slug: 'stolen-task' }, { cwd: testRepoDir, createNodeModulesJunction: false }),
    /Violación de seguridad/,
  );

  // 5. Verificar que nada fue creado dentro de outsideDir
  assert.equal(fs.readdirSync(outsideDir).length, 0);
});

test('🌲 Worktree Governance: componentes con enlaces simbólicos rotos o inaccesibles son rechazados', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-wt-broken-'));
  const parentDir = path.join(tempDir, 'repo_parent');
  const outsideDir = path.join(tempDir, 'outside_target');

  fs.mkdirSync(parentDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  const brokenLinkPath = path.join(parentDir, '.worktrees');
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(outsideDir, brokenLinkPath, symlinkType);
  // Borrar el destino para convertirlo en un enlace roto
  fs.rmdirSync(outsideDir);

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const targetPath = path.join(brokenLinkPath, 'pokedex', 'feat--broken');

  // assertNoEscapingSymlinks debe fallar con error de enlace roto o inaccesible
  assert.throws(
    () => assertNoEscapingSymlinks(targetPath, parentDir),
    /Violación de seguridad.*contiene un enlace simbólico roto o inaccesible/,
  );

  // isWithinCanonicalBase debe rechazar
  assert.equal(isWithinCanonicalBase(targetPath, path.join(brokenLinkPath, 'pokedex')), false);
});

test('🌲 Worktree Governance: checkUngovernedWorktreeCalls detecta infracciones en workflows, Taskfiles y scripts temporales', (t) => {
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-scanner-test-'));

  const scriptsDir = path.join(tempRepo, 'scripts');
  const workflowsDir = path.join(tempRepo, '.github', 'workflows');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(workflowsDir, { recursive: true });

  // Crear archivo con transgresión en script
  fs.writeFileSync(path.join(scriptsDir, 'bad-script.sh'), '#!/bin/bash\ngit worktree add ../temp-wt feature/bad\n');

  // Crear archivo con transgresión en workflow
  fs.writeFileSync(
    path.join(workflowsDir, 'bad-pipeline.yaml'),
    'name: Bad\njobs:\n  run:\n    steps:\n      - run: git worktree add ../dir branch\n',
  );

  // Crear Taskfile con transgresión
  fs.writeFileSync(
    path.join(tempRepo, 'Taskfile.yml'),
    'version: "3"\ntasks:\n  wt:\n    cmds:\n      - git worktree add ../custom feat\n',
  );

  t.after(() => {
    try {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const findings = checkUngovernedWorktreeCalls(tempRepo);
  assert.equal(findings.length, 3, `Se esperaban 3 infracciones detectadas, encontradas: ${findings.length}`);
  const paths = findings.map((f) => path.basename(f.worktreePath));
  assert.ok(paths.includes('bad-script.sh'));
  assert.ok(paths.includes('bad-pipeline.yaml'));
  assert.ok(paths.includes('Taskfile.yml'));
});

test('🌲 Worktree Governance: verifyWorktreePostCreation detecta TOCTOU/symlink post-creación y asegura validación estricta', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-wt-toctou-'));
  const parentDir = path.join(tempDir, 'repo_parent');
  const testRepoDir = path.join(parentDir, 'pokedex');
  const outsideDir = path.join(tempDir, 'outside_evil');

  fs.mkdirSync(testRepoDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  execSync('git init -b main', { cwd: testRepoDir });
  execSync('git config user.email "test@pokedex.local"', { cwd: testRepoDir });
  execSync('git config user.name "Pokedex Tester"', { cwd: testRepoDir });
  fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test\n');
  execSync('git add README.md && git commit -m "chore: init"', { cwd: testRepoDir });

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const canonicalBase = path.join(parentDir, '.worktrees', 'pokedex');
  fs.mkdirSync(canonicalBase, { recursive: true });

  // 1. Simular un targetPath que es un symlink/junction apuntando hacia outsideDir
  const fakeTargetPath = path.join(canonicalBase, 'feat--toctou-attack');
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(outsideDir, fakeTargetPath, symlinkType);

  // verifyWorktreePostCreation debe arrojar violación de seguridad TOCTOU
  assert.throws(
    () => verifyWorktreePostCreation(fakeTargetPath, canonicalBase, testRepoDir),
    /Violación de seguridad.*TOCTOU/,
  );

  // 2. Comprobar que verifyWorktreePostCreation falle si targetPath no existe
  assert.throws(
    () => verifyWorktreePostCreation(path.join(canonicalBase, 'non-existent'), canonicalBase, testRepoDir),
    /no fue creado físicamente/,
  );

  // 3. Crear un worktree legítimo y verificar que pase sin errores
  const created = createWorktree(
    { type: 'feat', slug: 'legit-post-check' },
    { cwd: testRepoDir, createNodeModulesJunction: false },
  );
  assert.ok(fs.existsSync(created.path));
  assert.doesNotThrow(() => verifyWorktreePostCreation(created.path, canonicalBase, testRepoDir));
});

test('🌲 Worktree Governance: checkUngovernedWorktreeCalls cubre la superficie de automatización completa (Makefile, Justfile, Taskfile, infra, CI)', (t) => {
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-scanner-surface-'));

  const scriptsDir = path.join(tempRepo, 'scripts');
  const workflowsDir = path.join(tempRepo, '.github', 'workflows');
  const actionsDir = path.join(tempRepo, '.github', 'actions', 'custom-action');
  const infraDir = path.join(tempRepo, 'infra', 'ansible');
  const appsDir = path.join(tempRepo, 'apps', 'backend');

  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.mkdirSync(actionsDir, { recursive: true });
  fs.mkdirSync(infraDir, { recursive: true });
  fs.mkdirSync(appsDir, { recursive: true });

  // 1. Script shell en scripts/
  fs.writeFileSync(path.join(scriptsDir, 'bad-script.sh'), '#!/bin/bash\ngit worktree add ../temp-wt feature/bad\n');

  // 2. Workflow en .github/workflows/
  fs.writeFileSync(
    path.join(workflowsDir, 'bad-pipeline.yaml'),
    'name: Bad\njobs:\n  run:\n    steps:\n      - run: git worktree add ../dir branch\n',
  );

  // 3. Composite action en .github/actions/
  fs.writeFileSync(
    path.join(actionsDir, 'action.yaml'),
    'name: Custom\nruns:\n  using: composite\n  steps:\n    - run: git worktree add ../dir branch\n      shell: bash\n',
  );

  // 4. Makefile en la raíz
  fs.writeFileSync(path.join(tempRepo, 'Makefile'), 'wt:\n\tgit worktree add ../custom feat\n');

  // 5. justfile en la raíz
  fs.writeFileSync(path.join(tempRepo, 'justfile'), 'wt:\n    git worktree add ../custom feat\n');

  // 6. Taskfile.dist.yaml en la raíz
  fs.writeFileSync(
    path.join(tempRepo, 'Taskfile.dist.yaml'),
    'version: "3"\ntasks:\n  wt:\n    cmds:\n      - git worktree add ../custom feat\n',
  );

  // 7. Configuración en infra/
  fs.writeFileSync(path.join(infraDir, 'deploy.sh'), '#!/bin/bash\ngit worktree add ../infra-wt main\n');

  // 8. package.json en apps/
  fs.writeFileSync(
    path.join(appsDir, 'package.json'),
    JSON.stringify({ scripts: { 'bad:wt': 'git worktree add ../dir feat' } }),
  );

  t.after(() => {
    try {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const findings = checkUngovernedWorktreeCalls(tempRepo);
  assert.equal(findings.length, 8, `Se esperaban 8 infracciones detectadas, encontradas: ${findings.length}`);
  const basenames = findings.map((f) => path.basename(f.worktreePath));
  assert.ok(basenames.includes('bad-script.sh'));
  assert.ok(basenames.includes('bad-pipeline.yaml'));
  assert.ok(basenames.includes('action.yaml'));
  assert.ok(basenames.includes('Makefile'));
  assert.ok(basenames.includes('justfile'));
  assert.ok(basenames.includes('Taskfile.dist.yaml'));
  assert.ok(basenames.includes('deploy.sh'));
  assert.ok(basenames.includes('package.json'));
});

test('🌲 Worktree Governance: safeRollbackWorktree valida identidad antes de eliminar, no borra symlinks recursivamente y preserva evidencia', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-rollback-test-'));
  const parentDir = path.join(tempDir, 'repo_parent');
  const testRepoDir = path.join(parentDir, 'pokedex');
  const outsideDir = path.join(tempDir, 'precious_outside_files');

  fs.mkdirSync(testRepoDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  execSync('git init -b main', { cwd: testRepoDir });
  execSync('git config user.email "test@pokedex.local"', { cwd: testRepoDir });
  execSync('git config user.name "Pokedex Tester"', { cwd: testRepoDir });
  fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test\n');
  execSync('git add README.md && git commit -m "chore: init"', { cwd: testRepoDir });

  // Archivo valioso fuera de la base que NUNCA debe ser eliminado
  const preciousFile = path.join(outsideDir, 'important.txt');
  fs.writeFileSync(preciousFile, 'DATOS IMPORTANTES');

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const canonicalBase = path.join(parentDir, '.worktrees', 'pokedex');
  fs.mkdirSync(canonicalBase, { recursive: true });

  // Caso A: targetPath es un symlink/junction apuntando a outsideDir
  const symlinkTargetPath = path.join(canonicalBase, 'feat--symlink-attack');
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(outsideDir, symlinkTargetPath, symlinkType);

  const reportA = safeRollbackWorktree(symlinkTargetPath, canonicalBase, testRepoDir);
  assert.equal(reportA.residualCleaned, true, 'El symlink debe haber sido eliminado');
  assert.equal(fs.existsSync(symlinkTargetPath), false, 'La ruta del enlace ya no debe existir');
  assert.equal(
    fs.existsSync(preciousFile),
    true,
    'El archivo en outsideDir DEBE seguir existiendo (sin borrado recursivo)',
  );
  assert.equal(fs.readFileSync(preciousFile, 'utf-8'), 'DATOS IMPORTANTES');

  // Caso B: targetPath es un directorio legal dentro de canonicalBase
  const legitDir = path.join(canonicalBase, 'feat--legit-dir');
  fs.mkdirSync(legitDir, { recursive: true });
  fs.writeFileSync(path.join(legitDir, 'file.txt'), 'test');

  const reportB = safeRollbackWorktree(legitDir, canonicalBase, testRepoDir);
  assert.equal(reportB.residualCleaned, true);
  assert.equal(fs.existsSync(legitDir), false, 'El directorio legal dentro de canonicalBase debe ser eliminado');

  // Caso C: targetPath no reside dentro de canonicalBase (ej. fuera de la base canónica)
  // safeRollbackWorktree debe negarse a borrar recursivamente y preservar evidencia
  const outsideTarget = path.join(outsideDir, 'sub-danger');
  fs.mkdirSync(outsideTarget, { recursive: true });
  fs.writeFileSync(path.join(outsideTarget, 'evidence.log'), 'evidencia de ataque');

  const reportC = safeRollbackWorktree(outsideTarget, canonicalBase, testRepoDir);
  assert.equal(reportC.residualPreservedForEvidence, true, 'Debe preservar evidencia');
  assert.equal(reportC.residualCleaned, false, 'No debe reportar residuo limpio');
  assert.equal(
    fs.existsSync(outsideTarget),
    true,
    'El directorio externo no verificado NO debe ser borrado recursivamente',
  );
  assert.equal(fs.existsSync(path.join(outsideTarget, 'evidence.log')), true);
});

test('🌲 Worktree Governance: auditAutomationSurface registra cobertura y distingue auditoría completa de parcial', (t) => {
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-unreadable-test-'));
  const scriptsDir = path.join(tempRepo, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  // Archivo legítimo
  const scriptPath = path.join(scriptsDir, 'legit-script.sh');
  fs.writeFileSync(scriptPath, '#!/bin/bash\necho "ok"\n');

  t.after(() => {
    try {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const audit = auditAutomationSurface(tempRepo);
  assert.equal(audit.coverage.isComplete, true, 'La auditoría sobre archivos legibles debe ser completa');
  assert.equal(audit.coverage.unreadableFiles.length, 0);
  assert.ok(audit.coverage.scannedFilesCount >= 1);
});

test('🌲 Worktree Governance: safeRollbackWorktree no declara éxito completo si falla git worktree remove', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-rollback-failgit-'));
  const parentDir = path.join(tempDir, 'repo_parent');
  const testRepoDir = path.join(parentDir, 'pokedex');

  fs.mkdirSync(testRepoDir, { recursive: true });
  execSync('git init -b main', { cwd: testRepoDir });
  execSync('git config user.email "test@pokedex.local"', { cwd: testRepoDir });
  execSync('git config user.name "Pokedex Tester"', { cwd: testRepoDir });
  fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test\n');
  execSync('git add README.md && git commit -m "chore: init"', { cwd: testRepoDir });

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const canonicalBase = path.join(parentDir, '.worktrees', 'pokedex');
  fs.mkdirSync(canonicalBase, { recursive: true });

  // Pasamos una ruta que NO está registrada como worktree en Git
  const unregDir = path.join(canonicalBase, 'feat--unregistered');
  fs.mkdirSync(unregDir, { recursive: true });

  const report = safeRollbackWorktree(unregDir, canonicalBase, testRepoDir);
  // git worktree remove debe fallar porque unregDir no es un worktree registrado
  assert.equal(report.gitWorktreeRemoved, false, 'gitWorktreeRemoved debe ser false si git worktree remove falla');
  assert.equal(report.residualCleaned, true, 'El directorio físico dentro de canonicalBase sí se limpió');
  assert.equal(report.gitMetadataPruned, true, 'El prune siempre se ejecuta');
  assert.ok(report.errors.length > 0, 'Debe registrar el error de git worktree remove');
});

test('🌲 Worktree Governance: safeRollbackWorktree protege contra fallos de lstat y mutación TOCTOU', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-rollback-toctou-'));
  const parentDir = path.join(tempDir, 'repo_parent');
  const testRepoDir = path.join(parentDir, 'pokedex');
  const outsideDir = path.join(tempDir, 'outside_target');

  fs.mkdirSync(testRepoDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  execSync('git init -b main', { cwd: testRepoDir });
  execSync('git config user.email "test@pokedex.local"', { cwd: testRepoDir });
  execSync('git config user.name "Pokedex Tester"', { cwd: testRepoDir });
  fs.writeFileSync(path.join(testRepoDir, 'README.md'), '# Test\n');
  execSync('git add README.md && git commit -m "chore: init"', { cwd: testRepoDir });

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const canonicalBase = path.join(parentDir, '.worktrees', 'pokedex');
  fs.mkdirSync(canonicalBase, { recursive: true });

  // Simular una ruta donde se coloca un symlink/junction apuntando a outsideDir
  const attackPath = path.join(canonicalBase, 'feat--attack-junction');
  const symType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(outsideDir, attackPath, symType);

  const report = safeRollbackWorktree(attackPath, canonicalBase, testRepoDir);
  assert.equal(report.residualCleaned, true, 'El junction/symlink debe eliminarse de forma segura');
  assert.equal(fs.existsSync(outsideDir), true, 'El directorio objetivo fuera de la base no debe ser afectado');
});

test('🌲 Worktree Governance: auditAutomationSurface detecta cuando una superficie gobernada es un archivo en lugar de directorio', (t) => {
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-surface-invalid-'));

  // Creamos un archivo regular en la ruta de scripts/ en lugar de un directorio
  const fakeScriptsFile = path.join(tempRepo, 'scripts');
  fs.writeFileSync(fakeScriptsFile, 'no soy un directorio');

  t.after(() => {
    try {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    } catch {
      // Ignorar fallos de limpieza
    }
  });

  const audit = auditAutomationSurface(tempRepo);
  assert.equal(
    audit.coverage.isComplete,
    false,
    'La cobertura debe ser parcial al encontrar un archivo en lugar de directorio',
  );
  assert.ok(audit.findings.some((f) => f.code === 'WT-AUDIT-UNREADABLE-DIR'));
  assert.ok(audit.coverage.unreadableFiles.some((u) => u.path === fakeScriptsFile));
});
