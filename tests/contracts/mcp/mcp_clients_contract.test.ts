import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * ==============================================================================
 * tests/contracts/mcp/mcp_clients_contract.test.ts
 * ==============================================================================
 * Pruebas de contrato de clientes MCP y políticas de exclusión en Git.
 * ==============================================================================
 */

test('🛡️ MCP Contrato Clientes: Todas las rutas de configuración de clientes están protegidas en .gitignore', () => {
  const gitignoreContent = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf-8');
  const clientsSpec: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'clients.yaml'), 'utf-8'));
  const clients = clientsSpec.clients || {};

  for (const [clientId, clientDef] of Object.entries<any>(clients)) {
    const configPath = clientDef.config_path;
    const parentDir = path.dirname(configPath).replace(/\\/g, '/');

    // Debe estar ignorado el archivo específico o su directorio padre
    const isIgnored =
      gitignoreContent.includes(configPath) ||
      gitignoreContent.includes(`${parentDir}/`) ||
      gitignoreContent.includes(`/${parentDir}/`) ||
      gitignoreContent.includes(path.basename(configPath));

    assert.ok(
      isIgnored,
      `La ruta de configuración del cliente ${clientId} (${configPath}) debe estar excluida en .gitignore`,
    );
  }
});

test('🛡️ MCP Contrato Clientes: Los clientes soportados están verificados y documentan sus limitaciones', () => {
  const clientsSpec: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'clients.yaml'), 'utf-8'));
  const clients = clientsSpec.clients || {};

  for (const [clientId, clientDef] of Object.entries<any>(clients)) {
    assert.strictEqual(clientDef.verified, true, `El cliente ${clientId} debe estar verificado`);
    assert.ok(
      clientDef.limitations && clientDef.limitations.length > 5,
      `El cliente ${clientId} debe documentar sus limitaciones`,
    );
    assert.ok(clientDef.supported_transports.length > 0, `El cliente ${clientId} debe declarar transportes`);
  }
});
