/**
 * ==============================================================================
 * scripts/tag-retention.ts
 *
 * Script de gobernanza y retención jerárquica de Git tags en GitHub (Opción B).
 * Estrategia de retención basada en Semantic Versioning (SemVer 2.0):
 *   - Major: Conserva las últimas M líneas major (por defecto M=2).
 *   - Minor: Conserva las últimas N líneas minor por cada major (por defecto N=3).
 *   - Patch: Conserva el último P patch disponible por cada minor (por defecto P=1).
 *   - Referencias protegidas: Nunca purga tags fijados en GitOps (targetRevision),
 *     Helm (Chart.yaml) o listas explícitas de excepciones.
 *   - Seguridad: Prereleases y tags no SemVer quedan excluidos de la purga estándar.
 *   - Modo seguro: Dry-run habilitado por defecto y doble verificación previa al borrado.
 *
 * Uso:
 *   node --experimental-strip-types scripts/tag-retention.ts [--major=2] [--minor=3] [--patch=1] [--dry-run] [--simulate]
 * ==============================================================================
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * Valida de forma estricta que una cadena sea un hash de Git completo y válido.
 * Rechaza cadenas vacías, incompletas, prefijos o con caracteres no hexadecimales.
 */
export function isValidGitSha(sha: unknown): sha is string {
  return typeof sha === 'string' && GIT_SHA_REGEX.test(sha.trim());
}

/**
 * Compara dos hashes de Git utilizando igualdad exacta insensible a mayúsculas.
 * Aborta devolviendo false si cualquiera de los dos valores no es un hash canónico completo de 40 hex.
 */
export function areShasEqual(a: unknown, b: unknown): boolean {
  if (!isValidGitSha(a) || !isValidGitSha(b)) {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Parsea y valida de forma estricta que una cadena represente un número entero positivo (> 0).
 * Rechaza cadenas con caracteres no numéricos o sufijos (e.g. '3abc'), números con decimales,
 * negativos, cero o valores vacíos/malformados.
 */
export function parseStrictPositiveInt(value: unknown, paramName: string): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(
      `Valor inválido para '${paramName}': se esperaba una cadena numérica o entero positivo, recibido ${typeof value}.`,
    );
  }

  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new Error(
      `Valor malformado para '${paramName}': '${str}' no es un entero positivo válido (> 0). Se rechazan sufijos alfanuméricos, decimales, negativos o cero.`,
    );
  }

  const parsed = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Valor fuera de rango seguro para '${paramName}': '${str}'.`);
  }

  return parsed;
}

/** Manifiestos de GitOps y Helm inspeccionados para proteger versiones activas. */
export const PROTECTED_MANIFEST_FILES = [
  'gitops/apps/app-proxmox-preprod.yaml',
  'gitops/apps/app-cloud.yaml',
  'gitops/apps/root-application.yaml',
  'infra/helm/pokedex/Chart.yaml',
  'package.json',
];

/**
 * Parsea un tag en sus componentes canónicos SemVer 2.0.
 * Devuelve null si no cumple el formato '[v]X.Y.Z[-prerelease][+build]'.
 */
export function parseSemverTag(name: string): ParsedSemver | null {
  const match = name.match(SEMVER_TAG_REGEX);
  if (!match) return null;

  const hasVPrefix = name.startsWith('v');
  const prerelease = match[4] || undefined;
  const build = match[5] || undefined;

  return {
    raw: name,
    hasVPrefix,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease,
    build,
    isPrerelease: Boolean(prerelease),
  };
}

/**
 * Comparador determinista SemVer 2.0.
 * Retorna > 0 si a > b, < 0 si a < b, 0 si son equivalentes en precedencia.
 * Regla: versión estable > prerelease.
 * Build metadata se ignora en la precedencia de versión según especificación SemVer.
 */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Prerelease handling
  if (!a.isPrerelease && b.isPrerelease) return 1; // a estable, b prerelease -> a > b
  if (a.isPrerelease && !b.isPrerelease) return -1; // a prerelease, b estable -> a < b
  if (!a.isPrerelease && !b.isPrerelease) return 0; // ambas estables -> iguales

  // Ambas tienen prerelease
  const partsA = (a.prerelease || '').split('.');
  const partsB = (b.prerelease || '').split('.');
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const pA = partsA[i];
    const pB = partsB[i];

    if (pA === undefined) return -1;
    if (pB === undefined) return 1;
    if (pA === pB) continue;

    const numA = /^\d+$/.test(pA) ? parseInt(pA, 10) : null;
    const numB = /^\d+$/.test(pB) ? parseInt(pB, 10) : null;

    if (numA !== null && numB !== null) {
      return numA - numB;
    }
    if (numA !== null && numB === null) {
      return -1;
    }
    if (numA === null && numB !== null) {
      return 1;
    }

    return pA.localeCompare(pB);
  }

  return 0;
}

/**
 * Protege los últimos `rollbackCount` tags SemVer estables (N, N-1, N-2) para mantener
 * paridad con la ventana de rollback de imágenes en GHCR (`collectReleasePinnedDigests`).
 */
export function protectRollbackWindowTags(
  tagNames: Iterable<string>,
  protectedMap: Map<string, string>,
  rollbackCount: number = DEFAULT_ROLLBACK_WINDOW_COUNT,
): void {
  const stableParsed: ParsedSemver[] = [];
  for (const rawName of tagNames) {
    const trimmed = rawName.trim();
    if (!trimmed) continue;
    const parsed = parseSemverTag(trimmed);
    if (parsed && !parsed.isPrerelease) {
      stableParsed.push(parsed);
    }
  }
  stableParsed.sort((a, b) => compareSemver(b, a));
  for (const item of stableParsed.slice(0, Math.max(0, rollbackCount))) {
    if (!protectedMap.has(item.raw)) {
      protectedMap.set(
        item.raw,
        `GHCR Rollback: ventana de los últimos ${rollbackCount} releases estables (N, N-1, N-2)`,
      );
    }
  }
}

/**
 * Recolecta todos los tags que están activamente protegidos por GitOps, Helm, package.json,
 * la ventana de rollback de GHCR (N, N-1, N-2) y una lista personalizada de excepciones.
 */
export function collectProtectedTags(
  root: string = process.cwd(),
  customExceptions: string[] = [],
  rollbackCount: number = DEFAULT_ROLLBACK_WINDOW_COUNT,
): Map<string, string> {
  const protectedMap = new Map<string, string>();

  // 1. Excepciones personalizadas explícitas
  for (const tag of customExceptions) {
    if (tag?.trim()) {
      protectedMap.set(tag.trim(), 'Configuración: Lista explícita de excepciones protegidas');
    }
  }

  // 2. GitOps Applications (targetRevision)
  for (const file of [
    'gitops/apps/app-proxmox-preprod.yaml',
    'gitops/apps/app-cloud.yaml',
    'gitops/apps/root-application.yaml',
  ]) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const match = content.match(/targetRevision:\s*([^\s#\r\n]+)/);
    if (match) {
      const rev = match[1].trim();
      if (SEMVER_TAG_REGEX.test(rev)) {
        protectedMap.set(rev, `GitOps: targetRevision en ${file}`);
      }
    }
  }

  // 3. Helm Chart.yaml
  const chartPath = path.join(root, 'infra/helm/pokedex/Chart.yaml');
  if (fs.existsSync(chartPath)) {
    const content = fs.readFileSync(chartPath, 'utf8');
    const appVerMatch = content.match(/^appVersion:\s*["']?([^"'\s]+)["']?/m);
    if (appVerMatch) {
      const raw = appVerMatch[1];
      protectedMap.set(raw, 'Helm: appVersion en infra/helm/pokedex/Chart.yaml');
      if (!raw.startsWith('v')) {
        protectedMap.set(`v${raw}`, 'Helm: appVersion con prefijo en infra/helm/pokedex/Chart.yaml');
      }
    }
    const verMatch = content.match(/^version:\s*["']?([^"'\s]+)["']?/m);
    if (verMatch) {
      const raw = verMatch[1];
      if (!protectedMap.has(raw)) {
        protectedMap.set(raw, 'Helm: chart version en infra/helm/pokedex/Chart.yaml');
      }
      if (!raw.startsWith('v') && !protectedMap.has(`v${raw}`)) {
        protectedMap.set(`v${raw}`, 'Helm: chart version con prefijo en infra/helm/pokedex/Chart.yaml');
      }
    }
  }

  // 4. package.json raíz
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) {
        protectedMap.set(`v${pkg.version}`, 'Monorepo: versión canónica en package.json');
        protectedMap.set(pkg.version, 'Monorepo: versión sin prefijo en package.json');
      }
    } catch {
      // Ignorar errores de parseo en entornos de test si package.json no es JSON válido
    }
  }

  // 5. AUD-REL-RET-002: Ventana de rollback de GHCR (últimos N releases estables vX.Y.Z)
  if (rollbackCount > 0) {
    try {
      const listed = execFileSync('git', ['tag', '--list', 'v*'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      protectRollbackWindowTags(listed.split(/\r?\n/), protectedMap, rollbackCount);
    } catch {
      // Si el directorio no es un repositorio Git o git no está disponible, se omite sin fallar
    }
  }

  return protectedMap;
}

/**
 * Evalúa el inventario de tags contra la política de retención jerárquica (Opción B).
 *
 * Jerarquía:
 * 1. Clasificación: descarta y preserva tags inválidos, prereleases o con ambigüedad en 'excluded'.
 * 2. Major: Selecciona las últimas M majors estables.
 * 3. Minor: Dentro de cada major seleccionada, selecciona las últimas N minors estables.
 * 4. Patch: Dentro de cada minor seleccionada, conserva el último P patch estable.
 * 5. Protegidos: Cualquier tag fuera de la jerarquía que esté en protectedTagsMap se conserva en 'protected'.
 * 6. Purga: Los tags restantes se marcan para purga en 'pruned'.
 */
export function evaluateHierarchicalTagRetention(
  tags: GitTagRef[],
  config: HierarchicalRetentionConfig = DEFAULT_CONFIG,
  protectedTagsMap: Map<string, string> = new Map(),
): {
  summary: HierarchicalRetentionSummary;
  kept: TagEvaluation[];
  pruned: TagEvaluation[];
  excluded: TagEvaluation[];
  protected: TagEvaluation[];
} {
  if (!Array.isArray(tags) || tags.length === 0) {
    return {
      summary: { selectedMajors: [], selectedMinorsByMajor: {}, retainedPatchesByMinor: {} },
      kept: [],
      pruned: [],
      excluded: [],
      protected: [],
    };
  }

  const eligibleStable: Array<TagEvaluation & { semver: ParsedSemver }> = [];
  const excluded: TagEvaluation[] = [];

  // 1. Clasificación inicial y filtro de seguridad
  for (const tag of tags) {
    const semver = parseSemverTag(tag.name);
    const isProtected = protectedTagsMap.has(tag.name);
    const protectionReason = protectedTagsMap.get(tag.name);

    if (!semver) {
      excluded.push({
        tag,
        isEligible: false,
        exclusionReason: 'No cumple con el formato canónico Semantic Versioning (SemVer)',
        isProtected,
        protectionReason,
        retentionDecision: {
          level: 'excluded',
          reason: 'Tag no parseable como SemVer; preservado por seguridad',
        },
      });
      continue;
    }

    if (semver.isPrerelease) {
      excluded.push({
        tag,
        isEligible: false,
        exclusionReason: 'Versión prerelease excluida de la retención estándar para evitar eliminación accidental',
        semver,
        isProtected,
        protectionReason,
        retentionDecision: {
          level: 'excluded',
          reason: `Prerelease (${semver.prerelease}) fuera de la retención normal; preservado por seguridad`,
        },
      });
      continue;
    }

    eligibleStable.push({
      tag,
      isEligible: true,
      semver,
      isProtected,
      protectionReason,
    });
  }

  // 2. Detección de ambigüedad o versiones duplicadas con distinto SHA
  const versionToTagMap = new Map<string, GitTagRef>();
  for (const item of eligibleStable) {
    const key = `${item.semver.major}.${item.semver.minor}.${item.semver.patch}`;
    const existing = versionToTagMap.get(key);
    if (existing && existing.name !== item.tag.name && existing.sha !== item.tag.sha) {
      throw new Error(
        `Ambigüedad crítica detectada: Los tags '${existing.name}' y '${item.tag.name}' corresponden a la versión SemVer ${key} pero apuntan a commits distintos (${existing.sha} vs ${item.tag.sha}). Deteniendo retención por seguridad.`,
      );
    }
    if (!existing) {
      versionToTagMap.set(key, item.tag);
    }
  }

  // 3. Estructura jerárquica anidada: Major -> Minor -> Patches[]
  // majorNum -> (minorNum -> items[])
  const hierarchy = new Map<number, Map<number, Array<TagEvaluation & { semver: ParsedSemver }>>>();

  for (const item of eligibleStable) {
    const { major, minor } = item.semver;
    let minorMap = hierarchy.get(major);
    if (!minorMap) {
      minorMap = new Map();
      hierarchy.set(major, minorMap);
    }
    let patchList = minorMap.get(minor);
    if (!patchList) {
      patchList = [];
      minorMap.set(minor, patchList);
    }
    patchList.push(item);
  }

  // 4. Selección Nivel 1: Major
  const allMajors = Array.from(hierarchy.keys()).sort((a, b) => b - a);
  const selectedMajors = allMajors.slice(0, Math.max(0, config.keepMajorCount));

  const selectedMinorsByMajor: Record<number, number[]> = {};
  const retainedPatchesByMinor: Record<string, string> = {};

  const retainedTagNames = new Set<string>();
  const kept: TagEvaluation[] = [];

  // 5. Selección Nivel 2 y 3: Minor y Patch dentro de cada Major seleccionada
  for (const major of selectedMajors) {
    const minorMap = hierarchy.get(major);
    if (!minorMap) continue;

    const allMinors = Array.from(minorMap.keys()).sort((a, b) => b - a);
    const selectedMinors = allMinors.slice(0, Math.max(0, config.keepMinorCount));
    selectedMinorsByMajor[major] = selectedMinors;

    for (const minor of selectedMinors) {
      const patchItems = minorMap.get(minor);
      if (!patchItems) continue;

      // Ordenar patches de mayor a menor patch numérico
      patchItems.sort((a, b) => {
        if (b.semver.patch !== a.semver.patch) {
          return b.semver.patch - a.semver.patch;
        }
        // Desempate por fecha si estuviera disponible
        if (a.tag.date && b.tag.date) {
          return new Date(b.tag.date).getTime() - new Date(a.tag.date).getTime();
        }
        return 0;
      });

      // Conservar los últimos P patches (por defecto 1: el último patch disponible)
      const selectedPatches = patchItems.slice(0, Math.max(0, config.keepPatchCount));

      for (const item of selectedPatches) {
        retainedTagNames.add(item.tag.name);
        item.retentionDecision = {
          level: 'patch',
          reason: `Retenido por jerarquía SemVer: último patch de la línea v${major}.${minor}.x (Major ${major}, Minor ${minor}, Patch ${item.semver.patch})`,
        };
        kept.push(item);
        retainedPatchesByMinor[`${major}.${minor}`] = item.tag.name;
      }
    }
  }

  // Ordenar 'kept' por SemVer descendente para presentación consistente
  kept.sort((a, b) => {
    if (!a.semver || !b.semver) return 0;
    return compareSemver(b.semver, a.semver);
  });

  // 6. Clasificar los tags estables restantes entre 'protected' y 'pruned'
  const protectedList: TagEvaluation[] = [];
  const pruned: TagEvaluation[] = [];

  for (const item of eligibleStable) {
    if (retainedTagNames.has(item.tag.name)) {
      continue; // Ya está conservado en 'kept'
    }

    const { major, minor, patch } = item.semver;
    let pruneReason = '';

    if (!selectedMajors.includes(major)) {
      pruneReason = `Línea Major v${major}.x fuera del límite de las últimas ${config.keepMajorCount} majors retenidas (${selectedMajors.join(', ')})`;
    } else if (!selectedMinorsByMajor[major]?.includes(minor)) {
      pruneReason = `Línea Minor v${major}.${minor}.x fuera del límite de las últimas ${config.keepMinorCount} minors retenidas para Major ${major}`;
    } else {
      pruneReason = `Patch histórico v${major}.${minor}.${patch} superado por el patch más reciente retenido (${retainedPatchesByMinor[`${major}.${minor}`]})`;
    }

    if (item.isProtected) {
      item.retentionDecision = {
        level: 'protected',
        reason: `Exento de purga por protección de despliegue: ${item.protectionReason}`,
      };
      protectedList.push(item);
    } else {
      item.retentionDecision = {
        level: 'pruned',
        reason: pruneReason,
      };
      pruned.push(item);
    }
  }

  // Ordenar pruned y protected descendentemente
  pruned.sort((a, b) => {
    if (!a.semver || !b.semver) return 0;
    return compareSemver(b.semver, a.semver);
  });
  protectedList.sort((a, b) => {
    if (!a.semver || !b.semver) return 0;
    return compareSemver(b.semver, a.semver);
  });

  return {
    summary: {
      selectedMajors,
      selectedMinorsByMajor,
      retainedPatchesByMinor,
    },
    kept,
    pruned,
    excluded,
    protected: protectedList,
  };
}

/**
 * Consulta los tags remotos de GitHub vía REST API paginada.
 * Implementa control estricto FAIL-CLOSED: si se alcanza el límite máximo de páginas
 * y todavía hay datos pendientes en el remoto, aborta inmediatamente para evitar
 * cálculos de retención o planes de purga sobre un inventario incompleto.
 */
export async function fetchRemoteTags(
  token: string,
  owner: string,
  repo: string,
  options: { maxPages?: number; perPage?: number; fetchFn?: typeof fetch } = {},
): Promise<GitTagRef[]> {
  const tags: GitTagRef[] = [];
  let page = 1;
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 30; // 3.000 tags máximo por defecto
  const fetchFn = options.fetchFn ?? fetch;

  while (true) {
    if (page > maxPages) {
      throw new Error(
        `Límite de seguridad alcanzado: el inventario excede el tope de ${maxPages * perPage} tags (${maxPages} páginas). Detención de seguridad FAIL-CLOSED para evitar purgas destructivas sobre un inventario incompleto.`,
      );
    }

    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=${perPage}&page=${page}`;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pokedex-tag-retention-script',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} al consultar tags de ${owner}/${repo}: ${errorText}`);
    }

    const data = (await response.json()) as Array<{
      name: string;
      commit: { sha: string };
      node_id?: string;
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const item of data) {
      tags.push({
        name: item.name,
        sha: item.commit.sha,
      });
    }

    const linkHeader = response.headers?.get?.('link');
    const hasNextPage = typeof linkHeader === 'string' ? linkHeader.includes('rel="next"') : data.length === perPage;

    if (!hasNextPage) {
      break;
    }

    // Si alcanzamos la última página permitida y todavía quedan más resultados pendientes
    if (page === maxPages && hasNextPage) {
      throw new Error(
        `Límite de seguridad superado: el repositorio contiene más de ${maxPages * perPage} tags (${maxPages} páginas). Detención de seguridad FAIL-CLOSED para evitar purgas destructivas sobre un inventario incompleto.`,
      );
    }

    page++;
  }

  return tags;
}

/**
 * Consulta un tag específico en el remoto para verificar existencia y precondición de SHA.
 * Desreferencia automáticamente tags anotados ("type": "tag") para resolver el SHA
 * del commit destino y permitir comparaciones correctas contra el inventario.
 */
export async function fetchRemoteTagRef(
  token: string,
  owner: string,
  repo: string,
  tagName: string,
  fetchFn: typeof fetch = fetch,
): Promise<GitRemoteRefDetail | null> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/tags/${encodeURIComponent(tagName)}`;

  const response = await fetchFn(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pokedex-tag-retention-script',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status} al verificar tag refs/tags/${tagName}: ${errorText}`);
  }

  const data = (await response.json()) as {
    ref?: string;
    object?: { sha?: string; type?: string; url?: string };
  };

  const refSha = data.object?.sha;
  const objType = data.object?.type || 'commit';

  if (!refSha || !isValidGitSha(refSha)) {
    throw new Error(
      `Estructura inválida o SHA malformado para refs/tags/${tagName}: object.sha ('${refSha}') no es un hash de Git válido.`,
    );
  }

  // Si es un tag anotado ("type": "tag"), desreferenciarlo para obtener el commit SHA destino
  if (objType === 'tag') {
    const tagUrl =
      data.object?.url ||
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/tags/${encodeURIComponent(refSha)}`;
    const tagResponse = await fetchFn(tagUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pokedex-tag-retention-script',
      },
    });

    if (!tagResponse.ok) {
      const errorText = await tagResponse.text();
      throw new Error(
        `Error ${tagResponse.status} al resolver objeto tag anotado ${refSha} para ${tagName}: ${errorText}`,
      );
    }

    const tagData = (await tagResponse.json()) as { object?: { sha?: string } };
    const targetCommitSha = tagData.object?.sha;
    if (!targetCommitSha || !isValidGitSha(targetCommitSha)) {
      throw new Error(
        `Estructura inválida en objeto tag anotado ${refSha} para ${tagName}: commit destino ('${targetCommitSha}') malformado o ausente.`,
      );
    }

    return {
      tagName,
      refSha,
      targetCommitSha,
      type: 'tag',
      isAnnotated: true,
    };
  }

  return {
    tagName,
    refSha,
    targetCommitSha: refSha,
    type: objType,
    isAnnotated: false,
  };
}

export interface EnrichTagsOptions {
  fetchFn?: typeof fetch;
  maxPages?: number;
  perPage?: number;
  strict?: boolean;
}

/**
 * Enriquece el inventario de tags con el SHA exacto del objeto de referencia (refSha)
 * consultando git/matching-refs/tags con paginación completa y control FAIL-CLOSED.
 *
 * En modo estricto (strict=true, obligatorio en purga destructiva real):
 *   - Falla inmediatamente ante cualquier error HTTP o excepción de red.
 *   - Falla inmediatamente si se supera el límite de páginas de seguridad (maxPages).
 *   - Falla inmediatamente si algún tag del inventario no se encuentra en las referencias remotas.
 *   - Falla inmediatamente si se detecta inconsistencia entre el commit del inventario y la referencia ligera.
 *
 * En modo no estricto (dry-run o diagnóstico):
 *   - Registra advertencias y degrada de forma segura si la API no está disponible.
 */
export async function enrichTagsWithRemoteRefs(
  token: string,
  owner: string,
  repo: string,
  tags: GitTagRef[],
  optionsOrFetchFn: EnrichTagsOptions | typeof fetch = {},
): Promise<void> {
  const options: EnrichTagsOptions =
    typeof optionsOrFetchFn === 'function' ? { fetchFn: optionsOrFetchFn } : optionsOrFetchFn;

  if (tags.length === 0) return;

  const fetchFn = options.fetchFn ?? fetch;
  const strict = options.strict ?? false;
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 30;

  if (!token) {
    if (strict) {
      throw new Error(
        'Token de GitHub no configurado para enriquecer referencias en modo destructivo. Operación cancelada por seguridad.',
      );
    }
    return;
  }

  const refsMap = new Map<string, { refSha: string; type: string }>();
  let page = 1;

  try {
    while (true) {
      if (page > maxPages) {
        throw new Error(
          `Límite de seguridad alcanzado en matching-refs: excede el tope de ${maxPages * perPage} referencias (${maxPages} páginas). Detención de seguridad FAIL-CLOSED.`,
        );
      }

      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/matching-refs/tags?per_page=${perPage}&page=${page}`;
      const response = await fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'pokedex-tag-retention-script',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Error ${response.status} al consultar matching-refs de ${owner}/${repo} (página ${page}): ${errorText}`,
        );
      }

      const data = (await response.json()) as Array<{
        ref: string;
        object?: { sha?: string; type?: string };
      }>;

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      for (const item of data) {
        if (!item || typeof item !== 'object') {
          if (strict) {
            throw new Error(
              `Respuesta remota malformada en matching-refs de ${owner}/${repo}: elemento inválido recibido de la API.`,
            );
          }
          continue;
        }

        const rawRef = item.ref;
        const rawSha = item.object?.sha;

        if (strict) {
          if (typeof rawRef !== 'string' || !rawRef.startsWith('refs/tags/')) {
            throw new Error(
              `Referencia remota malformada en matching-refs de ${owner}/${repo}: 'ref' ('${String(rawRef)}') no tiene el formato esperado 'refs/tags/*'. Abortando en modo estricto por seguridad (FAIL-CLOSED).`,
            );
          }

          const tagName = rawRef.slice('refs/tags/'.length);
          if (!tagName || tagName.trim() === '') {
            throw new Error(
              `Referencia remota malformada en matching-refs de ${owner}/${repo}: nombre de tag vacío en ref '${rawRef}'. Abortando en modo estricto por seguridad (FAIL-CLOSED).`,
            );
          }

          if (typeof rawSha !== 'string' || !isValidGitSha(rawSha)) {
            throw new Error(
              `Referencia remota inválida o malformada en matching-refs de ${owner}/${repo} para '${rawRef}': object.sha ('${String(rawSha)}') ausente o no es un hash de Git válido. Abortando en modo estricto por seguridad (FAIL-CLOSED).`,
            );
          }

          refsMap.set(tagName, {
            refSha: rawSha,
            type: item.object?.type || 'commit',
          });
        } else {
          if (rawRef?.startsWith('refs/tags/') && rawSha && isValidGitSha(rawSha)) {
            const tagName = rawRef.slice('refs/tags/'.length);
            if (tagName && tagName.trim() !== '') {
              refsMap.set(tagName, {
                refSha: rawSha,
                type: item.object?.type || 'commit',
              });
            }
          }
        }
      }

      const linkHeader = response.headers?.get?.('link');
      const hasNextPage = typeof linkHeader === 'string' ? linkHeader.includes('rel="next"') : data.length === perPage;

      if (!hasNextPage) {
        break;
      }

      if (page === maxPages && hasNextPage) {
        throw new Error(
          `Límite de seguridad superado en matching-refs: el repositorio contiene más de ${maxPages * perPage} referencias (${maxPages} páginas). Detención de seguridad FAIL-CLOSED.`,
        );
      }

      page++;
    }
  } catch (err: unknown) {
    if (strict) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Fallo crítico en enriquecimiento de referencias remotas: ${msg}. En modo destructivo se requiere inventario completo y validado. Purga cancelada por seguridad.`,
      );
    }
    console.warn(
      `⚠️  Advertencia: No se pudieron enriquecer las referencias remotas: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  // Mapeo y validación de cobertura de tags (consistencia bidireccional estricta)
  const initialTagNames = new Set(tags.map((t) => t.name));

  for (const tag of tags) {
    const refDetail = refsMap.get(tag.name);
    if (refDetail) {
      tag.refSha = refDetail.refSha;
      tag.isAnnotated = refDetail.type === 'tag';

      if (strict && !tag.isAnnotated && !areShasEqual(tag.refSha, tag.sha)) {
        throw new Error(
          `Inconsistencia de inventario en tag ligero ${tag.name}: el SHA de la referencia (${tag.refSha}) difiere del commit devuelto por la API de tags (${tag.sha}). Abortando operación destructiva por seguridad.`,
        );
      }
    } else if (strict) {
      throw new Error(
        `Inventario incompleto: el tag ${tag.name} no se encontró en las referencias remotas de GitHub (git/matching-refs/tags). Abortando operación destructiva por seguridad (FAIL-CLOSED).`,
      );
    }
  }

  // Validación inversa: en modo estricto, comprobar que NO existan referencias adicionales
  // en matching-refs que no estuvieran en el inventario inicial (ej. publicación concurrente de tags)
  if (strict) {
    const extraneousRefs: string[] = [];
    for (const remoteTagName of refsMap.keys()) {
      if (!initialTagNames.has(remoteTagName)) {
        extraneousRefs.push(remoteTagName);
      }
    }

    if (extraneousRefs.length > 0) {
      throw new Error(
        `Inconsistencia bidireccional de inventario: se detectaron ${extraneousRefs.length} referencias remotas en matching-refs que no existían en el inventario inicial (${extraneousRefs.slice(0, 5).join(', ')}${extraneousRefs.length > 5 ? '...' : ''}). Posible publicación concurrente de tags durante la ejecución. Cancelando operación destructiva por seguridad (FAIL-CLOSED).`,
      );
    }
  }
}

/**
 * Elimina una referencia de tag de Git en GitHub vía API REST con verificación de precondición estricta en dos fases.
 *
 * LIMITACIÓN ARQUITECTURAL TOCTOU DE LA API DE GITHUB:
 * La API Git Data de GitHub ('DELETE /repos/{owner}/{repo}/git/refs/tags/{tagName}') no soporta
 * primitivas de exclusión mutua condicional ni transacciones Compare-And-Swap (CAS)
 * mediante cabeceras condicionales (como 'If-Match') para referencias Git.
 * Por consiguiente, esta función implementa una verificación en dos fases inmediatamente contigua:
 * consulta el estado actual ('fetchRemoteTagRef'), valida la igualdad estricta ('===')
 * tanto del 'refSha' como del 'commitSha', y si coinciden, emite el 'DELETE'.
 * La ventana temporal de carrera (TOCTOU) queda minimizada a la latencia de red entre ambas peticiones,
 * pero no puede considerarse formalmente atómica a nivel de protocolo de GitHub.
 */
export async function deleteRemoteTag(
  token: string,
  owner: string,
  repo: string,
  tagName: string,
  precondition: TagDeletePrecondition,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (!precondition || typeof precondition !== 'object') {
    throw new Error(
      `Precondición obligatoria ausente para tag ${tagName}: se requiere un objeto TagDeletePrecondition con hashes válidos para autorizar el borrado seguro.`,
    );
  }

  if (!isValidGitSha(precondition.commitSha)) {
    throw new Error(
      `Precondición inválida para tag ${tagName}: commitSha ('${precondition.commitSha}') no es un hash de Git de 40 hex válido.`,
    );
  }

  if (precondition.refSha !== undefined && !isValidGitSha(precondition.refSha)) {
    throw new Error(
      `Precondición inválida para tag ${tagName}: refSha ('${precondition.refSha}') no es un hash de Git de 40 hex válido.`,
    );
  }

  const current = await fetchRemoteTagRef(token, owner, repo, tagName, fetchFn);
  if (!current) {
    console.warn(`   ⚠️ Tag refs/tags/${tagName} ya no existe en el remoto. Nada que eliminar.`);
    return false;
  }

  // 1. Verificación obligatoria de refSha para tags anotados o cuando se especifique refSha
  if (current.isAnnotated) {
    if (!precondition.refSha) {
      throw new Error(
        `Precondición no fiable para tag anotado ${tagName}: se requiere el SHA de referencia (refSha) además del commitSha para autorizar el borrado seguro.`,
      );
    }
    if (!areShasEqual(current.refSha, precondition.refSha)) {
      throw new Error(
        `Conflicto concurrente en tag ${tagName}: el SHA de la referencia (${current.refSha}) difiere del esperado (${precondition.refSha}). La referencia mutó a otro objeto tag/commit. Operación cancelada por seguridad.`,
      );
    }
  } else if (precondition.refSha && !areShasEqual(current.refSha, precondition.refSha)) {
    throw new Error(
      `Conflicto concurrente en tag ${tagName}: el SHA de la referencia (${current.refSha}) difiere del esperado (${precondition.refSha}). Operación cancelada por seguridad.`,
    );
  }

  // 2. Verificación obligatoria exacta de commitSha
  if (!areShasEqual(current.targetCommitSha, precondition.commitSha)) {
    throw new Error(
      `Conflicto concurrente en tag ${tagName}: el commit destino (${current.targetCommitSha}) difiere del esperado (${precondition.commitSha}). Operación cancelada por seguridad.`,
    );
  }

  const deleteUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/tags/${encodeURIComponent(tagName)}`;

  const response = await fetchFn(deleteUrl, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pokedex-tag-retention-script',
    },
  });

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status} al eliminar refs/tags/${tagName}: ${errorText}`);
  }

  return true;
}

/**
 * Revalida exhaustivamente el inventario global de tags remotos inmediatamente antes de iniciar
 * las eliminaciones destructivas, reduciendo la ventana de carrera concurrente (TOCTOU) al mínimo.
 *
 * Compara el inventario remoto fresco contra el inventario evaluado inicialmente y aborta (FAIL-CLOSED) si:
 *   - El número total de referencias remotas difiere (indicando publicación o eliminación concurrente).
 *   - Cualquier tag evaluado ha desaparecido o mutado de commit/refSha.
 *   - Ha aparecido cualquier tag nuevo que no existía en el inventario inicial.
 */
export async function revalidateGlobalRemoteInventory(
  token: string,
  owner: string,
  repo: string,
  expectedTags: GitTagRef[],
  options: {
    fetchFn?: typeof fetch;
    maxPages?: number;
    perPage?: number;
  } = {},
): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const freshTags = await fetchRemoteTags(token, owner, repo, {
    fetchFn,
    maxPages: options.maxPages,
    perPage: options.perPage,
  });

  await enrichTagsWithRemoteRefs(token, owner, repo, freshTags, {
    fetchFn,
    maxPages: options.maxPages,
    perPage: options.perPage,
    strict: true,
  });

  if (freshTags.length !== expectedTags.length) {
    throw new Error(
      `Inconsistencia concurrente en revalidación global: el número de tags remotos cambió de ${expectedTags.length} a ${freshTags.length} inmediatamente antes de iniciar la purga. Posible publicación o mutación de tags concurrente. Operación cancelada por seguridad (FAIL-CLOSED).`,
    );
  }

  const freshMap = new Map<string, GitTagRef>(freshTags.map((t) => [t.name, t]));

  for (const expected of expectedTags) {
    const fresh = freshMap.get(expected.name);
    if (!fresh) {
      throw new Error(
        `Inconsistencia concurrente en revalidación global: el tag ${expected.name} ya no existe en el remoto inmediatamente antes de iniciar la purga. Operación cancelada por seguridad (FAIL-CLOSED).`,
      );
    }
    if (!areShasEqual(fresh.sha, expected.sha)) {
      throw new Error(
        `Inconsistencia concurrente en revalidación global: el commit de ${expected.name} mutó en el remoto (esperado ${expected.sha}, obtenido ${fresh.sha}). Operación cancelada por seguridad (FAIL-CLOSED).`,
      );
    }
    if (expected.refSha && fresh.refSha && !areShasEqual(fresh.refSha, expected.refSha)) {
      throw new Error(
        `Inconsistencia concurrente en revalidación global: la referencia ${expected.name} mutó en el remoto (esperado ${expected.refSha}, obtenido ${fresh.refSha}). Operación cancelada por seguridad (FAIL-CLOSED).`,
      );
    }
  }

  const expectedSet = new Set(expectedTags.map((t) => t.name));
  const newTags: string[] = [];
  for (const fresh of freshTags) {
    if (!expectedSet.has(fresh.name)) {
      newTags.push(fresh.name);
    }
  }

  if (newTags.length > 0) {
    throw new Error(
      `Inconsistencia concurrente en revalidación global: se detectaron nuevos tags publicados en el remoto inmediatamente antes de iniciar la purga (${newTags.join(', ')}). Operación cancelada por seguridad (FAIL-CLOSED).`,
    );
  }
}

/**
 * Genera un conjunto representativo de tags sintéticos para pruebas y simulación.
 */
export function generateMockTags(): GitTagRef[] {
  const names = [
    'v1.4.0',
    'v1.5.2',
    'v2.1.0',
    'v2.1.3',
    'v2.2.0',
    'v2.2.2',
    'v2.3.0',
    'v2.3.4',
    'v2.4.0',
    'v3.0.0',
    'v3.1.0',
    'v3.1.4',
    'v3.2.0',
    'v3.2.2',
    'v3.3.0',
    'v3.3.5',
    'v3.4.0',
    'v3.4.1',
    'v3.5.0-rc.1', // prerelease
    'custom-test-build', // inválido
  ];

  return names.map((name, i) => {
    const hexCommit = (i + 1).toString(16).padStart(4, '0');
    const hexRef = (i + 101).toString(16).padStart(4, '0');
    return {
      name,
      sha: `${hexCommit.repeat(10)}`,
      refSha: `${hexRef.repeat(10)}`,
      date: new Date(Date.now() - (names.length - i) * 86400000).toISOString(),
      isAnnotated: true,
    };
  });
}

/**
 * Aplica la política de retención jerárquica de tags conforme a las opciones configuradas.
 */
export async function applyTagRetention(options: TagRetentionOptions = {}): Promise<TagRetentionResult> {
  const config: HierarchicalRetentionConfig = {
    keepMajorCount:
      options.config?.keepMajorCount !== undefined
        ? parseStrictPositiveInt(options.config.keepMajorCount, 'config.keepMajorCount')
        : DEFAULT_CONFIG.keepMajorCount,
    keepMinorCount:
      options.config?.keepMinorCount !== undefined
        ? parseStrictPositiveInt(options.config.keepMinorCount, 'config.keepMinorCount')
        : DEFAULT_CONFIG.keepMinorCount,
    keepPatchCount:
      options.config?.keepPatchCount !== undefined
        ? parseStrictPositiveInt(options.config.keepPatchCount, 'config.keepPatchCount')
        : DEFAULT_CONFIG.keepPatchCount,
  };

  const validatedMaxPages =
    options.maxPages !== undefined ? parseStrictPositiveInt(options.maxPages, 'options.maxPages') : undefined;

  const dryRun = options.dryRun ?? true; // Dry-run por defecto
  const simulate = options.simulate ?? false;
  const owner = options.owner || process.env.GITHUB_REPOSITORY_OWNER || DEFAULT_OWNER;
  const repo = options.repo || DEFAULT_REPO;
  const token = options.token || process.env.GITHUB_TOKEN || '';
  const repoRoot = options.repoRoot || process.cwd();

  console.log('================================================================');
  console.log('🏷️  POLÍTICA DE RETENCIÓN JERÁRQUICA DE GIT TAGS (OPCIÓN B)');
  console.log('================================================================');
  console.log(`• Repositorio objetivo       : ${owner}/${repo}`);
  console.log(
    `• Configuración jerárquica   : ${config.keepMajorCount} Majors -> ${config.keepMinorCount} Minors por Major -> Último ${config.keepPatchCount} Patch por Minor`,
  );
  console.log(`• Modo Dry-Run (Solo lectura): ${dryRun ? 'SÍ (No se eliminará nada)' : 'NO (Eliminación real)'}`);
  const fetchFn = options.fetchFn ?? fetch;
  const effectiveSimulate = simulate || (!token && !options.fetchFn);
  const autoSimulated = effectiveSimulate && !simulate;
  console.log(
    `• Modo Simulado              : ${
      autoSimulated
        ? 'SÍ (automático por falta de GITHUB_TOKEN; datos sintéticos)'
        : effectiveSimulate
          ? 'SÍ (Datos de prueba locales)'
          : 'NO'
    }`,
  );

  if (autoSimulated) {
    console.warn('⚠️  ADVERTENCIA: GITHUB_TOKEN no configurado.');
    console.warn('   Activando modo simulación automático (--simulate) para diagnóstico seguro.');
  }

  const protectedTagsMap = options.protectedTags ?? collectProtectedTags(repoRoot, options.customProtectedTags || []);
  console.log(`• Referencias protegidas     : ${protectedTagsMap.size}`);
  for (const [pTag, pReason] of protectedTagsMap.entries()) {
    console.log(`    🔒 ${pTag} -> ${pReason}`);
  }
  console.log('----------------------------------------------------------------');

  let rawTags: GitTagRef[] = [];

  if (effectiveSimulate) {
    rawTags = options.mockTags || generateMockTags();
    console.log(`   [Simulación] Se evaluarán ${rawTags.length} tags sintéticos locales.`);
  } else {
    try {
      console.log('🔍 Consultando inventario de tags remotos en GitHub...');
      rawTags = await fetchRemoteTags(token, owner, repo, {
        fetchFn,
        maxPages: validatedMaxPages,
      });
      // Capturar identidades de referencia (refSha) iniciales desde matching-refs con control FAIL-CLOSED
      const isDestructive = !dryRun && !effectiveSimulate;
      await enrichTagsWithRemoteRefs(token, owner, repo, rawTags, {
        fetchFn,
        maxPages: validatedMaxPages,
        strict: isDestructive,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error al consultar tags de ${owner}/${repo}: ${msg}`);
      throw err;
    }
  }

  console.log(`• Total de tags encontrados  : ${rawTags.length}`);

  // AUD-REL-RET-002: En ejecución real sin mapa de protección inyectado manualmente,
  // asegurar que los últimos 3 tags SemVer estables del inventario remoto también
  // queden protegidos aunque el clon local no tuviera todos los tags descargados.
  if (!effectiveSimulate && options.protectedTags === undefined) {
    protectRollbackWindowTags(
      rawTags.map((t) => t.name),
      protectedTagsMap,
    );
  }

  const {
    summary,
    kept,
    pruned,
    excluded,
    protected: protectedList,
  } = evaluateHierarchicalTagRetention(rawTags, config, protectedTagsMap);

  console.log('\n📊 Resumen de Jerarquía SemVer:');
  console.log(
    `   • Líneas Major seleccionadas (${summary.selectedMajors.length}): [${summary.selectedMajors.map((m) => `v${m}.x`).join(', ')}]`,
  );
  for (const m of summary.selectedMajors) {
    const minors = summary.selectedMinorsByMajor[m] || [];
    console.log(`     - Major v${m}.x -> Minors retenidas: [${minors.map((n) => `v${m}.${n}.x`).join(', ')}]`);
  }

  console.log(`\n• Tags conservados por jerarquía (${kept.length}):`);
  kept.forEach((item, idx) => {
    console.log(
      `    [ACTIVO #${idx + 1}] ${item.tag.name} (SHA: ${item.tag.sha.slice(0, 10)}) -> ${item.retentionDecision?.reason}`,
    );
  });

  if (protectedList.length > 0) {
    console.log(`\n• Tags protegidos fuera de la jerarquía retenida (${protectedList.length}):`);
    protectedList.forEach((item) => {
      console.log(`    [PROTEGIDO] ${item.tag.name} -> ${item.retentionDecision?.reason}`);
    });
  }

  if (excluded.length > 0) {
    console.log(`\n• Tags excluidos de la política (${excluded.length}):`);
    excluded.forEach((item) => {
      console.log(`    [EXCLUIDO] ${item.tag.name} -> Motivo: ${item.exclusionReason}`);
    });
  }

  console.log(`\n• Candidatos a purga (${pruned.length}):`);
  const deletedTags: string[] = [];

  if (pruned.length === 0) {
    console.log('ℹ️  No hay tags elegibles para purgar. El inventario cumple la política jerárquica.');
  } else {
    // Si es borrado real, realizar comprobación previa de seguridad
    if (!dryRun && !effectiveSimulate) {
      console.log('\n🔒 Validando completitud de identidad del inventario antes de proceder...');
      for (const item of [...kept, ...pruned]) {
        if (!item.tag.refSha || !isValidGitSha(item.tag.refSha)) {
          throw new Error(
            `Inconsistencia crítica de seguridad: el tag ${item.tag.name} no posee refSha inicial capturado en el inventario. Abortando purga por seguridad (FAIL-CLOSED).`,
          );
        }
      }

      console.log('\n🔒 Verificando existencia e identidad de los tags conservados antes de proceder...');
      for (const item of kept) {
        const check = await fetchRemoteTagRef(token, owner, repo, item.tag.name, fetchFn);
        if (!check) {
          throw new Error(
            `Inconsistencia crítica: El tag retenido ${item.tag.name} no se encontró en el remoto. Abortando purga por seguridad.`,
          );
        }
        if (!areShasEqual(check.targetCommitSha, item.tag.sha)) {
          throw new Error(
            `Inconsistencia crítica: El tag retenido ${item.tag.name} mutó de commit en el remoto (esperado ${item.tag.sha}, encontrado ${check.targetCommitSha}). Abortando purga por seguridad.`,
          );
        }
        if (item.tag.refSha && !areShasEqual(check.refSha, item.tag.refSha)) {
          throw new Error(
            `Inconsistencia crítica: El tag retenido ${item.tag.name} mutó de objeto de referencia en el remoto (esperado ${item.tag.refSha}, encontrado ${check.refSha}). Abortando purga por seguridad.`,
          );
        }
      }
      console.log('✅ Verificación de integridad e identidad de tags conservados completada.');

      console.log('🔒 Verificando precondiciones de referencia en dos fases para los tags candidatos a purga...');
      for (const item of pruned) {
        const checkPruned = await fetchRemoteTagRef(token, owner, repo, item.tag.name, fetchFn);
        if (!checkPruned) {
          throw new Error(
            `Inconsistencia crítica: El tag candidato a purga ${item.tag.name} no se encontró en el remoto al capturar precondiciones. Abortando purga por seguridad.`,
          );
        }
        const inventoryCommitSha = item.tag.sha;
        if (!areShasEqual(checkPruned.targetCommitSha, inventoryCommitSha)) {
          throw new Error(
            `Conflicto concurrente en tag ${item.tag.name}: el commit destino remoto (${checkPruned.targetCommitSha}) difiere del SHA evaluado en el inventario (${inventoryCommitSha}). La referencia mutó entre el cálculo y la purga. Operación cancelada por seguridad.`,
          );
        }
        if (item.tag.refSha && !areShasEqual(checkPruned.refSha, item.tag.refSha)) {
          throw new Error(
            `Conflicto concurrente en tag ${item.tag.name}: el SHA de la referencia remota (${checkPruned.refSha}) difiere del objeto evaluado en el inventario inicial (${item.tag.refSha}). El objeto tag anotado mutó aunque apunte al mismo commit. Operación cancelada por seguridad.`,
          );
        }
        item.tag.refSha = checkPruned.refSha;
        item.tag.sha = checkPruned.targetCommitSha;
        item.tag.isAnnotated = checkPruned.isAnnotated;
      }
      console.log('✅ Precondiciones fijadas.');

      console.log('\n🔒 Revalidando inventario global en remoto inmediatamente antes del primer borrado...');
      await revalidateGlobalRemoteInventory(token, owner, repo, rawTags, {
        fetchFn,
        maxPages: options.maxPages,
      });
      console.log(
        '✅ Revalidación global del inventario completada sin discrepancias concurrentes. Procediendo a eliminar tags candidatos:',
      );
    }

    for (const item of pruned) {
      const tagName = item.tag.name;
      if (dryRun || effectiveSimulate) {
        console.log(`    [PURGA - DRY RUN] ${tagName} -> ${item.retentionDecision?.reason}`);
        deletedTags.push(tagName);
      } else {
        try {
          const ok = await deleteRemoteTag(
            token,
            owner,
            repo,
            tagName,
            {
              commitSha: item.tag.sha,
              refSha: item.tag.refSha,
            },
            fetchFn,
          );
          if (ok) {
            console.log(`    [ELIMINADO] ${tagName} purgado exitosamente del remoto.`);
            deletedTags.push(tagName);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`    ❌ Fallo al eliminar tag ${tagName}: ${msg}`);
          throw err;
        }
      }
    }
  }

  console.log('\n================================================================');
  console.log(
    `✔ Política jerárquica finalizada: ${kept.length} en jerarquía + ${protectedList.length} protegidos + ${excluded.length} excluidos conservados.`,
  );
  console.log('================================================================');
  if (effectiveSimulate) {
    console.warn('⚠️  RESULTADO SIMULADO: evalúa tags sintéticos y NO refleja los tags reales del repositorio.');
    console.warn('   Para verificar el remoto, ejecute con GITHUB_TOKEN configurado.');
  }

  return {
    totalFound: rawTags.length,
    eligibleCount: kept.length + pruned.length + protectedList.length,
    config,
    summary,
    kept,
    pruned,
    excluded,
    protected: protectedList,
    deletedTags,
    dryRun,
    simulated: effectiveSimulate,
  };
}

// Ejecución CLI directa
if (process.argv[1]?.endsWith('tag-retention.ts')) {
  const args = process.argv.slice(2);
  const isSimulate = args.includes('--simulate');
  const hasDryRunArg = args.includes('--dry-run');
  const hasNoDryRunArg = args.includes('--no-dry-run');
  const isDryRun = hasNoDryRunArg ? false : hasDryRunArg || true;

  let keepMajorCount = DEFAULT_CONFIG.keepMajorCount;
  const majorArg = args.find((a) => a.startsWith('--major='));
  if (majorArg) {
    keepMajorCount = parseStrictPositiveInt(majorArg.split('=')[1], '--major');
  }

  let keepMinorCount = DEFAULT_CONFIG.keepMinorCount;
  const minorArg = args.find((a) => a.startsWith('--minor='));
  if (minorArg) {
    keepMinorCount = parseStrictPositiveInt(minorArg.split('=')[1], '--minor');
  }

  let keepPatchCount = DEFAULT_CONFIG.keepPatchCount;
  const patchArg = args.find((a) => a.startsWith('--patch='));
  if (patchArg) {
    keepPatchCount = parseStrictPositiveInt(patchArg.split('=')[1], '--patch');
  }

  const ownerArg = args.find((a) => a.startsWith('--owner='));
  const owner = ownerArg ? ownerArg.split('=')[1] : undefined;

  const repoArg = args.find((a) => a.startsWith('--repo='));
  const repo = repoArg ? repoArg.split('=')[1] : undefined;

  const protectArg = args.find((a) => a.startsWith('--protect='));
  const customProtectedTags = protectArg ? protectArg.split('=')[1].split(',') : undefined;

  let maxPages: number | undefined;
  const maxPagesArg = args.find((a) => a.startsWith('--max-pages='));
  if (maxPagesArg) {
    maxPages = parseStrictPositiveInt(maxPagesArg.split('=')[1], '--max-pages');
  } else if (process.env.TAG_RETENTION_MAX_PAGES) {
    maxPages = parseStrictPositiveInt(process.env.TAG_RETENTION_MAX_PAGES, 'TAG_RETENTION_MAX_PAGES');
  }

  applyTagRetention({
    dryRun: isDryRun,
    simulate: isSimulate,
    config: {
      keepMajorCount,
      keepMinorCount,
      keepPatchCount,
    },
    owner,
    repo,
    customProtectedTags,
    maxPages,
  }).catch((err) => {
    console.error('❌ Error fatal en retención jerárquica de tags:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
