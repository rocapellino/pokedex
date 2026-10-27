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

import {
  collectProtectedTags,
  DEFAULT_CONFIG,
  DEFAULT_OWNER,
  DEFAULT_REPO,
  deleteRemoteTag,
  enrichTagsWithRemoteRefs,
  evaluateHierarchicalTagRetention,
  fetchRemoteTagRef,
  fetchRemoteTags,
  generateMockTags,
  type GitTagRef,
  type HierarchicalRetentionConfig,
  isValidGitSha,
  parseStrictPositiveInt,
  protectRollbackWindowTags,
  revalidateGlobalRemoteInventory,
  type TagRetentionOptions,
  type TagRetentionResult,
  areShasEqual,
} from './tag-retention/index.ts';

// Re-exportar toda la API pública para compatibilidad 100% con tests existentes y consumidores
export * from './tag-retention/index.ts';

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
