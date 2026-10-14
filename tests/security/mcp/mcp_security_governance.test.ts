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

test('🔒 MCP Seguridad: Ningún servidor habilitado excede los permisos de su perfil de seguridad', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const policies: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'policies.yaml'), 'utf-8'));

  const servers = registry.servers || [];
  const profiles = policies.profiles || {};

  for (const s of servers) {
    const prof = profiles[s.profile];
    assert.ok(prof, `El perfil '${s.profile}' del servidor '${s.id}' debe existir`);

    // 1. Escritura
    if (prof.write_access === false) {
      assert.notStrictEqual(
        s.permissions?.write,
        true,
        `El servidor '${s.id}' no puede tener permissions.write: true en el perfil '${s.profile}' (write_access: false)`,
      );
    }

    // 2. Red
    if (prof.network === 'none') {
      assert.strictEqual(
        s.permissions?.network,
        'none',
        `El servidor '${s.id}' no puede tener red en el perfil '${s.profile}' (network: none)`,
      );
    }

    // 3. Contradicción interna en argumentos vs permisos
    if (Array.isArray(s.args) && s.args.includes('--network=none')) {
      assert.strictEqual(
        s.permissions?.network,
        'none',
        `El servidor '${s.id}' tiene --network=none en args, por lo que su permiso de red debe ser 'none'`,
      );
    }
  }
});

test('🔒 MCP Seguridad: URLs remotas en configuraciones generadas están completamente resueltas', () => {
  const configs = generateAllClientConfigs({ dryRun: true });

  for (const cfg of configs) {
    const parsed = JSON.parse(cfg.content);
    for (const [srvId, srvConfig] of Object.entries<any>(parsed.mcpServers || {})) {
      const url = srvConfig.url || srvConfig.serverUrl;
      if (url) {
        assert.ok(
          !url.includes('${'),
          `La URL del servidor '${srvId}' en el cliente '${cfg.clientId}' contiene una expresión sin resolver: '${url}'`,
        );
        assert.ok(
          url.startsWith('https://') || url.startsWith('http://localhost'),
          `La URL del servidor '${srvId}' debe ser un endpoint HTTP/HTTPS válido`,
        );
      }
    }
  }
});

test('🔒 MCP Seguridad: Perfiles security-readonly y documentation-readonly restringen escritura e infraestructura', () => {
  const policies: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'policies.yaml'), 'utf-8'));
  const profiles = policies.profiles || {};

  const secReadonly = profiles['security-readonly'];
  assert.ok(secReadonly, "El perfil 'security-readonly' debe existir en policies.yaml");
  assert.strictEqual(secReadonly.write_access, false, 'security-readonly DEBE prohibir write_access');
  assert.strictEqual(secReadonly.infra_access, 'none', 'security-readonly no debe permitir acceso a infraestructura');
  assert.strictEqual(
    secReadonly.allow_production_secrets,
    false,
    'security-readonly no debe permitir secretos de producción',
  );
  assert.strictEqual(secReadonly.filesystem, 'read-only-repo', 'security-readonly debe delimitarse a read-only-repo');
  assert.strictEqual(
    secReadonly.network,
    'outbound-allowed',
    'security-readonly requiere outbound-allowed para CVE DB',
  );

  const docReadonly = profiles['documentation-readonly'];
  assert.ok(docReadonly, "El perfil 'documentation-readonly' debe existir en policies.yaml");
  assert.strictEqual(docReadonly.write_access, false, 'documentation-readonly DEBE prohibir write_access');
  assert.strictEqual(
    docReadonly.infra_access,
    'none',
    'documentation-readonly no debe permitir acceso a infraestructura',
  );
  assert.strictEqual(
    docReadonly.allow_production_secrets,
    false,
    'documentation-readonly no debe permitir secretos de producción',
  );
  assert.strictEqual(docReadonly.filesystem, 'none', 'documentation-readonly no debe acceder al filesystem');
  assert.strictEqual(
    docReadonly.network,
    'outbound-allowed',
    'documentation-readonly requiere outbound-allowed para APIs de docs',
  );
});

test('🔒 MCP Seguridad: Coherencia de gobernanza entre skills (.agents/skills/*), reglas y catálogo canónico', () => {
  const registry: any = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.mcp', 'registry.yaml'), 'utf-8'));
  const servers = registry.servers || [];

  // 1. Skill repo-security referencia 'trivy' con perfil 'security-readonly'
  const repoSecurityContent = fs.readFileSync(
    path.join(ROOT_DIR, '.agents', 'skills', 'repo-security', 'SKILL.md'),
    'utf-8',
  );
  assert.ok(repoSecurityContent.includes('`trivy`'));
  assert.ok(repoSecurityContent.includes('`security-readonly`'));
  const trivyServer = servers.find((s: any) => s.id === 'trivy');
  assert.ok(trivyServer, "El servidor 'trivy' referenciado en repo-security debe existir en registry.yaml");
  assert.strictEqual(trivyServer.profile, 'security-readonly');
  assert.strictEqual(trivyServer.enabled, true);

  // 2. Skill repo-dependencies referencia 'context7' con perfil 'documentation-readonly'
  const repoDepsContent = fs.readFileSync(
    path.join(ROOT_DIR, '.agents', 'skills', 'repo-dependencies', 'SKILL.md'),
    'utf-8',
  );
  assert.ok(repoDepsContent.includes('`context7`'));
  assert.ok(repoDepsContent.includes('`documentation-readonly`'));
  const context7Server = servers.find((s: any) => s.id === 'context7');
  assert.ok(context7Server, "El servidor 'context7' referenciado en repo-dependencies debe existir en registry.yaml");
  assert.strictEqual(context7Server.profile, 'documentation-readonly');
  assert.strictEqual(context7Server.enabled, true);

  // 3. Regla transversal mcp-governance.md define Sección 5 para Trivy y Context7
  const governanceContent = fs.readFileSync(path.join(ROOT_DIR, '.agents', 'rules', 'mcp-governance.md'), 'utf-8');
  assert.ok(governanceContent.includes('5. Pautas Operativas para Servidores Especializados (Trivy y Context7)'));
  assert.ok(governanceContent.includes('Servidor Trivy (`security-readonly`)'));
  assert.ok(governanceContent.includes('Servidor Context7 (`documentation-readonly`)'));
});
