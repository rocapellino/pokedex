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

export interface WorkflowStep {
  name?: string;
  id?: string;
  uses?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, any>;
}

export interface WorkflowJob {
  permissions?: Record<string, string>;
  strategy?: { matrix?: Record<string, any> };
  env?: Record<string, string>;
  steps: WorkflowStep[];
}

const withoutShellComments = (script: string) =>
  script
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

/**
 * Jobs de un workflow de GitHub Actions ya parseados, con los `run:` sin las líneas de shell comentadas: un comando
 * comentado o el nombre de un paso no cuentan como si se ejecutaran.
 */
export function workflowJobs(relativePath: string): Record<string, WorkflowJob> {
  const workflow = readYaml<{ jobs?: Record<string, Omit<WorkflowJob, 'steps'> & { steps?: WorkflowStep[] }> }>(
    relativePath,
  );
  return Object.fromEntries(
    Object.entries(workflow.jobs ?? {}).map(([name, job]) => [
      name,
      {
        ...job,
        steps: (job.steps ?? []).map((step) =>
          typeof step.run === 'string' ? { ...step, run: withoutShellComments(step.run) } : step,
        ),
      },
    ]),
  );
}

/** Scripts (`run:`) de todos los pasos de un workflow, sin las líneas de shell comentadas. */
export function workflowScripts(relativePath: string): string[] {
  return Object.values(workflowJobs(relativePath)).flatMap((job) =>
    job.steps.flatMap((step) => (typeof step.run === 'string' ? [step.run] : [])),
  );
}
