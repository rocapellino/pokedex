/**
 * ==============================================================================
 * scripts/tag-retention.ts
 *
 * Script de gobernanza y retención automática de tags de Git en GitHub.
 * Conforme a las políticas de suministro seguro y control de referencias:
 *   - Mantiene activos los últimos N tags de versión de release (por defecto N=5).
 *   - Nunca purga tags fijados en GitOps (targetRevision), Helm (Chart.yaml)
 *     ni referencias no elegibles o protegidas por auditoría.
 *   - Proporciona soporte para simulación (--simulate) y ejecución en seco (--dry-run).
 *   - Implementa doble verificación y comprobación de precondiciones antes de borrar.
 *
 * Uso:
 *   node --experimental-strip-types scripts/tag-retention.ts [--keep=5] [--dry-run] [--simulate]
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

export interface GitTagRef {
  name: string;
  sha: string;
  date?: string;
  peeledSha?: string;
  isAnnotated?: boolean;
}

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export interface TagEvaluation {
  tag: GitTagRef;
  isEligible: boolean;
  exclusionReason?: string;
  semver?: ParsedSemver;
  isProtected: boolean;
  protectionReason?: string;
}

export interface TagRetentionResult {
  totalFound: number;
  eligibleCount: number;
  keepCount: number;
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
  keepCount?: number;
  dryRun?: boolean;
  simulate?: boolean;
  mockTags?: GitTagRef[];
  protectedTags?: Map<string, string>;
  repoRoot?: string;
}

export const DEFAULT_KEEP_COUNT = 5;
export const DEFAULT_OWNER = 'rocapellino';
export const DEFAULT_REPO = 'pokedex';

/** Expresión regular SemVer 2.0 canónica para tags del proyecto (prefijo 'v'). */
export const SEMVER_TAG_REGEX =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Manifiestos de GitOps y Helm inspeccionados para proteger versiones activas. */
export const PROTECTED_MANIFEST_FILES = [
  'gitops/apps/app-proxmox-preprod.yaml',
  'gitops/apps/app-cloud.yaml',
  'gitops/apps/root-application.yaml',
  'infra/helm/pokedex/Chart.yaml',
  'package.json',
];

/**
 * Parsea un tag semver en sus componentes canónicos (major, minor, patch, prerelease).
 * Devuelve null si no cumple el formato 'vX.Y.Z[-prerelease]'.
 */
export function parseSemverTag(name: string): ParsedSemver | null {
  const match = name.match(SEMVER_TAG_REGEX);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || undefined,
  };
}

/**
 * Comparador determinista SemVer 2.0.
 * Retorna > 0 si a > b, < 0 si a < b, 0 si son equivalentes.
 * Regla: una versión normal sin prerelease es mayor que una con prerelease.
 */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Prerelease handling
  if (!a.prerelease && b.prerelease) return 1; // a es normal, b es prerelease -> a > b
  if (a.prerelease && !b.prerelease) return -1; // a es prerelease, b es normal -> a < b
  if (!a.prerelease && !b.prerelease) return 0; // ambos normales -> iguales

  // Ambos tienen prerelease
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
      return -1; // numérico tiene menor precedencia que alfanumérico
    }
    if (numA === null && numB !== null) {
      return 1;
    }

    return pA.localeCompare(pB);
  }

  return 0;
}

/**
 * Recolecta todos los tags que están activamente protegidos por GitOps, Helm y la raíz del proyecto.
 * Mapea cada tag al motivo de su protección.
 */
export function collectProtectedTags(root: string = process.cwd()): Map<string, string> {
  const protectedMap = new Map<string, string>();

  // 1. GitOps Applications (targetRevision)
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
      if (rev.startsWith('v')) {
        protectedMap.set(rev, `GitOps: targetRevision en ${file}`);
      }
    }
  }

  // 2. Helm Chart.yaml
  const chartPath = path.join(root, 'infra/helm/pokedex/Chart.yaml');
  if (fs.existsSync(chartPath)) {
    const content = fs.readFileSync(chartPath, 'utf8');
    const appVerMatch = content.match(/^appVersion:\s*["']?([^"'\s]+)["']?/m);
    if (appVerMatch) {
      const tag = appVerMatch[1].startsWith('v') ? appVerMatch[1] : `v${appVerMatch[1]}`;
      protectedMap.set(tag, 'Helm: appVersion en infra/helm/pokedex/Chart.yaml');
    }
    const verMatch = content.match(/^version:\s*["']?([^"'\s]+)["']?/m);
    if (verMatch) {
      const tag = verMatch[1].startsWith('v') ? verMatch[1] : `v${verMatch[1]}`;
      if (!protectedMap.has(tag)) {
        protectedMap.set(tag, 'Helm: chart version en infra/helm/pokedex/Chart.yaml');
      }
    }
  }

  // 3. package.json raíz
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) {
        const tag = `v${pkg.version}`;
        if (!protectedMap.has(tag)) {
          protectedMap.set(tag, 'Monorepo: versión canónica en package.json');
        }
      }
    } catch {
      // Ignorar errores de parseo en entornos de test si package.json no es JSON válido
    }
  }

  return protectedMap;
}

/**
 * Evalúa el inventario de tags contra la política de retención.
 * Separa los tags en:
 *   - kept: conservados por estar dentro de los últimos N elegibles.
 *   - protected: conservados por estar referenciados en GitOps/Helm, aunque superen el cupo N.
 *   - excluded: no administrados por no cumplir el formato SemVer canónico (se conservan).
 *   - pruned: candidatos seguros a eliminación (elegibles por encima de los N más recientes y sin protección).
 */
export function evaluateTagRetention(
  tags: GitTagRef[],
  keepCount: number = DEFAULT_KEEP_COUNT,
  protectedTagsMap: Map<string, string> = new Map(),
): {
  kept: TagEvaluation[];
  pruned: TagEvaluation[];
  excluded: TagEvaluation[];
  protected: TagEvaluation[];
} {
  if (!Array.isArray(tags) || tags.length === 0) {
    return { kept: [], pruned: [], excluded: [], protected: [] };
  }

  const eligible: TagEvaluation[] = [];
  const excluded: TagEvaluation[] = [];

  for (const tag of tags) {
    const semver = parseSemverTag(tag.name);
    const isProtected = protectedTagsMap.has(tag.name);
    const protectionReason = protectedTagsMap.get(tag.name);

    if (!semver) {
      excluded.push({
        tag,
        isEligible: false,
        exclusionReason: 'No cumple con la convención SemVer canónica de releases administradas (vX.Y.Z)',
        isProtected,
        protectionReason,
      });
      continue;
    }

    eligible.push({
      tag,
      isEligible: true,
      semver,
      isProtected,
      protectionReason,
    });
  }

  // Ordenar elegibles por SemVer descendente (mayor a menor).
  // Si coinciden en SemVer, desempata por fecha más reciente si está disponible.
  eligible.sort((a, b) => {
    if (!a.semver || !b.semver) return 0;
    const cmp = compareSemver(b.semver, a.semver);
    if (cmp !== 0) return cmp;

    if (a.tag.date && b.tag.date) {
      return new Date(b.tag.date).getTime() - new Date(a.tag.date).getTime();
    }
    return 0;
  });

  const newest = eligible.slice(0, Math.max(0, keepCount));
  const older = eligible.slice(Math.max(0, keepCount));

  const kept: TagEvaluation[] = [...newest];
  const protectedList: TagEvaluation[] = [];
  const pruned: TagEvaluation[] = [];

  for (const item of older) {
    if (item.isProtected) {
      protectedList.push(item);
    } else {
      pruned.push(item);
    }
  }

  return { kept, pruned, excluded, protected: protectedList };
}

/**
 * Genera un inventario sintético de tags para ejecución offline o pruebas unitarias.
 */
export function generateMockTags(count: number = 8): GitTagRef[] {
  const tags: GitTagRef[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const timeOffset = i * 24 * 60 * 60 * 1000;
    const date = new Date(now - timeOffset).toISOString();
    const sha = `abcdef${i}0123456789abcdef0123456789abcdef01`.slice(0, 40);

    let name = `v1.${count - i}.0`;
    if (i === count - 1) {
      name = 'v1.0.0-rc.1'; // Caso con prerelease
    } else if (i === count - 2) {
      name = 'custom-build-test'; // Caso no elegible
    }

    tags.push({
      name,
      sha,
      date,
      isAnnotated: true,
    });
  }

  return tags;
}

/**
 * Consulta los tags remotos de GitHub vía REST API paginada.
 */
export async function fetchRemoteTags(token: string, owner: string, repo: string): Promise<GitTagRef[]> {
  const tags: GitTagRef[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=${perPage}&page=${page}`;

    const response = await fetch(url, {
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

    if (data.length < perPage) {
      break;
    }

    page++;
    if (page > 30) {
      // Límite de seguridad de 3000 tags por ejecución
      break;
    }
  }

  return tags;
}

/**
 * Consulta un tag específico en el remoto para verificar existencia y precondición de SHA.
 */
export async function fetchRemoteTagRef(
  token: string,
  owner: string,
  repo: string,
  tagName: string,
): Promise<{ sha: string } | null> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/tags/${encodeURIComponent(tagName)}`;

  const response = await fetch(url, {
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

  const data = (await response.json()) as { object?: { sha?: string } };
  return { sha: data.object?.sha || '' };
}

/**
 * Elimina una referencia de tag de Git en GitHub vía API REST con verificación de precondición.
 */
export async function deleteRemoteTag(
  token: string,
  owner: string,
  repo: string,
  tagName: string,
  expectedSha?: string,
): Promise<boolean> {
  // Pre-comprobación: verificar que el tag existe y no ha cambiado de SHA
  const current = await fetchRemoteTagRef(token, owner, repo, tagName);
  if (!current) {
    console.warn(`   ⚠️ Tag refs/tags/${tagName} ya no existe en el remoto. Nada que eliminar.`);
    return false;
  }

  if (expectedSha && current.sha && !current.sha.startsWith(expectedSha) && !expectedSha.startsWith(current.sha)) {
    throw new Error(
      `Conflicto concurrente en tag ${tagName}: SHA actual (${current.sha}) difiere del evaluado (${expectedSha}). Operación detenida por seguridad.`,
    );
  }

  const deleteUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/tags/${encodeURIComponent(tagName)}`;

  const response = await fetch(deleteUrl, {
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
 * Aplica la política de retención de tags conforme a las opciones configuradas.
 */
export async function applyTagRetention(options: TagRetentionOptions = {}): Promise<TagRetentionResult> {
  const keepCount = options.keepCount ?? DEFAULT_KEEP_COUNT;
  const dryRun = options.dryRun ?? true; // Dry-run habilitado por defecto
  const simulate = options.simulate ?? false;
  const owner = options.owner || process.env.GITHUB_REPOSITORY_OWNER || DEFAULT_OWNER;
  const repo = options.repo || DEFAULT_REPO;
  const token = options.token || process.env.GITHUB_TOKEN || '';
  const repoRoot = options.repoRoot || process.cwd();

  console.log('================================================================');
  console.log(`🏷️  POLÍTICA DE RETENCIÓN DE TAGS (CONSERVAR ÚLTIMOS ${keepCount} RELEASE TAGS)`);
  console.log('================================================================');
  console.log(`• Repositorio objetivo       : ${owner}/${repo}`);
  console.log(`• Modo Dry-Run (Solo lectura): ${dryRun ? 'SÍ (No se eliminará nada)' : 'NO (Eliminación real)'}`);
  console.log(`• Modo Simulado              : ${simulate ? 'SÍ (Datos de prueba locales)' : 'NO'}`);

  if (!token && !simulate) {
    console.warn('⚠️  ADVERTENCIA: GITHUB_TOKEN no configurado.');
    console.warn('   Activando modo simulación automático (--simulate) para diagnóstico seguro.');
  }

  const effectiveSimulate = simulate || !token;
  const protectedTagsMap = options.protectedTags ?? collectProtectedTags(repoRoot);
  console.log(`• Referencias protegidas     : ${protectedTagsMap.size}`);
  for (const [pTag, pReason] of protectedTagsMap.entries()) {
    console.log(`    🔒 ${pTag} -> ${pReason}`);
  }
  console.log('----------------------------------------------------------------');

  let rawTags: GitTagRef[] = [];

  if (effectiveSimulate) {
    rawTags = options.mockTags || generateMockTags(8);
    console.log(`   [Simulación] Se evaluarán ${rawTags.length} tags sintéticos locales.`);
  } else {
    try {
      console.log('🔍 Consultando inventario de tags remotos en GitHub...');
      rawTags = await fetchRemoteTags(token, owner, repo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error al consultar tags de ${owner}/${repo}: ${msg}`);
      throw err;
    }
  }

  console.log(`• Total de tags encontrados  : ${rawTags.length}`);

  const {
    kept,
    pruned,
    excluded,
    protected: protectedList,
  } = evaluateTagRetention(rawTags, keepCount, protectedTagsMap);

  console.log(`• Tags de release elegibles  : ${kept.length + pruned.length + protectedList.length}`);
  console.log(`• Tags conservados (Top ${keepCount}): ${kept.length}`);
  kept.forEach((item, idx) => {
    console.log(`    [ACTIVO #${idx + 1}] ${item.tag.name} (SHA: ${item.tag.sha.slice(0, 10)})`);
  });

  if (protectedList.length > 0) {
    console.log(`• Tags protegidos fuera del top ${keepCount} (${protectedList.length}):`);
    protectedList.forEach((item) => {
      console.log(`    [PROTEGIDO] ${item.tag.name} -> Motivo: ${item.protectionReason}`);
    });
  }

  if (excluded.length > 0) {
    console.log(`• Tags excluidos de la política (${excluded.length}):`);
    excluded.forEach((item) => {
      console.log(`    [EXCLUIDO] ${item.tag.name} -> Motivo: ${item.exclusionReason}`);
    });
  }

  console.log(`• Candidatos a purga         : ${pruned.length}`);
  const deletedTags: string[] = [];

  if (pruned.length === 0) {
    console.log('ℹ️  No hay tags elegibles para purgar. El inventario cumple la cuota.');
  } else {
    // Si es borrado real, realizar comprobación previa de seguridad
    if (!dryRun && !effectiveSimulate) {
      console.log('\n🔒 Verificando que los tags conservados siguen existiendo en el remoto antes de proceder...');
      for (const item of kept) {
        const check = await fetchRemoteTagRef(token, owner, repo, item.tag.name);
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
        console.log(`    [PURGA - DRY RUN] ${tagName} (SHA: ${item.tag.sha.slice(0, 10)}) -> Se conservaría seguro`);
        deletedTags.push(tagName);
      } else {
        try {
          const ok = await deleteRemoteTag(token, owner, repo, tagName, item.tag.sha);
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

  console.log('================================================================');
  console.log(
    `✔ Política de retención finalizada: ${kept.length} activos + ${protectedList.length} protegidos + ${excluded.length} excluidos conservados.`,
  );
  console.log('================================================================');

  return {
    totalFound: rawTags.length,
    eligibleCount: kept.length + pruned.length + protectedList.length,
    keepCount,
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
  // En CLI, si no se especifica --no-dry-run ni se omite deliberadamente, soportar flag explícito:
  const hasDryRunArg = args.includes('--dry-run');
  const hasNoDryRunArg = args.includes('--no-dry-run');
  const isDryRun = hasNoDryRunArg ? false : hasDryRunArg || true;

  let keepCount = DEFAULT_KEEP_COUNT;
  const keepArg = args.find((a) => a.startsWith('--keep='));
  if (keepArg) {
    const parsed = parseInt(keepArg.split('=')[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      keepCount = parsed;
    }
  }

  const ownerArg = args.find((a) => a.startsWith('--owner='));
  const owner = ownerArg ? ownerArg.split('=')[1] : undefined;

  const repoArg = args.find((a) => a.startsWith('--repo='));
  const repo = repoArg ? repoArg.split('=')[1] : undefined;

  applyTagRetention({
    dryRun: isDryRun,
    simulate: isSimulate,
    keepCount,
    owner,
    repo,
  }).catch((err) => {
    console.error('❌ Error fatal en retención de tags:', err);
    process.exit(1);
  });
}
