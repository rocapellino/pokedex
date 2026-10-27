/**
 * ==============================================================================
 * scripts/tag-retention/protection.ts
 *
 * Resolución y recolección de versiones protegidas en GitOps, Helm, package.json
 * y la ventana de rollback de imágenes OCI (N, N-1, N-2).
 * ==============================================================================
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { compareSemver, parseSemverTag } from './semver.ts';
import { DEFAULT_ROLLBACK_WINDOW_COUNT, type ParsedSemver, SEMVER_TAG_REGEX } from './types.ts';

const TARGET_REVISION_REGEX = /targetRevision:\s*([^\s#]+)/;
const APP_VERSION_REGEX = /^appVersion:\s*["']?([^"'\s]+)["']?/m;
const HELM_VERSION_REGEX = /^version:\s*["']?([^"'\s]+)["']?/m;

const GITOPS_MANIFEST_FILES = [
  'gitops/apps/app-proxmox-preprod.yaml',
  'gitops/apps/app-cloud.yaml',
  'gitops/apps/root-application.yaml',
] as const;

/**
 * Protege los últimos `rollbackCount` tags SemVer estables (N, N-1, N-2) para mantener
 * paridad con la ventana de rollback de imágenes en GHCR (`collectReleasePinnedDigests`).
 */
export function protectRollbackWindowTags(
  tagNames: Iterable<string>,
  protectedMap: Map<string, string>,
  rollbackCount: number = DEFAULT_ROLLBACK_WINDOW_COUNT,
): void {
  const stableParsed: ParsedSemver[] = [];
  for (const rawName of tagNames) {
    const trimmed = rawName.trim();
    if (!trimmed) continue;
    const parsed = parseSemverTag(trimmed);
    if (parsed && !parsed.isPrerelease) {
      stableParsed.push(parsed);
    }
  }
  stableParsed.sort((a, b) => compareSemver(b, a));
  for (const item of stableParsed.slice(0, Math.max(0, rollbackCount))) {
    if (!protectedMap.has(item.raw)) {
      protectedMap.set(
        item.raw,
        `GHCR Rollback: ventana de los últimos ${rollbackCount} releases estables (N, N-1, N-2)`,
      );
    }
  }
}

function collectCustomExceptions(customExceptions: string[], protectedMap: Map<string, string>): void {
  for (const tag of customExceptions) {
    if (tag?.trim()) {
      protectedMap.set(tag.trim(), 'Configuración: Lista explícita de excepciones protegidas');
    }
  }
}

function collectGitOpsProtectedTags(root: string, protectedMap: Map<string, string>): void {
  for (const file of GITOPS_MANIFEST_FILES) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const match = TARGET_REVISION_REGEX.exec(content);
    if (match) {
      const rev = match[1].trim();
      if (SEMVER_TAG_REGEX.test(rev)) {
        protectedMap.set(rev, `GitOps: targetRevision en ${file}`);
      }
    }
  }
}

function collectHelmProtectedTags(root: string, protectedMap: Map<string, string>): void {
  const chartPath = path.join(root, 'infra/helm/pokedex/Chart.yaml');
  if (!fs.existsSync(chartPath)) return;

  const content = fs.readFileSync(chartPath, 'utf8');
  const appVerMatch = APP_VERSION_REGEX.exec(content);
  if (appVerMatch) {
    const raw = appVerMatch[1];
    protectedMap.set(raw, 'Helm: appVersion en infra/helm/pokedex/Chart.yaml');
    if (!raw.startsWith('v')) {
      protectedMap.set(`v${raw}`, 'Helm: appVersion con prefijo en infra/helm/pokedex/Chart.yaml');
    }
  }

  const verMatch = HELM_VERSION_REGEX.exec(content);
  if (verMatch) {
    const raw = verMatch[1];
    if (!protectedMap.has(raw)) {
      protectedMap.set(raw, 'Helm: chart version en infra/helm/pokedex/Chart.yaml');
    }
    if (!raw.startsWith('v') && !protectedMap.has(`v${raw}`)) {
      protectedMap.set(`v${raw}`, 'Helm: chart version con prefijo en infra/helm/pokedex/Chart.yaml');
    }
  }
}

function collectPackageJsonProtectedTags(root: string, protectedMap: Map<string, string>): void {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version) {
      protectedMap.set(`v${pkg.version}`, 'Monorepo: versión canónica en package.json');
      protectedMap.set(pkg.version, 'Monorepo: versión sin prefijo en package.json');
    }
  } catch {
    // Ignorar errores de parseo en entornos de test si package.json no es JSON válido
  }
}

function collectRollbackWindowFromGit(root: string, protectedMap: Map<string, string>, rollbackCount: number): void {
  try {
    const listed = execFileSync('git', ['tag', '--list', 'v*'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
    });
    protectRollbackWindowTags(listed.split(/\r?\n/), protectedMap, rollbackCount);
  } catch {
    // Si el directorio no es un repositorio Git o git no está disponible, se omite sin fallar
  }
}

/**
 * Recolecta todos los tags que están activamente protegidos por GitOps, Helm, package.json,
 * la ventana de rollback de GHCR (N, N-1, N-2) y una lista personalizada de excepciones.
 */
export function collectProtectedTags(
  root: string = process.cwd(),
  customExceptions: string[] = [],
  rollbackCount: number = DEFAULT_ROLLBACK_WINDOW_COUNT,
): Map<string, string> {
  const protectedMap = new Map<string, string>();

  collectCustomExceptions(customExceptions, protectedMap);
  collectGitOpsProtectedTags(root, protectedMap);
  collectHelmProtectedTags(root, protectedMap);
  collectPackageJsonProtectedTags(root, protectedMap);

  if (rollbackCount > 0) {
    collectRollbackWindowFromGit(root, protectedMap, rollbackCount);
  }

  return protectedMap;
}
