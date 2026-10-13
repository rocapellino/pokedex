#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/doctor.ts
 * ==============================================================================
 * Diagnóstico seguro y accionable del entorno MCP en rocapellino/pokedex.
 *
 * Evalúa:
 *   1. Integridad del catálogo y políticas de seguridad (.mcp).
 *   2. Sincronización de configuraciones de clientes.
 *   3. Disponibilidad de herramientas del sistema (Node.js, Docker, clientes IDE).
 *   4. Estado por servidor: READY, CONFIG_MISSING, DEPENDENCY_MISSING, DISABLED.
 *
 * Principio Zero-Trust:
 *   NUNCA imprime ni filtra valores de secretos, tokens ni contraseñas.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { generateAllClientConfigs } from './generate.js';
import { loadLocalEnv } from './env.js';
import type { McpRegistrySpec, McpServerDefinition } from './adapters/types.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = process.cwd();
const MCP_DIR = path.join(ROOT_DIR, '.mcp');
const REGISTRY_PATH = path.join(MCP_DIR, 'registry.yaml');

export type ServerHealthState = 'READY' | 'CONFIG_MISSING' | 'DEPENDENCY_MISSING' | 'DISABLED';

export interface ServerDiagnosis {
  id: string;
  name: string;
  profile: string;
  transport: string;
  executionMode: string;
  state: ServerHealthState;
  details: string[];
}

export interface DoctorReport {
  overallValid: boolean;
  systemTools: Record<string, { available: boolean; version?: string }>;
  clientConfigs: { client: string; path: string; inSync: boolean }[];
  servers: ServerDiagnosis[];
  recommendations: string[];
}

export function probeCliTool(binary: string): { available: boolean; version?: string } {
  // 1. Intento directo con execFileSync sin shell
  try {
    const output = execFileSync(binary, ['--version'], {
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
        const output = execFileSync('cmd.exe', ['/d', '/s', '/c', `${binary} --version`], {
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

function detectSystemTools(): Record<string, { available: boolean; version?: string }> {
  return {
    node: { available: true, version: process.version },
    docker: probeCliTool('docker'),
    trivy: probeCliTool('trivy'),
    npx: probeCliTool('npx'),
    vscode: probeCliTool('code'),
    cursor: probeCliTool('cursor'),
    claude: probeCliTool('claude'),
  };
}

function getMissingEnvVars(requiredVars: string[] | undefined): string[] {
  if (!Array.isArray(requiredVars)) return [];
  const missing: string[] = [];
  for (const envVar of requiredVars) {
    const envVal = process.env[envVar];
    if (!envVal || envVal.trim().length === 0) {
      missing.push(envVar);
    }
  }
  return missing;
}

function isPlainHttpRemoteUrl(s: McpServerDefinition): boolean {
  if (s.transport !== 'sse' && s.transport !== 'http') return false;
  const url = s.url ?? '';
  return (
    !url.startsWith('https://') && !url.includes('localhost') && !url.includes('127.0.0.1') && !url.startsWith('${')
  );
}

function diagnoseServer(s: McpServerDefinition, dockerAvailable: boolean, recommendations: string[]): ServerDiagnosis {
  if (!s.enabled) {
    return {
      id: s.id,
      name: s.name,
      profile: s.profile,
      transport: s.transport,
      executionMode: s.execution_mode,
      state: 'DISABLED',
      details: ['Deshabilitado explícitamente en el registro.'],
    };
  }

  let state: ServerHealthState = 'READY';
  const details: string[] = [];

  const missingVars = getMissingEnvVars(s.required_env_vars);
  if (missingVars.length > 0) {
    state = 'CONFIG_MISSING';
    details.push(`Variables faltantes: ${missingVars.join(', ')}.`);
    recommendations.push(`Defina localmente las variables para '${s.id}': ${missingVars.join(', ')}.`);
  }

  if (s.execution_mode === 'container' && !dockerAvailable) {
    state = 'DEPENDENCY_MISSING';
    details.push('Docker no está disponible en PATH para ejecutar este contenedor.');
    recommendations.push(`Instale o inicie Docker para habilitar la ejecución del servidor '${s.id}'.`);
  }

  if (s.execution_mode === 'local' && s.command) {
    const cliProbe = probeCliTool(s.command);
    if (!cliProbe.available) {
      state = 'DEPENDENCY_MISSING';
      details.push(`El comando ejecutable '${s.command}' no está disponible en PATH.`);
      recommendations.push(
        s.command === 'trivy'
          ? `Instale Trivy CLI (https://trivy.dev) y ejecute 'trivy plugin install mcp' para habilitar el servidor '${s.id}'.`
          : `Instale la herramienta CLI '${s.command}' para habilitar la ejecución del servidor '${s.id}'.`,
      );
    }
  }

  if (isPlainHttpRemoteUrl(s)) {
    details.push('ADVERTENCIA: Transporte remoto sin TLS (https obligatoria en producción).');
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
    details,
  };
}

export function runMcpDoctor(): DoctorReport {
  loadLocalEnv(ROOT_DIR);
  const recommendations: string[] = [];

  // 1. Diagnóstico de herramientas del sistema
  const systemTools = detectSystemTools();

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

  // 3. Diagnóstico por servidor en registro
  const registry = (yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as McpRegistrySpec | undefined) ?? {};
  const serversList: McpServerDefinition[] = registry.servers ?? [];
  const dockerAvailable = Boolean(systemTools.docker?.available);
  const serverDiagnoses = serversList.map((s) => diagnoseServer(s, dockerAvailable, recommendations));

  return {
    overallValid: outOfSyncClients.length === 0,
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

function printSystemAndClientsSection(report: DoctorReport): void {
  console.log('1. Herramientas del Sistema:');
  for (const [tool, info] of Object.entries(report.systemTools)) {
    const icon = info.available ? '✔' : '○';
    const ver = info.version ? ` (${info.version})` : ' [no detectado en PATH]';
    console.log(`   ${icon} ${tool.padEnd(10)}: ${ver}`);
  }

  console.log('\n2. Sincronización de Clientes:');
  for (const c of report.clientConfigs) {
    const icon = c.inSync ? '✔' : '❌';
    const syncLabel = c.inSync ? 'Sincronizado' : 'DESACTUALIZADO';
    console.log(`   ${icon} ${c.client.padEnd(10)} ➔ ${c.path} [${syncLabel}]`);
  }
}

function printServersSection(servers: ServerDiagnosis[]): void {
  console.log('\n3. Estado de Servidores en Catálogo:');
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
    ? '✨ Diagnóstico completado sin bloqueos de sincronización.\n'
    : '⚠️ Diagnóstico completado: se encontraron elementos para resolver.\n';
  console.log(summaryMsg);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const isJson = process.argv.includes('--json');
  const report = runMcpDoctor();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printDoctorReport(report);
  }
}
