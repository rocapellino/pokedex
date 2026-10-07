// ==============================================================================
// Selección del Dataset de Siembra (ADR-030)
// ==============================================================================
// - `sample`: muestra curada de `initialPokemons.ts` (dev, tests y fallback en memoria).
// - `full`: catálogo nacional completo generado desde PokeAPI con
//   `scripts/generate-pokemon-catalog.ts` (pre-prod y prod).
//
// Solo el seed job importa este módulo: el JSON completo se empaqueta en
// `dist/seed.cjs` y no en `dist/server.cjs`.
import type { MegaEvolution, Pokemon, PokemonClassification } from '../types.js';
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

/**
 * Serialización JSON con claves ordenadas: sirve para comparar valores sin depender del
 * orden de las claves, que `jsonb` de PostgreSQL no preserva.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface MegaEnrichment {
  id: number;
  megaevoluciones: MegaEvolution[];
}

/**
 * Decide qué filas YA persistidas deben recibir las megaevoluciones del catálogo.
 *
 * El seed solo inserta IDs ausentes, así que las filas existentes nunca las recibirían.
 * Este plan actualiza únicamente ese campo, sin tocar el resto de la entrada ni las
 * ediciones hechas desde el backoffice. Es idempotente y nunca borra megaevoluciones
 * persistidas cuando el catálogo no trae ninguna.
 */
export function planMegaEnrichment(
  catalog: Pokemon[],
  persistedMegas: ReadonlyMap<number, MegaEvolution[] | undefined>,
  existingIds: ReadonlySet<number>,
): MegaEnrichment[] {
  const plan: MegaEnrichment[] = [];
  for (const entry of catalog) {
    const megas = entry.megaevoluciones;
    if (!megas || megas.length === 0 || !existingIds.has(entry.id)) continue;
    const current = persistedMegas.get(entry.id);
    if (current && canonicalJson(current) === canonicalJson(megas)) continue;
    plan.push({ id: entry.id, megaevoluciones: megas });
  }
  return plan;
}

export interface ClassificationEnrichment {
  id: number;
  clasificacion: PokemonClassification;
}

/**
 * Decide qué filas YA persistidas deben recibir (o corregir) la clasificación legendario/mítico
 * del catálogo. Igual que con las megaevoluciones, el seed solo inserta IDs ausentes, así que las
 * filas existentes necesitan este plan; solo toca ese campo y es idempotente. Nunca borra una
 * clasificación persistida cuando el catálogo no trae ninguna.
 */
export function planClassificationEnrichment(
  catalog: Pokemon[],
  persisted: ReadonlyMap<number, PokemonClassification | undefined>,
  existingIds: ReadonlySet<number>,
): ClassificationEnrichment[] {
  const plan: ClassificationEnrichment[] = [];
  for (const entry of catalog) {
    if (!entry.clasificacion || !existingIds.has(entry.id)) continue;
    if (persisted.get(entry.id) === entry.clasificacion) continue;
    plan.push({ id: entry.id, clasificacion: entry.clasificacion });
  }
  return plan;
}
