/**
 * ==============================================================================
 * scripts/mcp/env.ts
 * ==============================================================================
 * Utilidad determinista para cargar variables de entorno locales desde .env
 * sin exponer ni fugar secretos en logs.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

export function loadLocalEnv(rootDir: string = process.cwd()): void {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;

  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
      return;
    }
  } catch {
    // Fallback a parser determinista manual ante caracteres especiales
  }

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed
          .slice(eqIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Silencioso ante fallos no bloqueantes de lectura
  }
}
