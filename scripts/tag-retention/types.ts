/**
 * ==============================================================================
 * scripts/tag-retention/types.ts
 *
 * Definición de tipos, interfaces y constantes canónicas para la política de
 * retención jerárquica de Git tags en GitHub (Opción B).
 * ==============================================================================
 */

export interface GitTagRef {
  name: string;
  sha: string;
  refSha?: string;
  date?: string;
  peeledSha?: string;
  isAnnotated?: boolean;
}

export interface GitRemoteRefDetail {
  tagName: string;
  refSha: string;
  targetCommitSha: string;
  type: 'tag' | 'commit' | string;
  isAnnotated: boolean;
}

export interface TagDeletePrecondition {
  commitSha: string;
  refSha?: string;
}

export interface ParsedSemver {
  raw: string;
  hasVPrefix: boolean;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
  isPrerelease: boolean;
}

export interface HierarchicalRetentionConfig {
  keepMajorCount: number; // por defecto 2
  keepMinorCount: number; // por defecto 3
  keepPatchCount: number; // por defecto 1
}

export interface TagEvaluation {
  tag: GitTagRef;
  isEligible: boolean;
  exclusionReason?: string;
  semver?: ParsedSemver;
  isProtected: boolean;
  protectionReason?: string;
  retentionDecision?: {
    level: 'major' | 'minor' | 'patch' | 'protected' | 'pruned' | 'excluded';
    reason: string;
  };
}

export interface HierarchicalRetentionSummary {
  selectedMajors: number[];
  selectedMinorsByMajor: Record<number, number[]>;
  retainedPatchesByMinor: Record<string, string>; // "major.minor" -> tagName
}

export interface TagRetentionResult {
  totalFound: number;
  eligibleCount: number;
  config: HierarchicalRetentionConfig;
  summary: HierarchicalRetentionSummary;
  kept: TagEvaluation[];
  pruned: TagEvaluation[];
  excluded: TagEvaluation[];
  protected: TagEvaluation[];
  deletedTags: string[];
  dryRun: boolean;
  simulated: boolean;
}

export interface TagRetentionOptions {
  token?: string;
  owner?: string;
  repo?: string;
  config?: Partial<HierarchicalRetentionConfig>;
  dryRun?: boolean;
  simulate?: boolean;
  mockTags?: GitTagRef[];
  protectedTags?: Map<string, string>;
  customProtectedTags?: string[];
  repoRoot?: string;
  fetchFn?: typeof fetch;
  maxPages?: number;
}

export interface EnrichTagsOptions {
  fetchFn?: typeof fetch;
  maxPages?: number;
  perPage?: number;
  strict?: boolean;
}

export const DEFAULT_CONFIG: HierarchicalRetentionConfig = {
  keepMajorCount: 2,
  keepMinorCount: 3,
  keepPatchCount: 1,
};

export const DEFAULT_OWNER = 'rocapellino';
export const DEFAULT_REPO = 'pokedex';

/** Ventana de releases estables protegidos para rollback OCI en GHCR (N, N-1, N-2). */
export const DEFAULT_ROLLBACK_WINDOW_COUNT = 3;

/**
 * Expresión regular SemVer 2.0 canónica que admite prefijo 'v' opcional.
 * Grupos: 1=major, 2=minor, 3=patch, 4=prerelease, 5=build metadata.
 */
export const SEMVER_TAG_REGEX =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Expresión regular canónica para Git SHA-1 (40 caracteres hexadecimales completos). */
export const GIT_SHA_REGEX = /^[0-9a-f]{40}$/i;

/** Manifiestos de GitOps y Helm inspeccionados para proteger versiones activas. */
export const PROTECTED_MANIFEST_FILES = [
  'gitops/apps/app-proxmox-preprod.yaml',
  'gitops/apps/app-cloud.yaml',
  'gitops/apps/root-application.yaml',
  'infra/helm/pokedex/Chart.yaml',
  'package.json',
];
