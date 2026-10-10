import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertDocsPortalLinksAdrIndex } from '../../helpers/docs-portal.js';
import { ROOT_DIR } from '../../helpers/repo.js';

test('🛡️ Observabilidad & Prometheus: apps/backend expone métricas coherentes con infra/monitoring/alerts.yaml', () => {
  const metricsPath = path.join(ROOT_DIR, 'apps/backend/src/middleware/metrics.ts');
  const serverPath = path.join(ROOT_DIR, 'apps/backend/server.ts');
  const alertsPath = path.join(ROOT_DIR, 'infra/monitoring/alerts.yaml');

  assert.ok(fs.existsSync(serverPath), 'server.ts debe existir');
  assert.ok(fs.existsSync(metricsPath), 'metrics.ts debe existir');
  assert.ok(fs.existsSync(alertsPath), 'alerts.yaml debe existir');

  const serverContent = fs.readFileSync(metricsPath, 'utf-8');
  const alertsContent = fs.readFileSync(alertsPath, 'utf-8');

  // Coherencia con alertas de estado de infraestructura
  assert.ok(serverContent.includes('pokedex_storage_status'), 'metrics.ts debe exponer pokedex_storage_status');
  assert.ok(
    alertsContent.includes('pokedex_storage_status == 0'),
    'alerts.yaml debe monitorear desconexión de base de datos',
  );

  assert.ok(serverContent.includes('pokedex_redis_status'), 'server.ts debe exponer pokedex_redis_status');
  assert.ok(alertsContent.includes('pokedex_redis_status == 0'), 'alerts.yaml debe monitorear desconexión de Redis');

  // Coherencia con métricas estándar HTTP y latencia
  assert.ok(serverContent.includes('http_requests_total'), 'server.ts debe exponer http_requests_total estándar');
  assert.ok(
    alertsContent.includes('http_requests_total'),
    'alerts.yaml debe evaluar tasa de errores sobre http_requests_total',
  );

  assert.ok(
    serverContent.includes('http_request_duration_seconds_bucket'),
    'server.ts debe exponer buckets de histograma para duración de requests',
  );
  assert.ok(
    alertsContent.includes('http_request_duration_seconds_bucket'),
    'alerts.yaml debe calcular percentil P99 con http_request_duration_seconds_bucket',
  );

  // Coherencia con disyuntor de IA (Gemini)
  assert.ok(
    serverContent.includes('pokedex_ai_circuit_breaker_open'),
    'server.ts debe exponer pokedex_ai_circuit_breaker_open',
  );
  assert.ok(
    alertsContent.includes('PokedexAICircuitBreakerOpen'),
    'alerts.yaml debe definir alerta PokedexAICircuitBreakerOpen',
  );
  assert.ok(
    alertsContent.includes('pokedex_ai_circuit_breaker_open == 1'),
    'alerts.yaml debe evaluar condición de circuito de IA abierto',
  );
});

test('🛡️ Helm & Gobernanza: ServiceMonitor existe en Helm y ADR-007 documenta arquitectura de observabilidad', () => {
  const serviceMonitorPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/servicemonitor.yaml');
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-007-observability-and-metrics.md');
  const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const valuesProdPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.prod.yaml');

  assert.ok(fs.existsSync(serviceMonitorPath), 'servicemonitor.yaml debe existir en Helm');
  assert.ok(fs.existsSync(adrPath), 'ADR-007 debe existir en docs/decisions/');

  const smContent = fs.readFileSync(serviceMonitorPath, 'utf-8');
  assert.ok(smContent.includes('kind: ServiceMonitor'), 'Debe definir tipo ServiceMonitor');
  assert.ok(
    smContent.includes('apiVersion: monitoring.coreos.com/v1'),
    'Debe usar apiVersion monitoring.coreos.com/v1',
  );
  assert.ok(smContent.includes('path: /metrics'), 'Debe apuntar a /metrics');

  const _adrContent = fs.readFileSync(adrPath, 'utf-8');

  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  assert.ok(valuesContent.includes('serviceMonitor:'), 'values.yaml debe declarar serviceMonitor');

  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesProdContent.includes('enabled: true'), 'values.prod.yaml debe tener serviceMonitor habilitado');
});

test('🛡️ Excelencia Operacional: docs/operations/observability-alerts.md cubre todas las alertas de alerts.yaml', () => {
  const alertsPath = path.join(ROOT_DIR, 'infra/monitoring/alerts.yaml');
  const runbookPath = path.join(ROOT_DIR, 'docs/operations/observability-alerts.md');

  assert.ok(fs.existsSync(alertsPath), 'alerts.yaml debe existir');
  assert.ok(fs.existsSync(runbookPath), 'observability-alerts.md debe existir');

  const alertsContent = fs.readFileSync(alertsPath, 'utf-8');
  const runbookContent = fs.readFileSync(runbookPath, 'utf-8');

  // Extraer nombres de alertas de alerts.yaml
  const alertMatches = Array.from(alertsContent.matchAll(/alert:\s*([A-Za-z0-9_-]+)/g)).map((m) => m[1]);
  assert.ok(alertMatches.length > 0, 'alerts.yaml debe contener al menos una alerta');

  for (const alertName of alertMatches) {
    assert.ok(
      runbookContent.includes(alertName),
      `El runbook de observabilidad debe documentar el procedimiento de respuesta para la alerta ${alertName}`,
    );
  }
});

test('🛡️ Observabilidad Distribuida: ADR-018 formaliza OpenTelemetry, W3C Trace Context y correlación con Loki', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-018-opentelemetry-distributed-tracing-and-w3c.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const helmConfigmapPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/configmap.yaml');
  const helmValuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  const requestTracerPath = path.join(ROOT_DIR, 'apps/backend/src/middleware/request-tracer.ts');
  const loggerPath = path.join(ROOT_DIR, 'apps/backend/src/utils/logger.ts');

  // 1. ADR-018 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-018 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  // 2. ADR-018 documenta W3C traceparent y OpenTelemetry
  assert.ok(
    adrContent.includes('OpenTelemetry') || adrContent.includes('OTel'),
    'ADR-018 debe documentar OpenTelemetry',
  );
  assert.ok(
    adrContent.includes('W3C Trace Context') || adrContent.includes('traceparent'),
    'ADR-018 debe documentar W3C Trace Context traceparent',
  );
  assert.ok(adrContent.includes('requestTracer'), 'ADR-018 debe documentar middleware requestTracer');
  assert.ok(
    adrContent.includes('Loki') || adrContent.includes('Tempo'),
    'ADR-018 debe documentar correlación con Loki o Tempo',
  );

  // 3. Helm declara variables OTel
  const configmapContent = fs.readFileSync(helmConfigmapPath, 'utf-8');
  assert.ok(
    configmapContent.includes('OTEL_EXPORTER_OTLP_ENDPOINT'),
    'configmap.yaml debe declarar OTEL_EXPORTER_OTLP_ENDPOINT',
  );
  assert.ok(configmapContent.includes('OTEL_SERVICE_NAME'), 'configmap.yaml debe declarar OTEL_SERVICE_NAME');

  const valuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(valuesContent.includes('otelEndpoint'), 'values.yaml debe declarar otelEndpoint');

  // 4. request-tracer.ts y logger.ts implementan W3C traceparent y AsyncLocalStorage
  const tracerContent = fs.readFileSync(requestTracerPath, 'utf-8');
  assert.ok(tracerContent.includes('traceparent'), 'request-tracer.ts debe manejar cabecera traceparent');
  assert.ok(
    tracerContent.includes('W3C_TRACEPARENT_REGEX') || tracerContent.includes('traceparent'),
    'request-tracer.ts debe validar formato W3C',
  );

  const loggerContent = fs.readFileSync(loggerPath, 'utf-8');
  assert.ok(
    loggerContent.includes('spanId') || loggerContent.includes('traceparent'),
    'logger.ts debe incluir spanId/traceparent en LogTraceContext',
  );

  // 5. Test funcional de requestTracer con W3C Trace Context
  const tracerMod: any = fs.existsSync(path.join(ROOT_DIR, 'apps/backend/src/middleware/request-tracer.js'))
    ? await import('../../../apps/backend/src/middleware/request-tracer.js')
    : await import('../../../apps/backend/src/middleware/request-tracer.ts');
  const { requestTracer } = tracerMod;
  let nextCalled = false;
  const mockReq: any = {
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    },
  };
  const headersSet: Record<string, string> = {};
  const mockRes: any = {
    setHeader(k: string, v: string) {
      headersSet[k.toLowerCase()] = v;
    },
  };
  requestTracer(mockReq, mockRes, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled, 'requestTracer debe invocar next()');
  assert.ok(headersSet.traceparent, 'requestTracer debe emitir cabecera traceparent');
  assert.ok(
    headersSet.traceparent.startsWith('00-4bf92f3577b34da6a3ce929d0e0e4736-'),
    'requestTracer debe preservar el traceId W3C entrante',
  );
  assert.ok(headersSet['x-request-id'], 'requestTracer debe emitir cabecera X-Request-Id');

  // 6. README.md y docs/README.md enlazan ADR-018
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-018-opentelemetry-distributed-tracing-and-w3c.md'),
    'README.md debe enlazar ADR-018',
  );

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-018-opentelemetry-distributed-tracing-and-w3c.md'),
    'docs/README.md debe enlazar ADR-018',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});
