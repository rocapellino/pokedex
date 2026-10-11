/**
 * ==============================================================================
 * scripts/mcp/adapters/index.ts
 * ==============================================================================
 * Registro canónico y despachador de adaptadores MCP por cliente.
 * ==============================================================================
 */

import type { McpAdapter } from './types.js';
import { antigravityAdapter } from './antigravity.js';
import { claudeAdapter } from './claude.js';
import { cursorAdapter } from './cursor.js';
import { vscodeAdapter } from './vscode.js';
import { genericAdapter } from './generic.js';

export * from './types.js';
export { antigravityAdapter, claudeAdapter, cursorAdapter, vscodeAdapter, genericAdapter };

const ADAPTERS_BY_CLIENT_ID: Record<string, McpAdapter> = {
  antigravity: antigravityAdapter,
  claude: claudeAdapter,
  cursor: cursorAdapter,
  vscode: vscodeAdapter,
  generic: genericAdapter,
};

const ADAPTERS_BY_FORMAT: Record<string, McpAdapter> = {
  'antigravity-mcp-json': antigravityAdapter,
  'claude-mcp-json': claudeAdapter,
  'cursor-mcp-json': cursorAdapter,
  'vscode-mcp-json': vscodeAdapter,
  'standard-mcp-json': genericAdapter,
};

export function getAdapterForClient(clientId: string, format?: string): McpAdapter {
  if (ADAPTERS_BY_CLIENT_ID[clientId]) {
    return ADAPTERS_BY_CLIENT_ID[clientId];
  }
  if (format && ADAPTERS_BY_FORMAT[format]) {
    return ADAPTERS_BY_FORMAT[format];
  }
  return genericAdapter;
}
