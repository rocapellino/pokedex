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

/**
 * Expresión regular SemVer 2.0 canónica que admite prefijo 'v' opcional.
 * Grupos: 1=major, 2=minor, 3=patch, 4=prerelease, 5=build metadata.
 */
export const SEMVER_TAG_REGEX =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

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
 * Recolecta todos los tags que están activamente protegidos por GitOps, Helm, package.json
 * y una lista personalizada de excepciones.
 */
export function collectProtectedTags(
  root: string = process.cwd(),
  customExceptions: string[] = [],
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

    const linkHeader = response.headers?.get?.('link') || '';
    const hasNextPage = linkHeader.includes('rel="next"') || data.length === perPage;

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

  const refSha = data.object?.sha || '';
  const objType = data.object?.type || 'commit';

  // Si es un tag anotado ("type": "tag"), desreferenciarlo para obtener el commit SHA destino
  if (objType === 'tag' && refSha) {
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

    if (tagResponse.ok) {
      const tagData = (await tagResponse.json()) as { object?: { sha?: string } };
      const targetCommitSha = tagData.object?.sha || refSha;
      return {
        tagName,
        refSha,
        targetCommitSha,
        type: 'tag',
        isAnnotated: true,
      };
    }
  }

  return {
    tagName,
    refSha,
    targetCommitSha: refSha,
    type: objType,
    isAnnotated: false,
  };
}

/**
 * Elimina una referencia de tag de Git en GitHub vía API REST con verificación de precondición.
 * Soporta tanto tags ligeros como tags anotados, validando expectedSha contra targetCommitSha y refSha.
 */
export async function deleteRemoteTag(
  token: string,
  owner: string,
  repo: string,
  tagName: string,
  expectedSha?: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const current = await fetchRemoteTagRef(token, owner, repo, tagName, fetchFn);
  if (!current) {
    console.warn(`   ⚠️ Tag refs/tags/${tagName} ya no existe en el remoto. Nada que eliminar.`);
    return false;
  }

  if (expectedSha) {
    const matchesCommit =
      current.targetCommitSha &&
      (current.targetCommitSha.startsWith(expectedSha) || expectedSha.startsWith(current.targetCommitSha));
    const matchesRef =
      current.refSha && (current.refSha.startsWith(expectedSha) || expectedSha.startsWith(current.refSha));

    if (!matchesCommit && !matchesRef) {
      throw new Error(
        `Conflicto concurrente en tag ${tagName}: SHA actual (ref: ${current.refSha}, commit: ${current.targetCommitSha}) difiere del evaluado (${expectedSha}). Operación cancelada por seguridad.`,
      );
    }
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

  return names.map((name, i) => ({
    name,
    sha: `sha-${name.replace(/[^a-zA-Z0-9]/g, '')}-${i.toString().padStart(4, '0')}`.padEnd(40, '0'),
    date: new Date(Date.now() - (names.length - i) * 86400000).toISOString(),
    isAnnotated: true,
  }));
}

/**
 * Aplica la política de retención jerárquica de tags conforme a las opciones configuradas.
 */
export async function applyTagRetention(options: TagRetentionOptions = {}): Promise<TagRetentionResult> {
  const config: HierarchicalRetentionConfig = {
    keepMajorCount: options.config?.keepMajorCount ?? DEFAULT_CONFIG.keepMajorCount,
    keepMinorCount: options.config?.keepMinorCount ?? DEFAULT_CONFIG.keepMinorCount,
    keepPatchCount: options.config?.keepPatchCount ?? DEFAULT_CONFIG.keepPatchCount,
  };

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
  console.log(`• Modo Simulado              : ${simulate ? 'SÍ (Datos de prueba locales)' : 'NO'}`);

  if (!token && !simulate) {
    console.warn('⚠️  ADVERTENCIA: GITHUB_TOKEN no configurado.');
    console.warn('   Activando modo simulación automático (--simulate) para diagnóstico seguro.');
  }

  const fetchFn = options.fetchFn ?? fetch;
  const effectiveSimulate = simulate || (!token && !options.fetchFn);
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
        maxPages: options.maxPages,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error al consultar tags de ${owner}/${repo}: ${msg}`);
      throw err;
    }
  }

  console.log(`• Total de tags encontrados  : ${rawTags.length}`);

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
      console.log('\n🔒 Verificando que los tags conservados siguen existiendo en el remoto antes de proceder...');
      for (const item of kept) {
        const check = await fetchRemoteTagRef(token, owner, repo, item.tag.name, fetchFn);
        if (!check) {
          throw new Error(
            `Inconsistencia crítica: El tag retenido ${item.tag.name} no se encontró en el remoto. Abortando purga por seguridad.`,
          );
        }
      }
      console.log('✅ Verificación de integridad completada. Procediendo a eliminar tags candidatos:');
    }

    for (const item of pruned) {
      const tagName = item.tag.name;
      if (dryRun || effectiveSimulate) {
        console.log(`    [PURGA - DRY RUN] ${tagName} -> ${item.retentionDecision?.reason}`);
        deletedTags.push(tagName);
      } else {
        try {
          const ok = await deleteRemoteTag(token, owner, repo, tagName, item.tag.sha, fetchFn);
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
    const parsed = parseInt(majorArg.split('=')[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) keepMajorCount = parsed;
  }

  let keepMinorCount = DEFAULT_CONFIG.keepMinorCount;
  const minorArg = args.find((a) => a.startsWith('--minor='));
  if (minorArg) {
    const parsed = parseInt(minorArg.split('=')[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) keepMinorCount = parsed;
  }

  let keepPatchCount = DEFAULT_CONFIG.keepPatchCount;
  const patchArg = args.find((a) => a.startsWith('--patch='));
  if (patchArg) {
    const parsed = parseInt(patchArg.split('=')[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) keepPatchCount = parsed;
  }

  const ownerArg = args.find((a) => a.startsWith('--owner='));
  const owner = ownerArg ? ownerArg.split('=')[1] : undefined;

  const repoArg = args.find((a) => a.startsWith('--repo='));
  const repo = repoArg ? repoArg.split('=')[1] : undefined;

  const protectArg = args.find((a) => a.startsWith('--protect='));
  const customProtectedTags = protectArg ? protectArg.split('=')[1].split(',') : undefined;

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
  }).catch((err) => {
    console.error('❌ Error fatal en retención jerárquica de tags:', err);
    process.exit(1);
  });
}
