#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/worktree/agy-hook.mjs
 * ==============================================================================
 * Hook de ciclo de vida de Antigravity (.agents/hooks.json) para garantizar el
 * cumplimiento técnico activo (fail-closed) de la gobernanza de Git Worktrees:
 *   1. PreToolUse: Bloquea llamadas directas a `git worktree add`, bloquea
 *      ediciones u operaciones mutables de Git dentro de `.gemini/antigravity/worktrees/`,
 *      y redirige automáticamente `Cwd` de comandos de lectura hacia la raíz principal.
 *   2. PreInvocation: Si la sesión fue iniciada por la UI en un worktree no canónico,
 *      inyecta una directiva efímera con la ruta canónica exacta (`../.worktrees/pokedex`).
 * ==============================================================================
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NON_CANONICAL_AGY_WT_REGEX = /\.(?:gemini[\\/]+antigravity|claude)[\\/]+worktrees/i;
const DIRECT_GIT_WORKTREE_ADD_REGEX = /\bgit\b(?:[^\n;|&]*)\bworktree\s+add\b/i;
const READONLY_SEARCH_CMD_REGEX = /^\s*(git\s+grep|grep|rg|Select-String)\b/i;
const MUTATING_GIT_CMD_REGEX =
  /\bgit\b(?:[^\n;|&]*)\b(commit|checkout|switch|merge|rebase|cherry-pick|push|pull|reset|stash|apply)\b/i;
const JUNCTION_CREATE_CMD_REGEX = /\b(mklink|New-Item\b[^\n;|&]*(Junction|SymbolicLink))\b/i;

/**
 * Resuelve la raíz del checkout principal de Git sin depender de paquetes externos.
 */
export function resolveMainRootSafe(startDir = process.cwd()) {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: startDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (commonDir && fs.existsSync(commonDir)) {
      const norm = path.normalize(commonDir);
      if (path.basename(norm) === '.git') {
        return path.dirname(norm);
      }
      return norm;
    }
  } catch {
    // Fallback al árbol de directorios
  }

  let curr = path.resolve(startDir);
  while (curr !== path.dirname(curr)) {
    const gitEntry = path.join(curr, '.git');
    try {
      const st = fs.statSync(gitEntry, { throwIfNoEntry: false });
      if (st?.isDirectory()) {
        return curr;
      }
    } catch {
      // Continuar subiendo
    }
    curr = path.dirname(curr);
  }
  return startDir;
}

/**
 * Evalúa el contrato PreToolUse de Antigravity.
 */
export function evaluatePreToolUse(payload, options = {}) {
  const toolName = payload?.toolCall?.name || '';
  const args = payload?.toolCall?.args || {};
  const mainRepoRoot = options.mainRepoRoot || resolveMainRootSafe();

  if (toolName === 'run_command') {
    const cmd = String(args.CommandLine || '');
    const cwd = String(args.Cwd || '');

    // 1. Bloquear llamadas directas no gobernadas a `git worktree add`
    if (DIRECT_GIT_WORKTREE_ADD_REGEX.test(cmd) && !READONLY_SEARCH_CMD_REGEX.test(cmd)) {
      return {
        decision: 'deny',
        reason:
          "BLOQUEADO POR GOBERNANZA (.agents/rules/worktree-governance.md): Queda terminantemente prohibido ejecutar 'git worktree add' directamente. Crea el worktree exclusivamente con 'npm.cmd run worktree:create -- --type <tipo> --slug <slug>' desde la raíz principal del repositorio.",
      };
    }

    // 2. Bloquear creación manual de junctions/symlinks hacia .gemini/antigravity/worktrees/
    if (JUNCTION_CREATE_CMD_REGEX.test(cmd) && NON_CANONICAL_AGY_WT_REGEX.test(cmd)) {
      return {
        decision: 'deny',
        reason:
          "BLOQUEADO POR GOBERNANZA (.agents/rules/worktree-governance.md): Prohibido crear junctions o enlaces en el worktree no canónico '.gemini/antigravity/worktrees/'. Utiliza un worktree canónico bajo '../.worktrees/pokedex/' creado con 'npm.cmd run worktree:create'.",
      };
    }

    // 3. Si el Cwd apunta al worktree no canónico de Antigravity (.gemini/antigravity/worktrees/)
    if (NON_CANONICAL_AGY_WT_REGEX.test(cwd)) {
      const targetsCanonicalWorktree = /\.worktrees[\\/]/i.test(cmd) && !NON_CANONICAL_AGY_WT_REGEX.test(cmd);
      if (MUTATING_GIT_CMD_REGEX.test(cmd) && !targetsCanonicalWorktree) {
        return {
          decision: 'deny',
          reason:
            "BLOQUEADO POR GOBERNANZA (.agents/rules/worktree-governance.md): Prohibido ejecutar operaciones mutables de Git dentro de '.gemini/antigravity/worktrees/'. Aprovisiona primero un worktree canónico en '../.worktrees/pokedex/' con 'npm.cmd run worktree:create' y opera allí.",
        };
      }

      // Redirigir automáticamente comandos de lectura/diagnóstico o comandos anclados a .worktrees hacia la raíz principal
      if (mainRepoRoot) {
        return {
          decision: 'allow',
          overwrite: {
            Cwd: mainRepoRoot,
          },
        };
      }
    }

    return { decision: 'allow' };
  }

  if (toolName === 'write_to_file' || toolName === 'replace_file_content') {
    const targetFile = String(args.TargetFile || '');
    if (NON_CANONICAL_AGY_WT_REGEX.test(targetFile)) {
      return {
        decision: 'deny',
        reason:
          "BLOQUEADO POR GOBERNANZA (.agents/rules/worktree-governance.md): Prohibido crear o modificar archivos dentro del worktree no canónico '.gemini/antigravity/worktrees/'. Crea y utiliza un worktree canónico bajo '../.worktrees/pokedex/' mediante 'npm.cmd run worktree:create'.",
      };
    }
  }

  return { decision: 'allow' };
}

/**
 * Evalúa el contrato PreInvocation de Antigravity.
 */
export function evaluatePreInvocation(payload, options = {}) {
  const workspacePaths = Array.isArray(payload?.workspacePaths) ? payload.workspacePaths : [];
  const hasNonCanonicalWorkspace = workspacePaths.some((p) => NON_CANONICAL_AGY_WT_REGEX.test(String(p)));

  if (!hasNonCanonicalWorkspace) {
    return {};
  }

  const mainRepoRoot = options.mainRepoRoot || resolveMainRootSafe();
  const canonicalBase = path.join(path.dirname(mainRepoRoot), '.worktrees', path.basename(mainRepoRoot));

  return {
    injectSteps: [
      {
        ephemeralMessage: `[GOBERNANZA DE WORKTREES] El host inició esta sesión con una ruta en '.gemini/antigravity/worktrees/'. Queda ESTRICTAMENTE PROHIBIDO operar, editar archivos o ejecutar git checkout/commit en esa ruta no canónica. Para trabajar en una rama aislada debes usar la base canónica '${canonicalBase}' ejecutando 'npm.cmd run worktree:create -- --type <tipo> --slug <slug>' desde '${mainRepoRoot}' y retirar cualquier worktree no canónico con 'npm.cmd run worktree:cleanup -- --non-canonical'.`,
      },
    ],
  };
}

async function runCli() {
  const mode = process.argv[2] || 'pre-tool';
  let rawInput = '';
  try {
    rawInput = fs.readFileSync(0, 'utf-8');
  } catch {
    rawInput = '{}';
  }

  let payload = {};
  try {
    payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  } catch {
    payload = {};
  }

  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const mainRepoRoot = resolveMainRootSafe(scriptDir);

    if (mode === 'pre-invocation') {
      const out = evaluatePreInvocation(payload, { mainRepoRoot });
      process.stdout.write(`${JSON.stringify(out)}\n`);
    } else {
      const out = evaluatePreToolUse(payload, { mainRepoRoot });
      process.stdout.write(`${JSON.stringify(out)}\n`);
    }
  } catch {
    // Fail-safe de transporte JSON para no corromper el protocolo stdout del hook
    process.stdout.write(mode === 'pre-invocation' ? '{}\n' : '{"decision":"allow"}\n');
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  runCli();
}
