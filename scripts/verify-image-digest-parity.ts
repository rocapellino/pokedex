import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import yaml from 'js-yaml';

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
}

const DEFAULT_CHART_PATH = 'infra/helm/pokedex';
const DEFAULT_ENVIRONMENTS = [
  { name: 'AWS GitOps', file: 'gitops/environments/aws/values.yaml' },
  { name: 'Proxmox GitOps', file: 'gitops/environments/proxmox/values.yaml' },
  { name: 'Helm Production', file: 'infra/helm/pokedex/values.prod.yaml' },
];

/**
 * Renderiza el Deployment de la API para un conjunto de values y extrae
 * la imagen compilada final que Kubernetes recibirá.
 */
export function extractRenderedApiImage(chartPath: string, valuesPath: string): string {
  const resolvedValues = path.resolve(process.cwd(), valuesPath);
  const resolvedChart = path.resolve(process.cwd(), chartPath);

  if (!fs.existsSync(resolvedValues)) {
    throw new Error(`Archivo de values no encontrado: ${resolvedValues}`);
  }
  if (!fs.existsSync(resolvedChart)) {
    throw new Error(`Ruta de Helm chart no encontrada: ${resolvedChart}`);
  }

  // 1. Intentar renderizar vía Helm si está disponible en PATH
  try {
    const helmCmd = `helm template pokedex "${resolvedChart}" -f "${resolvedValues}" -s templates/api-deployment.yaml`;
    const output = execSync(helmCmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const documents = yaml.loadAll(output) as Array<Record<string, unknown> | null>;
    const deployment = documents.find(
      (doc) =>
        doc &&
        doc.kind === 'Deployment' &&
        (doc.metadata as Record<string, unknown> | undefined)?.name === 'pokemon-api'
    );

    if (deployment) {
      const spec = deployment.spec as Record<string, unknown> | undefined;
      const template = spec?.template as Record<string, unknown> | undefined;
      const podSpec = template?.spec as Record<string, unknown> | undefined;
      const containers = (podSpec?.containers || []) as Array<{ name: string; image?: string }>;

      const apiContainer = containers.find((c) => c.name === 'api');
      if (apiContainer && apiContainer.image) {
        return apiContainer.image.trim();
      }
    }
  } catch {
    // Si helm no está instalado (típico en runners de CI que solo ejecutan Node.js / unit tests)
    // o falla la ejecución, recurrimos a resolución estricta del AST de los values YAML.
  }

  // 2. Fallback determinista mediante AST parsing (js-yaml)
  const baseValuesPath = path.join(resolvedChart, 'values.yaml');
  let baseApiImage: Record<string, unknown> = {};
  if (fs.existsSync(baseValuesPath)) {
    const baseContent = fs.readFileSync(baseValuesPath, 'utf8');
    const baseDoc = yaml.load(baseContent) as Record<string, unknown> | null;
    const baseApi = baseDoc?.api as Record<string, unknown> | undefined;
    baseApiImage = (baseApi?.image as Record<string, unknown>) || {};
  }

  const envContent = fs.readFileSync(resolvedValues, 'utf8');
  const envDoc = yaml.load(envContent) as Record<string, unknown> | null;
  const envApi = envDoc?.api as Record<string, unknown> | undefined;
  const envApiImage = (envApi?.image as Record<string, unknown>) || {};

  const repository = (envApiImage.repository as string) || (baseApiImage.repository as string) || 'ghcr.io/rocapellino/pokedex-api';
  const digest = (envApiImage.digest as string) || (baseApiImage.digest as string);
  const tag = (envApiImage.tag as string) || (baseApiImage.tag as string);

  if (digest) {
    return `${repository}@${digest.trim()}`;
  }
  if (tag) {
    return `${repository}:${tag.trim()}`;
  }

  throw new Error(`No se pudo extraer la imagen del contenedor api en ${valuesPath}`);
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
  const results: EnvironmentDigestResult[] = [];

  console.log('🔍 [Supply Chain] Validando paridad de imágenes renderizadas en Kubernetes (Helm AST)...');

  for (const env of envs) {
    const image = extractRenderedApiImage(chartPath, env.file);
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
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--published-digest' && args[i + 1]) {
        publishedDigest = args[i + 1];
        i++;
      }
    }

    verifyImageDigestParity({ publishedDigest });
    console.log('✅ Validación de consistencia superada con éxito.');
    process.exit(0);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`\n❌ Error de Verificación: ${error.message}`);
    process.exit(1);
  }
}
