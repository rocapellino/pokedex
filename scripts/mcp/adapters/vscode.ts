/**
 * ==============================================================================
 * scripts/mcp/adapters/vscode.ts
 * ==============================================================================
 * Adaptador nativo verificado para Visual Studio Code (Copilot & extensiones MCP).
 *
 * Especificación VS Code:
 *   - Archivo de workspace: .vscode/mcp.json
 *   - Clave raíz: mcpServers
 *   - Transporte stdio: { command, args, env }
 *   - Transporte remoto (SSE/HTTP): { url, headers }
 * ==============================================================================
 */

import { type McpAdapter, type McpClientDefinition, type McpServerDefinition, resolveEnvExpression } from './types.js';

export const vscodeAdapter: McpAdapter = {
  clientId: 'vscode',
  format: 'vscode-mcp-json',

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
