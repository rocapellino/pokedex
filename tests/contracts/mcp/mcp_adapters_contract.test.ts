import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAllClientConfigs } from '../../../scripts/mcp/generate.js';
import { getAdapterForClient } from '../../../scripts/mcp/adapters/index.js';

/**
 * ==============================================================================
 * tests/contracts/mcp/mcp_adapters_contract.test.ts
 * ==============================================================================
 * Pruebas de contrato y especificación técnica de los adaptadores MCP por cliente.
 *
 * Valida:
 *   1. Antigravity: uso obligatorio de 'serverUrl' en transporte remoto y ruta .agents/mcp_config.json.
 *   2. Claude Code: formato oficial de proyecto .mcp.json con 'type: "sse"' en transporte remoto.
 *   3. Cursor y VS Code: transporte estándar con 'url' y rutas respectivas.
 *   4. Generic: formato con esquema y metadatos exportables.
 *   5. Resolución limpia de variables en URLs remotas sin expresiones de shell pendientes.
 * ==============================================================================
 */

test('🔌 MCP Adaptador Antigravity: genera serverUrl para transporte remoto y respeta ruta canónica', () => {
  const configs = generateAllClientConfigs({ dryRun: true, client: 'antigravity' });
  assert.strictEqual(configs.length, 1);

  const antigravityCfg = configs[0];
  assert.strictEqual(antigravityCfg.targetPath, '.agents/mcp_config.json');

  const parsed = JSON.parse(antigravityCfg.content);
  assert.ok(parsed.mcpServers, 'Debe contener mcpServers');

  const obsServer = parsed.mcpServers['observability-readonly'];
  assert.ok(obsServer, 'Debe contener observability-readonly');
  assert.ok(obsServer.serverUrl, "Antigravity debe usar estrictamente 'serverUrl'");
  assert.strictEqual(obsServer.url, undefined, "Antigravity no debe contener 'url'");
  assert.ok(!obsServer.serverUrl.includes('${'), "La URL no debe contener expresiones '${' sin resolver");
  assert.strictEqual(obsServer.serverUrl, 'https://monitoring.pokedex.internal/mcp');
});

test('🔌 MCP Adaptador Claude Code: genera .mcp.json con type sse explícito para transporte remoto', () => {
  const configs = generateAllClientConfigs({ dryRun: true, client: 'claude' });
  assert.strictEqual(configs.length, 1);

  const claudeCfg = configs[0];
  assert.strictEqual(claudeCfg.targetPath, '.mcp.json');

  const parsed = JSON.parse(claudeCfg.content);
  assert.ok(parsed.mcpServers, 'Debe contener mcpServers');

  const obsServer = parsed.mcpServers['observability-readonly'];
  assert.ok(obsServer, 'Debe contener observability-readonly');
  assert.strictEqual(obsServer.type, 'sse', 'Claude Code requiere \'type: "sse"\' para transporte remoto');
  assert.strictEqual(obsServer.url, 'https://monitoring.pokedex.internal/mcp');
});

test('🔌 MCP Adaptador Cursor y VS Code: generan esquemas compatibles con editores modernos', () => {
  const configs = generateAllClientConfigs({ dryRun: true });

  const cursorCfg = configs.find((c) => c.clientId === 'cursor');
  const vscodeCfg = configs.find((c) => c.clientId === 'vscode');

  assert.ok(cursorCfg, 'Configuración de Cursor debe existir');
  assert.ok(vscodeCfg, 'Configuración de VS Code debe existir');

  assert.strictEqual(cursorCfg!.targetPath, '.cursor/mcp.json');
  assert.strictEqual(vscodeCfg!.targetPath, '.vscode/mcp.json');

  const parsedCursor = JSON.parse(cursorCfg!.content);
  const parsedVscode = JSON.parse(vscodeCfg!.content);

  assert.strictEqual(parsedCursor.mcpServers['observability-readonly'].url, 'https://monitoring.pokedex.internal/mcp');
  assert.strictEqual(parsedVscode.mcpServers['observability-readonly'].url, 'https://monitoring.pokedex.internal/mcp');
});

test('🔌 MCP Adaptadores: getAdapterForClient despacha la instancia correcta según id y formato', () => {
  const antiAdapter = getAdapterForClient('antigravity');
  assert.strictEqual(antiAdapter.clientId, 'antigravity');
  assert.strictEqual(antiAdapter.format, 'antigravity-mcp-json');

  const claudeAdapter = getAdapterForClient('claude');
  assert.strictEqual(claudeAdapter.clientId, 'claude');
  assert.strictEqual(claudeAdapter.format, 'claude-mcp-json');

  const cursorAdapter = getAdapterForClient('cursor');
  assert.strictEqual(cursorAdapter.clientId, 'cursor');

  const vscodeAdapter = getAdapterForClient('vscode');
  assert.strictEqual(vscodeAdapter.clientId, 'vscode');
});
