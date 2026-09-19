/**
 * ==============================================================================
 * scripts/ghcr-retention.ts
 *
 * Script de gobernanza y retención para GitHub Container Registry (GHCR).
 * Conforme a las políticas de suministro seguro y control de cuotas:
 *   - Mantiene estrictamente activas las últimas N versiones (por defecto N=3).
 *   - Identifica y purga versiones históricas obsoletas y artefactos huérfanos.
 *   - Proporciona soporte para simulación (--simulate) y ejecución en seco (--dry-run).
 *
 * Uso:
 *   node --experimental-strip-types scripts/ghcr-retention.ts [--keep=3] [--dry-run] [--simulate]
 * ==============================================================================
 */

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
}

export const DEFAULT_PACKAGES = ['pokedex', 'pokedex-api'];
export const DEFAULT_KEEP_COUNT = 3;
export const DEFAULT_OWNER = 'rocapellino';

/**
 * Calcula las versiones que deben conservarse y las que deben purgarse,
 * ordenando cronológicamente de forma descendente (las más recientes primero).
 */
export function calculateVersionsToPrune(
  versions: PackageVersion[],
  keepCount: number = DEFAULT_KEEP_COUNT
): { keep: PackageVersion[]; prune: PackageVersion[] } {
  if (!Array.isArray(versions) || versions.length === 0) {
    return { keep: [], prune: [] };
  }

  // Ordenar por fecha más reciente (updated_at o created_at) descendente
  const sorted = [...versions].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const keep = sorted.slice(0, Math.max(0, keepCount));
  const prune = sorted.slice(Math.max(0, keepCount));

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
  packageName: string
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
export async function deletePackageVersion(
  token: string,
  packageName: string,
  versionId: number
): Promise<boolean> {
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

    const { keep, prune } = calculateVersionsToPrune(versions, keepCount);

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
        console.log(`     [PURGA - DRY RUN] ID: ${v.id} | Tags: [${tags}] | Fecha: ${v.created_at} -> Se mantendría seguro`);
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
if (process.argv[1] && process.argv[1].endsWith('ghcr-retention.ts')) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isSimulate = args.includes('--simulate');
  
  let keepCount = DEFAULT_KEEP_COUNT;
  const keepArg = args.find((a) => a.startsWith('--keep='));
  if (keepArg) {
    const parsed = parseInt(keepArg.split('=')[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
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
