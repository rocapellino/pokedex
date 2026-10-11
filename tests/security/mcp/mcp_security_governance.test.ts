import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { generateAllClientConfigs } from '../../../scripts/mcp/generate.js';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * ==============================================================================
 * tests/security/mcp/mcp_security_governance.test.ts
 * ==============================================================================
 * Pruebas de seguridad, minimización de privilegios y Zero-Trust para MCP.
 * ==============================================================================
 */

test('🔒 MCP Seguridad: El perfil infrastructure-write está deshabilitado por defecto y exige aprobación', () => {
  const policies: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'policies.yaml'), 'utf-8'));
  const infraWrite = policies.profiles['infrastructure-write'];

  assert.ok(infraWrite, "El perfil 'infrastructure-write' debe existir en policies.yaml");
  assert.strictEqual(infraWrite.default_enabled, false, "infrastructure-write DEBE tener 'default_enabled: false'");
  assert.strictEqual(
    infraWrite.requires_explicit_approval,
    true,
    'infrastructure-write DEBE requerir aprobación explícita',
  );
});

test('🔒 MCP Seguridad: Ningún servidor con infraestructura de escritura está habilitado en el catálogo', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const servers = registry.servers || [];

  for (const s of servers) {
    if (s.profile === 'infrastructure-write') {
      assert.strictEqual(
        s.enabled,
        false,
        `El servidor ${s.id} tiene perfil infrastructure-write y no debe estar habilitado por defecto`,
      );
    }
  }
});

test('🔒 MCP Seguridad: Ausencia estricta de credenciales reales en archivos de configuración', () => {
  const mcpFiles = ['registry.yaml', 'policies.yaml', 'clients.yaml'];
  const secretKeywords = ['ghp_', 'github_pat_', 'sk-', 'glpat-'];

  for (const file of mcpFiles) {
    const content = fs.readFileSync(path.join(ROOT_DIR, '.mcp', file), 'utf-8');
    for (const kw of secretKeywords) {
      assert.ok(!content.includes(kw), `Se detectó un patrón de secreto '${kw}' en .mcp/${file}`);
    }
  }
});

test('🔒 MCP Seguridad: Servidores en contenedor usan imágenes fijadas por digest SHA256 inmutable', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const servers = registry.servers || [];

  for (const s of servers) {
    if (s.execution_mode === 'container') {
      assert.ok(s.image, `El servidor container ${s.id} debe declarar imagen`);
      assert.ok(
        s.image.includes('@sha256:'),
        `La imagen del servidor ${s.id} (${s.image}) debe estar anclada a un digest inmutable @sha256:`,
      );
      assert.ok(
        !JSON.stringify(s.args || []).includes('docker.sock'),
        `El servidor ${s.id} no debe montar el socket docker`,
      );
    }
  }
});

test('🔒 MCP Seguridad: Servidores de filesystem limitados a la raíz del repositorio', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const fsServer = (registry.servers || []).find((s: any) => s.id === 'filesystem');

  assert.ok(fsServer, "El servidor 'filesystem' debe existir");
  assert.strictEqual(fsServer.permissions.filesystem, 'repo-root-only');
  assert.ok(fsServer.args.includes('.'), "Los argumentos del servidor filesystem deben apuntar a la raíz '.'");
  assert.ok(
    !fsServer.args.some((arg: string) => arg.includes('..') || arg.startsWith('/') || /^[A-Za-z]:\\/.test(arg)),
    'No se permiten rutas absolutas o traversal fuera del monorepo',
  );
});

test('🔒 MCP Seguridad: Configuraciones generadas no exponen secretos en disco', () => {
  const configs = generateAllClientConfigs({ dryRun: true });

  for (const cfg of configs) {
    assert.ok(!cfg.content.includes('ghp_'), 'No debe haber tokens personales en la configuración generada');
    assert.ok(!cfg.content.includes('sk-'), 'No debe haber claves API en la configuración generada');
  }
});
