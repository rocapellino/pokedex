import assert from 'node:assert/strict';
import test from 'node:test';
import { runPreCommit } from '../../scripts/run-pre-commit.ts';
import type { SystemDependencies } from '../../.agents/skills/repo-tool-exec/scripts/tool-exec.ts';

test('🔧 run-pre-commit: ejecuta pre-commit local cuando está disponible', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'pre-commit' ? '/usr/bin/pre-commit' : null),
    execSyncFn: (cmd, args) => {
      if (cmd === '/usr/bin/pre-commit' && args[0] === '--version') {
        return { status: 0, stdout: 'pre-commit 4.6.2\n', stderr: '' };
      }
      return { status: 0, stdout: 'PASS', stderr: '' };
    },
    fsReadFn: () => '',
  };

  const code = runPreCommit(['--version'], mockDeps);
  assert.equal(code, 0, 'runPreCommit con pre-commit local debe retornar 0');
});

test('🐳 run-pre-commit: ejecuta en contenedor cuando pre-commit local no existe pero docker sí', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'docker' ? '/usr/bin/docker' : null),
    execSyncFn: (cmd, args) => {
      if (cmd === '/usr/bin/docker' && args[0] === 'info') {
        return { status: 0, stdout: 'ok', stderr: '' };
      }
      if (cmd === '/usr/bin/docker' && args[0] === 'run') {
        return { status: 0, stdout: 'pre-commit 4.6.2 (container)\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    },
    fsReadFn: () => '',
  };

  const code = runPreCommit(['--version'], mockDeps);
  assert.equal(code, 0, 'runPreCommit en contenedor debe retornar 0');
});

test('⚠️ run-pre-commit: propaga código de fallo cuando pre-commit falla', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'pre-commit' ? '/usr/bin/pre-commit' : null),
    execSyncFn: () => ({ status: 1, stdout: '', stderr: 'hook failed' }),
    fsReadFn: () => '',
  };

  const code = runPreCommit(['run', '--all-files'], mockDeps);
  assert.equal(code, 1, 'runPreCommit debe retornar el código de salida del linter');
});
