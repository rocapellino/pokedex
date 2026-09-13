import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('🛡️ Operación: Kind clúster declarativo existe y define puertos e ingress-ready', () => {
  const kindConfigPath = path.join(ROOT_DIR, 'infra/k8s/kind-cluster.yaml');
  assert.ok(fs.existsSync(kindConfigPath), 'infra/k8s/kind-cluster.yaml debe existir');

  const content = fs.readFileSync(kindConfigPath, 'utf-8');
  assert.match(content, /kind:\s*Cluster/, 'Debe ser un kind Cluster');
  assert.match(content, /ingress-ready=true/, 'Debe etiquetar nodo con ingress-ready=true');
  assert.match(content, /hostPort:\s*8080/, 'Debe mapear puerto Ingress HTTP 8080');
  assert.match(content, /hostPort:\s*3000/, 'Debe mapear puerto API 3000');
});

test('🛡️ Operación: infra.yml integra Kind como prueba canónica de integración', () => {
  const infraWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yml'), 'utf-8');

  assert.match(infraWorkflow, /kind-integration:/, 'infra.yml debe incluir job kind-integration');
  assert.match(infraWorkflow, /helm\/kind-action/, 'kind-integration debe usar helm/kind-action');
  assert.match(infraWorkflow, /infra\/k8s\/kind-cluster\.yaml/, 'kind-integration debe usar kind-cluster.yaml');
  assert.match(infraWorkflow, /helm upgrade --install pokedex/, 'kind-integration debe desplegar el chart');
  assert.match(infraWorkflow, /curl -f http:\/\/127\.0\.0\.1:3000\/healthz/, 'kind-integration debe probar /healthz');
});

test('🛡️ Operación: security-dast-zap.yml configura escaneo dinámico con OWASP ZAP', () => {
  const zapWorkflowPath = path.join(ROOT_DIR, '.github/workflows/security-dast-zap.yml');
  assert.ok(fs.existsSync(zapWorkflowPath), 'security-dast-zap.yml debe existir');

  const content = fs.readFileSync(zapWorkflowPath, 'utf-8');
  assert.match(content, /zaproxy\/action-baseline/, 'Debe utilizar zaproxy/action-baseline');
  // network_name no es un input válido en zaproxy/action-baseline@v0.15.0 — fue eliminado correctamente
  assert.doesNotMatch(content, /network_name/, 'No debe usar el input inválido network_name (removido en v0.15.0)');
  assert.match(content, /172\.17\.0\.1/, 'Debe usar 172.17.0.1 (Docker gateway) para acceder al servidor del runner');
  assert.match(content, /allow_issue_writing/, 'Debe configurar allow_issue_writing');
  assert.match(content, /cron:/, 'Debe tener ejecución programada por cron');
});

test('🛡️ Operación: k6_stress_test.js y performance-k6.yml definen y validan umbrales de SLA', () => {
  const k6Script = fs.readFileSync(path.join(ROOT_DIR, 'tests/performance/k6_stress_test.js'), 'utf-8');
  assert.match(k6Script, /p\(95\)<200/, 'k6 debe exigir p95 < 200ms');
  assert.match(k6Script, /p\(99\)<500/, 'k6 debe exigir p99 < 500ms');
  assert.match(k6Script, /rate<0\.01/, 'k6 debe exigir tasa de error < 1%');

  const k6Workflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/performance-k6.yml'), 'utf-8');
  assert.match(k6Workflow, /--summary-export=\/tmp\/k6-summary\.json/, 'Debe exportar el resumen de k6');
  assert.match(k6Workflow, /GITHUB_STEP_SUMMARY/, 'Debe registrar métricas en GITHUB_STEP_SUMMARY');
});

test('🛡️ Operación: DISASTER_RECOVERY_PLAN.md documenta RPO y RTO medidos experimentalmente', () => {
  const drpPlan = fs.readFileSync(path.join(ROOT_DIR, 'docs/runbooks/DISASTER_RECOVERY_PLAN.md'), 'utf-8');

  assert.match(drpPlan, /1\.1\. Comparativa de SLAs: Objetivos Declarados vs\. Mediciones Empíricas/, 'Debe contener sección 1.1 de benchmarks medidos');
  assert.match(drpPlan, /Benchmark Empírico/, 'Debe contener columna de benchmark empírico');
  assert.match(drpPlan, /~1\.5 segundos/, 'Debe documentar RTO medido (~1.5 segundos)');
  assert.match(drpPlan, /≤ 24 horas/, 'Debe documentar RPO medido (≤ 24 horas)');
});

test('🛡️ Operación: dr-simulation.yml automatiza simulacros periódicos de recuperación ante desastres', () => {
  const drSimPath = path.join(ROOT_DIR, '.github/workflows/dr-simulation.yml');
  assert.ok(fs.existsSync(drSimPath), 'dr-simulation.yml debe existir');

  const content = fs.readFileSync(drSimPath, 'utf-8');
  assert.match(content, /cron:\s*"0 4 \* \* 0"/, 'Debe programarse semanalmente los domingos a las 04:00 UTC');
  assert.match(content, /scripts\/dr_verify_restore\.sh --dry-run/, 'Debe ejecutar dr_verify_restore.sh --dry-run');
  assert.match(content, /GITHUB_STEP_SUMMARY/, 'Debe publicar resultados en GITHUB_STEP_SUMMARY');
});

test('🛡️ Disaster Recovery: dr_verify_restore.sh implementa validación estricta de checksum y aislamiento de BD', () => {
  const drScriptPath = path.join(ROOT_DIR, 'scripts/dr_verify_restore.sh');
  assert.ok(fs.existsSync(drScriptPath), 'dr_verify_restore.sh debe existir');

  const content = fs.readFileSync(drScriptPath, 'utf-8');
  assert.match(content, /CHECKSUM_FILE="\$\{BACKUP_FILE\}\.sha256"/, 'Debe definir ruta de archivo .sha256');
  assert.match(content, /sha256sum -c "\$\{CHECKSUM_FILE\}"/, 'Debe validar el checksum con sha256sum');
  assert.match(content, /Archivo de checksum \$\{CHECKSUM_FILE\} ausente/, 'Debe fallar si el checksum falta fuera de dry-run');
  assert.match(content, /TEMP_RESTORE_DB=/, 'Debe utilizar base de datos temporal para aislamiento');
  assert.match(content, /DROP DATABASE IF EXISTS \$\{TEMP_RESTORE_DB\}/, 'Debe limpiar la base temporal en CLEANUP');
  assert.match(content, /ALLOW_PROD_RESTORE/, 'Debe proteger contra ejecuciones no autorizadas en producción');
});

test('🛡️ Gobernanza & Arquitectura: Suite formal de ADRs existe en docs/decisions/', () => {
  const adrs = [
    'ADR-001-kubernetes-as-runtime.md',
    'ADR-002-compose-for-local-development.md',
    'ADR-003-gitops-with-argocd.md',
    'ADR-004-opentofu-and-ansible-boundaries.md',
    'ADR-005-secret-management.md',
    'ADR-006-disaster-recovery-strategy.md'
  ];

  for (const adr of adrs) {
    const adrPath = path.join(ROOT_DIR, 'docs/decisions', adr);
    assert.ok(fs.existsSync(adrPath), `ADR ${adr} debe existir en docs/decisions/`);
    const content = fs.readFileSync(adrPath, 'utf-8');
    assert.match(content, /## Estado\s+Aceptado/, `${adr} debe tener Estado: Aceptado`);
    assert.match(content, /## Decisión/, `${adr} debe incluir sección de Decisión`);
  }
});

test('🛡️ Excelencia Operacional: Runbooks formales estructurados en docs/operations/', () => {
  const runbooks = [
    'deployment.md',
    'rollback.md',
    'incident-response.md',
    'backup-restore.md',
    'kubernetes-troubleshooting.md',
    'secret-rotation.md'
  ];

  for (const runbook of runbooks) {
    const runbookPath = path.join(ROOT_DIR, 'docs/operations', runbook);
    assert.ok(fs.existsSync(runbookPath), `Runbook ${runbook} debe existir en docs/operations/`);
    const content = fs.readFileSync(runbookPath, 'utf-8');
    assert.match(content, /## 1\. Propósito/, `${runbook} debe declarar su propósito`);
  }
});

