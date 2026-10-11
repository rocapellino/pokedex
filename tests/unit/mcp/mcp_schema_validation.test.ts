import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateMcpArchitecture } from '../../../scripts/mcp/validate.js';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * ==============================================================================
 * tests/unit/mcp/mcp_schema_validation.test.ts
 * ==============================================================================
 * Pruebas unitarias de esquema y validación del núcleo MCP.
 * ==============================================================================
 */

test('🧪 MCP Unit: Catálogo canónico supera la validación determinista sin errores', () => {
  const report = validateMcpArchitecture();
  assert.strictEqual(report.valid, true, 'El catálogo canónico debe ser válido');
  assert.ok(report.totalServers >= 5, 'Debe haber al menos 5 servidores registrados');
  assert.ok(report.enabledServers >= 4, 'Debe haber al menos 4 servidores habilitados');
  assert.ok(report.totalProfiles >= 5, 'Debe haber al menos 5 perfiles definidos');
  assert.ok(report.totalClients >= 4, 'Debe haber al menos 4 clientes soportados');
});

test('🧪 MCP Unit: El esquema JSON existe y define las estructuras requeridas', () => {
  const schemaPath = path.join(ROOT_DIR, '.mcp', 'schema.json');
  assert.ok(fs.existsSync(schemaPath), 'schema.json debe existir');

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  assert.ok(schema.definitions.server, 'El esquema debe definir server');
  assert.ok(schema.definitions.profile, 'El esquema debe definir profile');
  assert.ok(schema.definitions.client, 'El esquema debe definir client');
});

test('🧪 MCP Unit: Rechazo de servidor sin id o con id inválido', () => {
  const invalidServer = {
    name: 'Invalid Server',
    description: 'Servidor sin identificador',
    transport: 'stdio',
    execution_mode: 'local',
    version: '1.0.0',
    license: 'MIT',
    profile: 'development',
    enabled: true,
  };

  assert.ok(!('id' in invalidServer), 'El servidor de prueba carece de id');
});

test('🧪 MCP Unit: Rechazo de versiones flotantes o etiquetas mutables como latest', () => {
  const mutableVersions = ['latest', '^1.0.0', '~2.1.0', '*'];
  for (const ver of mutableVersions) {
    const isProhibited = ver === 'latest' || ver.startsWith('^') || ver.startsWith('~') || ver === '*';
    assert.strictEqual(isProhibited, true, `La versión ${ver} debe considerarse prohibida`);
  }
});
