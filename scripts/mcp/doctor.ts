#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/doctor.ts
 * ==============================================================================
 * Diagnóstico seguro, desacoplado y accionable del entorno MCP en rocapellino/pokedex.
 *
 * Evalúa por separado:
 *   1. Integridad y sincronización de configuraciones de clientes.
 *   2. Dependencias de herramientas del sistema (Node.js, Docker, CLI local y plugins).
 *   3. Variables de entorno requeridas por servidor (presencia estricta sin filtrar valores).
 *   4. Seguridad de conectividad y transporte (obligatoriedad de TLS en endpoints remotos).
 *
 * Principio Zero-Trust:
 *   NUNCA imprime, expone ni registra en disco valores de secretos, tokens ni contraseñas.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { withMcpAudit } from './audit.js';
import { generateAllClientConfigs } from './generate.js';
import { loadLocalEnv } from './env.js';
import type { McpRegistrySpec, McpServerDefinition } from './adapters/types.js';

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_ROOT_DIR = process.cwd();

export type ServerHealthState = 'READY' | 'CONFIG_MISSING' | 'DEPENDENCY_MISSING' | 'DISABLED';
export type ConfigurationStatus = 'VALID' | 'MISSING_ENV' | 'NOT_APPLICABLE';
export type DependenciesStatus = 'MET' | 'MISSING_TOOL' | 'MISSING_PLUGIN' | 'NOT_APPLICABLE';
export type ConnectivityStatus = 'SECURE' | 'INSECURE_REMOTE' | 'UNRESOLVED_URL' | 'LOCAL' | 'INVALID_URL';

export interface ServerDiagnosis {
  id: string;
  name: string;
  profile: string;
  transport: string;
  executionMode: string;
  state: ServerHealthState;
  configurationStatus: ConfigurationStatus;
  dependenciesStatus: DependenciesStatus;
  connectivityStatus: ConnectivityStatus;
  details: string[];
}

export interface DoctorSummary {
  clientsInSync: boolean;
  dependenciesMet: boolean;
  configurationsMet: boolean;
  connectivityMet: boolean;
  totalServers: number;
  enabledServers: number;
  readyServers: number;
  blockingServers: number;
}

export interface DoctorReport {
  overallValid: boolean;
  summary: DoctorSummary;
  systemTools: Record<string, { available: boolean; version?: string }>;
  clientConfigs: { client: string; path: string; inSync: boolean }[];
  servers: ServerDiagnosis[];
  recommendations: string[];
}

export interface McpDoctorOptions {
  rootDir?: string;
  env?: Record<string, string | undefined>;
  cliProbeFn?: (binary: string, args?: string[]) => { available: boolean; version?: string };
  trivyPluginProbeFn?: (pluginName?: string) => { installed: boolean; version?: string; error?: string };
}

/**
 * Sonda segura de comandos de línea de comandos locales.
 * En Windows, incluye fallback a cmd.exe para scripts por lotes (.cmd/.bat).
 */
export function probeCliTool(binary: string, args: string[] = ['--version']): { available: boolean; version?: string } {
  // 1. Intento directo con execFileSync sin shell
  try {
    const output = execFileSync(binary, args, {
      // NOSONAR: S4036 - sonda read-only de versión de herramientas CLI locales
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const firstLine = output.trim().split('\n')[0];
    return { available: true, version: firstLine };
  } catch {
    // 2. En Windows, herramientas empaquetadas como .cmd/.bat (ej. npx) requieren invocación vía cmd.exe
    if (process.platform === 'win32') {
      try {
        const cmdArgs = ['/d', '/s', '/c', `${binary} ${args.join(' ')}`];
        const output = execFileSync('cmd.exe', cmdArgs, {
          // NOSONAR: S4036 - sonda controlada de versión en Windows
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
        });
        const firstLine = output.trim().split('\n')[0];
        if (firstLine && !firstLine.includes('no se reconoce') && !firstLine.includes('is not recognized')) {
          return { available: true, version: firstLine };
        }
      } catch {
        return { available: false };
      }
    }
    return { available: false };
  }
}

/**
 * Sonda específica para comprobar que un plugin de Trivy (por defecto 'mcp') está instalado y operativo.
 */
export function probeTrivyPlugin(
  pluginName = 'mcp',
  cliProbeFn: (binary: string, args?: string[]) => { available: boolean; version?: string } = probeCliTool,
): { installed: boolean; version?: string; error?: string } {
  const cliProbe = cliProbeFn('trivy');
  if (!cliProbe.available) {
    return { installed: false, error: 'CLI trivy no encontrada en PATH' };
  }

  // 1. Intento primario: listar plugins instalados con `trivy plugin list`
  try {
    const listOutput = execFileSync('trivy', ['plugin', 'list'], {
      // NOSONAR: S4036 - sonda read-only de plugins de trivy
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const lines = listOutput.split('\n');
    const hasPlugin = lines.some((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith(pluginName) || trimmed.split(/\s+/)[0] === pluginName;
    });
    if (hasPlugin) {
      return { installed: true };
    }
  } catch {
    if (process.platform === 'win32') {
      try {
        const listOutput = execFileSync('cmd.exe', ['/d', '/s', '/c', 'trivy plugin list'], {
          // NOSONAR: S4036 - sonda de plugin en Windows
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
        });
        const lines = listOutput.split('\n');
        const hasPlugin = lines.some((line) => {
          const trimmed = line.trim();
          return trimmed.startsWith(pluginName) || trimmed.split(/\s+/)[0] === pluginName;
        });
        if (hasPlugin) {
          return { installed: true };
        }
      } catch {
        // Continúa al fallback no destructivo
      }
    }
  }

  // 2. Fallback no destructivo: comprobar si `trivy <pluginName> --help` es reconocido
  try {
    const helpOutput = execFileSync('trivy', [pluginName, '--help'], {
      // NOSONAR: S4036 - sonda no destructiva de subcomando
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    if (helpOutput && !helpOutput.includes('unknown command')) {
      return { installed: true };
    }
  } catch {
    if (process.platform === 'win32') {
      try {
        const helpOutput = execFileSync('cmd.exe', ['/d', '/s', '/c', `trivy ${pluginName} --help`], {
          // NOSONAR: S4036 - sonda no destructiva en Windows
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
        });
        if (helpOutput && !helpOutput.includes('unknown command')) {
          return { installed: true };
        }
      } catch {
        // Plugin no disponible
      }
    }
  }

  return { installed: false, error: `Plugin '${pluginName}' no detectado en 'trivy plugin list'` };
}

function detectSystemTools(
  cliProbeFn: (binary: string, args?: string[]) => { available: boolean; version?: string },
  trivyPluginProbeFn: (pluginName?: string) => { installed: boolean; version?: string; error?: string },
): Record<string, { available: boolean; version?: string }> {
  const trivyProbe = cliProbeFn('trivy');
  const trivyMcpPlugin = trivyProbe.available ? trivyPluginProbeFn('mcp') : { installed: false };

  return {
    node: { available: true, version: process.version },
    docker: cliProbeFn('docker'),
    trivy: trivyProbe,
    'trivy-mcp': {
      available: trivyMcpPlugin.installed,
      version: trivyMcpPlugin.installed ? 'instalado' : undefined,
    },
    npx: cliProbeFn('npx'),
    vscode: cliProbeFn('code'),
    cursor: cliProbeFn('cursor'),
    claude: cliProbeFn('claude'),
  };
}

function getMissingEnvVars(
  requiredVars: string[] | undefined,
  envSource: Record<string, string | undefined>,
): string[] {
  if (!Array.isArray(requiredVars)) return [];
  const missing: string[] = [];
  for (const envVar of requiredVars) {
    const envVal = envSource[envVar];
    if (!envVal || envVal.trim().length === 0) {
      missing.push(envVar);
    }
  }
  return missing;
}

export function resolveServerUrl(
  url: string | undefined,
  envSource: Record<string, string | undefined> = process.env,
): { resolvedUrl: string; hasUnresolvedVars: boolean; missingVars: string[] } {
  if (!url) {
    return { resolvedUrl: '', hasUnresolvedVars: false, missingVars: [] };
  }

  const missingVars: string[] = [];
  const resolvedUrl = url.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (match, varName, fallback) => {
    const envVal = envSource[varName];
    if (envVal && envVal.trim().length > 0) {
      return envVal.trim();
    }
    if (fallback !== undefined) {
      return fallback;
    }
    missingVars.push(varName);
    return match;
  });

  return {
    resolvedUrl,
    hasUnresolvedVars: missingVars.length > 0,
    missingVars,
  };
}

export function evaluateRemoteTransportUrl(targetUrl: string): {
  status: ConnectivityStatus;
  detail: string;
  recommendation?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return {
      status: 'INVALID_URL',
      detail: `URL de endpoint remoto inválida o malformada: '${targetUrl}'.`,
      recommendation: 'Configure una URL sintácticamente válida con esquema http:// o https://.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      status: 'INVALID_URL',
      detail: `Protocolo no soportado '${parsed.protocol}' en endpoint remoto (se exige http: o https:).`,
      recommendation: 'Configure el endpoint remoto utilizando esquema http:// o https://.',
    };
  }

  // Normalizar hostname removiendo corchetes de IPv6 (ej. [::1] -> ::1)
  const rawHostname = parsed.hostname.toLowerCase();
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']') ? rawHostname.slice(1, -1) : rawHostname;

  const isIpv4Loopback =
    /^127\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      hostname,
    );

  const isLoopback = hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || isIpv4Loopback;

  if (isLoopback) {
    return {
      status: 'LOCAL',
      detail: `Transporte remoto loopback local verificado (${parsed.hostname}).`,
    };
  }

  if (parsed.protocol === 'https:') {
    return {
      status: 'SECURE',
      detail: 'Transporte HTTPS declarado (esquema TLS conforme en inspección estática).',
    };
  }

  return {
    status: 'INSECURE_REMOTE',
    detail: `ADVERTENCIA: Transporte remoto hacia '${parsed.hostname}' sin TLS (https obligatoria en producción).`,
    recommendation: 'Configure endpoint seguro con HTTPS (TLS) para el servidor remoto.',
  };
}

function diagnoseServer(
  s: McpServerDefinition,
  dockerAvailable: boolean,
  recommendations: string[],
  options: McpDoctorOptions,
): ServerDiagnosis {
  const cliProbe = options.cliProbeFn ?? probeCliTool;
  const trivyPluginProbe = options.trivyPluginProbeFn ?? probeTrivyPlugin;
  const envSource = options.env ?? process.env;

  if (!s.enabled) {
    return {
      id: s.id,
      name: s.name,
      profile: s.profile,
      transport: s.transport,
      executionMode: s.execution_mode,
      state: 'DISABLED',
      configurationStatus: 'NOT_APPLICABLE',
      dependenciesStatus: 'NOT_APPLICABLE',
      connectivityStatus: s.transport === 'stdio' ? 'LOCAL' : 'SECURE',
      details: ['Deshabilitado explícitamente en el registro.'],
    };
  }

  const details: string[] = [];

  // 1. Evaluación segregada de variables de configuración requeridas
  const missingVars = getMissingEnvVars(s.required_env_vars, envSource);
  const configurationStatus: ConfigurationStatus = missingVars.length > 0 ? 'MISSING_ENV' : 'VALID';
  if (configurationStatus === 'MISSING_ENV') {
    details.push(`Variables faltantes: ${missingVars.join(', ')}.`);
    recommendations.push(`Defina localmente las variables para '${s.id}': ${missingVars.join(', ')}.`);
  }

  // 2. Evaluación segregada de dependencias locales (Docker, CLI, plugins)
  let dependenciesStatus: DependenciesStatus = 'MET';
  if (s.execution_mode === 'container' && !dockerAvailable) {
    dependenciesStatus = 'MISSING_TOOL';
    details.push('Docker no está disponible en PATH para ejecutar este contenedor.');
    recommendations.push(`Instale o inicie Docker para habilitar la ejecución del servidor '${s.id}'.`);
  }

  if (s.execution_mode === 'local' && s.command) {
    const binaryProbe = cliProbe(s.command);
    if (!binaryProbe.available) {
      dependenciesStatus = 'MISSING_TOOL';
      details.push(`El comando ejecutable '${s.command}' no está disponible en PATH.`);
      recommendations.push(
        s.command === 'trivy'
          ? `Instale Trivy CLI (https://trivy.dev) y ejecute 'trivy plugin install mcp' para habilitar el servidor '${s.id}'.`
          : `Instale la herramienta CLI '${s.command}' para habilitar la ejecución del servidor '${s.id}'.`,
      );
    } else if (s.command === 'trivy' && Array.isArray(s.args) && s.args.includes('mcp')) {
      const pluginProbe = trivyPluginProbe('mcp');
      if (!pluginProbe.installed) {
        dependenciesStatus = 'MISSING_PLUGIN';
        details.push("Plugin MCP de Trivy ('trivy-mcp') no instalado.");
        recommendations.push(
          `Ejecute 'trivy plugin install mcp' para habilitar las capacidades MCP del servidor '${s.id}'.`,
        );
      }
    }
  }

  // 3. Evaluación segregada de transporte y esquema seguro (inspección estática)
  let connectivityStatus: ConnectivityStatus = 'LOCAL';
  if (s.transport === 'sse' || s.transport === 'http') {
    const urlResolution = resolveServerUrl(s.url, envSource);

    if (urlResolution.hasUnresolvedVars) {
      connectivityStatus = 'UNRESOLVED_URL';
      details.push(
        `Endpoint remoto contiene variables de entorno sin definir en la URL: ${urlResolution.missingVars.join(', ')}.`,
      );
      recommendations.push(
        `Defina las variables para resolver la URL remota de '${s.id}': ${urlResolution.missingVars.join(', ')}.`,
      );
    } else {
      const evalResult = evaluateRemoteTransportUrl(urlResolution.resolvedUrl);
      connectivityStatus = evalResult.status;
      details.push(evalResult.detail);
      if (evalResult.recommendation) {
        recommendations.push(`${evalResult.recommendation} (servidor '${s.id}').`);
      }
    }
  }

  // 4. Determinación determinista del estado general del servidor
  let state: ServerHealthState = 'READY';
  if (dependenciesStatus !== 'MET') {
    state = 'DEPENDENCY_MISSING';
  } else if (
    configurationStatus !== 'VALID' ||
    connectivityStatus === 'UNRESOLVED_URL' ||
    connectivityStatus === 'INVALID_URL'
  ) {
    state = 'CONFIG_MISSING';
  }

  if (details.length === 0) {
    details.push('Listo para su consumo.');
  }

  return {
    id: s.id,
    name: s.name,
    profile: s.profile,
    transport: s.transport,
    executionMode: s.execution_mode,
    state,
    configurationStatus,
    dependenciesStatus,
    connectivityStatus,
    details,
  };
}

export function runMcpDoctor(options: McpDoctorOptions = {}): DoctorReport {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  if (!options.env) {
    loadLocalEnv(rootDir);
  }

  const recommendations: string[] = [];
  const cliProbe = options.cliProbeFn ?? probeCliTool;
  const trivyPluginProbe = options.trivyPluginProbeFn ?? probeTrivyPlugin;

  // 1. Diagnóstico de herramientas del sistema y plugins
  const systemTools = detectSystemTools(cliProbe, trivyPluginProbe);

  // 2. Diagnóstico de sincronización de clientes
  const genCheck = generateAllClientConfigs({ check: true });
  const clientConfigs = genCheck.map((c) => ({
    client: c.clientId,
    path: c.targetPath,
    inSync: c.inSync,
  }));

  const outOfSyncClients = clientConfigs.filter((c) => !c.inSync);
  if (outOfSyncClients.length > 0) {
    recommendations.push(
      `Ejecute 'npm run mcp:generate' para sincronizar los clientes desactualizados: ${outOfSyncClients.map((c) => c.client).join(', ')}.`,
    );
  }

  // 3. Diagnóstico granular por servidor registrado
  const registryPath = path.join(rootDir, '.mcp', 'registry.yaml');
  const registry = (yaml.load(fs.readFileSync(registryPath, 'utf-8')) as McpRegistrySpec | undefined) ?? {};
  const serversList: McpServerDefinition[] = registry.servers ?? [];
  const dockerAvailable = Boolean(systemTools.docker?.available);

  const serverDiagnoses = serversList.map((s) => diagnoseServer(s, dockerAvailable, recommendations, options));

  // 4. Cálculo estructurado del resumen y del indicador general overallValid
  const clientsInSync = outOfSyncClients.length === 0;
  const enabledServers = serverDiagnoses.filter((s) => s.state !== 'DISABLED');
  const hasConfigIssues = enabledServers.some((s) => s.configurationStatus === 'MISSING_ENV');
  const hasDependencyIssues = enabledServers.some((s) => s.dependenciesStatus.startsWith('MISSING_'));
  const hasTransportIssues = enabledServers.some(
    (s) =>
      s.connectivityStatus === 'INSECURE_REMOTE' ||
      s.connectivityStatus === 'UNRESOLVED_URL' ||
      s.connectivityStatus === 'INVALID_URL',
  );

  const readyServers = enabledServers.filter((s) => s.state === 'READY');
  const blockingServers = enabledServers.filter((s) => s.state !== 'READY');

  const summary: DoctorSummary = {
    clientsInSync,
    dependenciesMet: !hasDependencyIssues,
    configurationsMet: !hasConfigIssues,
    connectivityMet: !hasTransportIssues,
    totalServers: serverDiagnoses.length,
    enabledServers: enabledServers.length,
    readyServers: readyServers.length,
    blockingServers: blockingServers.length,
  };

  const overallValid = clientsInSync && !hasConfigIssues && !hasDependencyIssues && !hasTransportIssues;

  return {
    overallValid,
    summary,
    systemTools,
    clientConfigs,
    servers: serverDiagnoses,
    recommendations,
  };
}

function getServerStateIcon(state: ServerHealthState): string {
  if (state === 'CONFIG_MISSING') return '⚠️';
  if (state === 'DEPENDENCY_MISSING') return '❌';
  if (state === 'DISABLED') return '○';
  return '✔';
}

function printSummarySection(summary: DoctorSummary): void {
  console.log('1. Resumen de Salud del Entorno (Zero-Trust):');
  const syncIcon = summary.clientsInSync ? '✔' : '❌';
  console.log(
    `   ${syncIcon} Sincronización de Clientes:       ${summary.clientsInSync ? 'Óptima (todos en regla)' : 'Desincronizada'}`,
  );
  const depIcon = summary.dependenciesMet ? '✔' : '❌';
  console.log(
    `   ${depIcon} Dependencias y Herramientas:      ${summary.dependenciesMet ? 'Disponibles y operativas' : 'Faltantes en PATH o sin plugin'}`,
  );
  const cfgIcon = summary.configurationsMet ? '✔' : '⚠️';
  console.log(
    `   ${cfgIcon} Variables de Entorno:            ${summary.configurationsMet ? 'Completas' : 'Variables requeridas ausentes'}`,
  );
  const connIcon = summary.connectivityMet ? '✔' : '⚠️';
  console.log(
    `   ${connIcon} Transporte y Esquema Seguro:      ${
      summary.connectivityMet
        ? 'Conforme (HTTPS declarado / Local)'
        : 'Requiere HTTPS, URL válida o resolución de variables en URL'
    }`,
  );
  console.log(
    `   📊 Servidores Habilitados:            ${summary.readyServers}/${summary.enabledServers} listos (${summary.blockingServers} pendientes)`,
  );
}

function printSystemAndClientsSection(report: DoctorReport): void {
  console.log('\n2. Herramientas del Sistema y Plugins:');
  for (const [tool, info] of Object.entries(report.systemTools)) {
    const icon = info.available ? '✔' : '○';
    const ver = info.version ? ` (${info.version})` : ' [no detectado en PATH]';
    console.log(`   ${icon} ${tool.padEnd(12)}: ${ver}`);
  }

  console.log('\n3. Sincronización de Clientes:');
  for (const c of report.clientConfigs) {
    const icon = c.inSync ? '✔' : '❌';
    const syncLabel = c.inSync ? 'Sincronizado' : 'DESACTUALIZADO';
    console.log(`   ${icon} ${c.client.padEnd(12)} ➔ ${c.path} [${syncLabel}]`);
  }
}

function printServersSection(servers: ServerDiagnosis[]): void {
  console.log('\n4. Evaluación Segregada por Servidor (Catálogo MCP):');
  for (const s of servers) {
    const icon = getServerStateIcon(s.state);
    console.log(`   ${icon} ${s.id.padEnd(24)} [${s.state.padEnd(18)}] (${s.transport}/${s.executionMode})`);
    for (const d of s.details) {
      console.log(`      └─ ${d}`);
    }
  }
}

function printDoctorReport(report: DoctorReport): void {
  console.log('\n======================================================');
  console.log('🩺 MCP Doctor — Diagnóstico del Entorno');
  console.log('======================================================\n');

  printSummarySection(report.summary);
  printSystemAndClientsSection(report);
  printServersSection(report.servers);

  if (report.recommendations.length > 0) {
    console.log('\n------------------------------------------------------');
    console.log('💡 Recomendaciones y Pasos Accionables:');
    console.log('------------------------------------------------------');
    for (const rec of report.recommendations) {
      console.log(`   • ${rec}`);
    }
  }

  console.log('\n------------------------------------------------------');
  const summaryMsg = report.overallValid
    ? '✨ Diagnóstico completado: entorno MCP 100% operativo y seguro.\n'
    : '⚠️ Diagnóstico completado: se encontraron elementos para resolver antes de operar.\n';
  console.log(summaryMsg);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const isJson = process.argv.includes('--json');
  const report = withMcpAudit('mcp:doctor', () => runMcpDoctor(), { isSuccess: (r) => r.overallValid });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printDoctorReport(report);
  }
}
