/**
 * ==============================================================================
 * scripts/generate-pokemon-catalog.ts
 * ==============================================================================
 * Genera el catálogo nacional completo de Pokémon a partir de PokeAPI y lo
 * escribe como dataset versionado para el seed job de pre-prod (ADR-030).
 *
 * El dataset se genera fuera del despliegue a propósito: el seed job no depende
 * de la disponibilidad ni de los límites de tasa de PokeAPI, y dos
 * sincronizaciones del mismo tag producen la misma base.
 *
 * - Textos en español (nombre, tipos, habilidades, categoría, descripción y
 *   método de evolución), con fallback explícito cuando PokeAPI no los tiene.
 * - Cada entrada se valida con `validatePokemonPayload` del backend: si una
 *   entrada no supera el validador, el script falla sin escribir el archivo.
 * - Las respuestas se cachean en `tmp/pokeapi-cache/` para que reejecutar el
 *   script sea barato e idempotente.
 *
 * Uso CLI:
 *   npx tsx scripts/generate-pokemon-catalog.ts
 *   npx tsx scripts/generate-pokemon-catalog.ts --limit=151 --out=tmp/catalog.json
 *   npx tsx scripts/generate-pokemon-catalog.ts --no-cache
 * ==============================================================================
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePokemonPayload } from '../apps/backend/src/validation/pokemon.js';
import { validateEvolutionNodeZod } from '../apps/backend/src/validation/schemas.js';
import type { EvolutionNode, Pokemon } from '../apps/backend/src/types.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
export const DEFAULT_OUTPUT = 'apps/backend/src/data/pokemon-catalog.full.json';
const DEFAULT_CACHE_DIR = 'tmp/pokeapi-cache';
const CONCURRENCY = 8;
const MAX_ATTEMPTS = 4;
const ARTWORK_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

/** Nombres de tipo alineados con `TYPE_COLORS` del frontend. */
export const TYPE_NAMES_ES: Record<string, string> = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  grass: 'Planta',
  electric: 'Eléctrico',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
};

/** PokeAPI solo publica hábitat hasta la generación 3. */
export const HABITAT_NAMES_ES: Record<string, string> = {
  cave: 'Cuevas',
  forest: 'Bosques',
  grassland: 'Praderas',
  mountain: 'Montañas',
  rare: 'Zonas Raras',
  'rough-terrain': 'Terreno Agreste',
  sea: 'Mares',
  urban: 'Zonas Urbanas',
  'waters-edge': 'Ríos y Lagos',
};
export const UNKNOWN_HABITAT = 'Desconocido';

/** Disparadores de evolución sin `es` en PokeAPI (`level-up`, `use-item` y `trade` se componen aparte). */
export const EVOLUTION_TRIGGERS_ES: Record<string, string> = {
  shed: 'Muda (espacio libre en el equipo)',
  spin: 'Girar',
  'tower-of-darkness': 'Entrenar en la Torre Siniestra',
  'tower-of-waters': 'Entrenar en la Torre Hídrica',
  'three-critical-hits': 'Tres golpes críticos en un combate',
  'take-damage': 'Ir a un lugar tras recibir daño',
  'in-battle-level-up': 'Subir de nivel en combate',
  'agile-style-move': 'Usar movimiento en estilo rápido',
  'strong-style-move': 'Usar movimiento en estilo fuerte',
  'recoil-damage': 'Recibir daño de retroceso',
  'use-move': 'Usar movimiento',
  'three-defeated-bisharp': 'Derrotar a tres Bisharp con Distintivo de Líder',
  'gimmighoul-coins': 'Reunir 999 monedas de Gimmighoul',
  'meltan-candies': 'Caramelos de Meltan en Pokémon GO',
  unclassified: 'Método especial',
};

type StatKey = 'hp' | 'attack' | 'defense' | 'sp_attack' | 'sp_defense' | 'speed';

const STAT_KEYS: Record<string, StatKey> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'sp_attack',
  'special-defense': 'sp_defense',
  speed: 'speed',
};

interface NamedResource { name: string; url: string }
interface LocalizedName { name: string; language: NamedResource }

interface GeneratorOptions {
  limit?: number;
  outFile: string;
  cacheDir: string | null;
}

export interface DegradedEntry {
  id: number;
  nombre: string;
  motivos: string[];
}

// ------------------------------------------------------------------------------
// Utilidades de texto
// ------------------------------------------------------------------------------

export function pickLocalized(names: LocalizedName[] | undefined, lang: string): string | undefined {
  return names?.find((n) => n.language.name === lang)?.name;
}

export function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

/** Normaliza el flavor text de los juegos: saltos de página, guiones blandos y espacios. */
export function normalizeFlavorText(text: string): string {
  return text
    .replace(/[\f\n\r\u00ad]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `Pokémon Semilla` -> `Semilla`, igual que la muestra de `initialPokemons.ts`. */
export function stripGenusPrefix(genus: string): string {
  return genus.replace(/^Pokémon\s+/i, '').trim();
}

/** `Big Horn Pokémon` -> `Big Horn` (fallback en inglés). */
export function stripGenusSuffixEn(genus: string): string {
  return genus.replace(/\s+Pokémon$/i, '').trim();
}

export function speciesIdFromUrl(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url);
  if (!match) throw new Error(`URL de PokeAPI sin ID numérico: ${url}`);
  return Number(match[1]);
}

export function artworkUrl(id: number): string {
  return `${ARTWORK_BASE}/${id}.png`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

// ------------------------------------------------------------------------------
// Cliente PokeAPI con caché y reintentos
// ------------------------------------------------------------------------------

class PokeApiClient {
  private readonly memo = new Map<string, Promise<unknown>>();
  private readonly cacheDir: string | null;

  constructor(cacheDir: string | null) {
    this.cacheDir = cacheDir;
    if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
  }

  get<T>(url: string): Promise<T> {
    const absolute = url.startsWith('http') ? url : `${POKEAPI_BASE}/${url.replace(/^\//, '')}`;
    let pending = this.memo.get(absolute);
    if (!pending) {
      pending = this.load(absolute);
      this.memo.set(absolute, pending);
    }
    return pending as Promise<T>;
  }

  private async load(url: string): Promise<unknown> {
    const cacheFile = this.cacheDir
      ? path.join(this.cacheDir, `${crypto.createHash('sha256').update(url).digest('hex')}.json`)
      : null;
    if (cacheFile && fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!response.ok) {
          throw Object.assign(new Error(`HTTP ${response.status} en ${url}`), { permanent: true });
        }
        const body = await response.json();
        if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(body));
        return body;
      } catch (err) {
        lastError = err;
        if ((err as { permanent?: boolean }).permanent) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
    throw new Error(`No se pudo obtener ${url}: ${(lastError as Error)?.message ?? lastError}`);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ------------------------------------------------------------------------------
// Traducción de recursos
// ------------------------------------------------------------------------------

interface EvolutionDetail {
  trigger: NamedResource;
  min_level: number | null;
  min_happiness: number | null;
  min_affection: number | null;
  item: NamedResource | null;
  held_item: NamedResource | null;
  known_move: NamedResource | null;
  time_of_day: string;
  needs_overworld_rain: boolean;
  turn_upside_down: boolean;
}

interface ChainLink {
  species: NamedResource;
  evolution_details: EvolutionDetail[];
  evolves_to: ChainLink[];
}

class Translator {
  constructor(private readonly api: PokeApiClient) {}

  async resourceName(resource: NamedResource): Promise<string> {
    const data = await this.api.get<{ names?: LocalizedName[] }>(resource.url);
    return pickLocalized(data.names, 'es') ?? pickLocalized(data.names, 'en') ?? titleCaseSlug(resource.name);
  }

  /** Describe en español el primer método de evolución de un eslabón. */
  async evolutionMethod(details: EvolutionDetail[]): Promise<string> {
    const detail = details[0];
    if (!detail) return 'Método especial';

    const parts: string[] = [];
    switch (detail.trigger.name) {
      case 'level-up': {
        if (detail.min_level) parts.push(`Nivel ${detail.min_level}`);
        if (detail.min_happiness) parts.push(detail.min_level ? 'Amistad alta' : 'Amistad alta + Nivel');
        if (detail.min_affection) parts.push('Afecto alto + Nivel');
        if (detail.known_move) parts.push(`Conocer ${await this.resourceName(detail.known_move)}`);
        if (detail.held_item) parts.push(`Equipar ${await this.resourceName(detail.held_item)}`);
        if (parts.length === 0) parts.push('Subir de nivel');
        break;
      }
      case 'use-item':
        parts.push(detail.item ? `Usar ${await this.resourceName(detail.item)}` : 'Usar objeto');
        break;
      case 'trade':
        parts.push(detail.held_item ? `Intercambio con ${await this.resourceName(detail.held_item)}` : 'Intercambio');
        break;
      default:
        // Los disparadores de Galar, Hisui y Paldea no tienen nombre en español en PokeAPI.
        parts.push(EVOLUTION_TRIGGERS_ES[detail.trigger.name] ?? (await this.resourceName(detail.trigger)));
    }

    if (detail.time_of_day === 'day') parts.push('de día');
    if (detail.time_of_day === 'night') parts.push('de noche');
    if (detail.needs_overworld_rain) parts.push('con lluvia');
    if (detail.turn_upside_down) parts.push('consola invertida');

    return truncate(parts.join(' + ').replace(/ \+ (de día|de noche|con lluvia)/g, ' $1'), 100);
  }

  /** Aplana la cadena evolutiva en orden BFS, con la etapa según la profundidad. */
  async evolutionChain(chainUrl: string, names: Map<number, string>): Promise<EvolutionNode[]> {
    const chain = await this.api.get<{ chain: ChainLink }>(chainUrl);
    const nodes: EvolutionNode[] = [];
    const queue: Array<{ link: ChainLink; depth: number }> = [{ link: chain.chain, depth: 0 }];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { link, depth } = item;
      const id = speciesIdFromUrl(link.species.url);
      nodes.push({
        id,
        nombre: names.get(id) ?? titleCaseSlug(link.species.name),
        etapa: depth === 0 ? 'Base' : `Fase ${depth}`,
        metodo: depth === 0 ? null : await this.evolutionMethod(link.evolution_details),
        imagen: artworkUrl(id),
      });
      for (const child of link.evolves_to) queue.push({ link: child, depth: depth + 1 });
    }
    return nodes;
  }
}

// ------------------------------------------------------------------------------
// Construcción de entradas
// ------------------------------------------------------------------------------

interface SpeciesData {
  id: number;
  name: string;
  names: LocalizedName[];
  genera: Array<{ genus: string; language: NamedResource }>;
  flavor_text_entries: Array<{ flavor_text: string; language: NamedResource }>;
  habitat: NamedResource | null;
  evolution_chain: { url: string } | null;
  varieties: Array<{ is_default: boolean; pokemon: NamedResource }>;
}

interface PokemonData {
  id: number;
  height: number;
  weight: number;
  types: Array<{ slot: number; type: NamedResource }>;
  abilities: Array<{ slot: number; ability: NamedResource }>;
  stats: Array<{ base_stat: number; stat: NamedResource }>;
  sprites: { other?: { 'official-artwork'?: { front_default?: string | null } } };
}

async function buildEntry(
  species: SpeciesData,
  api: PokeApiClient,
  translator: Translator,
  names: Map<number, string>,
  degraded: DegradedEntry[],
): Promise<Pokemon> {
  const defaultVariety = species.varieties.find((v) => v.is_default) ?? species.varieties[0];
  const pokemon = await api.get<PokemonData>(defaultVariety.pokemon.url);
  const motivos: string[] = [];

  const nombre = names.get(species.id) ?? titleCaseSlug(species.name);
  const tipos = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((t) => TYPE_NAMES_ES[t.type.name] ?? titleCaseSlug(t.type.name));

  const habilidades: string[] = [];
  for (const { ability } of [...pokemon.abilities].sort((a, b) => a.slot - b.slot)) {
    const label = await translator.resourceName(ability);
    if (!habilidades.includes(label)) habilidades.push(label);
  }

  const stats = { hp: 0, attack: 0, defense: 0, sp_attack: 0, sp_defense: 0, speed: 0 };
  for (const s of pokemon.stats) {
    const key = STAT_KEYS[s.stat.name];
    if (key) stats[key] = s.base_stat;
  }

  const genusEs = species.genera.find((g) => g.language.name === 'es')?.genus;
  const genusEn = species.genera.find((g) => g.language.name === 'en')?.genus;
  // Sin traducción, el texto en inglés informa más que un marcador vacío; queda reportado como degradado.
  const categoria = genusEs ? stripGenusPrefix(genusEs) : genusEn ? stripGenusSuffixEn(genusEn) : 'Desconocida';
  if (!genusEs) motivos.push('categoría en inglés (sin traducción al español)');

  const flavorOf = (lang: string) => species.flavor_text_entries.filter((f) => f.language.name === lang).at(-1)?.flavor_text;
  const flavor = flavorOf('es') ?? flavorOf('en');
  const descripcion = flavor ? truncate(normalizeFlavorText(flavor), 1000) : 'Sin descripción disponible.';
  if (!flavorOf('es')) motivos.push('descripción en inglés (sin traducción al español)');

  const habitat = species.habitat ? HABITAT_NAMES_ES[species.habitat.name] ?? titleCaseSlug(species.habitat.name) : UNKNOWN_HABITAT;
  if (!species.habitat) motivos.push('hábitat no publicado por PokeAPI');

  const peso = pokemon.weight / 10;
  const altura = pokemon.height / 10;
  const imagen = pokemon.sprites.other?.['official-artwork']?.front_default ?? artworkUrl(species.id);

  const evoluciones = species.evolution_chain
    ? await translator.evolutionChain(species.evolution_chain.url, names)
    : [{ id: species.id, nombre, etapa: 'Base', metodo: null, imagen: artworkUrl(species.id) }];

  if (motivos.length > 0) degraded.push({ id: species.id, nombre, motivos });

  return {
    id: species.id,
    nombre,
    imagen,
    tipo: tipos[0],
    tipos,
    habitat,
    fuerza: stats.attack,
    caracteristicas: { peso, altura, fuerza: stats.attack, categoria, descripcion, habitat },
    habilidades,
    stats,
    evoluciones,
  };
}

/** Falla si alguna entrada no supera el validador del backend o si los IDs no son contiguos. */
export function assertCatalogValid(catalog: Pokemon[]): void {
  const errors: string[] = [];
  catalog.forEach((entry, index) => {
    if (entry.id !== index + 1) errors.push(`#${index + 1}: ID fuera de secuencia (${entry.id})`);
    const result = validatePokemonPayload(entry);
    if (!result.valid) errors.push(`#${entry.id} ${entry.nombre}: ${result.error}`);
    for (const node of (entry.evoluciones as EvolutionNode[]) ?? []) {
      const nodeResult = validateEvolutionNodeZod(node);
      if (!nodeResult.valid) errors.push(`#${entry.id} ${entry.nombre} (evolución): ${nodeResult.error}`);
    }
  });
  if (errors.length > 0) {
    throw new Error(`El catálogo generado no supera la validación:\n- ${errors.slice(0, 20).join('\n- ')}`);
  }
}

/** Una entrada por línea: diffs legibles sin el peso de un JSON indentado. */
export function serializeCatalog(catalog: Pokemon[]): string {
  return `[\n${catalog.map((entry) => JSON.stringify(entry)).join(',\n')}\n]\n`;
}

export async function generateCatalog(options: GeneratorOptions): Promise<{ catalog: Pokemon[]; degraded: DegradedEntry[] }> {
  const api = new PokeApiClient(options.cacheDir);
  const translator = new Translator(api);

  const index = await api.get<{ count: number; results: NamedResource[] }>('pokemon-species?limit=100000');
  const ids = index.results
    .map((r) => speciesIdFromUrl(r.url))
    .sort((a, b) => a - b)
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);

  console.log(`📦 Especies a procesar: ${ids.length} de ${index.count}.`);
  const speciesList = await mapLimit(ids, CONCURRENCY, (id) => api.get<SpeciesData>(`pokemon-species/${id}`));

  // Los nombres se resuelven antes para que las cadenas evolutivas usen el mismo nombre que la entrada.
  const names = new Map<number, string>();
  for (const s of speciesList) names.set(s.id, pickLocalized(s.names, 'es') ?? pickLocalized(s.names, 'en') ?? titleCaseSlug(s.name));

  const degraded: DegradedEntry[] = [];
  let done = 0;
  const catalog = await mapLimit(speciesList, CONCURRENCY, async (species) => {
    const entry = await buildEntry(species, api, translator, names, degraded);
    done++;
    if (done % 100 === 0 || done === speciesList.length) console.log(`⏳ ${done}/${speciesList.length} entradas construidas`);
    return entry;
  });

  degraded.sort((a, b) => a.id - b.id);
  assertCatalogValid(catalog);
  return { catalog, degraded };
}

function parseArgs(argv: string[]): GeneratorOptions {
  const options: GeneratorOptions = { outFile: DEFAULT_OUTPUT, cacheDir: DEFAULT_CACHE_DIR };
  for (const arg of argv) {
    if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--out=')) options.outFile = arg.slice('--out='.length);
    else if (arg === '--no-cache') options.cacheDir = null;
    else throw new Error(`Argumento no reconocido: ${arg}`);
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error('--limit debe ser un entero positivo');
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const cacheDir = options.cacheDir ? path.resolve(ROOT_DIR, options.cacheDir) : null;
  const { catalog, degraded } = await generateCatalog({ ...options, cacheDir });

  const outFile = path.resolve(ROOT_DIR, options.outFile);
  const tmpFile = `${outFile}.tmp`;
  fs.writeFileSync(tmpFile, serializeCatalog(catalog));
  fs.renameSync(tmpFile, outFile);

  console.log(`✅ Catálogo escrito en ${path.relative(ROOT_DIR, outFile)} (${catalog.length} entradas).`);
  if (degraded.length > 0) {
    const byReason = new Map<string, number>();
    for (const d of degraded) for (const m of d.motivos) byReason.set(m, (byReason.get(m) ?? 0) + 1);
    console.log(`⚠️ Entradas con datos de fallback: ${degraded.length}.`);
    for (const [reason, count] of byReason) console.log(`   - ${reason}: ${count}`);
  }
}

if (process.argv[1]?.endsWith('generate-pokemon-catalog.ts')) {
  main().catch((err) => {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
