#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/test-config.ts
 * ==============================================================================
 * Validador programático y ejecutor de pruebas de configuración y contratos MCP.
 *
 * Verifica:
 *   1. Integridad estructural de las configuraciones generadas frente a los esquemas.
 *   2. Ausencia de servidores deshabilitados en las salidas generadas.
 *   3. Coherencia entre transportes declarados y soportados por cada cliente.
 *   4. Ausencia de strings que parezcan secretos en el contenido generado.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { generateAllClientConfigs } from './generate.js';
import type { McpClientsSpec, McpRegistrySpec, McpServerDefinition } from './adapters/types.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = process.cwd();
const MCP_DIR = path.join(ROOT_DIR, '.mcp');
const REGISTRY_PATH = path.join(MCP_DIR, 'registry.yaml');
const CLIENTS_PATH = path.join(MCP_DIR, 'clients.yaml');

export interface ConfigTestResult {
  client: string;
  passed: boolean;
  errors: string[];
}

interface GeneratedServerConfig {
  url?: string;
  serverUrl?: string;
  type?: string;
}

function validateRemoteAdapterSchema(
  clientId: string,
  srvId: string,
  transport: string,
  srvConfig: GeneratedServerConfig,
  errors: string[],
): void {
  if (clientId === 'antigravity') {
    if (!srvConfig.serverUrl) {
      errors.push(`Antigravity exige 'serverUrl' para transporte ${transport} en servidor '${srvId}'.`);
    }
    if (srvConfig.url) {
      errors.push(`Antigravity prohíbe 'url' directa en favor de 'serverUrl' en servidor '${srvId}'.`);
    }
  } else if (clientId === 'claude') {
    if (!srvConfig.url) {
      errors.push(`Claude Code exige 'url' para transporte ${transport} en servidor '${srvId}'.`);
    }
    if (srvConfig.type !== 'sse' && srvConfig.type !== 'http') {
      errors.push(`Claude Code exige 'type: "${transport}"' explícito en servidor '${srvId}'.`);
    }
  } else if (!srvConfig.url) {
    errors.push(`Cliente '${clientId}' exige 'url' para transporte ${transport} en servidor '${srvId}'.`);
  }

  const activeUrl = srvConfig.url || srvConfig.serverUrl || '';
  if (activeUrl.includes('${')) {
    errors.push(`URL sin resolver detectada en servidor '${srvId}': '${activeUrl}'.`);
  }
}

function validateGeneratedServersForClient(
  clientId: string,
  supportedTransports: string[],
  mcpServers: Record<string, GeneratedServerConfig>,
  servers: McpServerDefinition[],
  enabledServerIds: Set<string>,
  disabledServerIds: Set<string>,
  errors: string[],
): void {
  for (const enabledId of enabledServerIds) {
    if (!mcpServers[enabledId]) {
      errors.push(`Servidor habilitado '${enabledId}' ausente en la configuración del cliente.`);
    }
  }

  for (const disabledId of disabledServerIds) {
    if (mcpServers[disabledId]) {
      errors.push(`Servidor deshabilitado '${disabledId}' presente indebidamente en la configuración.`);
    }
  }

  for (const [srvId, srvConfig] of Object.entries(mcpServers)) {
    const serverDef = servers.find((s) => s.id === srvId);
    if (!serverDef) continue;

    if (!supportedTransports.includes(serverDef.transport)) {
      errors.push(
        `Servidor '${srvId}' utiliza transporte '${serverDef.transport}' no soportado por el cliente (${supportedTransports.join(', ')}).`,
      );
    }

    if (serverDef.transport === 'sse' || serverDef.transport === 'http') {
      validateRemoteAdapterSchema(clientId, srvId, serverDef.transport, srvConfig, errors);
    }
  }
}

export function testAllMcpConfigs(): ConfigTestResult[] {
  const registry = (yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as McpRegistrySpec | undefined) ?? {};
  const clientsSpec = (yaml.load(fs.readFileSync(CLIENTS_PATH, 'utf-8')) as McpClientsSpec | undefined) ?? {};

  const servers: McpServerDefinition[] = registry.servers ?? [];
  const clients = clientsSpec.clients ?? {};

  const enabledServerIds = new Set(servers.filter((s) => s.enabled).map((s) => s.id));
  const disabledServerIds = new Set(servers.filter((s) => !s.enabled).map((s) => s.id));

  const configs = generateAllClientConfigs({ dryRun: true });
  const results: ConfigTestResult[] = [];

  for (const cfg of configs) {
    const errors: string[] = [];
    const clientDef = clients[cfg.clientId];

    let parsed: { mcpServers?: Record<string, GeneratedServerConfig> };
    try {
      parsed = JSON.parse(cfg.content) as { mcpServers?: Record<string, GeneratedServerConfig> };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`JSON no parseable: ${msg}`);
      results.push({ client: cfg.clientId, passed: false, errors });
      continue;
    }

    const mcpServers: Record<string, GeneratedServerConfig> = parsed.mcpServers ?? {};
    const supportedTransports = clientDef.supported_transports || [];

    validateGeneratedServersForClient(
      cfg.clientId,
      supportedTransports,
      mcpServers,
      servers,
      enabledServerIds,
      disabledServerIds,
      errors,
    );

    if (cfg.content.includes('ghp_') || cfg.content.includes('sk-') || cfg.content.includes('glpat-')) {
      errors.push('Posible token o secreto detectado en la configuración generada.');
    }

    results.push({
      client: cfg.clientId,
      passed: errors.length === 0,
      errors,
    });
  }

  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  console.log('\n======================================================');
  console.log('🧪 Verificación de Contratos de Configuraciones MCP');
  console.log('======================================================\n');

  const testResults = testAllMcpConfigs();
  let allPassed = true;

  for (const res of testResults) {
    if (res.passed) {
      console.log(`✔ ${res.client.padEnd(12)}: Todos los contratos y adaptadores validados.`);
    } else {
      allPassed = false;
      console.log(`❌ ${res.client.padEnd(12)}: Fallaron las verificaciones:`);
      for (const err of res.errors) {
        console.log(`   └─ ${err}`);
      }
    }
  }

  console.log('------------------------------------------------------');
  if (allPassed) {
    console.log('✨ Todos los contratos de configuración se cumplieron exitosamente.\n');
  } else {
    console.log('❌ Se detectaron violaciones en los contratos de configuración.\n');
    process.exit(1);
  }
}
