/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Contratos Arquitectónicos de ADRs, Observabilidad, Resiliencia y Gobernanza Monorepo
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🛡️ CI SAST Security: ci.yaml ejecuta Semgrep sobre scripts privilegiados (sin --exclude scripts)', () => {
  const ciPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  assert.ok(fs.existsSync(ciPath), 'ci.yaml debe existir');
  const content = fs.readFileSync(ciPath, 'utf-8');
  assert.equal(
    content.includes('--exclude scripts'),
    false,
    '.github/workflows/ci.yaml no debe excluir scripts del análisis SAST de Semgrep'
  );
});

test('🛡️ Tooling Governance: scripts/seal-secret.ts retirado en favor de ESO y Vault (CLN-002)', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/seal-secret.ts');
  assert.ok(!fs.existsSync(scriptPath), 'seal-secret.ts debe estar retirado tras adopción de ESO (ADR-005)');
});

test('🛡️ AI Contracts: apps/backend/src/services/ai.ts fuerza salida estructurada JSON en Gemini', () => {
  const aiServicePath = path.join(ROOT_DIR, 'apps/backend/src/services/ai.ts');
  assert.ok(fs.existsSync(aiServicePath), 'ai.ts debe existir');
  const content = fs.readFileSync(aiServicePath, 'utf-8');

  assert.ok(
    content.includes("responseMimeType: 'application/json'"),
    'ai.ts debe exigir responseMimeType application/json para garantizar contratos estructurados'
  );
  assert.ok(
    content.includes('mermaid_code'),
    'generateDiagram debe solicitar clave estructurada mermaid_code'
  );
  assert.ok(
    content.includes('html_code'),
    'generateMockup debe solicitar clave estructurada html_code'
  );
});

test('🛡️ Web Performance & Accesibilidad: lighthouserc.json define presupuestos estrictos para Core Web Vitals', () => {
  const lighthousercPath = path.join(ROOT_DIR, 'lighthouserc.json');
  assert.ok(fs.existsSync(lighthousercPath), 'lighthouserc.json debe existir en la raíz');
  const content = JSON.parse(fs.readFileSync(lighthousercPath, 'utf-8'));

  assert.ok(content.ci, 'lighthouserc.json debe tener sección ci');
  assert.ok(content.ci.assert?.assertions, 'lighthouserc.json debe definir assertions');
  assert.ok(
    content.ci.assert.assertions['categories:performance'],
    'Debe definir presupuesto mínimo para performance'
  );
  assert.ok(
    content.ci.assert.assertions['categories:accessibility'],
    'Debe definir presupuesto mínimo para accessibility'
  );
});

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
  assert.ok(
    serverContent.includes('pokedex_storage_status'),
    'metrics.ts debe exponer pokedex_storage_status'
  );
  assert.ok(
    alertsContent.includes('pokedex_storage_status == 0'),
    'alerts.yaml debe monitorear desconexión de base de datos'
  );

  assert.ok(
    serverContent.includes('pokedex_redis_status'),
    'server.ts debe exponer pokedex_redis_status'
  );
  assert.ok(
    alertsContent.includes('pokedex_redis_status == 0'),
    'alerts.yaml debe monitorear desconexión de Redis'
  );

  // Coherencia con métricas estándar HTTP y latencia
  assert.ok(
    serverContent.includes('http_requests_total'),
    'server.ts debe exponer http_requests_total estándar'
  );
  assert.ok(
    alertsContent.includes('http_requests_total'),
    'alerts.yaml debe evaluar tasa de errores sobre http_requests_total'
  );

  assert.ok(
    serverContent.includes('http_request_duration_seconds_bucket'),
    'server.ts debe exponer buckets de histograma para duración de requests'
  );
  assert.ok(
    alertsContent.includes('http_request_duration_seconds_bucket'),
    'alerts.yaml debe calcular percentil P99 con http_request_duration_seconds_bucket'
  );

  // Coherencia con disyuntor de IA (Gemini)
  assert.ok(
    serverContent.includes('pokedex_ai_circuit_breaker_open'),
    'server.ts debe exponer pokedex_ai_circuit_breaker_open'
  );
  assert.ok(
    alertsContent.includes('PokedexAICircuitBreakerOpen'),
    'alerts.yaml debe definir alerta PokedexAICircuitBreakerOpen'
  );
  assert.ok(
    alertsContent.includes('pokedex_ai_circuit_breaker_open == 1'),
    'alerts.yaml debe evaluar condición de circuito de IA abierto'
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
  assert.ok(smContent.includes('apiVersion: monitoring.coreos.com/v1'), 'Debe usar apiVersion monitoring.coreos.com/v1');
  assert.ok(smContent.includes('path: /metrics'), 'Debe apuntar a /metrics');

  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.match(adrContent, /## Estado\s+Aceptado/, 'ADR-007 debe estar aceptado');

  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  assert.ok(valuesContent.includes('serviceMonitor:'), 'values.yaml debe declarar serviceMonitor');

  const valuesProdContent = fs.readFileSync(valuesProdPath, 'utf-8');
  assert.ok(valuesProdContent.includes('enabled: true'), 'values.prod.yaml debe tener serviceMonitor habilitado');
});

test('🛡️ CI Tooling Parity: infra.yaml y ci.yaml mantienen paridad estricta de versión de Helm en todos sus jobs', () => {
  const infraWorkflowPath = path.join(ROOT_DIR, '.github/workflows/infra.yaml');
  const ciWorkflowPath = path.join(ROOT_DIR, '.github/workflows/ci.yaml');
  const toolVersionsPath = path.join(ROOT_DIR, '.tool-versions');

  assert.ok(fs.existsSync(infraWorkflowPath), 'infra.yaml debe existir');
  assert.ok(fs.existsSync(ciWorkflowPath), 'ci.yaml debe existir');
  assert.ok(fs.existsSync(toolVersionsPath), '.tool-versions debe existir');

  const infraContent = fs.readFileSync(infraWorkflowPath, 'utf-8');
  const ciContent = fs.readFileSync(ciWorkflowPath, 'utf-8');
  const toolVersionsContent = fs.readFileSync(toolVersionsPath, 'utf-8');

  // Extraer versión de Helm esperada de .tool-versions (ej. 3.17.0)
  const helmVersionMatch = toolVersionsContent.match(/helm\s+(\S+)/);
  assert.ok(helmVersionMatch, 'Debe encontrarse versión de Helm en .tool-versions');
  const expectedHelmVersion = `v${helmVersionMatch[1]}`;

  // Extraer todas las versiones configuradas para setup-helm en infra.yaml y ci.yaml
  const infraVersions = Array.from(infraContent.matchAll(/uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g)).map(m => m[1]);
  assert.ok(infraVersions.length >= 2, 'infra.yaml debe configurar Helm en al menos 2 jobs (validate-iac y kind-integration)');

  const ciVersions = Array.from(ciContent.matchAll(/uses:\s*azure\/setup-helm[^\n]*\n\s+with:\s*\n\s+version:\s*['"]?(v\d+\.\d+\.\d+)['"]?/g)).map(m => m[1]);
  assert.ok(ciVersions.length >= 1, 'ci.yaml debe configurar Helm en el job publish');

  const allVersions = [...infraVersions, ...ciVersions];
  for (const ver of allVersions) {
    assert.equal(
      ver,
      expectedHelmVersion,
      `Cada workflow de CI (infra.yaml, ci.yaml) debe utilizar Helm ${expectedHelmVersion} para garantizar paridad inmutable`
    );
  }
});

test('🛡️ Excelencia Operacional: docs/operations/observability-alerts.md cubre todas las alertas de alerts.yaml', () => {
  const alertsPath = path.join(ROOT_DIR, 'infra/monitoring/alerts.yaml');
  const runbookPath = path.join(ROOT_DIR, 'docs/operations/observability-alerts.md');

  assert.ok(fs.existsSync(alertsPath), 'alerts.yaml debe existir');
  assert.ok(fs.existsSync(runbookPath), 'observability-alerts.md debe existir');

  const alertsContent = fs.readFileSync(alertsPath, 'utf-8');
  const runbookContent = fs.readFileSync(runbookPath, 'utf-8');

  // Extraer nombres de alertas de alerts.yaml
  const alertMatches = Array.from(alertsContent.matchAll(/alert:\s*([A-Za-z0-9_-]+)/g)).map(m => m[1]);
  assert.ok(alertMatches.length > 0, 'alerts.yaml debe contener al menos una alerta');

  for (const alertName of alertMatches) {
    assert.ok(
      runbookContent.includes(alertName),
      `El runbook de observabilidad debe documentar el procedimiento de respuesta para la alerta ${alertName}`
    );
  }
});

test('🛡️ Gobernanza & Documentación: README.md y docs/README.md documentan Matriz de Estado y enlazan Runbooks y ADRs', () => {
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(readmePath), 'README.md debe existir');
  assert.ok(fs.existsSync(docsReadmePath), 'docs/README.md debe existir');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');

  // Matriz de estado en README.md
  assert.ok(
    readmeContent.includes('Matriz de Estado y Nivel de Soporte de Componentes'),
    'README.md debe contener la Matriz de Estado y Nivel de Soporte de Componentes'
  );
  assert.ok(readmeContent.includes('Kubernetes (K3s on-premise / cloud gestionado)'), 'Matriz debe listar Kubernetes');
  assert.ok(readmeContent.includes('Helm 3 (OCI Artifacts)'), 'Matriz debe listar Helm 3');
  assert.ok(readmeContent.includes('ArgoCD (GitOps)'), 'Matriz debe listar ArgoCD');
  assert.ok(readmeContent.includes('OpenTofu 1.8+'), 'Matriz debe listar OpenTofu');

  // Enlaces a Observabilidad y ADR-007
  assert.ok(readmeContent.includes('docs/operations/observability-alerts.md'), 'README.md debe enlazar observability-alerts.md');
  assert.ok(readmeContent.includes('docs/decisions/ADR-007-observability-and-metrics.md'), 'README.md debe enlazar ADR-007');

  assert.ok(docsReadmeContent.includes('observability-alerts.md'), 'docs/README.md debe enlazar observability-alerts.md');
  assert.ok(docsReadmeContent.includes('ADR-007-observability-and-metrics.md'), 'docs/README.md debe enlazar ADR-007');
});

test('🛡️ Supply Chain Security: ADR-008 formaliza inmutabilidad, Cosign Keyless, SLSA L3 y Kyverno', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-008-supply-chain-security.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-008 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-008 debe estar aceptado');
  assert.ok(adrContent.includes('Digest Pinning'), 'ADR-008 debe definir Digest Pinning');
  assert.ok(adrContent.includes('CycloneDX'), 'ADR-008 debe definir CycloneDX SBOM');
  assert.ok(adrContent.includes('Cosign'), 'ADR-008 debe definir Cosign Keyless');
  assert.ok(adrContent.includes('SLSA'), 'ADR-008 debe definir SLSA Provenance');
  assert.ok(adrContent.includes('Kyverno'), 'ADR-008 debe definir control de admisión Kyverno');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-008-supply-chain-security.md'), 'README.md debe enlazar ADR-008');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-008-supply-chain-security.md'), 'docs/README.md debe enlazar ADR-008');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});

test('🛡️ AI Resilience & Contratos: ADR-009 formaliza Gemini 2.5 Flash, Circuit Breaker y fallback determinista', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-009-ai-resilience-and-contracts.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-009 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-009 debe estar aceptado');
  assert.ok(adrContent.includes('GoogleGenAI'), 'ADR-009 debe documentar SDK oficial @google/genai');
  assert.ok(adrContent.includes('gemini-2.5-flash'), 'ADR-009 debe documentar modelo gemini-2.5-flash');
  assert.ok(adrContent.includes('responseMimeType: \'application/json\''), 'ADR-009 debe documentar modo estructurado JSON');
  assert.ok(adrContent.includes('AICircuitBreaker'), 'ADR-009 debe documentar patrón Circuit Breaker');
  assert.ok(adrContent.includes('getSemanticCacheKey'), 'ADR-009 debe documentar caché semántica en Redis');
  assert.ok(adrContent.includes('sanitizePrompt'), 'ADR-009 debe documentar sanitización contra prompt injection');
  assert.ok(adrContent.includes('getDeterministicDiagram'), 'ADR-009 debe documentar fallback determinista local');
  assert.ok(adrContent.includes('pokedex_ai_circuit_breaker_open'), 'ADR-009 debe documentar métricas de observabilidad en /metrics');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-009-ai-resilience-and-contracts.md'), 'README.md debe enlazar ADR-009');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-009-ai-resilience-and-contracts.md'), 'docs/README.md debe enlazar ADR-009');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  // Validar que los 9 ADRs existen físicamente en disco
  for (let i = 1; i <= 9; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Autenticación & Sesiones: ADR-010 formaliza doble capa, timingSafeEqual y revocación fail-closed', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-010-authentication-and-session-management.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-010 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-010 debe estar aceptado');
  assert.ok(adrContent.includes('timingSafeEqual'), 'ADR-010 debe documentar mitigación timing attacks con timingSafeEqual');
  assert.ok(adrContent.includes('ADMIN_SESSION_SECRET'), 'ADR-010 debe documentar desacoplamiento de ADMIN_SESSION_SECRET');
  assert.ok(adrContent.includes('fail-closed') || adrContent.includes('Fail-Closed'), 'ADR-010 debe documentar revocación fail-closed');
  assert.ok(adrContent.includes('pokedex:revoked:') || adrContent.includes('jti'), 'ADR-010 debe documentar revocación distribuida con jti en Redis');
  assert.ok(adrContent.includes('POST /api/v1/auth/session'), 'ADR-010 debe documentar endpoint de emisión de sesiones');
  assert.ok(adrContent.includes('POST /api/v1/auth/logout'), 'ADR-010 debe documentar endpoint de revocación/logout');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-010-authentication-and-session-management.md'), 'README.md debe enlazar ADR-010');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-010-authentication-and-session-management.md'), 'docs/README.md debe enlazar ADR-010');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  // Validar que los 10 ADRs existen físicamente en disco
  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Persistencia & Migraciones: ADR-011 formaliza Drizzle ORM, PgBouncer y secuencias atómicas', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-011 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-011 debe estar aceptado');
  assert.ok(adrContent.includes('Drizzle ORM'), 'ADR-011 debe documentar Drizzle ORM');
  assert.ok(adrContent.includes('PgBouncer'), 'ADR-011 debe documentar PgBouncer');
  assert.ok(adrContent.includes('pokedex_id_seq'), 'ADR-011 debe documentar secuencia atómica pokedex_id_seq');
  assert.ok(adrContent.includes('pokedex_entries'), 'ADR-011 debe documentar tabla pokedex_entries');
  assert.ok(adrContent.includes('JSONB'), 'ADR-011 debe documentar modelo híbrido JSONB');
  assert.ok(adrContent.includes('pool_mode = transaction') || adrContent.includes('transaction'), 'ADR-011 debe documentar pooling en modo transacción');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-011-persistence-drizzle-orm-and-pgbouncer.md'), 'README.md debe enlazar ADR-011');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-011-persistence-drizzle-orm-and-pgbouncer.md'), 'docs/README.md debe enlazar ADR-011');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  // Validar que los 11 ADRs existen físicamente en disco
  for (let i = 1; i <= 11; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Excelencia Operacional & Gobernanza: docs/operations/ contiene 7 SOPs estandarizados e indexados en docs/README.md', () => {
  const operationsDir = path.join(ROOT_DIR, 'docs/operations');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(operationsDir), 'docs/operations/ debe existir');
  assert.ok(fs.existsSync(docsReadmePath), 'docs/README.md debe existir');

  const expectedRunbooks = [
    'observability-alerts.md',
    'backup-restore.md',
    'deployment.md',
    'incident-response.md',
    'kubernetes-troubleshooting.md',
    'rollback.md',
    'secret-rotation.md',
  ];

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');

  for (const file of expectedRunbooks) {
    const filePath = path.join(operationsDir, file);
    assert.ok(fs.existsSync(filePath), `Runbook ${file} debe existir en docs/operations/`);

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.startsWith('# '), `Runbook ${file} debe comenzar con título H1`);
    assert.ok(
      !/\n## [^\n]+\n[^\n\r#\s]/.test(content),
      `Runbook ${file} debe respetar espaciado MD022 tras encabezados H2`
    );

    assert.ok(
      docsReadmeContent.includes(file),
      `docs/README.md debe indexar y enlazar ${file}`
    );
  }

  // Validar que el diagrama Mermaid contiene los 7 nodos de operaciones y R5 en runbooks
  assert.ok(docsReadmeContent.includes('RUN --> R5["📋 DISASTER_RECOVERY_PLAN.md"]'), 'Mermaid debe enlazar R5 DISASTER_RECOVERY_PLAN');
  for (let i = 1; i <= 7; i++) {
    assert.ok(
      docsReadmeContent.includes(`OP${i}`),
      `Mermaid en docs/README.md debe contener nodo OP${i}`
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
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-018 debe estar en estado Aceptado');

  // 2. ADR-018 documenta W3C traceparent y OpenTelemetry
  assert.ok(
    adrContent.includes('OpenTelemetry') || adrContent.includes('OTel'),
    'ADR-018 debe documentar OpenTelemetry'
  );
  assert.ok(
    adrContent.includes('W3C Trace Context') || adrContent.includes('traceparent'),
    'ADR-018 debe documentar W3C Trace Context traceparent'
  );
  assert.ok(
    adrContent.includes('requestTracer'),
    'ADR-018 debe documentar middleware requestTracer'
  );
  assert.ok(
    adrContent.includes('Loki') || adrContent.includes('Tempo'),
    'ADR-018 debe documentar correlación con Loki o Tempo'
  );

  // 3. Helm declara variables OTel
  const configmapContent = fs.readFileSync(helmConfigmapPath, 'utf-8');
  assert.ok(configmapContent.includes('OTEL_EXPORTER_OTLP_ENDPOINT'), 'configmap.yaml debe declarar OTEL_EXPORTER_OTLP_ENDPOINT');
  assert.ok(configmapContent.includes('OTEL_SERVICE_NAME'), 'configmap.yaml debe declarar OTEL_SERVICE_NAME');

  const valuesContent = fs.readFileSync(helmValuesPath, 'utf-8');
  assert.ok(valuesContent.includes('otelEndpoint'), 'values.yaml debe declarar otelEndpoint');

  // 4. request-tracer.ts y logger.ts implementan W3C traceparent y AsyncLocalStorage
  const tracerContent = fs.readFileSync(requestTracerPath, 'utf-8');
  assert.ok(tracerContent.includes('traceparent'), 'request-tracer.ts debe manejar cabecera traceparent');
  assert.ok(tracerContent.includes('W3C_TRACEPARENT_REGEX') || tracerContent.includes('traceparent'), 'request-tracer.ts debe validar formato W3C');

  const loggerContent = fs.readFileSync(loggerPath, 'utf-8');
  assert.ok(loggerContent.includes('spanId') || loggerContent.includes('traceparent'), 'logger.ts debe incluir spanId/traceparent en LogTraceContext');

  // 5. Test funcional de requestTracer con W3C Trace Context
  const tracerMod: any = fs.existsSync(path.join(ROOT_DIR, 'apps/backend/src/middleware/request-tracer.js'))
    ? await import('../../apps/backend/src/middleware/request-tracer.js')
    : await import('../../apps/backend/src/middleware/request-tracer.ts');
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
  assert.ok(headersSet['traceparent'], 'requestTracer debe emitir cabecera traceparent');
  assert.ok(
    headersSet['traceparent'].startsWith('00-4bf92f3577b34da6a3ce929d0e0e4736-'),
    'requestTracer debe preservar el traceId W3C entrante'
  );
  assert.ok(headersSet['x-request-id'], 'requestTracer debe emitir cabecera X-Request-Id');

  // 6. README.md y docs/README.md enlazan ADR-018
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-018-opentelemetry-distributed-tracing-and-w3c.md'), 'README.md debe enlazar ADR-018');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-018-opentelemetry-distributed-tracing-and-w3c.md'), 'docs/README.md debe enlazar ADR-018');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  // 7. Los 18 ADRs existen físicamente en disco
  for (let i = 1; i <= 18; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Orquestación de Monorepo: ADR-019 (Turborepo) está retirado y no quedan restos de la herramienta', async () => {
  const decisionsDir = path.join(ROOT_DIR, 'docs/decisions');
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  const decisionsIndex = fs.readFileSync(path.join(decisionsDir, 'README.md'), 'utf-8');

  // 1. El ADR retirado no conserva archivo (convención de ADR retirados) y consta en el índice
  assert.ok(
    !fs.readdirSync(decisionsDir).some((f: string) => f.startsWith('ADR-019')),
    'ADR-019 retirado no debe tener archivo en docs/decisions/'
  );
  assert.match(decisionsIndex, /\*\*ADR-019\*\*[^\n]*\*\*Retirado\*\*/, 'ADR-019 debe constar como Retirado en el índice');

  // 2. Sin restos de Turborepo en configuración ni scripts
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'turbo.json')), 'turbo.json no debe existir');
  assert.ok(!packageJson.devDependencies?.turbo, 'package.json no debe declarar turbo');
  assert.ok(
    !Object.keys(packageJson.scripts ?? {}).some((name) => name.endsWith(':turbo')),
    'package.json no debe exponer scripts :turbo'
  );
  assert.ok(!taskfileContent.includes('turbo:'), 'Taskfile.yaml no debe exponer tareas turbo');

  // 3. npm workspaces sigue siendo el orquestador canónico
  assert.ok(packageJson.packageManager?.startsWith('npm@'), 'package.json debe declarar packageManager npm');
  assert.ok(Array.isArray(packageJson.workspaces) && packageJson.workspaces.length > 0, 'package.json debe declarar workspaces');

  // 4. Los ADR activos contiguos hasta ADR-018 siguen existiendo en disco
  const files = fs.readdirSync(decisionsDir);
  for (let i = 1; i <= 18; i++) {
    const num = String(i).padStart(3, '0');
    assert.ok(files.some((f: string) => f.startsWith(`ADR-${num}`)), `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Gobernanza de Despliegue: ADR-020 formaliza CLI canónico con Taskfile, retiro de scripts legados y lista blanca', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-020-unified-deployment-governance-and-script-retirement.md');
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-020 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-020 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-020 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('Taskfile.yaml'), 'ADR-020 debe documentar Taskfile.yaml como interfaz canónica');
  assert.ok(adrContent.includes('dr_verify_restore.sh'), 'ADR-020 debe inventariar dr_verify_restore.sh');
  assert.ok(adrContent.includes('governance:audit-scripts'), 'ADR-020 debe documentar governance:audit-scripts');

  // 2. Lista blanca estricta de scripts .sh en todo el monorepo
  const allowedShScripts = ['scripts/dr_verify_restore.sh'];
  const findSh = (dir: string): string[] => {
    let results: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (['node_modules', '.git', 'dist', 'coverage', '.turbo', 'tmp'].includes(file)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        results = results.concat(findSh(fullPath));
      } else if (file.endsWith('.sh')) {
        results.push(path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/'));
      }
    }
    return results;
  };
  const actualShScripts = findSh(ROOT_DIR);
  const unauthorizedSh = actualShScripts.filter(s => !allowedShScripts.includes(s));
  assert.equal(
    unauthorizedSh.length,
    0,
    `No se permiten scripts shell fuera de la lista blanca autorizada. No autorizados: ${unauthorizedSh.join(', ')}`
  );

  // 3. Prohibición expresa de scripts imperativos de despliegue ad-hoc
  const forbiddenPatterns = ['deploy.sh', 'proxmox_deploy.sh', 'deploy_aws.sh', 'deploy_proxmox.sh', 'deploy_app.sh'];
  for (const forbidden of forbiddenPatterns) {
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, forbidden)),
      false,
      `Script prohibido no debe existir en la raíz: ${forbidden}`
    );
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, 'scripts', forbidden)),
      false,
      `Script prohibido no debe existir en scripts/: ${forbidden}`
    );
  }

  // 4. Taskfile.yaml expone tareas canónicas de ciclo de vida y gobernanza
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfileContent.includes('governance:audit-scripts:'), 'Taskfile.yaml debe definir governance:audit-scripts');
  assert.ok(taskfileContent.includes('k8s:up:'), 'Taskfile.yaml debe definir k8s:up');
  assert.ok(taskfileContent.includes('gitops:sync:cloud:'), 'Taskfile.yaml debe definir gitops:sync:cloud');
  assert.ok(taskfileContent.includes('gitops:sync:preprod:'), 'Taskfile.yaml debe definir gitops:sync:preprod');
  assert.equal(taskfileContent.includes('gitops:sync:proxmox:'), false, 'Taskfile.yaml no debe definir el alias legado gitops:sync:proxmox (retirado según ADR-020)');

  // 5. package.json incluye script de auditoría
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  assert.ok(packageJson.scripts?.['governance:audit-scripts'], 'package.json debe definir governance:audit-scripts');

  // 6. deployment.md referencia ADR-020 y Taskfile
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('ADR-020'), 'deployment.md debe enlazar ADR-020');
  assert.ok(deploymentContent.includes('task governance:audit-scripts'), 'deployment.md debe documentar task governance:audit-scripts');

  // 7. README.md y docs/README.md enlazan ADR-020
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'), 'README.md debe enlazar ADR-020');
  assert.ok(docsReadmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'), 'docs/README.md debe enlazar ADR-020');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  // 8. Los ADR activos hasta el 020 existen físicamente en disco (ADR-019 está retirado)
  for (let i = 1; i <= 20; i++) {
    if (i === 19) continue;
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find((f: string) => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Resiliencia & Deuda de Código: ADR-027 formaliza convergencia en frontend y contratos Fail-Open vs Fail-Closed', () => {
  const adr27Path = path.join(ROOT_DIR, 'docs/decisions/ADR-027-resilience-fail-open-vs-fail-closed-contracts.md');
  const specPath = path.join(ROOT_DIR, 'docs/architecture/FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  // 1. Documentos arquitectónicos existen y están en estado Aceptado
  assert.ok(fs.existsSync(adr27Path), 'ADR-027 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adr27Path, 'utf-8');
  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-027 debe estar en estado Aceptado');
  assert.ok(adrContent.includes('Fail-Closed (Seguridad & Integridad)'), 'ADR-027 debe documentar políticas Fail-Closed');
  assert.ok(adrContent.includes('Fail-Open (Disponibilidad)'), 'ADR-027 debe documentar políticas Fail-Open');

  assert.ok(fs.existsSync(specPath), 'FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md debe existir');
  const specContent = fs.readFileSync(specPath, 'utf-8');
  assert.ok(specContent.includes('requireWritableStorage'), 'Debe especificar requireWritableStorage');
  assert.ok(specContent.includes('isJtiRevokedInRedis'), 'Debe especificar isJtiRevokedInRedis');
  assert.ok(specContent.includes('failClosedOnRedisOutage'), 'Debe especificar failClosedOnRedisOutage');
  assert.ok(specContent.includes('invalidateCache'), 'Debe especificar invalidateCache');

  // 2. docs/README.md enlaza ADR-027 y FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md
  const docsReadme = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadme.includes('ADR-027-resilience-fail-open-vs-fail-closed-contracts.md'), 'docs/README.md debe enlazar ADR-027');
  assert.ok(docsReadme.includes('FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md'), 'docs/README.md debe enlazar FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md');

  // 3. Frontend: Módulos compartidos existen y contienen utilidades esperadas
  const sharedDir = path.join(ROOT_DIR, 'apps/frontend/src/shared');
  assert.ok(fs.existsSync(sharedDir), 'Directorio apps/frontend/src/shared debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'constants.ts')), 'constants.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'formatters.ts')), 'formatters.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'ui.ts')), 'ui.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'api.ts')), 'api.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'index.ts')), 'index.ts debe existir');

  const constantsContent = fs.readFileSync(path.join(sharedDir, 'constants.ts'), 'utf-8');
  assert.ok(constantsContent.includes('export const TYPE_COLORS'), 'constants.ts debe exportar TYPE_COLORS');

  const formattersContent = fs.readFileSync(path.join(sharedDir, 'formatters.ts'), 'utf-8');
  assert.ok(formattersContent.includes('export function normalizeStr'), 'formatters.ts debe exportar normalizeStr');
  assert.ok(formattersContent.includes('export function getTypeColor'), 'formatters.ts debe exportar getTypeColor');
  assert.ok(formattersContent.includes('export function formatPokemonId'), 'formatters.ts debe exportar formatPokemonId');

  const uiContent = fs.readFileSync(path.join(sharedDir, 'ui.ts'), 'utf-8');
  assert.ok(uiContent.includes('export function showToast'), 'ui.ts debe exportar showToast');
  assert.ok(uiContent.includes('export function renderTypeBadge'), 'ui.ts debe exportar renderTypeBadge');

  const apiContent = fs.readFileSync(path.join(sharedDir, 'api.ts'), 'utf-8');
  assert.ok(apiContent.includes('export async function fetchPokemonsWithCount'), 'api.ts debe exportar fetchPokemonsWithCount');
  assert.ok(apiContent.includes('export async function loginWithApiKey'), 'api.ts debe exportar loginWithApiKey');

  // 4. Frontend: pokedex.ts y backoffice.ts consumen módulos compartidos sin duplicar constantes
  const pokedexTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/frontend/src/pokedex.ts'), 'utf-8');
  const backofficeTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/frontend/src/backoffice.ts'), 'utf-8');

  assert.ok(pokedexTs.includes("from './shared/index.js'"), "pokedex.ts debe importar desde './shared/index.js'");
  assert.ok(!pokedexTs.includes('const TYPE_COLORS: Record<string, string>'), 'pokedex.ts no debe duplicar TYPE_COLORS localmente');

  assert.ok(backofficeTs.includes("from './shared/index.js'"), "backoffice.ts debe importar desde './shared/index.js'");
  assert.ok(!backofficeTs.includes('const TYPE_COLORS: Record<string, string>'), 'backoffice.ts no debe duplicar TYPE_COLORS localmente');

  // 5. Backend: Contratos de resiliencia alineados en código
  const serverTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/server.ts'), 'utf-8');
  const rateLimiterTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/middleware/rate-limiter.ts'), 'utf-8');
  const authTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/services/auth.ts'), 'utf-8');
  const dbTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/services/db.ts'), 'utf-8');

  assert.ok(rateLimiterTs.includes('failClosedOnRedisOutage: true'), 'rate-limiter.ts debe configurar limitadores de IA con failClosedOnRedisOutage: true');
  assert.ok(serverTs.includes('requireWritableStorage'), 'server.ts debe utilizar requireWritableStorage para mutaciones');
  assert.ok(authTs.includes("reason: 'service_unavailable'"), 'auth.ts debe implementar Fail-Closed en verificación de sesión cuando Redis está caído');
  assert.ok(dbTs.includes('invalidateCache'), 'db.ts debe implementar invalidateCache con versionado atómico');
});
