#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/worktree/cli.ts
 * ==============================================================================
 * CLI canónico y punto de entrada centralizado para la gobernanza de Git Worktrees
 * en el repositorio rocapellino/pokedex.
 *
 * Subcomandos:
 *   - create:  Crea un nuevo worktree gobernado.
 *   - list:    Lista todos los worktrees registrados y su estado.
 *   - doctor:  Diagnostica discrepancias de gobernanza y referencias huérfanas.
 *   - cleanup: Elimina de forma segura un worktree verificado.
 *   - prune:   Limpia metadatos prunables en Git.
 * ==============================================================================
 */

import { createWorktree } from './creator.js';
import { runWorktreeDoctor } from './doctor.js';
import { cleanupNonCanonicalWorktrees, listWorktrees, pruneWorktrees, removeWorktreeSafely } from './manager.js';
import { ALLOWED_TASK_TYPES, type TaskType } from './naming.js';

function printHelp() {
  console.log(`
🌲 Pokédex Git Worktree Governance CLI
=======================================

Uso:
  tsx scripts/worktree/cli.ts <subcomando> [opciones]

Subcomandos:
  create    Crea un nuevo worktree bajo la gobernanza centralizada.
            Opciones:
              --type <tipo>        Tipo Conventional Commit (${ALLOWED_TASK_TYPES.join(', ')})
              --slug <nombre>      Descripción breve de la tarea (ej. audit-rules)
              --scope <scope>      (Opcional) Ámbito de la tarea (ej. ci, helm, mcp)
              --ticket <id>        (Opcional) ID de ticket o auditoría (ej. AUD-SEC-001)
              --base-branch <ref>  (Opcional) Rama base (por defecto: main)

  list      Lista todos los worktrees y su estado de cumplimiento.
            Opciones:
              --json               Salida en formato JSON

  doctor    Audita la política canónica, detecta worktrees fuera de regla y prunables.
            Opciones:
              --json               Salida en formato JSON

  cleanup   Elimina de forma segura un worktree con comprobación de cambios y commits.
            Opciones:
              --target <id/path>   Ruta, rama o nombre del worktree a eliminar
              --non-canonical      Limpia todos los worktrees fuera de la base canónica
              --force              (Opcional) Fuerza la eliminación si hay cambios/untracked

  prune     Ejecuta git worktree prune para eliminar referencias huérfanas.
`);
}

function parseArgs(args: string[]): { command: string; flags: Record<string, string | boolean> } {
  const command = args[0] || 'help';
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return { command, flags };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { command, flags } = parseArgs(rawArgs);

  try {
    switch (command) {
      case 'create': {
        const type = flags.type as string;
        const slug = flags.slug as string;
        const scope = flags.scope as string | undefined;
        const ticketId = (flags.ticket as string) || (flags.ticketId as string) || undefined;
        const baseBranch = (flags['base-branch'] as string) || undefined;

        if (!type || !slug) {
          console.error('❌ Error: --type y --slug son obligatorios para crear un worktree.');
          console.error(`Tipos válidos: ${ALLOWED_TASK_TYPES.join(', ')}`);
          process.exit(1);
        }

        const res = createWorktree(
          {
            type: type as TaskType,
            slug,
            scope,
            ticketId,
          },
          { baseBranch },
        );

        console.log('✅ Worktree gobernado creado con éxito:');
        console.log(`   Ruta:           ${res.path}`);
        console.log(`   Rama:           ${res.branch}`);
        console.log(`   Carpeta:        ${res.folderName}`);
        console.log(`   Base Canónica:  ${res.canonicalBase}`);
        break;
      }

      case 'list': {
        const wts = listWorktrees();
        if (flags.json) {
          console.log(JSON.stringify(wts, null, 2));
        } else {
          console.log('\n📋 Worktrees Registrados:');
          console.log('--------------------------------------------------');
          for (const w of wts) {
            const statusTag = w.isMainCheckout
              ? '👑 [MAIN CHECKOUT]'
              : w.isCompliant
                ? '✅ [CANONICAL]'
                : '⚠️ [NON-CANONICAL]';
            const prunableTag = w.isPrunable ? ' 🗑️ (prunable)' : '';
            console.log(`${statusTag} ${w.path}${prunableTag}`);
            console.log(`   Rama: ${w.branch || '(detached HEAD)'} | HEAD: ${w.head.slice(0, 7)}`);
          }
          console.log('--------------------------------------------------\n');
        }
        break;
      }

      case 'doctor': {
        const doc = runWorktreeDoctor();
        if (flags.json) {
          console.log(JSON.stringify(doc, null, 2));
        } else {
          console.log('\n🩺 Diagnóstico de Gobernanza de Git Worktrees:');
          console.log('==================================================');
          console.log(`Raíz Principal:      ${doc.mainRepoRoot}`);
          console.log(`Base Canónica:       ${doc.canonicalBase}`);
          console.log(`Total Worktrees:     ${doc.totalWorktrees}`);
          console.log(`Canónicos:           ${doc.compliantWorktrees}`);
          console.log(`Fuera de Regla:      ${doc.nonCompliantWorktrees}`);
          console.log(`Prunables (Huérf.):  ${doc.prunableWorktrees}`);
          const cov = doc.auditCoverage;
          const covTag = cov.isComplete ? '✅ COMPLETA' : '⚠️ PARCIAL';
          const unreadableNote =
            cov.unreadableFiles.length > 0 ? `, ${cov.unreadableFiles.length} omitidos por error de lectura` : '';
          console.log(
            `Auditoría Automat.:  ${covTag} (${cov.scannedFilesCount} archivos inspeccionados${unreadableNote})`,
          );
          console.log('--------------------------------------------------');

          let hasIssues = false;
          for (const item of doc.worktrees) {
            if (item.findings.length > 0) {
              hasIssues = true;
              console.log(`\n🔍 Worktree: ${item.details.worktree.path}`);
              for (const f of item.findings) {
                console.log(`   [${f.severity}] ${f.code}: ${f.message}`);
                console.log(`   ➜ Remediación: ${f.remediation}`);
              }
            }
          }

          if (doc.globalFindings.length > 0) {
            console.log('\n🌐 Hallazgos Globales:');
            for (const gf of doc.globalFindings) {
              console.log(`   [${gf.severity}] ${gf.code}: ${gf.message}`);
            }
          }

          if (!hasIssues && doc.globalFindings.length === 0) {
            console.log('\n✨ Todos los worktrees cumplen estrictamente la gobernanza.');
          }
          console.log('==================================================\n');
        }
        break;
      }

      case 'cleanup': {
        const target = (flags.target as string) || (flags.path as string);
        const nonCanonical = Boolean(flags['non-canonical']);
        const force = Boolean(flags.force);

        if (nonCanonical) {
          const res = cleanupNonCanonicalWorktrees({ force });
          for (const r of res.removed) {
            console.log(`✅ Worktree no canónico eliminado: ${r}`);
          }
          for (const s of res.skipped) {
            console.error(`⚠️ Omitido (${s.path}): ${s.reason}`);
          }
          if (res.removed.length === 0 && res.skipped.length === 0) {
            console.log('✨ No hay worktrees fuera de la base canónica para limpiar.');
          }
          if (res.skipped.length > 0) {
            process.exit(1);
          }
          break;
        }

        if (!target) {
          console.error('❌ Error: Debe especificar --target <ruta/rama/carpeta> o --non-canonical para limpiar.');
          process.exit(1);
        }

        const res = removeWorktreeSafely(target, { force });
        console.log(`✅ ${res.message}`);
        break;
      }

      case 'prune': {
        const pruned = pruneWorktrees();
        console.log('✅ git worktree prune ejecutado exitosamente.');
        if (pruned) {
          console.log(pruned);
        }
        break;
      }
      default:
        printHelp();
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Error: ${msg}\n`);
    process.exit(1);
  }
}

main();
