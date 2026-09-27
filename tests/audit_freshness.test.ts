import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAuditFreshness } from '../.agents/skills/repo-lifecycle/scripts/audit-freshness.ts';

const CURRENT = {
  head: '67350e963fbc90ff2d5b816ed8a5e878fd028128',
  packageVersion: '1.84.7',
  chartVersion: '1.84.7',
  gitOpsRevisions: ['v1.84.7', 'v1.84.7', 'v1.84.7'],
};

function baseline(overrides: Partial<Record<'commit' | 'packageVersion' | 'chartVersion' | 'gitOpsRevision', string>> = {}): string {
  return `> **Commit:** \`${overrides.commit ?? CURRENT.head}\`
| \`package.json\` | \`${overrides.packageVersion ?? CURRENT.packageVersion}\` | SSOT |
| \`infra/helm/pokedex/Chart.yaml\` (\`version\` / \`appVersion\`) | \`${overrides.chartVersion ?? CURRENT.chartVersion}\` | SSOT |
| GitOps \`targetRevision\` (entornos) | \`${overrides.gitOpsRevision ?? CURRENT.gitOpsRevisions[0]}\` | SSOT |`;
}

test('Audit lifecycle: baseline idéntico al repositorio queda CURRENT', () => {
  assert.deepEqual(evaluateAuditFreshness(baseline(), CURRENT), {
    status: 'CURRENT',
    blocking: false,
    differences: [],
    snapshot: {
      commit: CURRENT.head,
      packageVersion: CURRENT.packageVersion,
      chartVersion: CURRENT.chartVersion,
      gitOpsRevision: CURRENT.gitOpsRevisions[0],
    },
  });
});

test('Audit lifecycle: commit divergente produce AUDIT_STALE no bloqueante', () => {
  const result = evaluateAuditFreshness(baseline({ commit: '0ca719a8c9ccf097c06f5b5a6557417d43c33ee2' }), CURRENT);
  assert.equal(result.status, 'AUDIT_STALE');
  assert.equal(result.blocking, false);
  assert.deepEqual(result.differences, ['HEAD']);
});

test('Audit lifecycle: metadatos ausentes se reportan explícitamente', () => {
  const result = evaluateAuditFreshness('# Snapshot sin metadatos', CURRENT);
  assert.equal(result.status, 'AUDIT_STALE');
  assert.deepEqual(result.differences, [
    'MISSING_COMMIT',
    'MISSING_PACKAGE_VERSION',
    'MISSING_CHART_VERSION',
    'MISSING_GITOPS_REVISION',
  ]);
});

test('Audit lifecycle: eleva evidencia por versión, Chart y GitOps divergentes', () => {
  const result = evaluateAuditFreshness(
    baseline({ packageVersion: '1.84.5', chartVersion: '1.84.5', gitOpsRevision: 'v1.84.5' }),
    CURRENT,
  );
  assert.equal(result.status, 'AUDIT_STALE');
  assert.deepEqual(result.differences, ['PACKAGE_VERSION', 'CHART_VERSION', 'GITOPS_REVISION']);
});
