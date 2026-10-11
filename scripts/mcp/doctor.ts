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
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { generateAllClientConfigs } from './generate.js';
import { loadLocalEnv } from './env.js';

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

export function runMcpDoctor(): DoctorReport {
  loadLocalEnv(ROOT_DIR);
  const recommendations: string[] = [];

  // 1. Diagnóstico de herramientas del sistema
  const systemTools: Record<string, { available: boolean; version?: string }> = {};

  // Node
  systemTools.node = {
    available: true,
    version: process.version,
  };

  // Docker
  try {
    const dockerVer = execSync('docker --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    systemTools.docker = { available: true, version: dockerVer };
  } catch {
    systemTools.docker = { available: false };
  }

  // VS Code
  try {
    const codeVer = execSync('code --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];
    systemTools.vscode = { available: true, version: codeVer };
  } catch {
    systemTools.vscode = { available: false };
  }

  // Cursor
  try {
    const cursorVer = execSync('cursor --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];
    systemTools.cursor = { available: true, version: cursorVer };
  } catch {
    systemTools.cursor = { available: false };
  }

  // Claude Code
  try {
    const claudeVer = execSync('claude --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];
    systemTools.claude = { available: true, version: claudeVer };
  } catch {
    systemTools.claude = { available: false };
  }

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
  const registry: any = yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const serversList: any[] = registry.servers || [];
  const serverDiagnoses: ServerDiagnosis[] = [];

  for (const s of serversList) {
    const details: string[] = [];

    if (!s.enabled) {
      serverDiagnoses.push({
        id: s.id,
        name: s.name,
        profile: s.profile,
        transport: s.transport,
        executionMode: s.execution_mode,
        state: 'DISABLED',
        details: ['Deshabilitado explícitamente en el registro.'],
      });
      continue;
    }

    let state: ServerHealthState = 'READY';

    // Comprobar variables de entorno requeridas
    if (s.required_env_vars && Array.isArray(s.required_env_vars)) {
      const missingVars: string[] = [];
      for (const envVar of s.required_env_vars) {
        if (!process.env[envVar] || process.env[envVar]!.trim().length === 0) {
          missingVars.push(envVar);
        }
      }
      if (missingVars.length > 0) {
        state = 'CONFIG_MISSING';
        details.push(`Variables faltantes: ${missingVars.join(', ')}.`);
        recommendations.push(`Defina localmente las variables para '${s.id}': ${missingVars.join(', ')}.`);
      }
    }

    // Comprobar runtime de contenedores si aplica
    if (s.execution_mode === 'container') {
      if (!systemTools.docker.available) {
        state = 'DEPENDENCY_MISSING';
        details.push('Docker no está disponible en PATH para ejecutar este contenedor.');
        recommendations.push(`Instale o inicie Docker para habilitar la ejecución del servidor '${s.id}'.`);
      }
    }

    // Comprobar URL y TLS en servidores remotos
    if (s.transport === 'sse' || s.transport === 'http') {
      const url = s.url || '';
      if (
        !url.startsWith('https://') &&
        !url.includes('localhost') &&
        !url.includes('127.0.0.1') &&
        !url.startsWith('${')
      ) {
        details.push('ADVERTENCIA: Transporte remoto sin TLS (https obligatoria en producción).');
      }
    }

    if (details.length === 0) {
      details.push('Listo para su consumo.');
    }

    serverDiagnoses.push({
      id: s.id,
      name: s.name,
      profile: s.profile,
      transport: s.transport,
      executionMode: s.execution_mode,
      state,
      details,
    });
  }

  const overallValid = outOfSyncClients.length === 0;

  return {
    overallValid,
    systemTools,
    clientConfigs,
    servers: serverDiagnoses,
    recommendations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const isJson = process.argv.includes('--json');
  const report = runMcpDoctor();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n======================================================');
    console.log('🩺 MCP Doctor — Diagnóstico del Entorno');
    console.log('======================================================\n');

    console.log('1. Herramientas del Sistema:');
    for (const [tool, info] of Object.entries(report.systemTools)) {
      const icon = info.available ? '✔' : '○';
      const ver = info.version ? ` (${info.version})` : ' [no detectado en PATH]';
      console.log(`   ${icon} ${tool.padEnd(10)}: ${ver}`);
    }

    console.log('\n2. Sincronización de Clientes:');
    for (const c of report.clientConfigs) {
      const icon = c.inSync ? '✔' : '❌';
      console.log(`   ${icon} ${c.client.padEnd(10)} ➔ ${c.path} [${c.inSync ? 'Sincronizado' : 'DESACTUALIZADO'}]`);
    }

    console.log('\n3. Estado de Servidores en Catálogo:');
    for (const s of report.servers) {
      let icon = '✔';
      if (s.state === 'CONFIG_MISSING') icon = '⚠️';
      if (s.state === 'DEPENDENCY_MISSING') icon = '❌';
      if (s.state === 'DISABLED') icon = '○';

      console.log(`   ${icon} ${s.id.padEnd(24)} [${s.state.padEnd(18)}] (${s.transport}/${s.executionMode})`);
      for (const d of s.details) {
        console.log(`      └─ ${d}`);
      }
    }

    if (report.recommendations.length > 0) {
      console.log('\n------------------------------------------------------');
      console.log('💡 Recomendaciones y Pasos Accionables:');
      console.log('------------------------------------------------------');
      for (const rec of report.recommendations) {
        console.log(`   • ${rec}`);
      }
    }

    console.log('\n------------------------------------------------------');
    if (report.overallValid) {
      console.log('✨ Diagnóstico completado sin bloqueos de sincronización.\n');
    } else {
      console.log('⚠️ Diagnóstico completado: se encontraron elementos para resolver.\n');
    }
  }
}
