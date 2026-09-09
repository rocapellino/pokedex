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

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function generateRandomKey(length = 32): string {
  return randomBytes(length).toString('base64url');
}

function findKubesealBinary(): string {
  const isWindows = process.platform === 'win32';
  const binName = isWindows ? 'kubeseal.exe' : 'kubeseal';

  // 1. Buscar en PATH del sistema
  const checkCmd = isWindows ? 'where' : 'which';
  const check = spawnSync(checkCmd, [binName], { encoding: 'utf-8' });
  if (check.status === 0 && check.stdout.trim()) {
    return check.stdout.trim().split(/\r?\n/)[0];
  }

  // 2. Buscar en .tools local del proyecto
  const localTool = path.resolve(process.cwd(), '.tools', binName);
  if (fs.existsSync(localTool)) {
    return localTool;
  }

  console.error("❌ Error: 'kubeseal' no encontrado en el PATH ni en .tools/.");
  console.error("   Descárgalo desde: https://github.com/bitnami-labs/sealed-secrets/releases");
  process.exit(1);
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
