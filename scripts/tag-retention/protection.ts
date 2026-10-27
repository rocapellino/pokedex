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

  // 1. Excepciones personalizadas explícitas
  for (const tag of customExceptions) {
    if (tag?.trim()) {
      protectedMap.set(tag.trim(), 'Configuración: Lista explícita de excepciones protegidas');
    }
  }

  // 2. GitOps Applications (targetRevision)
  for (const file of [
    'gitops/apps/app-proxmox-preprod.yaml',
    'gitops/apps/app-cloud.yaml',
    'gitops/apps/root-application.yaml',
  ]) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const match = content.match(/targetRevision:\s*([^\s#\r\n]+)/);
    if (match) {
      const rev = match[1].trim();
      if (SEMVER_TAG_REGEX.test(rev)) {
        protectedMap.set(rev, `GitOps: targetRevision en ${file}`);
      }
    }
  }

  // 3. Helm Chart.yaml
  const chartPath = path.join(root, 'infra/helm/pokedex/Chart.yaml');
  if (fs.existsSync(chartPath)) {
    const content = fs.readFileSync(chartPath, 'utf8');
    const appVerMatch = content.match(/^appVersion:\s*["']?([^"'\s]+)["']?/m);
    if (appVerMatch) {
      const raw = appVerMatch[1];
      protectedMap.set(raw, 'Helm: appVersion en infra/helm/pokedex/Chart.yaml');
      if (!raw.startsWith('v')) {
        protectedMap.set(`v${raw}`, 'Helm: appVersion con prefijo en infra/helm/pokedex/Chart.yaml');
      }
    }
    const verMatch = content.match(/^version:\s*["']?([^"'\s]+)["']?/m);
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

  // 4. package.json raíz
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
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

  // 5. AUD-REL-RET-002: Ventana de rollback de GHCR (últimos N releases estables vX.Y.Z)
  if (rollbackCount > 0) {
    try {
      const listed = execFileSync('git', ['tag', '--list', 'v*'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      protectRollbackWindowTags(listed.split(/\r?\n/), protectedMap, rollbackCount);
    } catch {
      // Si el directorio no es un repositorio Git o git no está disponible, se omite sin fallar
    }
  }

  return protectedMap;
}
