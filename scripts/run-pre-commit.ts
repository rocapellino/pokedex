#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/run-pre-commit.ts
 * ==============================================================================
 * Ejecutor canónico y resiliente de pre-commit para el repositorio Pokédex.
 *
 * Resuelve y ejecuta `pre-commit` localmente si está disponible en el entorno;
 * en caso de no encontrarse instalado localmente (ej. hosts Windows o agentes
 * sin entorno Python configurado), recurre de forma transparente a la ejecución
 * reproducible en contenedor efímero mediante `repo-tool-exec`.
 * ==============================================================================
 */

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { executeTool } from '../.agents/skills/repo-tool-exec/scripts/tool-exec.ts';
import type { SystemDependencies } from '../.agents/skills/repo-tool-exec/scripts/tool-exec.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export function runPreCommit(args: string[] = [], deps?: SystemDependencies): number {
  const targetArgs = args.length > 0 ? args : ['run', '--all-files'];

  console.log(`[pre-commit] Ejecutando: pre-commit ${targetArgs.join(' ')}`);

  const result = executeTool(
    'pre-commit',
    targetArgs,
    {
      repoRoot: REPO_ROOT,
    },
    deps,
  );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  console.log(
    `\n[pre-commit] Estado: ${result.status} | Modo: ${result.execution.mode}${
      result.execution.runtime ? ` (${result.execution.runtime})` : ''
    } | Código: ${result.exit_code}`,
  );

  return result.exit_code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cliArgs = process.argv.slice(2);
  const code = runPreCommit(cliArgs);
  process.exit(code);
}
