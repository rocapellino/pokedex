import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AuditFreshnessStatus = 'CURRENT' | 'AUDIT_STALE';

export interface AuditSnapshot {
  commit?: string;
  packageVersion?: string;
  chartVersion?: string;
  gitOpsRevision?: string;
}

export interface RepositoryState {
  head: string;
  packageVersion: string;
  chartVersion: string;
  gitOpsRevisions: string[];
}

export interface AuditFreshnessResult {
  status: AuditFreshnessStatus;
  blocking: false;
  differences: string[];
  snapshot: AuditSnapshot;
}

export function parseAuditSnapshot(content: string): AuditSnapshot {
  return {
    commit: content.match(/\*\*Commit:\*\*\s*`([0-9a-f]{7,40})`/i)?.[1],
    packageVersion: content.match(/\|\s*`package\.json`\s*\|\s*`([^`]+)`/i)?.[1],
    chartVersion: content.match(/\|\s*`infra\/helm\/pokedex\/Chart\.yaml`[^|]*\|\s*`([^`]+)`/i)?.[1],
    gitOpsRevision: content.match(/\|\s*GitOps `targetRevision`[^|]*\|\s*`([^`]+)`/i)?.[1],
  };
}

export function evaluateAuditFreshness(content: string, repository: RepositoryState): AuditFreshnessResult {
  const snapshot = parseAuditSnapshot(content);
  const differences: string[] = [];

  if (!snapshot.commit) differences.push('MISSING_COMMIT');
  else if (snapshot.commit !== repository.head) differences.push('HEAD');

  if (!snapshot.packageVersion) differences.push('MISSING_PACKAGE_VERSION');
  else if (snapshot.packageVersion !== repository.packageVersion) differences.push('PACKAGE_VERSION');

  if (!snapshot.chartVersion) differences.push('MISSING_CHART_VERSION');
  else if (snapshot.chartVersion !== repository.chartVersion) differences.push('CHART_VERSION');

  if (!snapshot.gitOpsRevision) differences.push('MISSING_GITOPS_REVISION');
  else if (repository.gitOpsRevisions.some((revision) => revision !== snapshot.gitOpsRevision)) {
    differences.push('GITOPS_REVISION');
  }

  return {
    status: differences.length === 0 ? 'CURRENT' : 'AUDIT_STALE',
    blocking: false,
    differences,
    snapshot,
  };
}

/** Lee el estado vigente desde las fuentes de verdad: HEAD, package.json, Chart.yaml y gitops/apps/. */
export function readRepositoryState(root = process.cwd()): RepositoryState {
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
  const appsDir = path.join(root, 'gitops', 'apps');

  return {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    packageVersion: JSON.parse(read('package.json')).version,
    chartVersion: read('infra/helm/pokedex/Chart.yaml').match(/^version:\s*"?([^"\s]+)"?/m)?.[1] ?? '',
    gitOpsRevisions: fs
      .readdirSync(appsDir)
      .filter((file) => file.endsWith('.yaml'))
      .flatMap((file) => [...read(`gitops/apps/${file}`).matchAll(/targetRevision:\s*"?([^"\s]+)"?/g)].map((m) => m[1])),
  };
}

/** Devuelve la ruta relativa del baseline más reciente (`docs/audits/<fecha>/baseline.md`). */
export function findLatestBaseline(root = process.cwd()): string | undefined {
  const auditsDir = path.join(root, 'docs', 'audits');
  const latest = fs
    .readdirSync(auditsDir)
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry) && fs.existsSync(path.join(auditsDir, entry, 'baseline.md')))
    .sort()
    .pop();
  return latest ? `docs/audits/${latest}/baseline.md` : undefined;
}

// Uso: npx tsx .agents/skills/repo-lifecycle/scripts/audit-freshness.ts [docs/audits/<fecha>/baseline.md]
// Siempre termina con código 0: AUDIT_STALE es informativo y no bloqueante.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const baseline = process.argv[2] ?? findLatestBaseline();
  if (!baseline) {
    console.error('No se encontró ningún baseline en docs/audits/<fecha>/baseline.md');
    process.exit(1);
  }
  const result = evaluateAuditFreshness(fs.readFileSync(baseline, 'utf8'), readRepositoryState());
  console.log(JSON.stringify({ baseline: baseline.replace(/\\/g, '/'), ...result }, null, 2));
}
