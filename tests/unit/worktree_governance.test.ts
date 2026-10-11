import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createWorktree } from '../../scripts/worktree/creator.js';
import { runWorktreeDoctor } from '../../scripts/worktree/doctor.js';
import { listWorktrees, pruneWorktrees, removeWorktreeSafely } from '../../scripts/worktree/manager.js';
import { generateCanonicalNaming, sanitizeSlug, sanitizeTicketId } from '../../scripts/worktree/naming.js';
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
