import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml, workflowJobs, type WorkflowStep } from '../helpers/yaml.js';

/**
 * Los workflows y el clúster Kind se verifican parseados (disparadores, pasos con su `uses`, `with` y `run`
 * sin comentarios): un valor dentro de un comentario o del nombre de otro paso no cuenta como si se ejecutara.
 * Los scripts (Bash y k6/JavaScript) y los documentos Markdown se comprueban como texto, sin sus comentarios los
 * primeros.
 */

const exists = (relativePath: string) => fs.existsSync(path.join(ROOT_DIR, relativePath));
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8');

/** Contenido de un script sin las líneas que son solo un comentario (`#` en Bash, `//` en JavaScript). */
const withoutComments = (source: string, marker: '#' | '//') =>
  source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(marker))
    .join('\n');

/** Disparadores `schedule` (expresiones cron) de un workflow. */
const crons = (workflow: string): string[] =>
  (readYaml<{ on: { schedule?: Array<{ cron: string }> } }>(workflow).on.schedule ?? []).map((s) => s.cron);

/** Todos los pasos de un workflow. */
const steps = (workflow: string): WorkflowStep[] => Object.values(workflowJobs(workflow)).flatMap((job) => job.steps);

/** Scripts `run:` de todos los pasos de un workflow, sin las líneas de shell comentadas. */
const scripts = (workflow: string): string =>
  steps(workflow)
    .map((step) => step.run ?? '')
    .join('\n');

test('🛡️ Operación: Kind clúster declarativo existe y define puertos e ingress-ready', () => {
  const kindConfig = 'infra/k8s/kind-cluster.yaml';
  assert.ok(exists(kindConfig), 'infra/k8s/kind-cluster.yaml debe existir');

  const cluster = readYaml<{
    kind: string;
    nodes: Array<{ kubeadmConfigPatches?: string[]; extraPortMappings?: Array<{ hostPort: number }> }>;
  }>(kindConfig);
  assert.equal(cluster.kind, 'Cluster', 'Debe ser un kind Cluster');

  const node = cluster.nodes[0];
  assert.ok(
    node.kubeadmConfigPatches?.some((patch) => patch.includes('node-labels: "ingress-ready=true"')),
    'Debe etiquetar nodo con ingress-ready=true',
  );
  const hostPorts = (node.extraPortMappings ?? []).map((mapping) => mapping.hostPort);
  assert.ok(hostPorts.includes(8080), 'Debe mapear puerto Ingress HTTP 8080');
  assert.ok(hostPorts.includes(3000), 'Debe mapear puerto API 3000');
  // La mención de kindnet es documentación (comentario) de la relación con las NetworkPolicies.
  assert.match(
    read(kindConfig),
    /kindnet/,
    'Debe documentar explícitamente el uso de kindnet y su relación con NetworkPolicies',
  );
});

test('🛡️ Operación: infra.yaml integra Kind como prueba canónica de integración', () => {
  const kindJob = workflowJobs('.github/workflows/infra.yaml')['kind-integration'];
  assert.ok(kindJob, 'infra.yaml debe incluir job kind-integration');

  const kindAction = kindJob.steps.find((step) => step.uses?.startsWith('helm/kind-action@'));
  assert.ok(kindAction, 'kind-integration debe usar helm/kind-action');
  assert.equal(kindAction.with?.config, 'infra/k8s/kind-cluster.yaml', 'kind-integration debe usar kind-cluster.yaml');

  const script = kindJob.steps.map((step) => step.run ?? '').join('\n');
  assert.match(script, /helm upgrade --install pokedex/, 'kind-integration debe desplegar el chart');
  assert.match(script, /curl -f http:\/\/127\.0\.0\.1:3000\/healthz/, 'kind-integration debe probar /healthz');
});

test('🛡️ Operación: security-dast-zap.yaml configura escaneo dinámico con OWASP ZAP', () => {
  const zapWorkflow = '.github/workflows/security-dast-zap.yaml';
  assert.ok(exists(zapWorkflow), 'security-dast-zap.yaml debe existir');

  const zap = steps(zapWorkflow).find((step) => step.uses?.startsWith('zaproxy/action-baseline@'));
  assert.ok(zap, 'Debe utilizar zaproxy/action-baseline');
  // network_name no es un input válido en zaproxy/action-baseline@v0.15.0 — fue eliminado correctamente
  assert.ok(!('network_name' in (zap.with ?? {})), 'No debe usar el input inválido network_name (removido en v0.15.0)');
  assert.ok('allow_issue_writing' in (zap.with ?? {}), 'Debe configurar allow_issue_writing');
  assert.match(
    scripts(zapWorkflow),
    /DOCKER_GW="172\.17\.0\.1"/,
    'Debe usar 172.17.0.1 (Docker gateway) para acceder al servidor del runner',
  );
  assert.ok(crons(zapWorkflow).length > 0, 'Debe tener ejecución programada por cron');
});

test('🛡️ Operación: k6_stress_test.js y performance-k6.yaml definen y validan umbrales de SLA', () => {
  // El script k6 no es importable fuera de k6: se comprueba su texto sin comentarios.
  const k6Script = withoutComments(read('tests/performance/k6_stress_test.js'), '//');
  // Cada umbral se ata a su métrica y cierra con la comilla: `p(95)<2000` no pasa por `p(95)<200`, y relajar
  // `http_req_failed` no queda tapado por `custom_error_rate`, que repite el mismo valor.
  assert.match(k6Script, /http_req_duration:\s*\[[^\]]*'p\(95\)<200'/, 'k6 debe exigir p95 < 200ms');
  assert.match(k6Script, /http_req_duration:\s*\[[^\]]*'p\(99\)<500'/, 'k6 debe exigir p99 < 500ms');
  assert.match(k6Script, /http_req_failed:\s*\['rate<0\.01'\]/, 'k6 debe exigir tasa de error HTTP < 1%');
  assert.match(k6Script, /custom_error_rate:\s*\['rate<0\.01'\]/, 'k6 debe exigir tasa de error de negocio < 1%');

  const k6Run = scripts('.github/workflows/performance-k6.yaml');
  assert.match(k6Run, /--summary-export=\/tmp\/k6-summary\.json/, 'Debe exportar el resumen de k6');
  assert.match(k6Run, /GITHUB_STEP_SUMMARY/, 'Debe registrar métricas en GITHUB_STEP_SUMMARY');
});

test('🛡️ Operación: DISASTER_RECOVERY_PLAN.md documenta RPO y RTO medidos experimentalmente', () => {
  const drpPlan = read('docs/runbooks/DISASTER_RECOVERY_PLAN.md');

  assert.match(
    drpPlan,
    /1\.1\. Comparativa de SLAs: Objetivos Declarados vs\. Mediciones Empíricas/,
    'Debe contener sección 1.1 de benchmarks medidos',
  );
  assert.match(drpPlan, /Benchmark Empírico/, 'Debe contener columna de benchmark empírico');
  assert.match(drpPlan, /~1\.5 segundos/, 'Debe documentar RTO medido (~1.5 segundos)');
  assert.match(drpPlan, /≤ 24 horas/, 'Debe documentar RPO medido (≤ 24 horas)');
});

test('🛡️ Operación: dr-simulation.yaml automatiza simulacros periódicos de recuperación ante desastres', () => {
  const drWorkflow = '.github/workflows/dr-simulation.yaml';
  assert.ok(exists(drWorkflow), 'dr-simulation.yaml debe existir');

  assert.deepEqual(crons(drWorkflow), ['0 4 * * 0'], 'Debe programarse semanalmente los domingos a las 04:00 UTC');
  const drill = steps(drWorkflow).find((step) => step.run?.includes('scripts/dr_verify_restore.sh --dry-run'));
  assert.ok(drill, 'Debe ejecutar dr_verify_restore.sh --dry-run');
  assert.ok(
    steps(drWorkflow).some((step) => step.run?.includes('GITHUB_STEP_SUMMARY')),
    'Debe publicar resultados en GITHUB_STEP_SUMMARY',
  );
});

test('🛡️ Disaster Recovery: dr_verify_restore.sh implementa validación estricta de checksum y aislamiento de BD', () => {
  const drScript = 'scripts/dr_verify_restore.sh';
  assert.ok(exists(drScript), 'dr_verify_restore.sh debe existir');

  const content = withoutComments(read(drScript), '#');
  assert.match(content, /CHECKSUM_FILE="\$\{BACKUP_FILE\}\.sha256"/, 'Debe definir ruta de archivo .sha256');
  assert.match(content, /sha256sum -c "\$\{CHECKSUM_FILE\}"/, 'Debe validar el checksum con sha256sum');
  assert.match(
    content,
    /Archivo de checksum \$\{CHECKSUM_FILE\} ausente/,
    'Debe fallar si el checksum falta fuera de dry-run',
  );
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
    'ADR-006-disaster-recovery-strategy.md',
  ];

  for (const adr of adrs) {
    const adrPath = path.join(ROOT_DIR, 'docs/decisions', adr);
    assert.ok(fs.existsSync(adrPath), `ADR ${adr} debe existir en docs/decisions/`);
    const content = fs.readFileSync(adrPath, 'utf-8');
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
    'secret-rotation.md',
  ];

  for (const runbook of runbooks) {
    const runbookPath = path.join(ROOT_DIR, 'docs/operations', runbook);
    assert.ok(fs.existsSync(runbookPath), `Runbook ${runbook} debe existir en docs/operations/`);
    const content = fs.readFileSync(runbookPath, 'utf-8');
    assert.match(content, /## 1\. Propósito/, `${runbook} debe declarar su propósito`);
  }
});
