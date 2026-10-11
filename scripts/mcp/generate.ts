#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/generate.ts
 * ==============================================================================
 * Generador idempotente y reproducible de configuraciones MCP para clientes soportados.
 *
 * Traduce el registro canónico (.mcp/registry.yaml) y sus políticas (.mcp/policies.yaml)
 * a los formatos nativos esperados por Cursor, VS Code, Claude Code y clientes genéricos.
 *
 * Opciones:
 *   --client <id>    Genera únicamente para un cliente específico (cursor, vscode, claude, generic).
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

export function generateAllClientConfigs(options: GenerateOptions = {}): ClientConfigResult[] {
  // 1. Validar la arquitectura antes de generar
  const validation = validateMcpArchitecture();
  if (!validation.valid) {
    throw new Error('La validación de .mcp falló. Corrija los errores antes de generar configuraciones.');
  }

  const registry: any = yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const policies: any = yaml.load(fs.readFileSync(POLICIES_PATH, 'utf-8'));
  const clientsSpec: any = yaml.load(fs.readFileSync(CLIENTS_PATH, 'utf-8'));

  const servers: any[] = registry.servers || [];
  const clients = clientsSpec.clients || {};

  const targetClients = options.client ? [options.client] : Object.keys(clients);

  const results: ClientConfigResult[] = [];

  for (const clientId of targetClients) {
    const clientDef = clients[clientId];
    if (!clientDef) {
      throw new Error(`Cliente '${clientId}' no declarado en .mcp/clients.yaml.`);
    }

    const targetRelPath = clientDef.config_path;
    const targetAbsPath = path.join(ROOT_DIR, targetRelPath);

    // Filtrar servidores aplicables
    const activeServers = servers.filter((s) => {
      if (!s.enabled) return false;
      if (options.profile && s.profile !== options.profile) return false;
      return true;
    });

    const configObject = buildConfigForClient(clientId, clientDef, activeServers);
    const formattedContent = `${JSON.stringify(configObject, null, 2)}\n`;

    let inSync = false;
    let written = false;

    if (fs.existsSync(targetAbsPath)) {
      const existingContent = fs.readFileSync(targetAbsPath, 'utf-8');
      inSync = existingContent.replace(/\r\n/g, '\n') === formattedContent.replace(/\r\n/g, '\n');
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

function buildConfigForClient(clientId: string, clientDef: any, servers: any[]): any {
  const mcpServers: Record<string, any> = {};

  for (const server of servers) {
    if (server.transport === 'stdio') {
      const serverConfig: any = {
        command: server.command,
        args: server.args || [],
      };

      if (server.env && Object.keys(server.env).length > 0) {
        serverConfig.env = server.env;
      }

      mcpServers[server.id] = serverConfig;
    } else if (server.transport === 'sse' || server.transport === 'http') {
      const serverConfig: any = {
        url: server.url,
      };

      if (server.headers) {
        serverConfig.headers = server.headers;
      }

      mcpServers[server.id] = serverConfig;
    }
  }

  // Estructura según cliente
  switch (clientDef.format) {
    case 'cursor-mcp-json':
    case 'vscode-mcp-json':
    case 'claude-mcp-json':
    case 'standard-mcp-json':
    default:
      return {
        // Marcador canónico para trazabilidad
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        description: `Configuración generada automáticamente para ${clientDef.name} desde .mcp/registry.yaml. NO EDITAR DIRECTAMENTE.`,
        mcpServers,
      };
  }
}

// Ejecución CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isDryRun = args.includes('--dry-run');

  let clientArg: string | undefined;
  const clientIdx = args.indexOf('--client');
  if (clientIdx !== -1 && args[clientIdx + 1]) {
    clientArg = args[clientIdx + 1];
  }

  let profileArg: string | undefined;
  const profileIdx = args.indexOf('--profile');
  if (profileIdx !== -1 && args[profileIdx + 1]) {
    profileArg = args[profileIdx + 1];
  }

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
      } else {
        console.log('\n✅ Todas las configuraciones generadas coinciden exactamente con el registro.\n');
      }
    } else {
      for (const res of results) {
        console.log(`✅ ${res.clientId} ➔ ${res.targetPath} (generado correctamente)`);
      }
      console.log('\n🎉 Generación completada con éxito.\n');
    }
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}
