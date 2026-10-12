#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/generate.ts
 * ==============================================================================
 * Generador idempotente y reproducible de configuraciones MCP para clientes soportados.
 *
 * Traduce el registro canónico (.mcp/registry.yaml) y sus políticas (.mcp/policies.yaml)
 * a los formatos nativos esperados por Cursor, VS Code, Claude Code, Antigravity y
 * clientes estándar/genéricos utilizando adaptadores modulares dedicados.
 *
 * Opciones:
 *   --client <id>    Genera únicamente para un cliente específico (cursor, vscode, claude, antigravity, generic).
 *   --profile <id>   Filtra los servidores por perfil (ej. development, github).
 *   --check          Verifica que las configuraciones generadas sean idénticas y estén sincronizadas.
 *   --dry-run        Imprime las configuraciones en stdout sin escribir en disco.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { validateMcpArchitecture } from './validate.js';
import { getAdapterForClient } from './adapters/index.js';
import type {
  McpClientsSpec,
  McpPoliciesSpec,
  McpProfileDefinition,
  McpRegistrySpec,
  McpServerDefinition,
} from './adapters/types.js';
import { loadLocalEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = process.cwd();
const MCP_DIR = path.join(ROOT_DIR, '.mcp');
const REGISTRY_PATH = path.join(MCP_DIR, 'registry.yaml');
const POLICIES_PATH = path.join(MCP_DIR, 'policies.yaml');
const CLIENTS_PATH = path.join(MCP_DIR, 'clients.yaml');

export interface GenerateOptions {
  client?: string;
  profile?: string;
  check?: boolean;
  dryRun?: boolean;
}

export interface ClientConfigResult {
  clientId: string;
  targetPath: string;
  content: string;
  inSync: boolean;
  written: boolean;
}

function enforceServerProfilePolicy(s: McpServerDefinition, prof: McpProfileDefinition | undefined): void {
  if (!prof) return;
  if (prof.write_access === false && s.permissions?.write === true) {
    throw new Error(
      `El servidor '${s.id}' viola la política del perfil '${s.profile}': write_access no está permitido.`,
    );
  }
  if (prof.network === 'none' && s.permissions?.network && s.permissions.network !== 'none') {
    throw new Error(`El servidor '${s.id}' viola la política del perfil '${s.profile}': network no está permitida.`);
  }
}

function filterActiveServers(
  servers: McpServerDefinition[],
  profiles: Record<string, McpProfileDefinition>,
  profileFilter?: string,
): McpServerDefinition[] {
  return servers.filter((s) => {
    if (!s.enabled) return false;
    if (profileFilter && s.profile !== profileFilter) return false;
    enforceServerProfilePolicy(s, profiles[s.profile]);
    return true;
  });
}

function syncOrWriteClientConfig(
  targetAbsPath: string,
  formattedContent: string,
  options: GenerateOptions,
): { inSync: boolean; written: boolean } {
  let inSync = false;
  let written = false;

  if (fs.existsSync(targetAbsPath)) {
    const existingContent = fs.readFileSync(targetAbsPath, 'utf-8');
    inSync = existingContent.replaceAll('\r\n', '\n') === formattedContent.replaceAll('\r\n', '\n');
  }

  if (!options.check && !options.dryRun) {
    const parentDir = path.dirname(targetAbsPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(targetAbsPath, formattedContent, 'utf-8');
    written = true;
    inSync = true;
  }

  return { inSync, written };
}

export function generateAllClientConfigs(options: GenerateOptions = {}): ClientConfigResult[] {
  // Cargar entorno local para resolución determinista de endpoints sin fugar secretos
  loadLocalEnv(ROOT_DIR);

  // 1. Validar la arquitectura y gobernanza antes de generar
  const validation = validateMcpArchitecture();
  if (!validation.valid) {
    const errorMsgs = validation.issues
      .filter((i) => i.severity === 'error')
      .map((i) => ` - [${i.file}] ${i.message}`)
      .join('\n');
    throw new Error(`La validación de .mcp falló. Corrija los errores antes de generar configuraciones:\n${errorMsgs}`);
  }

  const registry = (yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as McpRegistrySpec | undefined) ?? {};
  const policies = (yaml.load(fs.readFileSync(POLICIES_PATH, 'utf-8')) as McpPoliciesSpec | undefined) ?? {};
  const clientsSpec = (yaml.load(fs.readFileSync(CLIENTS_PATH, 'utf-8')) as McpClientsSpec | undefined) ?? {};

  const servers: McpServerDefinition[] = registry.servers ?? [];
  const profiles: Record<string, McpProfileDefinition> = policies.profiles ?? {};
  const clients = clientsSpec.clients ?? {};

  const targetClients = options.client ? [options.client] : Object.keys(clients);
  const activeServers = filterActiveServers(servers, profiles, options.profile);
  const results: ClientConfigResult[] = [];

  for (const clientId of targetClients) {
    const clientDef = clients[clientId];
    if (!clientDef) {
      throw new Error(`Cliente '${clientId}' no declarado en .mcp/clients.yaml.`);
    }

    const targetRelPath = clientDef.config_path;
    const targetAbsPath = path.join(ROOT_DIR, targetRelPath);

    const adapter = getAdapterForClient(clientId, clientDef.format);
    const configObject = adapter.generateConfig(activeServers, clientDef);
    const formattedContent = `${JSON.stringify(configObject, null, 2)}\n`;

    const { inSync, written } = syncOrWriteClientConfig(targetAbsPath, formattedContent, options);

    results.push({
      clientId,
      targetPath: targetRelPath,
      content: formattedContent,
      inSync,
      written,
    });
  }

  return results;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

function printCheckResults(results: ClientConfigResult[]): void {
  let allInSync = true;
  for (const res of results) {
    if (!res.inSync) {
      console.log(`❌ ${res.clientId} (${res.targetPath}): Desactualizado o no generado.`);
      allInSync = false;
    } else {
      console.log(`✅ ${res.clientId} (${res.targetPath}): Sincronizado.`);
    }
  }

  if (!allInSync) {
    console.log('\n❌ Las configuraciones no están sincronizadas. Ejecute npm run mcp:generate.\n');
    process.exit(1);
  }
  console.log('\n✅ Todas las configuraciones generadas coinciden exactamente con el registro.\n');
}

function runGenerateCli(args: string[]): void {
  const isCheck = args.includes('--check');
  const isDryRun = args.includes('--dry-run');
  const clientArg = getFlagValue(args, '--client');
  const profileArg = getFlagValue(args, '--profile');

  console.log('\n======================================================');
  console.log('⚙️  Generador de Configuraciones MCP por Cliente');
  console.log('======================================================');

  try {
    const results = generateAllClientConfigs({
      client: clientArg,
      profile: profileArg,
      check: isCheck,
      dryRun: isDryRun,
    });

    if (isDryRun) {
      for (const res of results) {
        console.log(`\n--- Configuración para ${res.clientId} (${res.targetPath}) ---`);
        console.log(res.content);
      }
      process.exit(0);
    }

    if (isCheck) {
      printCheckResults(results);
      return;
    }

    for (const res of results) {
      console.log(`✅ ${res.clientId} ➔ ${res.targetPath} (generado correctamente)`);
    }
    console.log('\n🎉 Generación completada con éxito.\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Error: ${msg}\n`);
    process.exit(1);
  }
}

// Ejecución CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runGenerateCli(process.argv.slice(2));
}
