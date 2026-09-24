/**
 * ==============================================================================
 * scripts/update-gitops-pin.ts
 * ==============================================================================
 * Script canónico para auditar y actualizar el anclaje inmutable (pinning) de
 * versión en las aplicaciones de ArgoCD (root-application, app-proxmox, app-cloud).
 *
 * Uso CLI:
 *   node --experimental-strip-types scripts/update-gitops-pin.ts --tag=v1.75.10
 *   node --experimental-strip-types scripts/update-gitops-pin.ts --check
 *   node --experimental-strip-types scripts/update-gitops-pin.ts --tag=v1.75.10 --dry-run
 * ==============================================================================
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const DEFAULT_GITOPS_APP_FILES = [
  'gitops/apps/root-application.yaml',
  'gitops/apps/app-proxmox.yaml',
  'gitops/apps/app-cloud.yaml',
  'gitops/apps/app-proxmox-preprod.yaml',
];

const SEMVER_TAG_REGEX = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const TARGET_REVISION_REGEX = /(targetRevision:\s*)([^\s#\r\n]+)/;

/**
 * Valida si un tag sigue la convención SemVer canónica de Pokédex (vX.Y.Z)
 */
export function validateSemVerTag(tag: string): boolean {
  return SEMVER_TAG_REGEX.test(tag.trim());
}

/**
 * Lee el targetRevision declarado en el contenido de un manifiesto Application de ArgoCD
 */
export function extractTargetRevision(content: string): string | null {
  const match = content.match(TARGET_REVISION_REGEX);
  return match ? match[2].trim() : null;
}

/**
 * Sustituye el targetRevision en el contenido YAML preservando formato y comentarios
 */
export function replaceTargetRevision(content: string, newTag: string): string {
  if (!validateSemVerTag(newTag)) {
    throw new Error(`Tag inválido para targetRevision: "${newTag}". Debe cumplir formato vX.Y.Z`);
  }
  if (!TARGET_REVISION_REGEX.test(content)) {
    throw new Error('No se encontró la directiva targetRevision en el contenido del manifiesto');
  }
  return content.replace(TARGET_REVISION_REGEX, `$1${newTag.trim()}`);
}

/**
 * Audita la paridad y validez del anclaje de versión entre los manifiestos de GitOps
 */
export function checkGitOpsPinParity(
  targetFiles: string[] = DEFAULT_GITOPS_APP_FILES,
  baseDir: string = ROOT_DIR
): {
  inSync: boolean;
  canonicalVersion: string | null;
  versions: Record<string, string | null>;
  errors: string[];
} {
  const versions: Record<string, string | null> = {};
  const errors: string[] = [];

  for (const relPath of targetFiles) {
    const fullPath = path.resolve(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Archivo no encontrado: ${relPath}`);
      versions[relPath] = null;
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const version = extractTargetRevision(content);
    versions[relPath] = version;

    if (!version) {
      errors.push(`targetRevision no detectado en: ${relPath}`);
    } else if (!validateSemVerTag(version)) {
      errors.push(`targetRevision no cumple SemVer (${version}) en: ${relPath}`);
    }
  }

  const distinctVersions = Array.from(
    new Set(Object.values(versions).filter((v): v is string => v !== null))
  );

  const inSync = errors.length === 0 && distinctVersions.length === 1;
  const canonicalVersion = inSync ? distinctVersions[0] : null;

  if (distinctVersions.length > 1) {
    errors.push(`Discrepancia de versiones entre manifiestos: ${distinctVersions.join(', ')}`);
  }

  return {
    inSync,
    canonicalVersion,
    versions,
    errors,
  };
}

/**
 * Aplica una nueva versión a los manifiestos de ArgoCD
 */
export function applyGitOpsPin(options: {
  tag: string;
  dryRun?: boolean;
  targetFiles?: string[] | undefined;
  baseDir?: string | undefined;
}): {
  success: boolean;
  newTag: string;
  updatedFiles: string[];
  oldVersions: Record<string, string | null>;
} {
  const { tag, dryRun = false, targetFiles = DEFAULT_GITOPS_APP_FILES, baseDir = ROOT_DIR } = options;

  if (!validateSemVerTag(tag)) {
    throw new Error(`Tag inválido: "${tag}". Debe seguir formato vX.Y.Z`);
  }

  const updatedFiles: string[] = [];
  const oldVersions: Record<string, string | null> = {};

  for (const relPath of targetFiles) {
    const fullPath = path.resolve(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Archivo objetivo no encontrado: ${relPath}`);
    }

    const originalContent = fs.readFileSync(fullPath, 'utf-8');
    const oldVersion = extractTargetRevision(originalContent);
    oldVersions[relPath] = oldVersion;

    const newContent = replaceTargetRevision(originalContent, tag);

    if (!dryRun) {
      fs.writeFileSync(fullPath, newContent, 'utf-8');
    }
    updatedFiles.push(relPath);
  }

  return {
    success: true,
    newTag: tag,
    updatedFiles,
    oldVersions,
  };
}

// -----------------------------------------------------------------------------
// Punto de entrada CLI
// -----------------------------------------------------------------------------
function runCli() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isDryRun = args.includes('--dry-run');
  const tagArg = args.find((a) => a.startsWith('--tag='));
  const tag = tagArg ? tagArg.split('=')[1] : null;

  if (isCheck) {
    console.log('🔍 Auditando coherencia de targetRevision en manifiestos de ArgoCD...');
    const result = checkGitOpsPinParity();
    for (const [file, ver] of Object.entries(result.versions)) {
      console.log(`   - ${file}: ${ver ?? 'DESCONOCIDO'}`);
    }

    if (!result.inSync) {
      console.error('\n❌ Errores de paridad detectados en GitOps targetRevision:');
      for (const err of result.errors) {
        console.error(`   • ${err}`);
      }
      process.exit(1);
    }

    console.log(`\n✅ Paridad 1:1 verificada en ArgoCD. Versión canónica: ${result.canonicalVersion}`);
    process.exit(0);
  }

  if (tag) {
    console.log(`🚀 ${isDryRun ? '[DRY-RUN] ' : ''}Actualizando targetRevision de ArgoCD a: ${tag}`);
    try {
      const result = applyGitOpsPin({ tag, dryRun: isDryRun });
      for (const file of result.updatedFiles) {
        console.log(`   ✔ ${file}: ${result.oldVersions[file]} -> ${result.newTag}`);
      }
      if (isDryRun) {
        console.log('\n✨ Simulación exitosa. No se realizaron escrituras en disco.');
      } else {
        console.log('\n✅ Manifiestos de ArgoCD actualizados exitosamente.');
      }
      process.exit(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n❌ Error al actualizar targetRevision: ${msg}`);
      process.exit(1);
    }
  }

  console.log(`
Uso de update-gitops-pin:
  node --experimental-strip-types scripts/update-gitops-pin.ts --tag=<vX.Y.Z> [--dry-run]
  node --experimental-strip-types scripts/update-gitops-pin.ts --check
`);
  process.exit(1);
}

// Ejecución directa si se invoca como script principal
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runCli();
}
