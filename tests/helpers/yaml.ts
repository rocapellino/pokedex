import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ROOT_DIR } from './repo.js';

/** Lee y parsea un YAML del repo (ruta relativa a la raíz). Los comentarios no forman parte del resultado. */
export function readYaml<T = any>(relativePath: string): T {
  return yaml.load(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8')) as T;
}

/** Igual que `readYaml` para archivos con varios documentos (`---`); descarta los vacíos. */
export function readYamlDocs<T = any>(relativePath: string): T[] {
  return (yaml.loadAll(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8')) as T[]).filter(Boolean);
}

/**
 * Scripts (`run:`) de todos los pasos de un workflow de GitHub Actions, ya parseado y sin las líneas de shell
 * comentadas: un comando comentado o el nombre de un paso no cuentan como si se ejecutaran.
 */
export function workflowScripts(relativePath: string): string[] {
  const workflow = readYaml<{ jobs?: Record<string, { steps?: Array<{ run?: string }> }> }>(relativePath);
  const withoutShellComments = (script: string) =>
    script
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
  return Object.values(workflow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (typeof step.run === 'string' ? [withoutShellComments(step.run)] : [])),
  );
}
