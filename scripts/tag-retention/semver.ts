/**
 * ==============================================================================
 * scripts/tag-retention/semver.ts
 *
 * Utilidades de validación criptográfica Git y parseo/comparación SemVer 2.0.
 * ==============================================================================
 */

import { GIT_SHA_REGEX, type ParsedSemver, SEMVER_TAG_REGEX } from './types.ts';

/**
 * Valida de forma estricta que una cadena sea un hash de Git completo y válido.
 * Rechaza cadenas vacías, incompletas, prefijos o con caracteres no hexadecimales.
 */
export function isValidGitSha(sha: unknown): sha is string {
  return typeof sha === 'string' && GIT_SHA_REGEX.test(sha.trim());
}

/**
 * Compara dos hashes de Git utilizando igualdad exacta insensible a mayúsculas.
 * Aborta devolviendo false si cualquiera de los dos valores no es un hash canónico completo de 40 hex.
 */
export function areShasEqual(a: unknown, b: unknown): boolean {
  if (!isValidGitSha(a) || !isValidGitSha(b)) {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Parsea y valida de forma estricta que una cadena represente un número entero positivo (> 0).
 * Rechaza cadenas con caracteres no numéricos o sufijos (e.g. '3abc'), números con decimales,
 * negativos, cero o valores vacíos/malformados.
 */
export function parseStrictPositiveInt(value: unknown, paramName: string): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(
      `Valor inválido para '${paramName}': se esperaba una cadena numérica o entero positivo, recibido ${typeof value}.`,
    );
  }

  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new Error(
      `Valor malformado para '${paramName}': '${str}' no es un entero positivo válido (> 0). Se rechazan sufijos alfanuméricos, decimales, negativos o cero.`,
    );
  }

  const parsed = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Valor fuera de rango seguro para '${paramName}': '${str}'.`);
  }

  return parsed;
}

/**
 * Parsea un tag en sus componentes canónicos SemVer 2.0.
 * Devuelve null si no cumple el formato '[v]X.Y.Z[-prerelease][+build]'.
 */
export function parseSemverTag(name: string): ParsedSemver | null {
  const match = SEMVER_TAG_REGEX.exec(name);
  if (!match) return null;

  const hasVPrefix = name.startsWith('v');
  const prerelease = match[4] || undefined;
  const build = match[5] || undefined;

  return {
    raw: name,
    hasVPrefix,
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease,
    build,
    isPrerelease: Boolean(prerelease),
  };
}

function comparePrereleasePart(pA?: string, pB?: string): number {
  if (pA === undefined) return -1;
  if (pB === undefined) return 1;
  if (pA === pB) return 0;

  const isNumA = /^\d+$/.test(pA);
  const isNumB = /^\d+$/.test(pB);

  if (isNumA && isNumB) {
    return Number.parseInt(pA, 10) - Number.parseInt(pB, 10);
  }
  if (isNumA) return -1;
  if (isNumB) return 1;

  return pA.localeCompare(pB);
}

function comparePrereleases(prereleaseA?: string, prereleaseB?: string): number {
  const partsA = (prereleaseA || '').split('.');
  const partsB = (prereleaseB || '').split('.');
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const diff = comparePrereleasePart(partsA[i], partsB[i]);
    if (diff !== 0) return diff;
  }

  return 0;
}

/**
 * Comparador determinista SemVer 2.0.
 * Retorna > 0 si a > b, < 0 si a < b, 0 si son equivalentes en precedencia.
 * Regla: versión estable > prerelease.
 * Build metadata se ignora en la precedencia de versión según especificación SemVer.
 */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Prerelease handling: estable > prerelease
  if (!a.isPrerelease && b.isPrerelease) return 1;
  if (a.isPrerelease && !b.isPrerelease) return -1;
  if (!a.isPrerelease && !b.isPrerelease) return 0;

  // Ambas tienen prerelease
  return comparePrereleases(a.prerelease, b.prerelease);
}
