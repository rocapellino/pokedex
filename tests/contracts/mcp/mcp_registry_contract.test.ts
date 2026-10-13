import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { generateAllClientConfigs } from '../../../scripts/mcp/generate.js';
import { testAllMcpConfigs } from '../../../scripts/mcp/test-config.js';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * ==============================================================================
 * tests/contracts/mcp/mcp_registry_contract.test.ts
 * ==============================================================================
 * Pruebas de contrato del registro canónico y generación de configuraciones MCP.
 * ==============================================================================
 */

test('🛡️ MCP Contrato: Todo servidor en registry.yaml referencia un perfil válido en policies.yaml', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const policies: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'policies.yaml'), 'utf-8'));

  const profiles = Object.keys(policies.profiles || {});
  const servers = registry.servers || [];

  for (const s of servers) {
    assert.ok(
      profiles.includes(s.profile),
      `El servidor ${s.id} debe referenciar un perfil existente en policies.yaml (referencia '${s.profile}')`,
    );
  }
});

test('🛡️ MCP Contrato: Unicidad absoluta de IDs de servidor en el registro', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const servers = registry.servers || [];
  const seenIds = new Set<string>();

  for (const s of servers) {
    assert.ok(!seenIds.has(s.id), `ID duplicado detectado: ${s.id}`);
    seenIds.add(s.id);
  }
});

test('🛡️ MCP Contrato: Generación de adaptadores es 100% idempotente', () => {
  const firstPass = generateAllClientConfigs({ dryRun: true });
  const secondPass = generateAllClientConfigs({ dryRun: true });

  assert.strictEqual(firstPass.length, secondPass.length);
  for (let i = 0; i < firstPass.length; i++) {
    assert.strictEqual(firstPass[i].clientId, secondPass[i].clientId);
    assert.strictEqual(firstPass[i].content, secondPass[i].content);
  }
});

test('🛡️ MCP Contrato: El validador test-config aprueba todos los adaptadores y transportes', () => {
  const results = testAllMcpConfigs();
  for (const res of results) {
    assert.strictEqual(
      res.passed,
      true,
      `El cliente ${res.client} debe superar las pruebas de configuración: ${res.errors.join(', ')}`,
    );
  }
});

test('🛡️ MCP Contrato: Servidores trivy y context7 están registrados con perfiles y permisos válidos', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const servers = registry.servers || [];

  const trivy = servers.find((s: any) => s.id === 'trivy');
  assert.ok(trivy, "El servidor 'trivy' debe estar registrado en registry.yaml");
  assert.strictEqual(trivy.profile, 'security-readonly');
  assert.strictEqual(trivy.permissions?.write, false);
  assert.strictEqual(trivy.permissions?.filesystem, 'read-only-repo');

  const context7 = servers.find((s: any) => s.id === 'context7');
  assert.ok(context7, "El servidor 'context7' debe estar registrado en registry.yaml");
  assert.strictEqual(context7.profile, 'documentation-readonly');
  assert.strictEqual(context7.permissions?.write, false);
  assert.strictEqual(context7.permissions?.filesystem, 'none');
});
