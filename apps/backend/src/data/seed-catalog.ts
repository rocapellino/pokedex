// ==============================================================================
// Selección del Dataset de Siembra (ADR-030)
// ==============================================================================
// - `sample`: muestra curada de `initialPokemons.ts` (dev, tests y fallback en memoria).
// - `full`: catálogo nacional completo generado desde PokeAPI con
//   `scripts/generate-pokemon-catalog.ts` (pre-prod y prod).
//
// Solo el seed job importa este módulo: el JSON completo se empaqueta en
// `dist/seed.cjs` y no en `dist/server.cjs`.
import type { Pokemon } from '../types.js';
import { initialPokemons } from './initialPokemons.js';
import fullCatalog from './pokemon-catalog.full.json' with { type: 'json' };

export const SEED_DATASETS = ['sample', 'full'] as const;
export type SeedDataset = (typeof SEED_DATASETS)[number];

/**
 * Interpreta `SEED_DATASET`. Sin valor se usa la muestra; un valor desconocido
 * es un error de configuración y no se degrada en silencio a otro dataset.
 */
export function resolveSeedDataset(raw: string | undefined): SeedDataset {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return 'sample';
  if ((SEED_DATASETS as readonly string[]).includes(value)) return value as SeedDataset;
  throw new Error(`SEED_DATASET inválido: '${raw}'. Valores permitidos: ${SEED_DATASETS.join(', ')}.`);
}

export function loadSeedCatalog(dataset: SeedDataset): Pokemon[] {
  return dataset === 'full' ? (fullCatalog as unknown as Pokemon[]) : initialPokemons;
}

export const PRODUCTION_FORCE_SEED_TOKEN = 'OVERRIDE_PRODUCTION_CONFIRMED';

export interface SeedPlan {
  /** `insert-missing`: solo IDs ausentes. `force-sync`: reescribe todo el catálogo base. */
  mode: 'insert-missing' | 'force-sync';
  toSeed: Pokemon[];
  /** Presente cuando se pidió FORCE_SEED en producción sin el token de confirmación. */
  blockedForce?: string;
}

/**
 * Decide qué entradas sembrar.
 *
 * Sin FORCE_SEED solo se insertan los IDs que faltan: así reejecutar el job no
 * pisa las ediciones hechas desde el backoffice. FORCE_SEED reescribe el
 * catálogo base completo; en producción exige `OVERRIDE_PRODUCTION_CONFIRMED`.
 */
export function planSeed(
  catalog: Pokemon[],
  existingIds: ReadonlySet<number>,
  env: { forceSeed?: string; isProduction: boolean },
): SeedPlan {
  const forceRaw = (env.forceSeed ?? '').trim();
  const forceRequested = forceRaw === 'true' || forceRaw === '1' || forceRaw === PRODUCTION_FORCE_SEED_TOKEN;
  const missing = catalog.filter((p) => !existingIds.has(p.id));

  if (!forceRequested) return { mode: 'insert-missing', toSeed: missing };

  if (env.isProduction && forceRaw !== PRODUCTION_FORCE_SEED_TOKEN) {
    return {
      mode: 'insert-missing',
      toSeed: missing,
      blockedForce: `FORCE_SEED bloqueado en producción: configure FORCE_SEED="${PRODUCTION_FORCE_SEED_TOKEN}" para reescribir el catálogo base.`,
    };
  }
  return { mode: 'force-sync', toSeed: catalog };
}
