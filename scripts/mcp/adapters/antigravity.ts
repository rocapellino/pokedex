/**
 * ==============================================================================
 * scripts/mcp/adapters/antigravity.ts
 * ==============================================================================
 * Adaptador nativo verificado para Google Antigravity / Gemini Code Assist.
 *
 * Especificación Antigravity:
 *   - Archivo de workspace: .agents/mcp_config.json
 *   - Clave raíz: mcpServers
 *   - Transporte stdio: { command, args, env }
 *   - Transporte remoto (SSE/HTTP): utiliza estrictamente 'serverUrl' (NO 'url').
 * ==============================================================================
 */

import { type McpAdapter, type McpClientDefinition, type McpServerDefinition, resolveEnvExpression } from './types.js';

export const antigravityAdapter: McpAdapter = {
  clientId: 'antigravity',
  format: 'antigravity-mcp-json',

  generateConfig(servers: McpServerDefinition[], _clientDef: McpClientDefinition): Record<string, any> {
    const mcpServers: Record<string, any> = {};

    for (const server of servers) {
      if (server.transport === 'stdio') {
        const srvConfig: Record<string, any> = {
          command: server.command,
          args: server.args || [],
        };

        if (server.env && Object.keys(server.env).length > 0) {
          srvConfig.env = server.env;
        }

        mcpServers[server.id] = srvConfig;
      } else if (server.transport === 'sse' || server.transport === 'http') {
        const resolvedUrl = resolveEnvExpression(server.url);
        const srvConfig: Record<string, any> = {
          serverUrl: resolvedUrl,
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
