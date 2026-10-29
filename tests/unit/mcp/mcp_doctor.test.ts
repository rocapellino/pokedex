import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRemoteTransportUrl,
  probeCliTool,
  probeTrivyPlugin,
  resolveServerUrl,
  runMcpDoctor,
  type ServerDiagnosis,
} from '../../../scripts/mcp/doctor.js';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * ==============================================================================
 * tests/unit/mcp/mcp_doctor.test.ts
 * ==============================================================================
 * Pruebas unitarias para el subsistema de diagnóstico MCP (scripts/mcp/doctor.ts).
 * ==============================================================================
 */

test('🧪 MCP Doctor Unit: probeCliTool detecta herramientas existentes y reporta ausentes', () => {
  // Herramienta existente en runtime
  const nodeProbe = probeCliTool('node');
  assert.strictEqual(nodeProbe.available, true);
  assert.ok(nodeProbe.version?.startsWith('v'));

  // Herramienta ficticia que no existe en PATH
  const missingProbe = probeCliTool('non_existent_binary_tool_xyz_404');
  assert.strictEqual(missingProbe.available, false);
  assert.strictEqual(missingProbe.version, undefined);
});

test('🧪 MCP Doctor Unit: probeTrivyPlugin reporta correctamente cuando CLI o plugin están ausentes', () => {
  // Mock donde trivy CLI no está disponible
  const mockCliMissing = (_bin: string) => ({ available: false });
  const missingResult = probeTrivyPlugin('mcp', mockCliMissing);
  assert.strictEqual(missingResult.installed, false);
  assert.ok(missingResult.error?.includes('CLI trivy no encontrada'));
});

test('🧪 MCP Doctor Unit: overallValid refleja fallos de variables requeridas (CONFIG_MISSING)', () => {
  // Entorno sin ninguna variable de entorno configurada
  const emptyEnv: Record<string, string | undefined> = {};
  const report = runMcpDoctor({
    rootDir: ROOT_DIR,
    env: emptyEnv,
    cliProbeFn: () => ({ available: true, version: '1.0.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  // Los servidores con required_env_vars deben reportar CONFIG_MISSING
  const githubServer = report.servers.find((s) => s.id === 'github');
  assert.ok(githubServer);
  assert.strictEqual(githubServer.state, 'CONFIG_MISSING');
  assert.strictEqual(githubServer.configurationStatus, 'MISSING_ENV');
  assert.ok(githubServer.details.some((d) => d.includes('GITHUB_PERSONAL_ACCESS_TOKEN')));

  // overallValid debe ser false debido a variables faltantes
  assert.strictEqual(report.summary.configurationsMet, false);
  assert.strictEqual(report.overallValid, false);
});

test('🧪 MCP Doctor Unit: Trivy reporta DEPENDENCY_MISSING y MISSING_PLUGIN cuando falta el plugin mcp', () => {
  const dummyEnv: Record<string, string | undefined> = {
    GITHUB_PERSONAL_ACCESS_TOKEN: 'test-env-val-github',
    SONAR_TOKEN: 'test-env-val-sonar',
    GRAFANA_SERVICE_ACCOUNT_TOKEN: 'test-env-val-grafana',
  };

  const report = runMcpDoctor({
    rootDir: ROOT_DIR,
    env: dummyEnv,
    cliProbeFn: (bin: string) => ({ available: true, version: `${bin}-v1.0` }),
    // CLI trivy existe pero plugin mcp NO está instalado
    trivyPluginProbeFn: () => ({ installed: false, error: 'plugin not found' }),
  });

  const trivyServer = report.servers.find((s) => s.id === 'trivy');
  assert.ok(trivyServer);
  assert.strictEqual(trivyServer.state, 'DEPENDENCY_MISSING');
  assert.strictEqual(trivyServer.dependenciesStatus, 'MISSING_PLUGIN');
  assert.ok(trivyServer.details.some((d) => d.includes("Plugin MCP de Trivy ('trivy-mcp') no instalado")));
  assert.strictEqual(report.summary.dependenciesMet, false);
  assert.strictEqual(report.overallValid, false);
});

test('🧪 MCP Doctor Unit: Principio Zero-Trust preservado en reportes y recomendaciones', () => {
  const secretToken = 'dummy-secret-marker-zero-trust-probe';
  const customEnv: Record<string, string | undefined> = {
    GITHUB_PERSONAL_ACCESS_TOKEN: secretToken,
    SONAR_TOKEN: '',
  };

  // Sondas inyectadas: ejecutar los binarios reales (`code`, `trivy`...) haría el test lento y
  // dependiente del host, y `code` hereda NODE_V8_COVERAGE y corrompe el LCOV (AUD-TST-HERM-001).
  const report = runMcpDoctor({
    rootDir: ROOT_DIR,
    env: customEnv,
    cliProbeFn: () => ({ available: true, version: '1.0.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  const serialized = JSON.stringify(report);
  assert.ok(
    !serialized.includes(secretToken),
    'El reporte de doctor NUNCA debe incluir el valor real de un token secreto',
  );

  for (const s of report.servers) {
    for (const d of s.details) {
      assert.ok(!d.includes(secretToken), `Detalle de servidor filtró token: ${d}`);
    }
  }

  for (const rec of report.recommendations) {
    assert.ok(!rec.includes(secretToken), `Recomendación filtró token: ${rec}`);
  }
});

test('🧪 MCP Doctor Unit: Diagnóstico exitoso cuando todas las dependencias y configuraciones se cumplen', () => {
  const fullEnv: Record<string, string | undefined> = {
    GITHUB_PERSONAL_ACCESS_TOKEN: 'test-env-val-github',
    SONAR_TOKEN: 'test-env-val-sonar',
    GRAFANA_SERVICE_ACCOUNT_TOKEN: 'test-env-val-grafana',
  };

  const report = runMcpDoctor({
    rootDir: ROOT_DIR,
    env: fullEnv,
    cliProbeFn: (_bin: string) => ({ available: true, version: '1.0.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  assert.strictEqual(report.summary.dependenciesMet, true);
  assert.strictEqual(report.summary.configurationsMet, true);
  assert.strictEqual(report.summary.connectivityMet, true);

  const enabledServers = report.servers.filter((s: ServerDiagnosis) => s.state !== 'DISABLED');
  for (const server of enabledServers) {
    assert.strictEqual(
      server.state,
      'READY',
      `El servidor ${server.id} debería estar READY pero está en ${server.state}: ${server.details.join('; ')}`,
    );
  }
});

test('🧪 MCP Doctor Unit: resolveServerUrl resuelve variables, fallback y detecta variables pendientes', () => {
  const env = {
    CUSTOM_HOST: 'https://monitoring.corp.internal',
    EMPTY_VAR: '',
  };

  // 1. Variable existente resuelta
  const res1 = resolveServerUrl('${CUSTOM_HOST}/mcp', env);
  assert.strictEqual(res1.resolvedUrl, 'https://monitoring.corp.internal/mcp');
  assert.strictEqual(res1.hasUnresolvedVars, false);
  assert.deepStrictEqual(res1.missingVars, []);

  // 2. Variable ausente pero con fallback predeterminado
  const res2 = resolveServerUrl('${NON_EXISTENT_VAR:-https://fallback.domain/mcp}', env);
  assert.strictEqual(res2.resolvedUrl, 'https://fallback.domain/mcp');
  assert.strictEqual(res2.hasUnresolvedVars, false);
  assert.deepStrictEqual(res2.missingVars, []);

  // 3. Variable ausente sin fallback
  const res3 = resolveServerUrl('${PENDING_VAR}/mcp', env);
  assert.strictEqual(res3.resolvedUrl, '${PENDING_VAR}/mcp');
  assert.strictEqual(res3.hasUnresolvedVars, true);
  assert.deepStrictEqual(res3.missingVars, ['PENDING_VAR']);
});

test('🧪 MCP Doctor Unit: Servidor remoto con URL sin resolver reporta UNRESOLVED_URL y bloquea overallValid', () => {
  const env: Record<string, string | undefined> = {
    GITHUB_PERSONAL_ACCESS_TOKEN: 'mock-token',
    SONAR_TOKEN: 'mock-token',
    GRAFANA_SERVICE_ACCOUNT_TOKEN: 'mock-token',
    // Inyectamos explícitamente una variable que resuelva a endpoint inseguro plain http
    GRAFANA_MCP_ENDPOINT: 'http://insecure-remote-host.example.com/mcp',
  };

  const report = runMcpDoctor({
    rootDir: ROOT_DIR,
    env,
    cliProbeFn: () => ({ available: true, version: '1.0.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  const obsServer = report.servers.find((s) => s.id === 'observability-readonly');
  assert.ok(obsServer);
  assert.strictEqual(obsServer.connectivityStatus, 'INSECURE_REMOTE');
  assert.ok(obsServer.details.some((d) => d.includes('sin TLS')));
  assert.strictEqual(report.summary.connectivityMet, false);
  assert.strictEqual(report.overallValid, false);
});

test('🧪 MCP Doctor Unit: evaluateRemoteTransportUrl clasifica URLs estrictamente con new URL()', () => {
  // 1. Loopback legítimo IPv4, IPv6 y localhost
  const localCases = [
    'http://localhost:8080/mcp',
    'http://localhost/sse',
    'http://127.0.0.1:3000/sse',
    'http://127.0.0.2:9090/mcp',
    'http://[::1]:8080/mcp',
    'http://0.0.0.0:8080/mcp',
  ];
  for (const url of localCases) {
    const res = evaluateRemoteTransportUrl(url);
    assert.strictEqual(res.status, 'LOCAL', `Debe clasificar '${url}' como LOCAL`);
    assert.ok(res.detail.includes('loopback local verificado'));
  }

  // 2. Hostnames engañosos que contienen 'localhost' o '127.0.0.1' pero no son loopback
  const deceptiveCases = [
    'http://localhost.attacker.com/mcp',
    'http://127.0.0.1.attacker.example/mcp',
    'http://subdomain.localhost.evil.org/sse',
    'http://fake-localhost:8080/mcp',
  ];
  for (const url of deceptiveCases) {
    const res = evaluateRemoteTransportUrl(url);
    assert.strictEqual(
      res.status,
      'INSECURE_REMOTE',
      `Debe clasificar '${url}' como INSECURE_REMOTE y nunca como LOCAL`,
    );
    assert.ok(res.detail.includes('sin TLS'));
  }

  // 3. URLs malformadas o protocolos no permitidos
  const invalidCases = [
    'not-a-valid-url',
    'htp://broken-scheme.com',
    'ftp://localhost:21/mcp',
    'file:///etc/hosts',
    'javascript:alert(1)',
  ];
  for (const url of invalidCases) {
    const res = evaluateRemoteTransportUrl(url);
    assert.strictEqual(res.status, 'INVALID_URL', `Debe clasificar '${url}' como INVALID_URL`);
    assert.ok(res.detail.includes('inválida') || res.detail.includes('no soportado'));
  }

  // 4. Endpoints remotos legítimos: HTTPS vs HTTP
  const httpsRes = evaluateRemoteTransportUrl('https://telemetry.corp.internal/mcp');
  assert.strictEqual(httpsRes.status, 'SECURE');
  assert.ok(httpsRes.detail.includes('Transporte HTTPS declarado'));

  const httpRes = evaluateRemoteTransportUrl('http://telemetry.corp.internal/mcp');
  assert.strictEqual(httpRes.status, 'INSECURE_REMOTE');
  assert.ok(httpRes.detail.includes('sin TLS'));
});

test('🧪 MCP Doctor Unit: Servidor remoto con URL inválida reporta INVALID_URL, CONFIG_MISSING y bloquea overallValid', () => {
  const env: Record<string, string | undefined> = {
    GITHUB_PERSONAL_ACCESS_TOKEN: 'mock-token',
    SONAR_TOKEN: 'mock-token',
    GRAFANA_SERVICE_ACCOUNT_TOKEN: 'mock-token',
    // Inyectamos explícitamente una URL sintácticamente inválida
    GRAFANA_MCP_ENDPOINT: 'malformed_url_without_protocol',
  };

  const report = runMcpDoctor({
    rootDir: ROOT_DIR,
    env,
    cliProbeFn: () => ({ available: true, version: '1.0.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  const obsServer = report.servers.find((s) => s.id === 'observability-readonly');
  assert.ok(obsServer);
  assert.strictEqual(obsServer.connectivityStatus, 'INVALID_URL');
  assert.strictEqual(obsServer.state, 'CONFIG_MISSING');
  assert.ok(obsServer.details.some((d) => d.includes('inválida o malformada')));
  assert.strictEqual(report.summary.connectivityMet, false);
  assert.strictEqual(report.overallValid, false);
});
