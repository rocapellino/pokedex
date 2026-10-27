/**
 * ==============================================================================
 * scripts/tag-retention.ts
 *
 * Script de gobernanza y retención jerárquica de Git tags en GitHub (Opción B).
 * Fachada principal y ejecutor de CLI que delega en submódulos especializados
 * bajo scripts/tag-retention/.
 *
 * Estrategia de retención basada en Semantic Versioning (SemVer 2.0):
 *   - Major: Conserva las últimas M líneas major (por defecto M=2).
 *   - Minor: Conserva las últimas N líneas minor por cada major (por defecto N=3).
 *   - Patch: Conserva el último P patch disponible por cada minor (por defecto P=1).
 *   - Referencias protegidas: Nunca purga tags fijados en GitOps (targetRevision),
 *     Helm (Chart.yaml), package.json, ventana de rollback OCI (N, N-1, N-2)
 *     o listas explícitas de excepciones.
 *   - Seguridad: Prereleases y tags no SemVer quedan excluidos de la purga estándar.
 *   - Modo seguro: Dry-run habilitado por defecto y doble verificación previa al borrado.
 *
 * Uso:
 *   node --experimental-strip-types scripts/tag-retention.ts [--major=2] [--minor=3] [--patch=1] [--dry-run] [--simulate]
 * ==============================================================================
 */

import { applyTagRetention, DEFAULT_CONFIG, parseStrictPositiveInt } from './tag-retention/index.ts';

// Re-exportar toda la API pública para compatibilidad 100% con tests existentes y consumidores
export * from './tag-retention/index.ts';

// Ejecución CLI directa con top-level await
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

  try {
    await applyTagRetention({
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
    });
  } catch (err) {
    console.error('❌ Error fatal en retención jerárquica de tags:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
