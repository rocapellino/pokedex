import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type MountMode = 'ro' | 'rw';

export interface ToolLocalConfig {
  executable: string;
  version_args?: string[];
  version_regex?: string;
}

export interface ToolContainerConfig {
  image: string;
  mount_mode?: MountMode;
  network?: 'none' | 'bridge';
  workdir?: string;
  env?: Record<string, string>;
  entrypoint?: string;
  default_args?: string[];
  user?: string;
}

export interface ToolCatalogEntry {
  description?: string;
  local?: ToolLocalConfig;
  container?: ToolContainerConfig;
}

export interface ToolCatalog {
  version: string;
  tools: Record<string, ToolCatalogEntry>;
}

export type ExecutionStatus = 'PASS' | 'FAIL' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'NOT_APPLICABLE';

export interface ToolExecutionResult {
  tool: string;
  command: string;
  status: ExecutionStatus;
  exit_code: number;
  stdout: string;
  stderr: string;
  execution: {
    mode: 'local' | 'container' | 'none';
    runtime?: 'host' | 'docker' | 'podman' | 'nerdctl';
    image?: string;
    executable?: string;
  };
  version: {
    requested?: string;
    resolved?: string;
  };
  message?: string;
}

export interface ExecutionOptions {
  versionReq?: string;
  repoRoot?: string;
  preferContainer?: boolean;
  captureOutput?: boolean;
  timeoutMs?: number;
}

export interface SystemDependencies {
  lookPathFn: (command: string) => string | null;
  execSyncFn: (
    cmd: string,
    args: string[],
    options?: { env?: Record<string, string>; cwd?: string; timeout?: number },
  ) => { status: number | null; stdout: string; stderr: string; error?: Error };
  fsReadFn: (filePath: string) => string;
}

/**
 * Resuelve la raíz del repositorio buscando package.json o .git
 */
export function findRepoRoot(startDir = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, '.git')) || fs.existsSync(path.join(curr, 'package.json'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  throw new Error(`No se encontró la raíz del repositorio (.git o package.json) desde ${startDir}`);
}

/**
 * Parseador YAML liviano y tolerante para tool-catalog.yaml
 */
export function parseCatalogYaml(content: string): ToolCatalog {
  const catalog: ToolCatalog = { version: '1.0.0', tools: {} };
  const lines = content.split(/\r?\n/);
  let currentTool = '';
  let currentSection: 'local' | 'container' | '' = '';
  let inEnv = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const versionMatch = line.match(/^version:\s*["']?([^"'\s]+)["']?/);
    if (versionMatch) {
      catalog.version = versionMatch[1];
      continue;
    }

    const toolMatch = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*$/);
    if (toolMatch) {
      currentTool = toolMatch[1];
      catalog.tools[currentTool] = {};
      currentSection = '';
      inEnv = false;
      continue;
    }

    if (!currentTool) continue;
    const entry = catalog.tools[currentTool];

    const descMatch = line.match(/^\s{4}description:\s*["']?([^"']+)["']?/);
    if (descMatch) {
      entry.description = descMatch[1].trim();
      continue;
    }

    if (/^\s{4}local:\s*$/.test(line)) {
      currentSection = 'local';
      entry.local = { executable: currentTool };
      inEnv = false;
      continue;
    }

    if (/^\s{4}container:\s*$/.test(line)) {
      currentSection = 'container';
      entry.container = { image: '' };
      inEnv = false;
      continue;
    }

    if (currentSection === 'local' && entry.local) {
      const execMatch = line.match(/^\s{6}executable:\s*["']?([^"'\s]+)["']?/);
      if (execMatch) entry.local.executable = execMatch[1];

      const regexMatch = line.match(/^\s{6}version_regex:\s*['"]?([^'"]+)['"]?/);
      if (regexMatch) entry.local.version_regex = regexMatch[1];

      const vargsMatch = line.match(/^\s{6}version_args:\s*\[(.*)\]/);
      if (vargsMatch) {
        entry.local.version_args = vargsMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
    } else if (currentSection === 'container' && entry.container) {
      const imgMatch = line.match(/^\s{6}image:\s*["']?([^"'\s]+)["']?/);
      if (imgMatch) entry.container.image = imgMatch[1];

      const mountMatch = line.match(/^\s{6}mount_mode:\s*["']?(ro|rw)["']?/);
      if (mountMatch) entry.container.mount_mode = mountMatch[1] as MountMode;

      const networkMatch = line.match(/^\s{6}network:\s*["']?(none|bridge)["']?/);
      if (networkMatch) entry.container.network = networkMatch[1] as 'none' | 'bridge';

      const workdirMatch = line.match(/^\s{6}workdir:\s*["']?([^"'\s]+)["']?/);
      if (workdirMatch) entry.container.workdir = workdirMatch[1];

      const entrypointMatch = line.match(/^\s{6}entrypoint:\s*["']?([^"'\s]+)["']?/);
      if (entrypointMatch) entry.container.entrypoint = entrypointMatch[1];

      const userMatch = line.match(/^\s{6}user:\s*["']?([^"'\s]+)["']?/);
      if (userMatch) entry.container.user = userMatch[1];

      const defaultArgsMatch = line.match(/^\s{6}default_args:\s*\[(.*)\]/);
      if (defaultArgsMatch) {
        entry.container.default_args = defaultArgsMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }

      if (/^\s{6}env:\s*$/.test(line)) {
        inEnv = true;
        entry.container.env = {};
        continue;
      }

      if (inEnv) {
        const envMatch = line.match(/^\s{8}([a-zA-Z0-9_]+):\s*["']?([^"']*)["']?/);
        if (envMatch) {
          entry.container.env = entry.container.env || {};
          entry.container.env[envMatch[1]] = envMatch[2];
        } else if (!/^\s{8}/.test(line)) {
          inEnv = false;
        }
      }
    }
  }

  return catalog;
}

/**
 * Carga el catálogo de herramientas desde el archivo oficial
 */
export function loadCatalog(
  repoRoot: string,
  fsRead: (p: string) => string = (p) => fs.readFileSync(p, 'utf8'),
): ToolCatalog {
  const catalogPath = path.join(
    repoRoot,
    '.agents',
    'skills',
    'repo-tool-exec',
    'references',
    'tool-catalog.yaml',
  );
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catálogo no encontrado en ${catalogPath}`);
  }
  const content = fsRead(catalogPath);
  return parseCatalogYaml(content);
}

/**
 * Comparador semver liviano para rangos de versión
 */
export function parseSemver(vStr: string): [number, number, number] | null {
  const m = vStr.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0];
}

export function satisfiesVersion(actual: string, requirement?: string): boolean {
  if (!requirement || requirement.trim() === '*' || requirement.trim() === '') return true;

  const reqTrim = requirement.trim();
  const actualParts = parseSemver(actual);
  if (!actualParts) return false;

  const [aMaj, aMin, aPat] = actualParts;

  // Formato: >=1.2.3, >1.2.3, <=1.2.3, <1.2.3, =1.2.3, ^1.2.3, ~1.2.3 o 1.2.3
  const opMatch = reqTrim.match(/^([><=^~]=?|)\s*(.+)$/);
  if (!opMatch) return false;

  const op = opMatch[1] || '=';
  const reqParts = parseSemver(opMatch[2]);
  if (!reqParts) return false;

  const [rMaj, rMin, rPat] = reqParts;

  const compare = (a: [number, number, number], b: [number, number, number]): number => {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
  };

  const diff = compare([aMaj, aMin, aPat], [rMaj, rMin, rPat]);

  switch (op) {
    case '>=':
      return diff >= 0;
    case '>':
      return diff > 0;
    case '<=':
      return diff <= 0;
    case '<':
      return diff < 0;
    case '=':
    case '==':
      return diff === 0;
    case '^':
      // Mismo major y >= req
      return aMaj === rMaj && diff >= 0;
    case '~':
      // Mismo major y minor y >= req
      return aMaj === rMaj && aMin === rMin && diff >= 0;
    default:
      return diff === 0;
  }
}

/**
 * Dependencias de sistema por defecto para llamadas de proceso
 */
export const defaultSystemDeps: SystemDependencies = {
  lookPathFn: (command: string): string | null => {
    try {
      const isWin = process.platform === 'win32';
      const lookCmd = isWin ? 'where.exe' : 'which';
      const res = spawnSync(lookCmd, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (res.status === 0 && res.stdout) {
        const first = res.stdout.split(/\r?\n/)[0].trim();
        return first || null;
      }
      return null;
    } catch {
      return null;
    }
  },
  execSyncFn: (
    cmd: string,
    args: string[],
    options = {},
  ): { status: number | null; stdout: string; stderr: string; error?: Error } => {
    try {
      const res = spawnSync(cmd, args, {
        encoding: 'utf8',
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        timeout: options.timeout,
      });
      return {
        status: res.status,
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        error: res.error,
      };
    } catch (err) {
      return {
        status: 1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        error: err instanceof Error ? err : undefined,
      };
    }
  },
  fsReadFn: (filePath: string): string => fs.readFileSync(filePath, 'utf8'),
};

/**
 * Detecta disponibilidad y versión de una herramienta local
 */
export function detectLocalTool(
  toolKey: string,
  catalogEntry: ToolCatalogEntry,
  versionReq?: string,
  deps: SystemDependencies = defaultSystemDeps,
): { available: boolean; version?: string; satisfies: boolean; executablePath?: string } {
  const localConfig = catalogEntry.local;
  const exeName = localConfig?.executable || toolKey;
  const exePath = deps.lookPathFn(exeName);

  if (!exePath) {
    return { available: false, satisfies: false };
  }

  // Si no se requiere versión específica, es válido inmediatamente
  if (!versionReq) {
    return { available: true, satisfies: true, executablePath: exePath };
  }

  // Ejecutar comando para extraer versión
  const vArgs = localConfig?.version_args || ['--version'];
  const res = deps.execSyncFn(exePath, vArgs, { timeout: 5000 });
  const rawOutput = (res.stdout || '') + ' ' + (res.stderr || '');

  let detectedVersion: string | undefined;
  if (localConfig?.version_regex) {
    // El patrón proviene del catálogo versionado (no de entrada de usuario); aun así se acota
    // su tamaño y se rechazan cuantificadores anidados para evitar ReDoS por un catálogo alterado.
    if (localConfig.version_regex.length > 200 || /[)\]][+*{]/.test(localConfig.version_regex)) {
      throw new Error(`version_regex inseguro para '${toolKey}'`);
    }
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    const rx = new RegExp(localConfig.version_regex);
    const m = rawOutput.match(rx);
    if (m && m[1]) detectedVersion = m[1];
  } else {
    const sem = parseSemver(rawOutput);
    if (sem) detectedVersion = `${sem[0]}.${sem[1]}.${sem[2]}`;
  }

  if (!detectedVersion) {
    // Si no logramos extraer versión, asumimos que no satisface el requerimiento estricto
    return { available: true, satisfies: false, executablePath: exePath };
  }

  const satisfies = satisfiesVersion(detectedVersion, versionReq);
  return { available: true, version: detectedVersion, satisfies, executablePath: exePath };
}

/**
 * Detecta y valida un runtime de contenedores (docker, podman, nerdctl)
 */
export function detectContainerRuntime(
  deps: SystemDependencies = defaultSystemDeps,
): { runtime: 'docker' | 'podman' | 'nerdctl'; binary: string } | null {
  const candidates: Array<'docker' | 'podman' | 'nerdctl'> = ['docker', 'podman', 'nerdctl'];

  for (const c of candidates) {
    const bin = deps.lookPathFn(c);
    if (!bin) continue;

    // Verificar si el daemon/runtime está operativo
    const testRes = deps.execSyncFn(bin, ['info'], { timeout: 5000 });
    if (testRes.status === 0) {
      return { runtime: c, binary: bin };
    }
  }

  return null;
}

/**
 * Construye el comando de ejecución seguro para contenedor
 */
export function buildContainerCommand(
  runtimeBin: string,
  toolKey: string,
  catalogEntry: ToolCatalogEntry,
  repoRoot: string,
  userArgs: string[] = [],
): { command: string; args: string[]; env: Record<string, string> } {
  const container = catalogEntry.container;
  if (!container || !container.image) {
    throw new Error(`Herramienta '${toolKey}' no define configuración de contenedor autorizada.`);
  }

  // Comprobar política de imagen: prohibido 'latest'
  if (container.image.endsWith(':latest') || container.image === 'latest') {
    throw new Error(
      `Política de supply chain: la imagen '${container.image}' para '${toolKey}' no puede usar la etiqueta 'latest'.`,
    );
  }

  // Prevenir flags peligrosos en los argumentos del usuario
  for (const arg of userArgs) {
    if (arg === '--privileged') {
      throw new Error(`Violación de seguridad: '--privileged' está estrictamente prohibido.`);
    }
    if (arg.includes('/var/run/docker.sock') || arg.includes('docker.sock')) {
      throw new Error(`Violación de seguridad: montar el socket de Docker está estrictamente prohibido.`);
    }
  }

  const mountMode = container.mount_mode || 'ro';
  const workdir = container.workdir || '/repo';

  // Windows volume handling: MSYS_NO_PATHCONV=1
  const env: Record<string, string> = {
    MSYS_NO_PATHCONV: '1',
    ...(container.env || {}),
  };

  const args: string[] = [
    'run',
    '--rm',
    '-v',
    `${repoRoot}:${workdir}:${mountMode}`,
    '-w',
    workdir,
    '--network',
    container.network || 'none',
    '--security-opt',
    'no-new-privileges',
  ];

  // Con montaje ro la herramienta no necesita capabilities; con rw se conservan las
  // por defecto para no perder DAC_OVERRIDE sobre los archivos del montaje.
  if (mountMode === 'ro') {
    args.push('--cap-drop', 'ALL');
  }

  if (container.entrypoint) {
    args.push('--entrypoint', container.entrypoint);
  }

  if (container.user) {
    args.push('--user', container.user);
  } else if (mountMode === 'rw' && typeof process.getuid === 'function' && typeof process.getgid === 'function') {
    // Evita archivos propiedad de root en el repositorio al escribir desde el contenedor.
    args.push('--user', `${process.getuid()}:${process.getgid()}`);
  }

  for (const [k, v] of Object.entries(container.env || {})) {
    args.push('-e', `${k}=${v}`);
  }

  args.push(container.image);

  if (container.default_args && container.default_args.length > 0) {
    args.push(...container.default_args);
  }

  args.push(...userArgs);

  return {
    command: runtimeBin,
    args,
    env,
  };
}

/**
 * Orquesta la resolución y ejecución de una herramienta
 */
export function executeTool(
  toolKey: string,
  userArgs: string[] = [],
  options: ExecutionOptions = {},
  deps: SystemDependencies = defaultSystemDeps,
): ToolExecutionResult {
  const repoRoot = options.repoRoot || findRepoRoot();
  const catalog = loadCatalog(repoRoot, deps.fsReadFn);
  const entry = catalog.tools[toolKey];

  if (!entry) {
    return {
      tool: toolKey,
      command: `${toolKey} ${userArgs.join(' ')}`.trim(),
      status: 'NOT_CONFIGURED',
      exit_code: 1,
      stdout: '',
      stderr: `Herramienta '${toolKey}' no está registrada en el catálogo declarativo tool-catalog.yaml`,
      execution: { mode: 'none' },
      version: { requested: options.versionReq },
      message: `Herramienta '${toolKey}' no configurada en el catálogo.`,
    };
  }

  // 1. Detección Local (salvo si se fuerza contenedor)
  if (!options.preferContainer) {
    let local: ReturnType<typeof detectLocalTool>;
    try {
      local = detectLocalTool(toolKey, entry, options.versionReq, deps);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        tool: toolKey,
        command: `${toolKey} ${userArgs.join(' ')}`.trim(),
        status: 'NOT_CONFIGURED',
        exit_code: 1,
        stdout: '',
        stderr: reason,
        execution: { mode: 'none' },
        version: { requested: options.versionReq },
        message: `Configuración inválida en el catálogo para '${toolKey}': ${reason}`,
      };
    }
    if (local.available && local.satisfies && local.executablePath) {
      const fullCmd = `${local.executablePath} ${userArgs.join(' ')}`.trim();
      const runRes = deps.execSyncFn(local.executablePath, userArgs, {
        cwd: repoRoot,
        timeout: options.timeoutMs,
      });

      const exitCode = runRes.status ?? (runRes.error ? 1 : 0);
      return {
        tool: toolKey,
        command: fullCmd,
        status: exitCode === 0 ? 'PASS' : 'FAIL',
        exit_code: exitCode,
        stdout: runRes.stdout,
        stderr: runRes.stderr + (runRes.error ? `\n${runRes.error.message}` : ''),
        execution: {
          mode: 'local',
          runtime: 'host',
          executable: local.executablePath,
        },
        version: {
          requested: options.versionReq,
          resolved: local.version,
        },
      };
    }
  }

  // 2. Fallback a Contenedor
  if (!entry.container || !entry.container.image) {
    return {
      tool: toolKey,
      command: `${toolKey} ${userArgs.join(' ')}`.trim(),
      status: 'UNAVAILABLE',
      exit_code: 1,
      stdout: '',
      stderr: `Herramienta local ausente y sin definición de contenedor de fallback para '${toolKey}'.`,
      execution: { mode: 'none' },
      version: { requested: options.versionReq },
      message: `Herramienta '${toolKey}' no disponible en host ni contenedor.`,
    };
  }

  // El fallback a contenedor también debe respetar el requisito de versión.
  const imageTag = entry.container.image.match(/:([a-zA-Z0-9._-]+)(?:@|$)/)?.[1];
  if (options.versionReq && !(imageTag && satisfiesVersion(imageTag, options.versionReq))) {
    return {
      tool: toolKey,
      command: `${toolKey} ${userArgs.join(' ')}`.trim(),
      status: 'UNAVAILABLE',
      exit_code: 1,
      stdout: '',
      stderr: `La imagen '${entry.container.image}' no satisface el requisito de versión '${options.versionReq}' y la herramienta local no lo cumple.`,
      execution: { mode: 'none' },
      version: { requested: options.versionReq, resolved: imageTag },
      message: `Ni el binario local ni la imagen del catálogo satisfacen '${options.versionReq}'.`,
    };
  }

  const detectedRuntime = detectContainerRuntime(deps);
  if (!detectedRuntime) {
    return {
      tool: toolKey,
      command: `${toolKey} ${userArgs.join(' ')}`.trim(),
      status: 'UNAVAILABLE',
      exit_code: 1,
      stdout: '',
      stderr: `Herramienta local ausente y ningún runtime de contenedor operativo (docker, podman, nerdctl).`,
      execution: { mode: 'none' },
      version: { requested: options.versionReq },
      message: `Runtime de contenedores no disponible para fallback.`,
    };
  }

  try {
    const containerPlan = buildContainerCommand(
      detectedRuntime.binary,
      toolKey,
      entry,
      repoRoot,
      userArgs,
    );

    const runRes = deps.execSyncFn(containerPlan.command, containerPlan.args, {
      cwd: repoRoot,
      env: containerPlan.env,
      timeout: options.timeoutMs,
    });

    const exitCode = runRes.status ?? (runRes.error ? 1 : 0);
    const fullCmd = `${detectedRuntime.runtime} ${containerPlan.args.join(' ')}`;

    // Extraer versión de la imagen si está disponible
    const imageVersionMatch = entry.container.image.match(/:([a-zA-Z0-9._-]+)(?:@|$)/);
    const resolvedVersion = imageVersionMatch ? imageVersionMatch[1] : undefined;

    return {
      tool: toolKey,
      command: fullCmd,
      status: exitCode === 0 ? 'PASS' : 'FAIL',
      exit_code: exitCode,
      stdout: runRes.stdout,
      stderr: runRes.stderr + (runRes.error ? `\n${runRes.error.message}` : ''),
      execution: {
        mode: 'container',
        runtime: detectedRuntime.runtime,
        image: entry.container.image,
      },
      version: {
        requested: options.versionReq,
        resolved: resolvedVersion,
      },
    };
  } catch (err) {
    return {
      tool: toolKey,
      command: `${toolKey} ${userArgs.join(' ')}`.trim(),
      status: 'FAIL',
      exit_code: 1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      execution: {
        mode: 'container',
        runtime: detectedRuntime.runtime,
        image: entry.container.image,
      },
      version: { requested: options.versionReq },
      message: `Error al construir o ejecutar el contenedor: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Punto de entrada CLI
 */
export function runCli(args = process.argv.slice(2)): void {
  const jsonOutput = args.includes('--json');
  const filteredArgs = args.filter((a) => a !== '--json');
  const subCommand = filteredArgs[0];

  if (!subCommand || subCommand === 'help' || subCommand === '--help') {
    console.log(`
Uso de repo-tool-exec:
  tool-exec.ts run <tool> [args...] [--version-req <v>] [--json]
  tool-exec.ts check <tool> [--version-req <v>] [--json]
  tool-exec.ts catalog [--json]

Ejemplos:
  tool-exec.ts run actionlint .
  tool-exec.ts run shellcheck scripts/dr_verify_restore.sh
  tool-exec.ts check actionlint --version-req ">=1.7.7"
  tool-exec.ts catalog
`);
    return;
  }

  let repoRoot: string;
  try {
    repoRoot = findRepoRoot();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  if (subCommand === 'catalog') {
    const catalog = loadCatalog(repoRoot);
    if (jsonOutput) {
      console.log(JSON.stringify(catalog, null, 2));
    } else {
      console.log(`Catálogo Canónico de Herramientas (v${catalog.version}):`);
      for (const [key, tool] of Object.entries(catalog.tools)) {
        console.log(`  - ${key.padEnd(25)} ${tool.description || ''}`);
        if (tool.container) console.log(`      imagen: ${tool.container.image}`);
      }
    }
    return;
  }

  if (subCommand === 'check') {
    const toolName = filteredArgs[1];
    if (!toolName) {
      console.error('Error: debe especificar el nombre de la herramienta');
      process.exitCode = 1;
      return;
    }

    let versionReq: string | undefined;
    const vIdx = filteredArgs.indexOf('--version-req');
    if (vIdx !== -1 && filteredArgs[vIdx + 1]) {
      versionReq = filteredArgs[vIdx + 1];
    }

    const catalog = loadCatalog(repoRoot);
    const entry = catalog.tools[toolName];
    if (!entry) {
      console.error(`Herramienta '${toolName}' no encontrada en el catálogo.`);
      process.exitCode = 1;
      return;
    }

    const local = detectLocalTool(toolName, entry, versionReq);
    const runtime = detectContainerRuntime();

    const report = {
      tool: toolName,
      local: {
        available: local.available,
        satisfies_version: local.satisfies,
        version: local.version,
        path: local.executablePath,
      },
      container: {
        runtime_available: !!runtime,
        runtime: runtime?.runtime,
        image: entry.container?.image,
      },
      can_execute: local.satisfies || (!!runtime && !!entry.container?.image),
    };

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Estado de disponibilidad para '${toolName}':`);
      console.log(`  Local:     ${local.available ? 'Sí' : 'No'} (versión: ${local.version || 'desconocida'}, cumple: ${local.satisfies ? 'Sí' : 'No'})`);
      console.log(`  Container: ${runtime ? `Sí (${runtime.runtime})` : 'No'} (imagen: ${entry.container?.image || 'sin definir'})`);
      console.log(`  Resolución final: ${report.can_execute ? 'DISPONIBLE' : 'UNAVAILABLE'}`);
    }
    return;
  }

  if (subCommand === 'run') {
    const toolName = filteredArgs[1];
    if (!toolName) {
      console.error('Error: debe especificar el nombre de la herramienta a ejecutar');
      process.exitCode = 1;
      return;
    }

    let versionReq: string | undefined;
    const vIdx = filteredArgs.indexOf('--version-req');
    let toolArgs: string[];

    if (vIdx !== -1) {
      versionReq = filteredArgs[vIdx + 1];
      toolArgs = filteredArgs.slice(2, vIdx).concat(filteredArgs.slice(vIdx + 2));
    } else {
      toolArgs = filteredArgs.slice(2);
    }

    const result = executeTool(toolName, toolArgs, { versionReq, repoRoot });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      console.log(`\n[repo-tool-exec] ${result.status} | Mode: ${result.execution.mode} | Exit Code: ${result.exit_code}`);
    }

    process.exitCode = result.exit_code;
    return;
  }

  console.error(`Subcomando desconocido: ${subCommand}`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
