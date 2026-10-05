/**
 * ==============================================================================
 * scripts/ghcr-retention.ts
 *
 * Script de gobernanza y retención para GitHub Container Registry (GHCR).
 * Conforme a las políticas de suministro seguro y control de cuotas:
 *   - Mantiene activas las últimas N imágenes de release (por defecto N=3).
 *   - Nunca purga digests fijados en GitOps ni artefactos de Cosign o versiones
 *     sin tag (firmas, SBOM, atestaciones y referrers de imágenes vigentes).
 *   - Proporciona soporte para simulación (--simulate) y ejecución en seco (--dry-run).
 *
 * Uso:
 *   node --experimental-strip-types scripts/ghcr-retention.ts [--keep=3] [--dry-run] [--simulate]
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

export interface PackageVersion {
  id: number;
  name: string; // digest o hash
  url: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    package_type?: string;
    container?: {
      tags: string[];
    };
  };
}

export interface RetentionResult {
  packageName: string;
  totalVersions: number;
  keepCount: number;
  kept: PackageVersion[];
  pruned: PackageVersion[];
  deletedIds: number[];
  dryRun: boolean;
  simulated: boolean;
}

export interface GhcrRetentionOptions {
  token?: string;
  owner?: string;
  packages?: string[];
  keepCount?: number;
  dryRun?: boolean;
  simulate?: boolean;
  mockVersions?: Record<string, PackageVersion[]>;
  /** Digests que nunca se purgan. Por defecto, los fijados en GitOps (collectPinnedDigests). */
  protectedDigests?: Set<string>;
}

export const DEFAULT_PACKAGES = ['pokedex', 'pokedex-api', 'pokedex-web'];
export const DEFAULT_KEEP_COUNT = 3;
export const DEFAULT_OWNER = 'rocapellino';

/** Values de GitOps y Helm de producción cuyos digests fijados nunca se purgan. */
export const PINNED_VALUES_FILES = [
  'gitops/environments/proxmox-preprod/values.yaml',
  'gitops/environments/cloud/values.yaml',
  'infra/helm/pokedex/values.prod.yaml',
];

// Tags que Cosign publica junto a la imagen: firma (.sig), SBOM (.sbom) y atestación (.att).
const COSIGN_ARTIFACT_TAG = /^sha256-[a-f0-9]{64}(\.[a-z]+)?$/;

/**
 * Una versión es una imagen de release si tiene al menos un tag que no es un
 * artefacto de Cosign. Las versiones sin tag (referrers OCI, manifiestos de
 * plataforma) y los artefactos de Cosign no compiten por el cupo ni se purgan.
 */
export function isReleaseImage(version: PackageVersion): boolean {
  const tags = version.metadata?.container?.tags ?? [];
  return tags.some((tag) => !COSIGN_ARTIFACT_TAG.test(tag));
}

/** Recolecta los digests sha256 fijados en los values de GitOps y Helm de producción. */
export function collectPinnedDigests(root: string = process.cwd()): Set<string> {
  const pinned = new Set<string>();
  for (const file of PINNED_VALUES_FILES) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) continue;
    for (const digest of fs.readFileSync(fullPath, 'utf8').match(/sha256:[a-f0-9]{64}/g) ?? []) {
      pinned.add(digest);
    }
  }
  return pinned;
}

/**
 * Calcula las versiones que deben conservarse y las que deben purgarse.
 *
 * Solo las imágenes de release compiten por el cupo `keepCount` (más recientes
 * primero). Los digests protegidos se conservan siempre, y las versiones que no
 * son imágenes de release (artefactos de Cosign, versiones sin tag) se ignoran.
 */
export function calculateVersionsToPrune(
  versions: PackageVersion[],
  keepCount: number = DEFAULT_KEEP_COUNT,
  protectedDigests: Set<string> = new Set(),
): { keep: PackageVersion[]; prune: PackageVersion[] } {
  if (!Array.isArray(versions) || versions.length === 0) {
    return { keep: [], prune: [] };
  }

  // Ordenar por fecha más reciente (updated_at o created_at) descendente
  const sorted = versions.filter(isReleaseImage).sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const newest = sorted.slice(0, Math.max(0, keepCount));
  const older = sorted.slice(Math.max(0, keepCount));
  const keep = [...newest, ...older.filter((v) => protectedDigests.has(v.name))];
  const prune = older.filter((v) => !protectedDigests.has(v.name));

  return { keep, prune };
}

/**
 * Genera un conjunto de versiones simuladas para pruebas o ejecución offline.
 */
export function generateMockPackageVersions(packageName: string, count: number = 6): PackageVersion[] {
  const versions: PackageVersion[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const timeOffset = i * 24 * 60 * 60 * 1000; // 1 día de diferencia por versión
    const date = new Date(now - timeOffset).toISOString();
    const tag = i === 0 ? 'latest' : `v1.${count - i}.0`;

    versions.push({
      id: 100000 + i,
      name: `sha256:${i.toString().repeat(64)}`.slice(0, 71),
      url: `https://api.github.com/user/packages/container/${packageName}/versions/${100000 + i}`,
      created_at: date,
      updated_at: date,
      metadata: {
        package_type: 'container',
        container: {
          tags: i === 3 ? [] : [tag], // una versión sin tag como caso borde
        },
      },
    });
  }

  return versions;
}

/**
 * Consulta la lista de versiones de un paquete en GHCR vía GitHub REST API.
 */
export async function fetchPackageVersions(
  token: string,
  owner: string,
  packageName: string,
): Promise<PackageVersion[]> {
  const url = `https://api.github.com/users/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packageName)}/versions?per_page=100`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pokedex-ghcr-retention-script',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      // El paquete puede no existir todavía en la cuenta
      return [];
    }
    const errorText = await response.text();
    throw new Error(`Error ${response.status} al consultar versiones de ${packageName}: ${errorText}`);
  }

  return (await response.json()) as PackageVersion[];
}

/**
 * Elimina una versión específica de un contenedor en GHCR vía GitHub REST API.
 */
export async function deletePackageVersion(token: string, packageName: string, versionId: number): Promise<boolean> {
  const url = `https://api.github.com/user/packages/container/${encodeURIComponent(packageName)}/versions/${versionId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pokedex-ghcr-retention-script',
    },
  });

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status} al eliminar versión ${versionId} de ${packageName}: ${errorText}`);
  }

  return true;
}

/**
 * Aplica la política de retención para los paquetes especificados.
 */
export async function applyGhcrRetention(options: GhcrRetentionOptions = {}): Promise<RetentionResult[]> {
  const keepCount = options.keepCount ?? DEFAULT_KEEP_COUNT;
  const dryRun = options.dryRun ?? false;
  const simulate = options.simulate ?? false;
  const owner = options.owner || process.env.GITHUB_REPOSITORY_OWNER || DEFAULT_OWNER;
  const packages = options.packages && options.packages.length > 0 ? options.packages : DEFAULT_PACKAGES;
  const token = options.token || process.env.GITHUB_TOKEN || '';

  const results: RetentionResult[] = [];

  console.log(`================================================================`);
  console.log(`📦 POLÍTICA DE RETENCIÓN DE GHCR (MÁXIMO ${keepCount} VERSIONES ACTIVAS)`);
  console.log(`================================================================`);
  console.log(`• Organización / Propietario : ${owner}`);
  console.log(`• Paquetes gestionados       : ${packages.join(', ')}`);
  console.log(`• Modo Dry-Run (Solo lectura): ${dryRun ? 'SÍ (No se eliminará nada)' : 'NO (Eliminación real)'}`);
  console.log(`• Modo Simulado              : ${simulate ? 'SÍ (Datos de prueba locales)' : 'NO'}`);
  console.log(`----------------------------------------------------------------`);

  if (!token && !simulate) {
    console.warn(`⚠️  ADVERTENCIA: GITHUB_TOKEN no configurado.`);
    console.warn(`   Para ejecutar en clúster real de GitHub Packages, proporcione GITHUB_TOKEN.`);
    console.warn(`   Activando modo simulación automático (--simulate) para diagnóstico local.`);
  }

  const effectiveSimulate = simulate || !token;
  const protectedDigests = options.protectedDigests ?? collectPinnedDigests();
  console.log(`• Digests protegidos (GitOps): ${protectedDigests.size}`);

  for (const pkg of packages) {
    console.log(`\n🔍 Evaluando paquete: ${owner}/${pkg}`);
    let versions: PackageVersion[] = [];

    if (effectiveSimulate) {
      versions = options.mockVersions?.[pkg] || generateMockPackageVersions(pkg, 6);
      console.log(`   [Simulación] Se generaron ${versions.length} versiones sintéticas para evaluación.`);
    } else {
      try {
        versions = await fetchPackageVersions(token, owner, pkg);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`   ❌ Error al consultar paquete ${pkg}: ${msg}`);
        continue;
      }
    }

    if (versions.length === 0) {
      console.log(`   ℹ️  No se encontraron versiones registradas para ${pkg}. Nada que purgar.`);
      results.push({
        packageName: pkg,
        totalVersions: 0,
        keepCount,
        kept: [],
        pruned: [],
        deletedIds: [],
        dryRun,
        simulated: effectiveSimulate,
      });
      continue;
    }

    const { keep, prune } = calculateVersionsToPrune(versions, keepCount, protectedDigests);

    console.log(`   • Total de versiones encontradas : ${versions.length}`);
    console.log(`   • Versiones que se conservan (${keep.length}/${keepCount}):`);
    keep.forEach((v, idx) => {
      const tags = v.metadata?.container?.tags?.length ? v.metadata.container.tags.join(', ') : '(sin tag)';
      console.log(`     [ACTIVA #${idx + 1}] ID: ${v.id} | Tags: [${tags}] | Fecha: ${v.created_at}`);
    });

    console.log(`   • Versiones a purgar (${prune.length}):`);
    const deletedIds: number[] = [];

    for (const v of prune) {
      const tags = v.metadata?.container?.tags?.length ? v.metadata.container.tags.join(', ') : '(sin tag)';
      if (dryRun || effectiveSimulate) {
        console.log(
          `     [PURGA - DRY RUN] ID: ${v.id} | Tags: [${tags}] | Fecha: ${v.created_at} -> Se mantendría seguro`,
        );
        deletedIds.push(v.id);
      } else {
        try {
          await deletePackageVersion(token, pkg, v.id);
          console.log(`     [ELIMINADA] ID: ${v.id} | Tags: [${tags}] purgada exitosamente de GHCR.`);
          deletedIds.push(v.id);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`     ❌ Fallo al purgar versión ID ${v.id}: ${msg}`);
        }
      }
    }

    results.push({
      packageName: pkg,
      totalVersions: versions.length,
      keepCount,
      kept: keep,
      pruned: prune,
      deletedIds,
      dryRun,
      simulated: effectiveSimulate,
    });
  }

  console.log(`\n================================================================`);
  console.log(`✔ Política de retención aplicada con éxito: Solo los últimos ${keepCount} releases permanecen activos.`);
  console.log(`================================================================`);

  return results;
}

// Ejecución CLI directa
if (process.argv[1]?.endsWith('ghcr-retention.ts')) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isSimulate = args.includes('--simulate');

  let keepCount = DEFAULT_KEEP_COUNT;
  const keepArg = args.find((a) => a.startsWith('--keep='));
  if (keepArg) {
    const parsed = parseInt(keepArg.split('=')[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      keepCount = parsed;
    }
  }

  applyGhcrRetention({
    dryRun: isDryRun,
    simulate: isSimulate,
    keepCount,
  }).catch((err) => {
    console.error('❌ Error fatal en retención de GHCR:', err);
    process.exit(1);
  });
}
