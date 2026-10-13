/**
 * ==============================================================================
 * scripts/mcp/adapters/claude.ts
 * ==============================================================================
 * Adaptador nativo verificado para Claude Code (Anthropic CLI & Agente).
 *
 * Especificación Claude Code:
 *   - Archivo de proyecto: .mcp.json (en la raíz del repositorio para compartir con el equipo)
 *   - Clave raíz: mcpServers
 *   - Transporte stdio: { command, args, env }
 *   - Transporte remoto (SSE): { type: "sse", url, headers }
 * ==============================================================================
 */

import {
  type McpAdapter,
  type McpClientDefinition,
  type McpServerDefinition,
  resolveClientEnv,
  resolveEnvExpression,
} from './types.js';

export const claudeAdapter: McpAdapter = {
  clientId: 'claude',
  format: 'claude-mcp-json',

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
          type: server.transport === 'http' ? 'http' : 'sse',
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
