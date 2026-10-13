/**
 * ==============================================================================
 * scripts/mcp/adapters/cursor.ts
 * ==============================================================================
 * Adaptador nativo verificado para Cursor IDE.
 *
 * Especificación Cursor:
 *   - Archivo de workspace: .cursor/mcp.json
 *   - Clave raíz: mcpServers
 *   - Transporte stdio: { command, args, env }
 *   - Transporte remoto (SSE/HTTP): { url, headers }
 * ==============================================================================
 */

import {
  type McpAdapter,
  type McpClientDefinition,
  type McpServerDefinition,
  resolveClientEnv,
  resolveEnvExpression,
} from './types.js';

export const cursorAdapter: McpAdapter = {
  clientId: 'cursor',
  format: 'cursor-mcp-json',

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
      mcpServers,
    };
  },
};
