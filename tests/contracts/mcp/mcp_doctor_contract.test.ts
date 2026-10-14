import test from 'node:test';
import assert from 'node:assert/strict';
import { runMcpDoctor, type ServerDiagnosis } from '../../../scripts/mcp/doctor.js';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * ==============================================================================
 * tests/contracts/mcp/mcp_doctor_contract.test.ts
 * ==============================================================================
 * Pruebas de contrato para la estructura, tipos y garantías del diagnóstico MCP.
 * ==============================================================================
 */

test('🛡️ MCP Contrato: El reporte de diagnóstico cumple con el esquema estructural completo', () => {
  const report = runMcpDoctor({ rootDir: ROOT_DIR });

  // 1. Estructura de primer nivel
  assert.strictEqual(typeof report.overallValid, 'boolean');
  assert.ok(report.summary && typeof report.summary === 'object');
  assert.ok(report.systemTools && typeof report.systemTools === 'object');
  assert.ok(Array.isArray(report.clientConfigs));
  assert.ok(Array.isArray(report.servers));
  assert.ok(Array.isArray(report.recommendations));

  // 2. Resumen de salud
  const s = report.summary;
  assert.strictEqual(typeof s.clientsInSync, 'boolean');
  assert.strictEqual(typeof s.dependenciesMet, 'boolean');
  assert.strictEqual(typeof s.configurationsMet, 'boolean');
  assert.strictEqual(typeof s.connectivityMet, 'boolean');
  assert.ok(s.totalServers > 0);
  assert.ok(s.enabledServers > 0);
  assert.strictEqual(s.readyServers + s.blockingServers, s.enabledServers);

  // 3. Herramientas críticas del sistema inspeccionadas
  assert.ok('node' in report.systemTools);
  assert.ok('docker' in report.systemTools);
  assert.ok('trivy' in report.systemTools);
  assert.ok('trivy-mcp' in report.systemTools);
  assert.ok('npx' in report.systemTools);

  // 4. Clientes soportados inspeccionados
  const supportedClients = ['cursor', 'vscode', 'claude', 'antigravity', 'generic'];
  const reportedClients = report.clientConfigs.map((c) => c.client);
  for (const client of supportedClients) {
    assert.ok(reportedClients.includes(client), `El cliente ${client} debe estar presente en el diagnóstico`);
  }

  // 5. Contrato de estados por cada servidor
  const validStates = ['READY', 'CONFIG_MISSING', 'DEPENDENCY_MISSING', 'DISABLED'];
  const validConfigStatuses = ['VALID', 'MISSING_ENV', 'NOT_APPLICABLE'];
  const validDepStatuses = ['MET', 'MISSING_TOOL', 'MISSING_PLUGIN', 'NOT_APPLICABLE'];
  const validConnStatuses = ['SECURE', 'INSECURE_REMOTE', 'UNRESOLVED_URL', 'LOCAL', 'INVALID_URL'];

  for (const srv of report.servers) {
    assert.ok(validStates.includes(srv.state), `Estado inválido en servidor ${srv.id}: ${srv.state}`);
    assert.ok(
      validConfigStatuses.includes(srv.configurationStatus),
      `configurationStatus inválido en servidor ${srv.id}: ${srv.configurationStatus}`,
    );
    assert.ok(
      validDepStatuses.includes(srv.dependenciesStatus),
      `dependenciesStatus inválido en servidor ${srv.id}: ${srv.dependenciesStatus}`,
    );
    assert.ok(
      validConnStatuses.includes(srv.connectivityStatus),
      `connectivityStatus inválido en servidor ${srv.id}: ${srv.connectivityStatus}`,
    );
    assert.ok(Array.isArray(srv.details) && srv.details.length > 0);
  }
});

test('🛡️ MCP Contrato: overallValid es estrictamente determinista respecto a sus componentes', () => {
  const report = runMcpDoctor({ rootDir: ROOT_DIR });
  const expectedValid =
    report.summary.clientsInSync &&
    report.summary.dependenciesMet &&
    report.summary.configurationsMet &&
    report.summary.connectivityMet;

  assert.strictEqual(
    report.overallValid,
    expectedValid,
    'overallValid debe coincidir exactamente con la conjunción de los 4 pilares de salud',
  );
});

test('🛡️ MCP Contrato: Servidores deshabilitados no bloquean dependenciesMet ni configurationsMet', () => {
  const report = runMcpDoctor({
    rootDir: ROOT_DIR,
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'token',
      SONAR_TOKEN: 'token',
      GRAFANA_SERVICE_ACCOUNT_TOKEN: 'token',
    },
    cliProbeFn: () => ({ available: true, version: '1.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  const k8sDisabled = report.servers.find((s: ServerDiagnosis) => s.id === 'k8s-platform-write');
  assert.ok(k8sDisabled);
  assert.strictEqual(k8sDisabled.state, 'DISABLED');
  assert.strictEqual(k8sDisabled.configurationStatus, 'NOT_APPLICABLE');
  assert.strictEqual(k8sDisabled.dependenciesStatus, 'NOT_APPLICABLE');

  // No debe penalizar la salud del entorno
  assert.strictEqual(report.summary.dependenciesMet, true);
  assert.strictEqual(report.summary.configurationsMet, true);
});

test('🛡️ MCP Contrato: Transporte remoto no admite falsos positivos, URLs malformadas ni dominios engañosos', () => {
  // 1. Inyección de dominio engañoso tipo 'localhost.attacker.com'
  const deceptiveReport = runMcpDoctor({
    rootDir: ROOT_DIR,
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'mock-token',
      SONAR_TOKEN: 'mock-token',
      GRAFANA_SERVICE_ACCOUNT_TOKEN: 'mock-token',
      GRAFANA_MCP_ENDPOINT: 'http://localhost.attacker.com/mcp',
    },
    cliProbeFn: () => ({ available: true, version: '1.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  const deceptiveServer = deceptiveReport.servers.find((s) => s.id === 'observability-readonly');
  assert.ok(deceptiveServer);
  assert.notStrictEqual(
    deceptiveServer.connectivityStatus,
    'LOCAL',
    'Un dominio engañoso que contiene localhost no debe ser considerado LOCAL',
  );
  assert.notStrictEqual(
    deceptiveServer.connectivityStatus,
    'SECURE',
    'Un endpoint HTTP sin TLS nunca debe ser considerado SECURE',
  );
  assert.strictEqual(deceptiveServer.connectivityStatus, 'INSECURE_REMOTE');
  assert.strictEqual(deceptiveReport.summary.connectivityMet, false);
  assert.strictEqual(deceptiveReport.overallValid, false);

  // 2. Inyección de URL malformada
  const malformedReport = runMcpDoctor({
    rootDir: ROOT_DIR,
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'mock-token',
      SONAR_TOKEN: 'mock-token',
      GRAFANA_SERVICE_ACCOUNT_TOKEN: 'mock-token',
      GRAFANA_MCP_ENDPOINT: 'htt://invalid_url_syntax:99999',
    },
    cliProbeFn: () => ({ available: true, version: '1.0' }),
    trivyPluginProbeFn: () => ({ installed: true }),
  });

  const malformedServer = malformedReport.servers.find((s) => s.id === 'observability-readonly');
  assert.ok(malformedServer);
  assert.strictEqual(malformedServer.connectivityStatus, 'INVALID_URL');
  assert.strictEqual(malformedServer.state, 'CONFIG_MISSING');
  assert.strictEqual(malformedReport.summary.connectivityMet, false);
  assert.strictEqual(malformedReport.overallValid, false);
});
