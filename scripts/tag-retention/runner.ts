/**
 * ==============================================================================
 * scripts/tag-retention/runner.ts
 *
 * Orquestador principal de la política de retención jerárquica de Git tags (Opción B).
 * ==============================================================================
 */

import { evaluateHierarchicalTagRetention, generateMockTags } from './evaluator.ts';
import { collectProtectedTags, protectRollbackWindowTags } from './protection.ts';
import {
  deleteRemoteTag,
  enrichTagsWithRemoteRefs,
  fetchRemoteTagRef,
  fetchRemoteTags,
  revalidateGlobalRemoteInventory,
} from './remote-api.ts';
import { areShasEqual, isValidGitSha, parseStrictPositiveInt } from './semver.ts';
import {
  DEFAULT_CONFIG,
  DEFAULT_OWNER,
  DEFAULT_REPO,
  type GitTagRef,
  type HierarchicalRetentionConfig,
  type TagEvaluation,
  type TagRetentionOptions,
  type TagRetentionResult,
} from './types.ts';

/**
 * Procesa una lista de elementos de forma estrictamente secuencial y determinista
 * usando recursión asíncrona (sin bucles imperativos con await).
 */
async function runSequentially<T>(items: readonly T[], action: (item: T) => Promise<void>, index = 0): Promise<void> {
  if (index >= items.length) {
    return;
  }
  await action(items[index]);
  await runSequentially(items, action, index + 1);
}

function buildRetentionConfig(options: TagRetentionOptions): HierarchicalRetentionConfig {
  return {
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
}

function resolveSimulationLabel(autoSimulated: boolean, effectiveSimulate: boolean): string {
  if (autoSimulated) {
    return 'SÍ (automático por falta de GITHUB_TOKEN; datos sintéticos)';
  }
  if (effectiveSimulate) {
    return 'SÍ (Datos de prueba locales)';
  }
  return 'NO';
}

function printExecutionHeader(
  owner: string,
  repo: string,
  config: HierarchicalRetentionConfig,
  dryRun: boolean,
  simulationLabel: string,
  autoSimulated: boolean,
  protectedTagsMap: Map<string, string>,
): void {
  console.log('================================================================');
  console.log('🏷️  POLÍTICA DE RETENCIÓN JERÁRQUICA DE GIT TAGS (OPCIÓN B)');
  console.log('================================================================');
  console.log(`• Repositorio objetivo       : ${owner}/${repo}`);
  console.log(
    `• Configuración jerárquica   : ${config.keepMajorCount} Majors -> ${config.keepMinorCount} Minors por Major -> Último ${config.keepPatchCount} Patch por Minor`,
  );
  console.log(`• Modo Dry-Run (Solo lectura): ${dryRun ? 'SÍ (No se eliminará nada)' : 'NO (Eliminación real)'}`);
  console.log(`• Modo Simulado              : ${simulationLabel}`);

  if (autoSimulated) {
    console.warn('⚠️  ADVERTENCIA: GITHUB_TOKEN no configurado.');
    console.warn('   Activando modo simulación automático (--simulate) para diagnóstico seguro.');
  }

  console.log(`• Referencias protegidas     : ${protectedTagsMap.size}`);
  for (const [pTag, pReason] of protectedTagsMap.entries()) {
    console.log(`    🔒 ${pTag} -> ${pReason}`);
  }
  console.log('----------------------------------------------------------------');
}

async function fetchInitialTags(
  effectiveSimulate: boolean,
  options: TagRetentionOptions,
  token: string,
  owner: string,
  repo: string,
  fetchFn: typeof fetch,
  validatedMaxPages?: number,
  isDestructive?: boolean,
): Promise<GitTagRef[]> {
  if (effectiveSimulate) {
    const mockTags = options.mockTags || generateMockTags();
    console.log(`   [Simulación] Se evaluarán ${mockTags.length} tags sintéticos locales.`);
    return mockTags;
  }

  try {
    console.log('🔍 Consultando inventario de tags remotos en GitHub...');
    const rawTags = await fetchRemoteTags(token, owner, repo, {
      fetchFn,
      maxPages: validatedMaxPages,
    });
    await enrichTagsWithRemoteRefs(token, owner, repo, rawTags, {
      fetchFn,
      maxPages: validatedMaxPages,
      strict: isDestructive,
    });
    return rawTags;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error al consultar tags de ${owner}/${repo}: ${msg}`);
    throw err;
  }
}

function printHierarchySummary(summary: ReturnType<typeof evaluateHierarchicalTagRetention>['summary']): void {
  console.log('\n📊 Resumen de Jerarquía SemVer:');
  const formattedMajors = summary.selectedMajors.map((m) => `v${m}.x`).join(', ');
  console.log(`   • Líneas Major seleccionadas (${summary.selectedMajors.length}): [${formattedMajors}]`);

  for (const m of summary.selectedMajors) {
    const minors = summary.selectedMinorsByMajor[m] || [];
    const formattedMinors = minors.map((n) => `v${m}.${n}.x`).join(', ');
    console.log(`     - Major v${m}.x -> Minors retenidas: [${formattedMinors}]`);
  }
}

function printEvaluationDetails(
  kept: TagEvaluation[],
  protectedList: TagEvaluation[],
  excluded: TagEvaluation[],
): void {
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
}

function verifyInventoryIdentity(kept: TagEvaluation[], pruned: TagEvaluation[]): void {
  console.log('\n🔒 Validando completitud de identidad del inventario antes de proceder...');
  for (const item of [...kept, ...pruned]) {
    if (!item.tag.refSha || !isValidGitSha(item.tag.refSha)) {
      throw new Error(
        `Inconsistencia crítica de seguridad: el tag ${item.tag.name} no posee refSha inicial capturado en el inventario. Abortando purga por seguridad (FAIL-CLOSED).`,
      );
    }
  }
}

async function verifyKeptTags(
  kept: TagEvaluation[],
  token: string,
  owner: string,
  repo: string,
  fetchFn: typeof fetch,
): Promise<void> {
  console.log('\n🔒 Verificando existencia e identidad de los tags conservados antes de proceder...');
  await runSequentially(kept, async (item) => {
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
  });
  console.log('✅ Verificación de integridad e identidad de tags conservados completada.');
}

async function verifyPrunedPreconditions(
  pruned: TagEvaluation[],
  token: string,
  owner: string,
  repo: string,
  fetchFn: typeof fetch,
): Promise<void> {
  console.log('🔒 Verificando precondiciones de referencia en dos fases para los tags candidatos a purga...');
  await runSequentially(pruned, async (item) => {
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
  });
  console.log('✅ Precondiciones fijadas.');
}

async function executePurge(
  pruned: TagEvaluation[],
  dryRun: boolean,
  effectiveSimulate: boolean,
  token: string,
  owner: string,
  repo: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const deletedTags: string[] = [];

  await runSequentially(pruned, async (item) => {
    const tagName = item.tag.name;
    if (dryRun || effectiveSimulate) {
      console.log(`    [PURGA - DRY RUN] ${tagName} -> ${item.retentionDecision?.reason}`);
      deletedTags.push(tagName);
      return;
    }

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
  });

  return deletedTags;
}

function printExecutionFooter(
  keptLength: number,
  protectedLength: number,
  excludedLength: number,
  effectiveSimulate: boolean,
): void {
  console.log('\n================================================================');
  console.log(
    `✔ Política jerárquica finalizada: ${keptLength} en jerarquía + ${protectedLength} protegidos + ${excludedLength} excluidos conservados.`,
  );
  console.log('================================================================');
  if (effectiveSimulate) {
    console.warn('⚠️  RESULTADO SIMULADO: evalúa tags sintéticos y NO refleja los tags reales del repositorio.');
    console.warn('   Para verificar el remoto, ejecute con GITHUB_TOKEN configurado.');
  }
}

/**
 * Aplica la política de retención jerárquica de tags conforme a las opciones configuradas.
 */
export async function applyTagRetention(options: TagRetentionOptions = {}): Promise<TagRetentionResult> {
  const config = buildRetentionConfig(options);
  const validatedMaxPages =
    options.maxPages !== undefined ? parseStrictPositiveInt(options.maxPages, 'options.maxPages') : undefined;

  const dryRun = options.dryRun ?? true;
  const simulate = options.simulate ?? false;
  const owner = options.owner || process.env.GITHUB_REPOSITORY_OWNER || DEFAULT_OWNER;
  const repo = options.repo || DEFAULT_REPO;
  const token = options.token || process.env.GITHUB_TOKEN || '';
  const repoRoot = options.repoRoot || process.cwd();
  const fetchFn = options.fetchFn ?? fetch;

  const effectiveSimulate = simulate || (!token && !options.fetchFn);
  const autoSimulated = effectiveSimulate && !simulate;
  const simulationLabel = resolveSimulationLabel(autoSimulated, effectiveSimulate);

  const protectedTagsMap = options.protectedTags ?? collectProtectedTags(repoRoot, options.customProtectedTags || []);
  printExecutionHeader(owner, repo, config, dryRun, simulationLabel, autoSimulated, protectedTagsMap);

  const isDestructive = !dryRun;
  const rawTags = await fetchInitialTags(
    effectiveSimulate,
    options,
    token,
    owner,
    repo,
    fetchFn,
    validatedMaxPages,
    isDestructive,
  );
  console.log(`• Total de tags encontrados  : ${rawTags.length}`);

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

  printHierarchySummary(summary);
  printEvaluationDetails(kept, protectedList, excluded);

  console.log(`\n• Candidatos a purga (${pruned.length}):`);
  let deletedTags: string[] = [];

  if (pruned.length === 0) {
    console.log('ℹ️  No hay tags elegibles para purgar. El inventario cumple la política jerárquica.');
  } else {
    if (!dryRun && !effectiveSimulate) {
      verifyInventoryIdentity(kept, pruned);
      await verifyKeptTags(kept, token, owner, repo, fetchFn);
      await verifyPrunedPreconditions(pruned, token, owner, repo, fetchFn);

      console.log('\n🔒 Revalidando inventario global en remoto inmediatamente antes del primer borrado...');
      await revalidateGlobalRemoteInventory(token, owner, repo, rawTags, {
        fetchFn,
        maxPages: options.maxPages,
      });
      console.log(
        '✅ Revalidación global del inventario completada sin discrepancias concurrentes. Procediendo a eliminar tags candidatos:',
      );
    }

    deletedTags = await executePurge(pruned, dryRun, effectiveSimulate, token, owner, repo, fetchFn);
  }

  printExecutionFooter(kept.length, protectedList.length, excluded.length, effectiveSimulate);

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
