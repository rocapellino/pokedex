import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCatalogYaml,
  satisfiesVersion,
  detectLocalTool,
  detectContainerRuntime,
  buildContainerCommand,
  executeTool,
} from '../../.agents/skills/repo-tool-exec/scripts/tool-exec.ts';
import type { SystemDependencies, ToolCatalogEntry } from '../../.agents/skills/repo-tool-exec/scripts/tool-exec.ts';

const mockCatalogYaml = `
version: "1.0.0"
tools:
  mock-tool:
    description: "Herramienta de prueba mock"
    local:
      executable: "mock-tool"
      version_args: ["--version"]
      version_regex: 'v?(\\d+\\.\\d+\\.\\d+)'
    container:
      image: "mock/image:1.2.3@sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
      mount_mode: "ro"
      workdir: "/repo"
      env:
        TOOL_OPT: "--strict"
      default_args: ["--check"]

  mock-no-container:
    description: "Herramienta sin contenedor"
    local:
      executable: "mock-local-only"

  mock-rw-tool:
    description: "Herramienta con escritura rw"
    local:
      executable: "mock-rw"
    container:
      image: "mock/rw:2.0.0"
      mount_mode: "rw"
      workdir: "/repo"
`;

test('📦 repo-tool-exec: parseCatalogYaml parsea correctamente la especificación declarativa', () => {
  const catalog = parseCatalogYaml(mockCatalogYaml);
  assert.equal(catalog.version, '1.0.0');
  assert.ok(catalog.tools['mock-tool']);
  assert.equal(catalog.tools['mock-tool'].description, 'Herramienta de prueba mock');
  assert.equal(catalog.tools['mock-tool'].local?.executable, 'mock-tool');
  assert.equal(catalog.tools['mock-tool'].container?.mount_mode, 'ro');
  assert.equal(catalog.tools['mock-tool'].container?.env?.TOOL_OPT, '--strict');
  assert.deepEqual(catalog.tools['mock-tool'].container?.default_args, ['--check']);
});

test('🔢 repo-tool-exec: satisfiesVersion valida comparaciones semver', () => {
  assert.equal(satisfiesVersion('1.7.12', '>=1.7.7'), true);
  assert.equal(satisfiesVersion('1.7.0', '>=1.7.7'), false);
  assert.equal(satisfiesVersion('2.0.0', '>=1.7.7'), true);
  assert.equal(satisfiesVersion('1.7.7', '=1.7.7'), true);
  assert.equal(satisfiesVersion('1.8.0', '^1.7.0'), true);
  assert.equal(satisfiesVersion('2.0.0', '^1.7.0'), false);
  assert.equal(satisfiesVersion('1.7.8', '~1.7.0'), true);
  assert.equal(satisfiesVersion('1.8.0', '~1.7.0'), false);
  assert.equal(satisfiesVersion('1.5.0'), true); // sin requerimiento
});

test('🖥️ repo-tool-exec: detección local cuando el binario existe y cumple versión', () => {
  const catalog = parseCatalogYaml(mockCatalogYaml);
  const entry = catalog.tools['mock-tool'];

  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'mock-tool' ? '/usr/bin/mock-tool' : null),
    execSyncFn: (cmd, args) => {
      if (cmd === '/usr/bin/mock-tool' && args[0] === '--version') {
        return { status: 0, stdout: 'mock-tool v1.8.0\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    },
    fsReadFn: () => mockCatalogYaml,
  };

  const detected = detectLocalTool('mock-tool', entry, '>=1.7.0', mockDeps);
  assert.equal(detected.available, true);
  assert.equal(detected.version, '1.8.0');
  assert.equal(detected.satisfies, true);
  assert.equal(detected.executablePath, '/usr/bin/mock-tool');
});

test('🖥️ repo-tool-exec: fallback cuando la versión local es incompatible', () => {
  const catalog = parseCatalogYaml(mockCatalogYaml);
  const entry = catalog.tools['mock-tool'];

  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'mock-tool' ? '/usr/bin/mock-tool' : null),
    execSyncFn: (cmd, args) => {
      if (cmd === '/usr/bin/mock-tool' && args[0] === '--version') {
        return { status: 0, stdout: 'mock-tool v1.2.0\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    },
    fsReadFn: () => mockCatalogYaml,
  };

  const detected = detectLocalTool('mock-tool', entry, '>=1.7.0', mockDeps);
  assert.equal(detected.available, true);
  assert.equal(detected.version, '1.2.0');
  assert.equal(detected.satisfies, false); // No cumple -> activa fallback
});

test('🐳 repo-tool-exec: detección dinámica de runtimes (docker > podman > nerdctl)', () => {
  const mockDepsDocker: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'docker' ? '/bin/docker' : null),
    execSyncFn: (cmd, args) => ({
      status: cmd === '/bin/docker' && args[0] === 'info' ? 0 : 1,
      stdout: '',
      stderr: '',
    }),
    fsReadFn: () => '',
  };
  const runtimeDocker = detectContainerRuntime(mockDepsDocker);
  assert.deepEqual(runtimeDocker, { runtime: 'docker', binary: '/bin/docker' });

  const mockDepsPodman: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'podman' ? '/bin/podman' : null),
    execSyncFn: (cmd, args) => ({
      status: cmd === '/bin/podman' && args[0] === 'info' ? 0 : 1,
      stdout: '',
      stderr: '',
    }),
    fsReadFn: () => '',
  };
  const runtimePodman = detectContainerRuntime(mockDepsPodman);
  assert.deepEqual(runtimePodman, { runtime: 'podman', binary: '/bin/podman' });

  const mockDepsNerdctl: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'nerdctl' ? '/bin/nerdctl' : null),
    execSyncFn: (cmd, args) => ({
      status: cmd === '/bin/nerdctl' && args[0] === 'info' ? 0 : 1,
      stdout: '',
      stderr: '',
    }),
    fsReadFn: () => '',
  };
  const runtimeNerdctl = detectContainerRuntime(mockDepsNerdctl);
  assert.deepEqual(runtimeNerdctl, { runtime: 'nerdctl', binary: '/bin/nerdctl' });

  const mockDepsNone: SystemDependencies = {
    lookPathFn: () => null,
    execSyncFn: () => ({ status: 1, stdout: '', stderr: '' }),
    fsReadFn: () => '',
  };
  assert.equal(detectContainerRuntime(mockDepsNone), null);
});

test('🔒 repo-tool-exec: buildContainerCommand aplica aislamiento y rechaza parámetros inseguros', () => {
  const catalog = parseCatalogYaml(mockCatalogYaml);
  const entry = catalog.tools['mock-tool'];
  const repoRoot = '/workspace/repo';

  const cmd = buildContainerCommand('/bin/docker', 'mock-tool', entry, repoRoot, ['src/file.sh']);
  assert.equal(cmd.command, '/bin/docker');
  assert.ok(cmd.args.includes('--rm'));
  assert.ok(cmd.args.includes('/workspace/repo:/repo:ro'));
  assert.ok(cmd.args.includes('-w'));
  assert.ok(cmd.args.includes('/repo'));
  assert.ok(cmd.args.includes('-e'));
  assert.ok(cmd.args.includes('TOOL_OPT=--strict'));
  assert.equal(cmd.env.MSYS_NO_PATHCONV, '1');

  // Violación: --privileged
  assert.throws(() => {
    buildContainerCommand('/bin/docker', 'mock-tool', entry, repoRoot, ['--privileged']);
  }, /Violación de seguridad: '--privileged'/);

  // Violación: docker.sock
  assert.throws(() => {
    buildContainerCommand('/bin/docker', 'mock-tool', entry, repoRoot, [
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
    ]);
  }, /Violación de seguridad: montar el socket de Docker/);
});

test('🔒 repo-tool-exec: rechaza el uso de imágenes con tag :latest', () => {
  const entry: ToolCatalogEntry = {
    container: {
      image: 'dangerous/image:latest',
    },
  };
  assert.throws(() => {
    buildContainerCommand('/bin/docker', 'tool', entry, '/repo', []);
  }, /no puede usar la etiqueta 'latest'/);
});

test('🚀 repo-tool-exec: flujo completo ejecuta en local cuando está disponible', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'mock-tool' ? '/usr/bin/mock-tool' : null),
    execSyncFn: (cmd, args) => {
      if (cmd === '/usr/bin/mock-tool' && args[0] === '--version') {
        return { status: 0, stdout: 'mock-tool v1.8.0\n', stderr: '' };
      }
      if (cmd === '/usr/bin/mock-tool') {
        return { status: 0, stdout: 'SUCCESS LOCAL', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    },
    fsReadFn: () => mockCatalogYaml,
  };

  const result = executeTool('mock-tool', ['arg1'], { versionReq: '>=1.7.0' }, mockDeps);
  assert.equal(result.status, 'PASS');
  assert.equal(result.exit_code, 0);
  assert.equal(result.execution.mode, 'local');
  assert.equal(result.execution.runtime, 'host');
  assert.equal(result.stdout, 'SUCCESS LOCAL');
});

test('🚀 repo-tool-exec: flujo completo ejecuta en contenedor cuando binario local falta', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'docker' ? '/usr/bin/docker' : null), // mock-tool no existe, docker sí
    execSyncFn: (cmd, args) => {
      if (cmd === '/usr/bin/docker' && args[0] === 'info') {
        return { status: 0, stdout: 'ok', stderr: '' };
      }
      if (cmd === '/usr/bin/docker' && args[0] === 'run') {
        return { status: 0, stdout: 'SUCCESS CONTAINER', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    },
    fsReadFn: () => mockCatalogYaml,
  };

  const result = executeTool('mock-tool', ['arg1'], {}, mockDeps);
  assert.equal(result.status, 'PASS');
  assert.equal(result.exit_code, 0);
  assert.equal(result.execution.mode, 'container');
  assert.equal(result.execution.runtime, 'docker');
  assert.equal(result.stdout, 'SUCCESS CONTAINER');
});

test('⚠️ repo-tool-exec: propaga exit code != 0 como FAIL y nunca como PASS', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'docker' ? '/usr/bin/docker' : null),
    execSyncFn: (cmd, args) => {
      if (cmd === '/usr/bin/docker' && args[0] === 'info') {
        return { status: 0, stdout: 'ok', stderr: '' };
      }
      if (cmd === '/usr/bin/docker' && args[0] === 'run') {
        return { status: 2, stdout: '', stderr: 'LINT ERROR DETECTED' };
      }
      return { status: 1, stdout: '', stderr: '' };
    },
    fsReadFn: () => mockCatalogYaml,
  };

  const result = executeTool('mock-tool', ['arg1'], {}, mockDeps);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.exit_code, 2);
  assert.equal(result.execution.mode, 'container');
  assert.match(result.stderr, /LINT ERROR DETECTED/);
});

test('🚫 repo-tool-exec: devuelve UNAVAILABLE cuando binario local falta y runtime tampoco existe', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: () => null, // Ni herramienta ni runtime existen
    execSyncFn: () => ({ status: 1, stdout: '', stderr: '' }),
    fsReadFn: () => mockCatalogYaml,
  };

  const result = executeTool('mock-tool', ['arg1'], {}, mockDeps);
  assert.equal(result.status, 'UNAVAILABLE');
  assert.notEqual(result.exit_code, 0);
  assert.equal(result.execution.mode, 'none');
});

test('🚫 repo-tool-exec: devuelve UNAVAILABLE cuando binario local falta y herramienta no tiene imagen en catálogo', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: (cmd) => (cmd === 'docker' ? '/usr/bin/docker' : null),
    execSyncFn: () => ({ status: 0, stdout: '', stderr: '' }),
    fsReadFn: () => mockCatalogYaml,
  };

  const result = executeTool('mock-no-container', ['arg1'], {}, mockDeps);
  assert.equal(result.status, 'UNAVAILABLE');
  assert.notEqual(result.exit_code, 0);
  assert.equal(result.execution.mode, 'none');
});

test('🚫 repo-tool-exec: devuelve NOT_CONFIGURED cuando la herramienta no existe en el catálogo', () => {
  const mockDeps: SystemDependencies = {
    lookPathFn: () => null,
    execSyncFn: () => ({ status: 0, stdout: '', stderr: '' }),
    fsReadFn: () => mockCatalogYaml,
  };

  const result = executeTool('non-existent-tool', ['arg1'], {}, mockDeps);
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.notEqual(result.exit_code, 0);
  assert.equal(result.execution.mode, 'none');
});
