import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createWorktree } from '../../scripts/worktree/creator.js';
import { checkUngovernedWorktreeCalls, runWorktreeDoctor } from '../../scripts/worktree/doctor.js';
import { listWorktrees, pruneWorktrees, removeWorktreeSafely } from '../../scripts/worktree/manager.js';
import {
  ALLOWED_TASK_TYPES,
  generateCanonicalNaming,
  sanitizeSlug,
  sanitizeTicketId,
  validateGitRef,
} from '../../scripts/worktree/naming.js';
import {
  isWithinCanonicalBase,
  resolveCanonicalWorktreeBase,
  resolveMainRepoRoot,
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
