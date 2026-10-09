import path from 'node:path';
import yaml from 'js-yaml';
import { runHelm } from '../../scripts/lib/helm.js';
import { ROOT_DIR } from './repo.js';

export interface K8sDoc {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; annotations?: Record<string, string>; labels?: Record<string, string> };
  spec?: any;
  data?: Record<string, string>;
}

export const CHART_DIR = path.join(ROOT_DIR, 'infra/helm/pokedex');

/** Valores ficticios para los secretos obligatorios del chart: el render no los valida y no son credenciales. */
const CI_SECRETS = [
  'postgresql.auth.password=ci',
  'secrets.adminApiKey=ci',
  'secrets.adminSessionSecret=ci',
  'redis.auth.password=ci',
  'secrets.backupEncryptionKey=ci',
].flatMap((value) => ['--set', value]);

/** Perfiles de valores renderizables (rutas relativas a la raíz del repo). */
export const PROFILES = {
  default: [] as string[],
  prod: ['infra/helm/pokedex/values.prod.yaml'],
  preprod: ['gitops/environments/proxmox-preprod/values.yaml'],
} as const;

const cache = new Map<string, K8sDoc[]>();

/** Renderiza el chart con `helm template` para un conjunto de archivos de valores y devuelve los documentos. */
export function renderChart(valueFiles: readonly string[] = []): K8sDoc[] {
  const key = valueFiles.join('|');
  let docs = cache.get(key);
  if (!docs) {
    const files = valueFiles.flatMap((file) => ['-f', path.join(ROOT_DIR, file)]);
    const out = runHelm(['template', 'pokedex', CHART_DIR, ...files, ...CI_SECRETS]);
    docs = (yaml.loadAll(out) as K8sDoc[]).filter(Boolean);
    cache.set(key, docs);
  }
  return docs;
}

const POD_KINDS = ['Deployment', 'StatefulSet', 'Job', 'CronJob', 'DaemonSet'];

/** Especificación del pod de un workload (atraviesa `jobTemplate` en los CronJob). */
export function podSpecOf(doc: K8sDoc): any | undefined {
  if (!POD_KINDS.includes(doc.kind)) return undefined;
  return doc.kind === 'CronJob' ? doc.spec.jobTemplate.spec.template.spec : doc.spec.template.spec;
}

/** Recursos que ejecutan pods (Deployment, StatefulSet, Job, CronJob, DaemonSet) con su especificación de pod. */
export function podWorkloads(docs: K8sDoc[]): Array<{ doc: K8sDoc; name: string; spec: any }> {
  return docs.flatMap((doc) => {
    const spec = podSpecOf(doc);
    return spec ? [{ doc, name: `${doc.kind}/${doc.metadata.name}`, spec }] : [];
  });
}
