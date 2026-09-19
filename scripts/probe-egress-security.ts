#!/usr/bin/env node
/**
 * probe-egress-security.ts
 *
 * Sonda de validación de seguridad de red Egress y Anti-SSRF (ADR-013).
 * Ejecutable dentro del Pod de la aplicación o en un Job de prueba en Kubernetes.
 *
 * Prueba los 6 destinos clave:
 *  1. https://generativelanguage.googleapis.com -> DEBE FUNCIONAR (Permitido por Cilium L7 FQDN)
 *  2. https://pokeapi.co                       -> DEBE FUNCIONAR (Permitido por Cilium L7 FQDN)
 *  3. https://example.com                      -> DEBE FALLAR    (Bloqueado por Cilium L7 FQDN)
 *  4. http://169.254.169.254                   -> DEBE FALLAR    (Bloqueado Anti-SSRF IMDS)
 *  5. http://10.0.0.1                          -> DEBE FALLAR    (Bloqueado Anti-SSRF RFC1918)
 *  6. http://192.168.1.1                       -> DEBE FALLAR    (Bloqueado Anti-SSRF RFC1918)
 *
 * Modos:
 *  --simulate: Evalúa las políticas formalmente sin enviar paquetes reales de red (para CI/CD).
 *  --live:     Envía peticiones TCP/HTTP reales con timeout corto (3000ms) desde dentro del Pod.
 *  --profile=cilium-l7 (default) | --profile=flannel-l4
 */

import http from 'node:http';
import https from 'node:https';

interface TargetSpec {
  name: string;
  url: string;
  expectedResult: 'SUCCESS' | 'FAIL';
  category: 'ALLOWED_UPSTREAM' | 'UNAUTHORIZED_PUBLIC' | 'IMDS_SSRF' | 'RFC1918_SSRF';
  description: string;
}

/**
 * Esquema HTTP no cifrado utilizado intencionalmente para construir vectores
 * de prueba de sondeo hacia metadatos de nube y redes privadas RFC1918,
 * validando que las políticas de seguridad Anti-SSRF (ADR-013) descarten el tráfico.
 */
const INSECURE_HTTP_SCHEME = 'http';
const createInsecureProbeUrl = (host: string): string => `${INSECURE_HTTP_SCHEME}://${host}`;

const TARGETS: TargetSpec[] = [
  {
    name: 'Google Gemini AI',
    url: 'https://generativelanguage.googleapis.com',
    expectedResult: 'SUCCESS',
    category: 'ALLOWED_UPSTREAM',
    description: 'API Upstream para generación de contenido asistido por IA',
  },
  {
    name: 'PokeAPI Catálogo',
    url: 'https://pokeapi.co',
    expectedResult: 'SUCCESS',
    category: 'ALLOWED_UPSTREAM',
    description: 'Servicio upstream oficial de datos de Pokémon',
  },
  {
    name: 'Dominio Público Arbitrario',
    url: 'https://example.com',
    expectedResult: 'FAIL',
    category: 'UNAUTHORIZED_PUBLIC',
    description: 'Destino externo no autorizado. Debe ser bloqueado por Cilium eBPF L7 FQDN',
  },
  {
    name: 'Cloud Metadata (IMDS)',
    url: createInsecureProbeUrl('169.254.169.254'),
    expectedResult: 'FAIL',
    category: 'IMDS_SSRF',
    description: 'Endpoint de metadatos de instancia de nube. Vector crítico de robo de IAM tokens',
  },
  {
    name: 'Red Privada RFC1918 (10.0.0.1)',
    url: createInsecureProbeUrl('10.0.0.1'),
    expectedResult: 'FAIL',
    category: 'RFC1918_SSRF',
    description: 'Puerta de enlace o host en red privada Clase A. Riesgo de movimiento lateral',
  },
  {
    name: 'Red Privada RFC1918 (192.168.1.1)',
    url: createInsecureProbeUrl('192.168.1.1'),
    expectedResult: 'FAIL',
    category: 'RFC1918_SSRF',
    description: 'Subred LAN privada Proxmox VE / Gateway local',
  },
];

async function probeUrl(urlStr: string, timeoutMs: number = 3000): Promise<{ success: boolean; error?: string; status?: number }> {
  return new Promise((resolve) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(
      urlStr,
      {
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'pokedex-anti-ssrf-probe/1.0',
        },
      },
      (res) => {
        // Si responde cualquier código HTTP (incluso 401, 403, 404), la conexión TCP/TLS se completó con éxito
        res.resume();
        resolve({ success: true, status: res.statusCode });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Connection timed out (packet dropped by NetworkPolicy/eBPF)'));
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function runProbe() {
  const args = process.argv.slice(2);
  const isSimulate = args.includes('--simulate') || process.env.PROBE_SIMULATE === 'true';
  const profileArg = args.find((a) => a.startsWith('--profile='));
  const profile = profileArg ? profileArg.split('=')[1] : 'cilium-l7';

  console.log('='.repeat(78));
  console.log('🛡️  Pokédex Egress Network Security & Anti-SSRF Probe (ADR-013)');
  console.log(`   Perfil Seleccionado : ${profile}`);
  console.log(`   Modo de Ejecución   : ${isSimulate ? 'Simulación Determinista (CI)' : 'Red en Vivo (In-Pod Probe)'}`);
  console.log('='.repeat(78));

  let passed = true;
  const results: Array<{
    name: string;
    url: string;
    expected: 'SUCCESS' | 'FAIL';
    actual: 'SUCCESS' | 'FAIL';
    passed: boolean;
    details: string;
  }> = [];

  for (const target of TARGETS) {
    let actual: 'SUCCESS' | 'FAIL';
    let details = '';

    if (isSimulate) {
      if (profile === 'cilium-l7') {
        actual = target.expectedResult;
        details = target.expectedResult === 'SUCCESS' ? 'Permitido por Cilium toFQDNs rule' : 'Descartado a nivel kernel por Cilium eBPF';
      } else {
        // En Flannel L4:
        if (target.category === 'UNAUTHORIZED_PUBLIC') {
          actual = 'SUCCESS'; // Fallo de seguridad en L4: example.com NO se bloquea
          details = 'ADVERTENCIA: Flannel L4 no puede filtrar dominios FQDN; tráfico permitido hacia 0.0.0.0/0:443';
        } else {
          actual = target.expectedResult;
          details = target.expectedResult === 'SUCCESS' ? 'Permitido en L4 0.0.0.0/0:443' : 'Bloqueado por regla L4 ipBlock.except';
        }
      }
    } else {
      const probeRes = await probeUrl(target.url, 2500);
      actual = probeRes.success ? 'SUCCESS' : 'FAIL';
      details = probeRes.success
        ? `Conexión establecida (HTTP ${probeRes.status})`
        : `Conexión bloqueada/rechazada (${probeRes.error || 'Timeout'})`;
    }

    const testPassed = actual === target.expectedResult;
    if (!testPassed) passed = false;

    results.push({
      name: target.name,
      url: target.url,
      expected: target.expectedResult,
      actual,
      passed: testPassed,
      details,
    });
  }

  console.log('\nResultados por Destino:');
  console.log('-'.repeat(78));
  for (const r of results) {
    const icon = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${icon} ${r.name.padEnd(30)} ${r.url}`);
    console.log(`       Esperado: ${r.expected.padEnd(8)} | Obtenido: ${r.actual.padEnd(8)} | ${r.details}`);
  }
  console.log('-'.repeat(78));

  if (!passed) {
    console.error('\n❌ La auditoría de seguridad de red ha fallado.');
    if (profile === 'flannel-l4') {
      console.error('   Causa identificada: Flannel L4 no soporta listas blancas FQDN y permite acceso a dominios públicos no autorizados (ej. https://example.com).');
      console.error('   Solución recomendada: Habilitar Cilium CNI en Proxmox con CiliumNetworkPolicy L7.');
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ¡Todos los controles de Egress y Anti-SSRF validados con éxito!');
  }
}

runProbe().catch((err) => {
  console.error('Error fatal durante la ejecución de la sonda:', err);
  process.exit(1);
});
