#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/setup.ts
 * ==============================================================================
 * Asistente determinista y seguro para la inicialización y preparación del entorno
 * de servidores MCP en rocapellino/pokedex.
 *
 * Flujo:
 *   1. Verifica dependencias del sistema (Node.js >= 24, npm, npx, Docker opcional).
 *   2. Valida la integridad del catálogo canónico y políticas (.mcp/validate.ts).
 *   3. Genera las configuraciones locales de los clientes soportados (.mcp/generate.ts).
 *   4. Audita e indica de forma segura qué variables de entorno son requeridas,
 *      sin exponer ni solicitar el ingreso de secretos ni conectarse a sistemas externos.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { validateMcpArchitecture } from './validate.js';
import { generateAllClientConfigs } from './generate.js';
import { loadLocalEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = process.cwd();
const MCP_DIR = path.join(ROOT_DIR, '.mcp');
const REGISTRY_PATH = path.join(MCP_DIR, 'registry.yaml');

export interface SetupStatus {
  success: boolean;
  nodeVersion: string;
  dockerAvailable: boolean;
  generatedConfigs: string[];
  requiredEnvVars: { name: string; isSet: boolean; serverId: string }[];
}

export function runMcpSetup(): SetupStatus {
  loadLocalEnv(ROOT_DIR);

  console.log('\n======================================================');
  console.log('🚀 Inicialización y Onboarding del Entorno MCP Gobernada');
  console.log('======================================================\n');

  // 1. Verificación de Node.js
  const nodeVersion = process.version;
  const majorNode = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
  console.log(`[1/4] Verificando runtime Node.js: ${nodeVersion}`);
  if (majorNode < 24) {
    throw new Error(`Node.js >= 24 es obligatorio (versión actual: ${nodeVersion}).`);
  }
  console.log('      ✔ Node.js cumple con el estándar del monorepo (>= 24).\n');

  // 2. Detección no bloqueante de Docker
  let dockerAvailable = false;
  try {
    const dockerCheck = execSync('docker --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    dockerAvailable = true;
    console.log(`[2/4] Runtime de Contenedores OCI: detectado (${dockerCheck.trim()})`);
  } catch {
    console.log(
      '[2/4] Runtime de Contenedores OCI: no detectado en PATH (los servidores en contenedor requerirán Docker cuando se habiliten).',
    );
  }
  console.log('      ✔ Verificación de runtime de contenedores completada.\n');

  // 3. Validación de catálogo y políticas
  console.log('[3/4] Validando catálogo canónico y políticas de seguridad...');
  const validation = validateMcpArchitecture();
  if (!validation.valid) {
    throw new Error('La validación de la arquitectura MCP falló. Corrija los errores reportados.');
  }
  console.log(
    `      ✔ Registro válido: ${validation.totalServers} servidores, ${validation.totalProfiles} perfiles, ${validation.totalClients} clientes.\n`,
  );

  // 4. Generación de configuraciones locales
  console.log('[4/4] Generando configuraciones para clientes locales soportados...');
  const genResults = generateAllClientConfigs();
  const generatedConfigs: string[] = [];
  for (const res of genResults) {
    generatedConfigs.push(res.targetPath);
    console.log(`      ✔ Generada configuración: ${res.targetPath}`);
  }

  // 5. Auditoría segura de variables de entorno requeridas
  const registry: any = yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const servers: any[] = registry.servers || [];
  const requiredEnvVars: { name: string; isSet: boolean; serverId: string }[] = [];

  for (const s of servers) {
    if (!s.enabled) continue;
    if (s.required_env_vars && Array.isArray(s.required_env_vars)) {
      for (const envVar of s.required_env_vars) {
        const isSet = Boolean(process.env[envVar] && process.env[envVar]?.trim().length > 0);
        requiredEnvVars.push({
          name: envVar,
          isSet,
          serverId: s.id,
        });
      }
    }
  }

  console.log('\n------------------------------------------------------');
  console.log('🔒 Auditoría Segura de Variables de Entorno (Sin Valores)');
  console.log('------------------------------------------------------');
  for (const item of requiredEnvVars) {
    const statusIcon = item.isSet ? '✔ CONFIGURADA' : '○ PENDIENTE';
    console.log(`  ${statusIcon.padEnd(14)} ${item.name.padEnd(30)} (Servidor: ${item.serverId})`);
  }

  console.log('\nℹ️  Para configurar variables pendientes, defínalas en su entorno local');
  console.log('    o archivo .env local (estrictamente ignorado por Git).');
  console.log('    Ninguna credencial debe versionarse jamás en el repositorio.\n');
  console.log('✨ Onboarding y preparación completados con éxito.\n');

  return {
    success: true,
    nodeVersion,
    dockerAvailable,
    generatedConfigs,
    requiredEnvVars,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  try {
    runMcpSetup();
  } catch (err: any) {
    console.error(`\n❌ Error durante el setup: ${err.message}\n`);
    process.exit(1);
  }
}
