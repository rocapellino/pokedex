/**
 * ==============================================================================
 * scripts/tag-retention/evaluator.ts
 *
 * Algoritmo de evaluación jerárquica SemVer 2.0 (Opción B) y generación de
 * inventario sintético para simulación y pruebas.
 * ==============================================================================
 */

import { compareSemver, parseSemverTag } from './semver.ts';
import {
  DEFAULT_CONFIG,
  type GitTagRef,
  type HierarchicalRetentionConfig,
  type HierarchicalRetentionSummary,
  type ParsedSemver,
  type TagEvaluation,
} from './types.ts';

type StableTagEvaluation = TagEvaluation & { semver: ParsedSemver };
type HierarchyMap = Map<number, Map<number, StableTagEvaluation[]>>;

function classifyTags(
  tags: GitTagRef[],
  protectedTagsMap: Map<string, string>,
): { eligibleStable: StableTagEvaluation[]; excluded: TagEvaluation[] } {
  const eligibleStable: StableTagEvaluation[] = [];
  const excluded: TagEvaluation[] = [];

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

  return { eligibleStable, excluded };
}

function checkAmbiguousVersions(eligibleStable: StableTagEvaluation[]): void {
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
}

function buildHierarchyMap(eligibleStable: StableTagEvaluation[]): HierarchyMap {
  const hierarchy: HierarchyMap = new Map();

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

  return hierarchy;
}

function selectPatchesForMinor(
  patchItems: StableTagEvaluation[],
  major: number,
  minor: number,
  keepPatchCount: number,
  retainedTagNames: Set<string>,
  retainedPatchesByMinor: Record<string, string>,
  kept: TagEvaluation[],
): void {
  patchItems.sort((a, b) => {
    if (b.semver.patch !== a.semver.patch) {
      return b.semver.patch - a.semver.patch;
    }
    if (a.tag.date && b.tag.date) {
      return new Date(b.tag.date).getTime() - new Date(a.tag.date).getTime();
    }
    return 0;
  });

  const selectedPatches = patchItems.slice(0, Math.max(0, keepPatchCount));
  const minorKey = `${major}.${minor}`;

  for (const item of selectedPatches) {
    retainedTagNames.add(item.tag.name);
    item.retentionDecision = {
      level: 'patch',
      reason: `Retenido por jerarquía SemVer: último patch de la línea v${major}.${minor}.x (Major ${major}, Minor ${minor}, Patch ${item.semver.patch})`,
    };
    kept.push(item);
    retainedPatchesByMinor[minorKey] = item.tag.name;
  }
}

function selectKeptHierarchicalTags(
  hierarchy: HierarchyMap,
  config: HierarchicalRetentionConfig,
): {
  kept: TagEvaluation[];
  retainedTagNames: Set<string>;
  selectedMajors: number[];
  selectedMinorsByMajor: Record<number, number[]>;
  retainedPatchesByMinor: Record<string, string>;
} {
  const allMajors = Array.from(hierarchy.keys()).sort((a, b) => b - a);
  const selectedMajors = allMajors.slice(0, Math.max(0, config.keepMajorCount));

  const selectedMinorsByMajor: Record<number, number[]> = {};
  const retainedPatchesByMinor: Record<string, string> = {};
  const retainedTagNames = new Set<string>();
  const kept: TagEvaluation[] = [];

  for (const major of selectedMajors) {
    const minorMap = hierarchy.get(major);
    if (!minorMap) continue;

    const allMinors = Array.from(minorMap.keys()).sort((a, b) => b - a);
    const selectedMinors = allMinors.slice(0, Math.max(0, config.keepMinorCount));
    selectedMinorsByMajor[major] = selectedMinors;

    for (const minor of selectedMinors) {
      const patchItems = minorMap.get(minor);
      if (!patchItems) continue;

      selectPatchesForMinor(
        patchItems,
        major,
        minor,
        config.keepPatchCount,
        retainedTagNames,
        retainedPatchesByMinor,
        kept,
      );
    }
  }

  kept.sort((a, b) => {
    if (!a.semver || !b.semver) return 0;
    return compareSemver(b.semver, a.semver);
  });

  return {
    kept,
    retainedTagNames,
    selectedMajors,
    selectedMinorsByMajor,
    retainedPatchesByMinor,
  };
}

function resolvePruneReason(
  major: number,
  minor: number,
  patch: number,
  selectedMajors: number[],
  selectedMinorsByMajor: Record<number, number[]>,
  retainedPatchesByMinor: Record<string, string>,
  config: HierarchicalRetentionConfig,
): string {
  if (!selectedMajors.includes(major)) {
    return `Línea Major v${major}.x fuera del límite de las últimas ${config.keepMajorCount} majors retenidas (${selectedMajors.join(', ')})`;
  }
  if (!selectedMinorsByMajor[major]?.includes(minor)) {
    return `Línea Minor v${major}.${minor}.x fuera del límite de las últimas ${config.keepMinorCount} minors retenidas para Major ${major}`;
  }
  const minorKey = `${major}.${minor}`;
  const retainedPatch = retainedPatchesByMinor[minorKey];
  return `Patch histórico v${major}.${minor}.${patch} superado por el patch más reciente retenido (${retainedPatch})`;
}

function partitionRemainingTags(
  eligibleStable: StableTagEvaluation[],
  retainedTagNames: Set<string>,
  selectedMajors: number[],
  selectedMinorsByMajor: Record<number, number[]>,
  retainedPatchesByMinor: Record<string, string>,
  config: HierarchicalRetentionConfig,
): { protectedList: TagEvaluation[]; pruned: TagEvaluation[] } {
  const protectedList: TagEvaluation[] = [];
  const pruned: TagEvaluation[] = [];

  for (const item of eligibleStable) {
    if (retainedTagNames.has(item.tag.name)) {
      continue;
    }

    const { major, minor, patch } = item.semver;
    const pruneReason = resolvePruneReason(
      major,
      minor,
      patch,
      selectedMajors,
      selectedMinorsByMajor,
      retainedPatchesByMinor,
      config,
    );

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

  pruned.sort((a, b) => {
    if (!a.semver || !b.semver) return 0;
    return compareSemver(b.semver, a.semver);
  });
  protectedList.sort((a, b) => {
    if (!a.semver || !b.semver) return 0;
    return compareSemver(b.semver, a.semver);
  });

  return { protectedList, pruned };
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

  const { eligibleStable, excluded } = classifyTags(tags, protectedTagsMap);
  checkAmbiguousVersions(eligibleStable);

  const hierarchy = buildHierarchyMap(eligibleStable);
  const { kept, retainedTagNames, selectedMajors, selectedMinorsByMajor, retainedPatchesByMinor } =
    selectKeptHierarchicalTags(hierarchy, config);

  const { protectedList, pruned } = partitionRemainingTags(
    eligibleStable,
    retainedTagNames,
    selectedMajors,
    selectedMinorsByMajor,
    retainedPatchesByMinor,
    config,
  );

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
