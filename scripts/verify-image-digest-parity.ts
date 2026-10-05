/**
 * ==============================================================================
 * scripts/verify-image-digest-parity.ts
 * ==============================================================================
 * Verificación Criptográfica de Paridad de Digest OCI en Manifiestos de Kubernetes
 *
 * ARQUITECTURA DE PARIDAD DE DIGESTS (ADR-008 & Modelo GitOps Canónico):
 *
 * En este repositorio conviven dos conceptos complementarios pero deliberadamente
 * desacoplados en el pipeline:
 *
 * 1. Paridad Interna Inter-Entornos (Inter-Environment Parity / Intra-GitOps):
 *    - Ecuación: Cloud GitOps == Proxmox Pre-prod GitOps == Helm Production
 *    - Rol en CI: GATE OBLIGATORIO Y BLOQUEANTE (`--strict`).
 *    - Propósito: Garantiza que no exista deriva (drift) accidental entre los
 *      manifiestos de producción y GitOps. Todos los clústeres deben recibir
 *      exactamente el mismo artefacto inmutable.
 *
 * 2. Paridad Publicado vs. Desplegado (Published vs. Deployed Parity):
 *    - Ecuación: Digest Publicado en GHCR == Digest Declarado en GitOps
 *    - Rol en CI: DESACOPLADO DEL GATE DE BUILD/RELEASE (opcional con `--published-digest`).
 *    - Racional: En un modelo GitOps profesional, la construcción de artefactos
 *      (Build Phase) y el despliegue/promoción (Promotion Phase) están separados.
 *      Exigir que la imagen recién compilada coincida con los values de GitOps en el
 *      mismo commit de build crearía un bloqueo circular (chicken-and-egg problem),
 *      impidiendo publicar nuevas versiones si GitOps está pinneado a un release estable.
 *    - Uso: Herramienta de auditoría, drift detection y gates en workflows de promoción.
 * ==============================================================================
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import yaml from 'js-yaml';

export type ImageComponent = 'api' | 'web';

/** Plantilla y contenedor que renderizan la imagen de cada componente. */
const COMPONENTS: Record<ImageComponent, { template: string; container: string; defaultRepository: string }> = {
  api: { template: 'templates/api-deployment.yaml', container: 'api', defaultRepository: 'ghcr.io/rocapellino/pokedex-api' },
  web: { template: 'templates/web-deployment.yaml', container: 'web', defaultRepository: 'ghcr.io/rocapellino/pokedex-web' },
};

export interface EnvironmentDigestResult {
  envName: string;
  valuesPath: string;
  image: string;
  digest: string;
}

export interface VerificationOptions {
  publishedDigest?: string;
  chartPath?: string;
  environments?: { name: string; file: string }[];
  strict?: boolean;
}

const DEFAULT_CHART_PATH = 'infra/helm/pokedex';
// El contrato de paridad inter-entornos declarado en
// docs/architecture/GITOPS_PROMOTION_WORKFLOW.md es:
//
//   Digest(Cloud) = Digest(Proxmox Pre-prod) = Digest(Helm Prod)
//
// `proxmox-preprod` DEBE formar parte de este conjunto. Excluirlo haría que el
// gate `--strict` validara un subconjunto de la ecuación documentada, permitiendo
// que un entorno se desvise de forma silenciosa sin romper la integración.
const DEFAULT_ENVIRONMENTS = [
  { name: 'Cloud GitOps (blueprint)', file: 'gitops/environments/cloud/values.yaml' },
  { name: 'Proxmox Preprod', file: 'gitops/environments/proxmox-preprod/values.yaml' },
  { name: 'Helm Production', file: 'infra/helm/pokedex/values.prod.yaml' },
];

interface CacheEntry {
  valuesMtime: number;
  chartMtime: number;
  image: string;
}

const apiImageRenderCache = new Map<string, CacheEntry>();

/**
 * Limpia la caché en memoria de renderizado Helm (utilizada en pruebas y benchmarking).
 */
export function clearRenderCache(): void {
  apiImageRenderCache.clear();
}

function getChartMtime(chartDir: string): number {
  try {
    const files = [
      path.join(chartDir, 'Chart.yaml'),
      path.join(chartDir, 'values.yaml'),
      path.join(chartDir, 'templates/api-deployment.yaml'),
    ];
    let max = 0;
    for (const f of files) {
      if (fs.existsSync(f)) {
        max = Math.max(max, fs.statSync(f).mtimeMs);
      }
    }
    return max;
  } catch {
    return 0;
  }
}

/**
 * Renderiza el Deployment de la API para un conjunto de values y extrae
 * la imagen compilada final que Kubernetes recibirá.
 *
 * @param chartPath Ruta al Helm chart
 * @param valuesPath Ruta al archivo de values
 * @param options Opciones de ejecución: si strict=true (CI release), helm template es
 *                obligatorio y se desactiva por completo el fallback a values AST.
 *                skipCache desactiva la lectura de la caché en memoria.
 */
export function extractRenderedApiImage(
  chartPath: string,
  valuesPath: string,
  options: { strict?: boolean; skipCache?: boolean } = {}
): string {
  return extractRenderedImage(chartPath, valuesPath, 'api', options);
}

/**
 * Renderiza el Deployment del componente con Helm y extrae la imagen de su contenedor.
 * Misma semántica de modo estricto, caché y fallback que extractRenderedApiImage.
 */
export function extractRenderedImage(
  chartPath: string,
  valuesPath: string,
  component: ImageComponent,
  options: { strict?: boolean; skipCache?: boolean } = {}
): string {
  const spec = COMPONENTS[component];
  const resolvedValues = path.resolve(process.cwd(), valuesPath);
  const resolvedChart = path.resolve(process.cwd(), chartPath);
  const isStrict = options.strict ?? (process.env.STRICT_HELM === 'true');

  if (!fs.existsSync(resolvedValues)) {
    throw new Error(`Archivo de values no encontrado: ${resolvedValues}`);
  }
  if (!fs.existsSync(resolvedChart)) {
    throw new Error(`Ruta de Helm chart no encontrada: ${resolvedChart}`);
  }

  const valuesMtime = fs.statSync(resolvedValues).mtimeMs;
  const chartMtime = getChartMtime(resolvedChart);
  const cacheKey = `${resolvedChart}::${resolvedValues}::${component}::strict=${isStrict}`;

  if (!options.skipCache) {
    const cached = apiImageRenderCache.get(cacheKey);
    if (cached && cached.valuesMtime === valuesMtime && cached.chartMtime === chartMtime) {
      return cached.image;
    }
  }

  // 1. Renderizado real vía Helm CLI
  let helmOutput: string | null = null;
  let helmExecError: Error | null = null;

  try {
    const helmCmd = `helm template pokedex "${resolvedChart}" -f "${resolvedValues}" -s ${spec.template}`;
    helmOutput = execSync(helmCmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    helmExecError = err as Error;
    if (isStrict) {
      throw new Error(
        `[Modo Estricto CI - Sin Fallback] Falló la ejecución obligatoria de 'helm template' para ${valuesPath}:\n${helmExecError.message}`
      );
    }
  }

  if (helmOutput) {
    const documents = yaml.loadAll(helmOutput) as Array<Record<string, unknown> | null>;
    const containersOf = (doc: Record<string, unknown>) => {
      const template = (doc.spec as Record<string, unknown> | undefined)?.template as Record<string, unknown> | undefined;
      const podSpec = template?.spec as Record<string, unknown> | undefined;
      return (podSpec?.containers || []) as Array<{ name: string; image?: string }>;
    };
    const deployment = documents.find(
      (doc) => doc && doc.kind === 'Deployment' && containersOf(doc).some((c) => c.name === spec.container)
    );

    if (deployment) {
      const container = containersOf(deployment).find((c) => c.name === spec.container);
      if (container?.image) {
        const imageResult = container.image.trim();
        apiImageRenderCache.set(cacheKey, { valuesMtime, chartMtime, image: imageResult });
        return imageResult;
      }
    }

    if (isStrict) {
      throw new Error(
        `[Modo Estricto CI - Sin Fallback] 'helm template' no generó un Deployment con el contenedor '${spec.container}' en ${valuesPath}`
      );
    }
  }

  // 2. Fallback determinista mediante AST parsing (js-yaml) reservado exclusivamente para desarrollo local
  if (isStrict) {
    throw new Error(
      `[Modo Estricto CI - Sin Fallback] Se requiere 'helm template' válido en release de CI para ${valuesPath}. El fallback a values AST está prohibido.`
    );
  }

  const baseValuesPath = path.join(resolvedChart, 'values.yaml');
  let baseApiImage: Record<string, unknown> = {};
  if (fs.existsSync(baseValuesPath)) {
    const baseContent = fs.readFileSync(baseValuesPath, 'utf8');
    const baseDoc = yaml.load(baseContent) as Record<string, unknown> | null;
    const baseApi = baseDoc?.[component] as Record<string, unknown> | undefined;
    baseApiImage = (baseApi?.image as Record<string, unknown>) || {};
  }

  const envContent = fs.readFileSync(resolvedValues, 'utf8');
  const envDoc = yaml.load(envContent) as Record<string, unknown> | null;
  const envApi = envDoc?.[component] as Record<string, unknown> | undefined;
  const envApiImage = (envApi?.image as Record<string, unknown>) || {};

  const repository = (envApiImage.repository as string) || (baseApiImage.repository as string) || spec.defaultRepository;
  const digest = (envApiImage.digest as string) || (baseApiImage.digest as string);
  const tag = (envApiImage.tag as string) || (baseApiImage.tag as string);

  let fallbackImage: string | null = null;
  if (digest) {
    fallbackImage = `${repository}@${digest.trim()}`;
  } else if (tag) {
    fallbackImage = `${repository}:${tag.trim()}`;
  }

  if (fallbackImage) {
    apiImageRenderCache.set(cacheKey, { valuesMtime, chartMtime, image: fallbackImage });
    return fallbackImage;
  }

  throw new Error(`No se pudo extraer la imagen del contenedor ${spec.container} en ${valuesPath}`);
}

/**
 * Valida que la imagen utilice pinning inmutable por digest sha256 y extrae el digest.
 */
export function parseImmutableDigest(imageString: string): string {
  const parts = imageString.split('@');
  if (parts.length !== 2) {
    throw new Error(
      `Violación de seguridad de Supply Chain: La imagen '${imageString}' no utiliza digest inmutable (@sha256:...). El uso de tags o :latest está estrictamente prohibido.`
    );
  }

  const digest = parts[1].trim();
  const digestRegex = /^sha256:[a-f0-9]{64}$/;
  if (!digestRegex.test(digest)) {
    throw new Error(`Formato de digest SHA256 inválido en la imagen '${imageString}': '${digest}'`);
  }

  return digest;
}

/**
 * Ejecuta la verificación completa de paridad entre todos los entornos declarados.
 */
export function verifyImageDigestParity(options: VerificationOptions = {}): EnvironmentDigestResult[] {
  const chartPath = options.chartPath || DEFAULT_CHART_PATH;
  const envs = options.environments || DEFAULT_ENVIRONMENTS;
  const strict = options.strict ?? (process.env.STRICT_HELM === 'true');
  const results: EnvironmentDigestResult[] = [];

  const modeLabel = strict ? 'Helm Template Real [CI Estricto - Sin Fallback]' : 'Helm Template / Fallback Dev';
  console.log(`🔍 [Supply Chain] Validando paridad de imágenes renderizadas en Kubernetes (${modeLabel})...`);

  for (const env of envs) {
    const image = extractRenderedApiImage(chartPath, env.file, { strict });
    const digest = parseImmutableDigest(image);

    results.push({
      envName: env.name,
      valuesPath: env.file,
      image,
      digest,
    });

    console.log(`   - ${env.name.padEnd(16)}: ${image}`);
  }

  // 1. Validar paridad entre todos los entornos GitOps
  const baseResult = results[0];
  for (let i = 1; i < results.length; i++) {
    const current = results[i];
    if (current.digest !== baseResult.digest) {
      throw new Error(
        `❌ Discrepancia crítica de digest entre entornos:\n` +
          `   ${baseResult.envName} (${baseResult.valuesPath}): ${baseResult.digest}\n` +
          `   ${current.envName} (${current.valuesPath}): ${current.digest}\n` +
          `Todos los entornos de producción y GitOps deben apuntar al mismo digest inmutable.`
      );
    }
  }

  // 1b. La misma ecuación para la imagen web (pokedex-web): antes solo se verificaba el API.
  const webResults = envs.map((env) => {
    const image = extractRenderedImage(chartPath, env.file, 'web', { strict });
    console.log(`   - ${env.name.padEnd(16)}: ${image}`);
    return { envName: env.name, valuesPath: env.file, image, digest: parseImmutableDigest(image) };
  });
  for (const current of webResults.slice(1)) {
    if (current.digest !== webResults[0].digest) {
      throw new Error(
        `❌ Discrepancia crítica de digest web entre entornos:
` +
          `   ${webResults[0].envName} (${webResults[0].valuesPath}): ${webResults[0].digest}
` +
          `   ${current.envName} (${current.valuesPath}): ${current.digest}
` +
          `Todos los entornos deben desplegar el mismo digest inmutable de pokedex-web.`
      );
    }
  }

  // 2. Si se provee digest publicado en CI, validar que coincida con los manifiestos
  if (options.publishedDigest) {
    const expected = options.publishedDigest.trim();
    console.log(`   - Digest Publicado (CI): ${expected}`);
    if (baseResult.digest !== expected) {
      throw new Error(
        `❌ Discrepancia entre la imagen publicada en CI y los manifiestos GitOps:\n` +
          `   Digest Publicado (CI): ${expected}\n` +
          `   Digest GitOps / Helm:  ${baseResult.digest}\n` +
          `Los manifiestos GitOps deben sincronizarse con la imagen recién publicada antes de firmar el release.`
      );
    }
  }

  console.log(`🔒 Paridad criptográfica 1:1 certificada en Kubernetes (${results.map((r) => r.envName).join(' == ')}): ${baseResult.digest}`);
  return results;
}

// Ejecución CLI directa
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('verify-image-digest-parity.ts')) {
  try {
    let publishedDigest: string | undefined;
    let strict = process.env.STRICT_HELM === 'true';
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--published-digest' && args[i + 1]) {
        publishedDigest = args[i + 1];
        i++;
      } else if (args[i] === '--strict' || args[i] === '--require-helm') {
        strict = true;
      }
    }

    verifyImageDigestParity({ publishedDigest, strict });
    console.log('✅ Validación de consistencia superada con éxito.');
    process.exit(0);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`\n❌ Error de Verificación: ${error.message}`);
    process.exit(1);
  }
}
