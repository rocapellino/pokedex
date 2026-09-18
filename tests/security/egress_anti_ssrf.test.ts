import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

interface EgressTarget {
  name: string;
  url: string;
  host: string;
  protocol: 'http:' | 'https:';
  port: number;
  expectedL7Cilium: 'ALLOW' | 'DENY';
  expectedL4Flannel: 'ALLOW' | 'DENY';
  reason: string;
}

const TEST_TARGETS: EgressTarget[] = [
  {
    name: 'Google Gemini AI (API Upstream)',
    url: 'https://generativelanguage.googleapis.com',
    host: 'generativelanguage.googleapis.com',
    protocol: 'https:',
    port: 443,
    expectedL7Cilium: 'ALLOW',
    expectedL4Flannel: 'ALLOW',
    reason: 'Upstream obligatorio para generación de mockups y asistencia con IA',
  },
  {
    name: 'PokeAPI (Catálogo Upstream)',
    url: 'https://pokeapi.co',
    host: 'pokeapi.co',
    protocol: 'https:',
    port: 443,
    expectedL7Cilium: 'ALLOW',
    expectedL4Flannel: 'ALLOW',
    reason: 'Upstream autorizado para catálogo e imágenes de Pokémon',
  },
  {
    name: 'Dominio Público No Autorizado (Anti-Exfiltración)',
    url: 'https://example.com',
    host: 'example.com',
    protocol: 'https:',
    port: 443,
    expectedL7Cilium: 'DENY',
    expectedL4Flannel: 'ALLOW', // Demuestra la debilidad de Flannel L4 puro
    reason: 'Dominio arbitrario externo. Solo Cilium L7 eBPF puede bloquearlo en capa de red',
  },
  {
    name: 'Cloud Metadata IMDS (Anti-SSRF)',
    url: 'http://169.254.169.254',
    host: '169.254.169.254',
    protocol: 'http:',
    port: 80,
    expectedL7Cilium: 'DENY',
    expectedL4Flannel: 'DENY',
    reason: 'Endpoint de metadatos de instancia. Bloqueado en L4 por ipBlock.except y en L7 por default-deny',
  },
  {
    name: 'Red Privada RFC1918 Clase A (Anti-SSRF / Lateral)',
    url: 'http://10.0.0.1',
    host: '10.0.0.1',
    protocol: 'http:',
    port: 80,
    expectedL7Cilium: 'DENY',
    expectedL4Flannel: 'DENY',
    reason: 'Subred privada interna. Bloqueado en L4 por ipBlock.except y en L7 por falta de regla egress',
  },
  {
    name: 'Red Privada RFC1918 Clase C (Anti-SSRF / Lateral)',
    url: 'http://192.168.1.1',
    host: '192.168.1.1',
    protocol: 'http:',
    port: 80,
    expectedL7Cilium: 'DENY',
    expectedL4Flannel: 'DENY',
    reason: 'Subred LAN privada Proxmox/Gateway. Bloqueado en L4 por ipBlock.except y en L7 por default-deny',
  },
];

/**
 * Simula la evaluación determinista de políticas de red de Kubernetes.
 */
function evaluateL4Policy(target: EgressTarget, externalHttpsAllowed: boolean): 'ALLOW' | 'DENY' {
  // En L4 estándar, solo se evalúan IP y Puerto.
  // Si el puerto es 80, no hay regla que lo permita hacia destinos externos -> DENY
  if (target.port !== 443) {
    return 'DENY';
  }

  // Si externalHttps está desactivado en L4 -> DENY
  if (!externalHttpsAllowed) {
    return 'DENY';
  }

  // Si la IP de destino cae en los bloques 'except':
  const isImds = target.host === '169.254.169.254';
  const isRfc1918 =
    target.host.startsWith('10.') ||
    target.host.startsWith('192.168.') ||
    target.host.startsWith('172.16.') ||
    target.host === '127.0.0.1';

  if (isImds || isRfc1918) {
    return 'DENY';
  }

  // Cualquier destino público en puerto 443 es aceptado bajo 0.0.0.0/0
  return 'ALLOW';
}

function evaluateL7CiliumPolicy(target: EgressTarget, fqdnAllowlist: string[]): 'ALLOW' | 'DENY' {
  if (target.port !== 443) {
    return 'DENY';
  }

  // Comprobar coincidencia exacta o con wildcard
  const matches = fqdnAllowlist.some(pattern => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ej: .pokeapi.co
      return target.host.endsWith(suffix) || target.host === pattern.slice(2);
    }
    return target.host === pattern;
  });

  return matches ? 'ALLOW' : 'DENY';
}

test('🛡️ Egress Matrix: Verificación formal de los 6 destinos requeridos bajo Cilium L7 vs Flannel L4', () => {
  const ciliumAllowlist = ['generativelanguage.googleapis.com', '*.pokeapi.co', '*.githubusercontent.com'];

  for (const target of TEST_TARGETS) {
    const l7Decision = evaluateL7CiliumPolicy(target, ciliumAllowlist);
    const l4Decision = evaluateL4Policy(target, true);

    // 1. Validar comportamiento esperado bajo Cilium L7
    assert.equal(
      l7Decision,
      target.expectedL7Cilium,
      `[Cilium L7] ${target.name} (${target.url}) debió resultar en ${target.expectedL7Cilium} pero fue ${l7Decision}. Razón: ${target.reason}`
    );

    // 2. Validar comportamiento bajo Flannel L4
    assert.equal(
      l4Decision,
      target.expectedL4Flannel,
      `[Flannel L4] ${target.name} (${target.url}) debió resultar en ${target.expectedL4Flannel} pero fue ${l4Decision}. Razón: ${target.reason}`
    );
  }

  // Demostración explícita de la brecha de seguridad de Flannel L4:
  const exampleTarget = TEST_TARGETS.find(t => t.host === 'example.com')!;
  assert.equal(
    evaluateL7CiliumPolicy(exampleTarget, ciliumAllowlist),
    'DENY',
    'Cilium L7 DEBE bloquear https://example.com'
  );
  assert.equal(
    evaluateL4Policy(exampleTarget, true),
    'ALLOW',
    'Flannel L4 NO PUEDE bloquear https://example.com porque 0.0.0.0/0:443 lo permite'
  );
});

test('🛡️ Helm Rendering: CiliumNetworkPolicy emite allowlist estricta L7 eBPF en producción y Proxmox', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const valuesProdPath = path.join(chartPath, 'values.prod.yaml');

  const renderedCilium = execSync(
    `helm template pokedex "${chartPath}" -f "${valuesProdPath}" -s templates/cilium-network-policies.yaml`,
    { encoding: 'utf-8' }
  );

  assert.match(renderedCilium, /kind:\s*CiliumNetworkPolicy/, 'Debe generar recurso CiliumNetworkPolicy');
  assert.match(renderedCilium, /toFQDNs:/, 'Debe contener sección toFQDNs');
  assert.match(
    renderedCilium,
    /matchName:\s*["']?generativelanguage\.googleapis\.com/,
    'Debe permitir generativelanguage.googleapis.com'
  );
  assert.match(renderedCilium, /matchPattern:\s*["']?\*\.pokeapi\.co/, 'Debe permitir *.pokeapi.co');
  assert.match(renderedCilium, /matchPattern:\s*["']?\*\.githubusercontent\.com/, 'Debe permitir *.githubusercontent.com');
  assert.doesNotMatch(renderedCilium, /example\.com/, 'NO debe permitir example.com');

  // Verificar que en producción, el L4 permisivo 0.0.0.0/0 en network-policies.yaml está desactivado
  const renderedL4 = execSync(
    `helm template pokedex "${chartPath}" -f "${valuesProdPath}" -s templates/network-policies.yaml`,
    { encoding: 'utf-8' }
  );

  assert.doesNotMatch(
    renderedL4,
    /169\.254\.169\.254\/32/,
    'En producción con Cilium activo, la regla L4 0.0.0.0/0 se omite para delegar el control total a Cilium L7'
  );
});

test('🛡️ GitOps Configuration: Proxmox values.yaml habilita Cilium L7 Zero-Trust para cumplir con el test de salida', () => {
  const proxmoxValuesPath = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const content = fs.readFileSync(proxmoxValuesPath, 'utf-8');

  assert.match(content, /ciliumNetworkPolicy:/, 'Proxmox values.yaml debe configurar ciliumNetworkPolicy');
  assert.match(content, /enabled:\s*true/, 'Proxmox values.yaml debe habilitar ciliumNetworkPolicy para soportar FQDN allowlist');
  assert.match(
    content,
    /matchName:\s*["']?generativelanguage\.googleapis\.com/,
    'Proxmox values.yaml debe incluir generativelanguage en fqdnAllowlist'
  );
  assert.match(
    content,
    /externalHttps:\s*false/,
    'Proxmox values.yaml debe desactivar externalHttps L4 para evitar el bypass de 0.0.0.0/0'
  );
});
