/**
 * ==============================================================================
 * scripts/seal-secret.ts
 * Utilidad Multiplataforma para Sellar Secretos con Bitnami Sealed Secrets
 * ==============================================================================
 * 
 * Genera el Secret temporal en memoria y ejecuta 'kubeseal' para producir
 * un SealedSecret seguro para versionar en Git (GitOps).
 * 
 * Uso:
 *   npx tsx scripts/seal-secret.ts [--name <name>] [--namespace <ns>] [--output <path>]
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function generateRandomKey(length = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Verifica la integridad criptográfica de un binario comparando su hash SHA-256
 * con el valor esperado. Este control es parte de la cadena de suministro segura
 * del proyecto (ADR-008).
 *
 * @param binaryPath - Ruta absoluta al binario a verificar.
 * @param expectedSha256 - Hash SHA-256 esperado (hexadecimal, case-insensitive).
 *   En el flujo normal de producción, este parámetro proviene de KUBESEAL_SHA256
 *   y su presencia se valida como obligatoria en findKubesealBinary().
 * @returns true si el hash coincide, false en caso contrario.
 */
export function verifyBinaryIntegrity(binaryPath: string, expectedSha256?: string): boolean {
  if (!expectedSha256) {
    // Salvaguarda de robustez: en tests unitarios puede llamarse directamente.
    // En producción, findKubesealBinary() garantiza que expectedSha256 siempre esté presente.
    return true;
  }
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`El archivo binario '${binaryPath}' no existe.`);
  }
  const fileBuffer = fs.readFileSync(binaryPath);
  const actualHash = createHash('sha256').update(fileBuffer).digest('hex');
  if (actualHash.toLowerCase() !== expectedSha256.trim().toLowerCase()) {
    console.error(`❌ Error de integridad: Checksum SHA-256 no coincide para '${binaryPath}'.`);
    console.error(`   Esperado: ${expectedSha256.trim()}`);
    console.error(`   Obtenido: ${actualHash}`);
    return false;
  }
  console.log(`✅ Integridad criptográfica verificada para '${path.basename(binaryPath)}': ${actualHash}`);
  return true;
}

export function findKubesealBinary(): string {
  const isWindows = process.platform === 'win32';
  const binName = isWindows ? 'kubeseal.exe' : 'kubeseal';

  // 1. Buscar en PATH del sistema
  const checkCmd = isWindows ? 'where' : 'which';
  const check = spawnSync(checkCmd, [binName], { encoding: 'utf-8' });
  let selectedBin: string | null = null;
  if (check.status === 0 && check.stdout.trim()) {
    selectedBin = check.stdout.trim().split(/\r?\n/)[0];
  } else {
    // 2. Buscar en .tools local del proyecto
    const localTool = path.resolve(process.cwd(), '.tools', binName);
    if (fs.existsSync(localTool)) {
      selectedBin = localTool;
    }
  }

  if (!selectedBin) {
    console.error("❌ Error: 'kubeseal' no encontrado en el PATH ni en .tools/.");
    console.error("   Descárgalo desde: https://github.com/bitnami-labs/sealed-secrets/releases");
    process.exit(1);
  }

  const expectedSha = process.env.KUBESEAL_SHA256;
  if (!expectedSha) {
    // SECURITY (Supply Chain): La verificación de integridad del binario kubeseal es un
    // control obligatorio de cadena de suministro. No se permite continuar sin ella.
    // Para obtener el SHA256 del binario descargado:
    //   Linux/macOS: sha256sum .tools/kubeseal
    //   Windows:     (Get-FileHash .tools\kubeseal.exe -Algorithm SHA256).Hash.ToLower()
    // Luego exportar: export KUBESEAL_SHA256=<hash_obtenido>
    console.error('❌ Error de seguridad: La variable de entorno KUBESEAL_SHA256 es obligatoria.');
    console.error('   Verifica la integridad del binario kubeseal antes de usarlo:');
    console.error('   Linux/macOS: sha256sum .tools/kubeseal');
    console.error('   Windows:     (Get-FileHash .tools\\kubeseal.exe -Algorithm SHA256).Hash.ToLower()');
    console.error('   Luego exportar: export KUBESEAL_SHA256=<hash_obtenido>');
    process.exit(1);
  }
  const isValid = verifyBinaryIntegrity(selectedBin, expectedSha);
  if (!isValid) {
    process.exit(1);
  }

  return selectedBin;
}

export function main(): void {
  const args = process.argv.slice(2);
  const name = getArgValue(args, '--name', 'pokemon-secrets');
  const namespace = getArgValue(args, '--namespace', 'pokemon-app');
  const output = getArgValue(args, '--output', 'infra/helm/pokedex/templates/sealed-secrets.yaml');

  const kubesealBin = findKubesealBinary();
  console.log('🔐 Generando Secret temporal y cifrando con Sealed Secrets...');

  const postgresUser = process.env.POSTGRES_USER || 'postgres';
  const postgresPassword = process.env.POSTGRES_PASSWORD || generateRandomKey(24);
  const adminApiKey = process.env.ADMIN_API_KEY || generateRandomKey(32);
  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || generateRandomKey(32);
  const aiApiKey = process.env.AI_API_KEY || generateRandomKey(32);
  const geminiApiKey = process.env.GEMINI_API_KEY || aiApiKey;
  const redisPassword = process.env.REDIS_PASSWORD || generateRandomKey(24);

  const secretYaml = `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: ${namespace}
type: Opaque
stringData:
  POSTGRES_USER: "${postgresUser}"
  POSTGRES_PASSWORD: "${postgresPassword}"
  ADMIN_API_KEY: "${adminApiKey}"
  ADMIN_SESSION_SECRET: "${adminSessionSecret}"
  AI_API_KEY: "${aiApiKey}"
  GEMINI_API_KEY: "${geminiApiKey}"
  REDIS_PASSWORD: "${redisPassword}"
`;

  const proc = spawnSync(
    kubesealBin,
    ['--controller-namespace', 'kube-system', '--controller-name', 'sealed-secrets-controller', '--format', 'yaml'],
    {
      input: secretYaml,
      encoding: 'utf-8',
    }
  );

  if (proc.status !== 0) {
    console.error(`❌ Error ejecutando kubeseal: ${proc.stderr || proc.error?.message}`);
    process.exit(proc.status || 1);
  }

  const outputDir = path.dirname(path.resolve(output));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(output, proc.stdout, 'utf-8');
  console.log(`✅ Secreto sellado exitosamente guardado en: ${output}`);
  console.log('💡 Este archivo SealedSecret es seguro para versionar en Git (GitOps).');
}

function getArgValue(args: string[], flag: string, defaultValue: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return defaultValue;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('seal-secret')) {
  main();
}
