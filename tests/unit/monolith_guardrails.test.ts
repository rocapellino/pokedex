import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPrivateOrRestrictedIp,
  validateImageUrl,
  SCRIPT_PATTERN,
} from '../../apps/backend/src/validation/network-security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

interface MonolithGuardrail {
  file: string;
  maxLoc: number;
  maxImports: number;
  description: string;
}

const MONOLITH_WATCHLIST: readonly MonolithGuardrail[] = Object.freeze([
  {
    file: 'apps/backend/server.ts',
    maxLoc: 350,
    maxImports: 25,
    description: 'Composition Root del servidor Express',
  },
  {
    file: 'apps/backend/src/routes/pokemons.ts',
    maxLoc: 350,
    maxImports: 15,
    description: 'Enrutador HTTP principal del catálogo Pokémon',
  },
  {
    file: 'apps/backend/src/validation/network-security.ts',
    maxLoc: 200,
    maxImports: 5,
    description: 'Módulo desacoplado de seguridad de red y Anti-SSRF',
  },
  {
    file: 'apps/backend/src/validation/pokemon.ts',
    maxLoc: 100,
    maxImports: 10,
    description: 'Fachada y adaptador de validación de payloads',
  },
]);

test('🛡️ Monolith Watch: Archivos clave respetan los umbrales de LOC e imports (APPS-008)', () => {
  for (const item of MONOLITH_WATCHLIST) {
    const fullPath = path.join(ROOT_DIR, item.file);
    assert.ok(fs.existsSync(fullPath), `El archivo ${item.file} debe existir en el monorepo`);

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const loc = lines.length;

    // Conteo de imports directos
    const importStatements = content.match(/^import\s+.*from\s+['"][^'"]+['"]/gm) || [];
    const importCount = importStatements.length;

    assert.ok(
      loc <= item.maxLoc,
      `[Monolith Guardrail] ${item.file} (${item.description}) supera el límite de LOC: ${loc} > ${item.maxLoc}`
    );

    assert.ok(
      importCount <= item.maxImports,
      `[Monolith Guardrail] ${item.file} (${item.description}) supera el límite de imports: ${importCount} > ${item.maxImports}`
    );
  }
});

test('🛡️ Monolith Watch: network-security.ts está completamente desacoplado de Express, DB y servicios', () => {
  const securityModulePath = path.join(ROOT_DIR, 'apps/backend/src/validation/network-security.ts');
  const content = fs.readFileSync(securityModulePath, 'utf-8');

  // No debe depender de Express, PostgreSQL, Redis, Drizzle ni logging con estado
  assert.doesNotMatch(content, /from\s+['"]express['"]/);
  assert.doesNotMatch(content, /from\s+['"]pg['"]/);
  assert.doesNotMatch(content, /from\s+['"]ioredis['"]/);
  assert.doesNotMatch(content, /from\s+['"]drizzle-orm/);
  assert.doesNotMatch(content, /from\s+['"].*\/services\/db/);
});

test('🛡️ Network Security [Unit]: isPrivateOrRestrictedIp rechaza rangos restringidos y metadatos de nube', () => {
  // Cloud Metadata
  assert.equal(isPrivateOrRestrictedIp('metadata.google.internal'), true);
  assert.equal(isPrivateOrRestrictedIp('metadata.internal'), true);
  assert.equal(isPrivateOrRestrictedIp('host.internal'), true);

  // Loopback
  assert.equal(isPrivateOrRestrictedIp('localhost'), true);
  assert.equal(isPrivateOrRestrictedIp('127.0.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('127.0.1.1'), true);
  assert.equal(isPrivateOrRestrictedIp('::1'), true);

  // Link-local / Cloud IMDS (169.254.x.x)
  assert.equal(isPrivateOrRestrictedIp('169.254.169.254'), true);

  // RFC 1918 Private ranges
  assert.equal(isPrivateOrRestrictedIp('10.0.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('172.16.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('172.31.255.255'), true);
  assert.equal(isPrivateOrRestrictedIp('192.168.1.1'), true);

  // IPs públicas legítimas
  assert.equal(isPrivateOrRestrictedIp('8.8.8.8'), false);
  assert.equal(isPrivateOrRestrictedIp('1.1.1.1'), false);
  assert.equal(isPrivateOrRestrictedIp('raw.githubusercontent.com'), false);
});

test('🛡️ Network Security [Unit]: validateImageUrl valida protocolo y previene SSRF', () => {
  // URLs HTTPS públicas válidas
  assert.equal(validateImageUrl('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'), true);
  assert.equal(validateImageUrl('https://images.pokemontcg.io/base1/4.png'), true);

  // Rutas relativas seguras
  assert.equal(validateImageUrl('/static/img/charizard.png'), true);

  // Protocol-relative (//badhost) denegado
  assert.equal(validateImageUrl('//malicious.com/image.png'), false);

  // Ataques SSRF denegados
  assert.equal(validateImageUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(validateImageUrl('https://169.254.169.254/latest/meta-data/'), false);
  assert.equal(validateImageUrl('https://10.0.0.1/private.png'), false);
  assert.equal(validateImageUrl('https://metadata.google.internal/computeMetadata/v1/'), false);
  assert.equal(validateImageUrl('https://192.168.1.1/router.png'), false);
  assert.equal(validateImageUrl('http://example.com/unencrypted.png'), false);

  // Inyección de script o caracteres maliciosos
  assert.equal(validateImageUrl('javascript:alert(1)'), false);
  assert.equal(validateImageUrl('/static/<script>alert(1)</script>'), false);
  assert.equal(validateImageUrl(''), false);
  assert.equal(validateImageUrl(null), false);
});
