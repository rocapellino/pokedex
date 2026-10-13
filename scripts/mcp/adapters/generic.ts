/**
 * ==============================================================================
 * scripts/mcp/adapters/generic.ts
 * ==============================================================================
 * Adaptador normalizado portable para exportación de referencia y pipelines CI.
 * ==============================================================================
 */

import {
  type McpAdapter,
  type McpClientDefinition,
  type McpServerDefinition,
  resolveClientEnv,
  resolveEnvExpression,
} from './types.js';

export const genericAdapter: McpAdapter = {
  clientId: 'generic',
  format: 'standard-mcp-json',

  generateConfig(servers: McpServerDefinition[], clientDef: McpClientDefinition): Record<string, unknown> {
    const mcpServers: Record<string, unknown> = {};

    for (const server of servers) {
      if (server.transport === 'stdio') {
        const srvConfig: Record<string, unknown> = {
          command: server.command,
          args: server.args || [],
        };

        const resolvedEnv = resolveClientEnv(server, clientDef);
        if (resolvedEnv) {
          srvConfig.env = resolvedEnv;
        }

        mcpServers[server.id] = srvConfig;
      } else if (server.transport === 'sse' || server.transport === 'http') {
        const resolvedUrl = resolveEnvExpression(server.url);
        const srvConfig: Record<string, unknown> = {
          url: resolvedUrl,
        };

        if (server.headers && Object.keys(server.headers).length > 0) {
          srvConfig.headers = server.headers;
        }

        mcpServers[server.id] = srvConfig;
      }
    }

    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      description: `Configuración normalizada y exportable para ${clientDef.name} desde .mcp/registry.yaml. NO EDITAR DIRECTAMENTE.`,
      mcpServers,
    };
  },
};
