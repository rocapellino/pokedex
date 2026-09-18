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

  const helmCmd = `helm template pokedex "${resolvedChart}" -f "${resolvedValues}" -s templates/api-deployment.yaml`;
  let output: string;
  try {
    output = execSync(helmCmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(`Fallo al ejecutar 'helm template' para ${valuesPath}:\n${error.stderr || error.message}`);
  }

  const documents = yaml.loadAll(output) as Array<Record<string, unknown> | null>;
  const deployment = documents.find(
    (doc) =>
      doc &&
      doc.kind === 'Deployment' &&
      (doc.metadata as Record<string, unknown> | undefined)?.name === 'pokemon-api'
  );

  if (!deployment) {
    throw new Error(`No se encontró el Deployment 'pokemon-api' renderizado en ${valuesPath}`);
  }

  const spec = deployment.spec as Record<string, unknown> | undefined;
  const template = spec?.template as Record<string, unknown> | undefined;
  const podSpec = template?.spec as Record<string, unknown> | undefined;
  const containers = (podSpec?.containers || []) as Array<{ name: string; image?: string }>;

  const apiContainer = containers.find((c) => c.name === 'api');
  if (!apiContainer || !apiContainer.image) {
    throw new Error(`Contenedor 'api' o campo 'image' no encontrado en Deployment 'pokemon-api' para ${valuesPath}`);
  }

  return apiContainer.image.trim();
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
