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
