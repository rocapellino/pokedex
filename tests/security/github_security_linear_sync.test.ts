import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapSeverityToPriority,
  formatCodeScanningTitle,
  formatDependabotTitle,
  formatSecretScanningTitle,
  sanitize,
  extractAlertKeyFromTitle,
  syncAlertLifecycle,
  syncGitHubSecurityToLinear,
  GitHubCodeScanningAlert,
  GitHubDependabotAlert,
  GitHubSecretScanningAlert,
  LinearIssueNode,
} from '../../scripts/github-security-linear-sync.js';

test('🛡️ GitHub Security Linear Sync: mapSeverityToPriority mapea severidades a prioridades de Linear', () => {
  assert.equal(mapSeverityToPriority('critical'), 1);
  assert.equal(mapSeverityToPriority('CRITICAL'), 1);

  assert.equal(mapSeverityToPriority('high'), 2);
  assert.equal(mapSeverityToPriority('error'), 2);
  assert.equal(mapSeverityToPriority('HIGH'), 2);

  assert.equal(mapSeverityToPriority('medium'), 3);
  assert.equal(mapSeverityToPriority('warning'), 3);
  assert.equal(mapSeverityToPriority('MEDIUM'), 3);

  assert.equal(mapSeverityToPriority('low'), 4);
  assert.equal(mapSeverityToPriority('note'), 4);
  assert.equal(mapSeverityToPriority('unknown'), 4);
  assert.equal(mapSeverityToPriority(undefined), 4);
});

test('🛡️ GitHub Security Linear Sync: formatCodeScanningTitle genera título descriptivo y consistente', () => {
  const alert: GitHubCodeScanningAlert = {
    number: 10,
    created_at: '2026-09-11T20:00:00Z',
    html_url: 'https://github.com/rocapellino/pokedex/security/code-scanning/10',
    state: 'open',
    rule: {
      id: 'js/system-prompt-injection',
      severity: 'high',
      description: 'System prompt injection vulnerability',
      name: 'System Prompt Injection',
    },
    tool: {
      name: 'CodeQL',
    },
  };

  const title = formatCodeScanningTitle(alert);
  assert.equal(title, '[GitHub CodeQL #10] System prompt injection vulnerability');
});

test('🛡️ GitHub Security Linear Sync: formatDependabotTitle formatea paquete, advisory y resumen', () => {
  const alert: GitHubDependabotAlert = {
    number: 42,
    created_at: '2026-09-11T20:00:00Z',
    html_url: 'https://github.com/rocapellino/pokedex/security/dependabot/42',
    state: 'open',
    dependency: {
      package: {
        ecosystem: 'npm',
        name: 'express',
      },
    },
    security_advisory: {
      ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
      summary: 'Express prototype pollution in query parser',
      description: 'Full description',
      severity: 'high',
    },
  };

  const title = formatDependabotTitle(alert);
  assert.equal(title, '[GitHub Dependabot #42] express (GHSA-xxxx-yyyy-zzzz): Express prototype pollution in query parser');
});

test('🛡️ GitHub Security Linear Sync: formatSecretScanningTitle formatea el tipo de secreto expuesto', () => {
  const alert: GitHubSecretScanningAlert = {
    number: 3,
    created_at: '2026-09-11T20:00:00Z',
    html_url: 'https://github.com/rocapellino/pokedex/security/secret-scanning/3',
    state: 'open',
    secret_type: 'stripe_api_key',
    secret_type_display_name: 'Stripe API Key',
  };

  const title = formatSecretScanningTitle(alert);
  assert.equal(title, '[GitHub Secret #3] Detección de Stripe API Key');
});

test('🛡️ GitHub Security Linear Sync: extractAlertKeyFromTitle extrae herramienta y número de alerta', () => {
  assert.deepEqual(extractAlertKeyFromTitle('[GitHub CodeQL #18] Use of password hash with insufficient computational effort'), {
    tool: 'codeql',
    number: 18,
  });

  assert.deepEqual(extractAlertKeyFromTitle('[GitHub Dependabot #42] express (GHSA-xxxx): Prototype pollution'), {
    tool: 'dependabot',
    number: 42,
  });

  assert.deepEqual(extractAlertKeyFromTitle('[GitHub Secret #7] Detección de AWS Secret Key'), {
    tool: 'secret',
    number: 7,
  });

  assert.deepEqual(extractAlertKeyFromTitle('[GitHub Trivy #105] CVE-2026-0001 in Alpine base'), {
    tool: 'trivy',
    number: 105,
  });

  assert.deepEqual(extractAlertKeyFromTitle('[GitHub Code Scanning #12] Missing rate limiting'), {
    tool: 'codeql',
    number: 12,
  });

  assert.equal(extractAlertKeyFromTitle('Feature: Add new Pokemon stats chart'), null);
});

test('🛡️ GitHub Security Linear Sync: sanitize neutraliza saltos de línea y limita longitud', () => {
  const dirty = 'Línea 1\nLínea 2\rLínea 3\tTab'.repeat(10);
  const clean = sanitize(dirty);
  assert.equal(clean.includes('\n'), false);
  assert.equal(clean.includes('\r'), false);
  assert.equal(clean.includes('\t'), false);
  assert.equal(clean.length <= 120, true);
});

test('🛡️ GitHub Security Linear Sync: syncAlertLifecycle maneja ciclo de vida en DRY-RUN sin errores', async () => {
  process.env.DRY_RUN = 'true';

  const existingIssues: LinearIssueNode[] = [
    {
      id: 'issue-1',
      identifier: 'PEX-86',
      title: '[GitHub CodeQL #18] Use of password hash',
      state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
    },
    {
      id: 'issue-2',
      identifier: 'PEX-98',
      title: '[GitHub CodeQL #18] Use of password hash',
      state: { id: 'state-backlog', name: 'Backlog', type: 'backlog' },
    },
  ];

  // Caso A: Alerta cerrada en GitHub
  await assert.doesNotReject(async () => {
    await syncAlertLifecycle({
      alertType: 'codeql',
      alertNumber: 18,
      isOpen: false,
      stateDescription: 'fixed',
      title: '[GitHub CodeQL #18] Use of password hash',
      description: 'Detalle de prueba',
      priority: 2,
      existingIssues,
      teamId: 'team-mock',
      todoStateId: 'state-todo',
      doneStateId: 'state-done',
      canceledStateId: 'state-canceled',
      duplicateStateId: 'state-duplicate',
    });
  });

  // Caso B: Alerta nueva abierta sin tickets previos
  await assert.doesNotReject(async () => {
    await syncAlertLifecycle({
      alertType: 'codeql',
      alertNumber: 999,
      isOpen: true,
      stateDescription: 'open',
      title: '[GitHub CodeQL #999] Nueva alerta',
      description: 'Detalle de prueba',
      priority: 1,
      existingIssues: [],
      teamId: 'team-mock',
      todoStateId: 'state-todo',
      doneStateId: 'state-done',
      canceledStateId: 'state-canceled',
      duplicateStateId: 'state-duplicate',
    });
  });
});

test('🛡️ GitHub Security Linear Sync: workflow YAML existe y define permisos de menor privilegio', () => {
  const workflowPath = path.join(process.cwd(), '.github/workflows/github-security-linear-sync.yml');
  assert.equal(fs.existsSync(workflowPath), true, 'El workflow YAML de sincronización de seguridad debe existir');

  const content = fs.readFileSync(workflowPath, 'utf8');
  assert.match(content, /permissions:/);
  assert.match(content, /contents:\s*read/);
  assert.match(content, /security-events:\s*read/);
  assert.match(content, /code_scanning_alert/);
  assert.match(content, /dependabot_alert/);
  assert.match(content, /secret_scanning_alert/);
  assert.match(content, /github-security-linear-sync\.ts/);
});

test('🛡️ GitHub Security Linear Sync: syncGitHubSecurityToLinear se degrada elegantemente sin LINEAR_API_KEY', async () => {
  const prevKey = process.env.LINEAR_API_KEY;
  delete process.env.LINEAR_API_KEY;

  // No debe lanzar excepciones no controladas
  await assert.doesNotReject(async () => {
    await syncGitHubSecurityToLinear();
  });

  if (prevKey) {
    process.env.LINEAR_API_KEY = prevKey;
  }
});

test('🛡️ GitHub Code Scanning SAST: workflow YAML de njsscan, hadolint y Trivy IaC existe y está configurado', () => {
  const workflowPath = path.join(process.cwd(), '.github/workflows/security-code-scanning.yml');
  assert.equal(fs.existsSync(workflowPath), true, 'El workflow YAML de SAST debe existir');

  const content = fs.readFileSync(workflowPath, 'utf8');
  assert.match(content, /permissions:/);
  assert.match(content, /contents:\s*read/);
  assert.match(content, /security-events:\s*write/);
  assert.match(content, /njsscan-action/);
  assert.match(content, /hadolint-action/);
  assert.match(content, /trivy-action/);
  assert.match(content, /upload-sarif/);
});

