import { SCRIPT_PATTERN, validateImageUrl } from './network-security.js';
import { ALLOWED_STATS_KEYS, StatsSchema, strictFiniteNumber } from './pokemon-stats.schema.js';

// ==============================================================================
// Esquemas Zod de Nodos de Evolución y Megaevoluciones
// ==============================================================================

/**
 * Validación recursiva de nodos de evolución con límite de profundidad (máx 5)
 * y ramificación (máx 10 hijos directos).
 */
export interface EvolutionNode {
  id?: number;
  nombre?: string;
  etapa?: string;
  metodo?: string | null;
  imagen?: string | null;
  evolves_to?: EvolutionNode[];
  evoluciones?: EvolutionNode[];
}

export function validateEvolutionNodeZod(node: unknown, depth = 0): { valid: boolean; error?: string } {
  if (depth > 5) {
    return { valid: false, error: 'El árbol de evoluciones excede la profundidad máxima permitida de 5 niveles' };
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { valid: false, error: 'Cada nodo de evolución debe ser un objeto' };
  }
  const n = node as Record<string, unknown>;

  if (n.id !== undefined) {
    let id: number | null = null;
    if (typeof n.id === 'number' && Number.isInteger(n.id)) id = n.id;
    else if (typeof n.id === 'string' && /^-?\d+$/.test(n.id.trim())) {
      const parsed = Number(n.id.trim());
      if (Number.isSafeInteger(parsed)) id = parsed;
    }
    if (id === null || id <= 0) {
      return { valid: false, error: 'El ID en nodo de evolución debe ser un entero positivo' };
    }
  }

  if (n.nombre !== undefined) {
    if (typeof n.nombre !== 'string' || !n.nombre.trim() || n.nombre.length > 60 || SCRIPT_PATTERN.test(n.nombre)) {
      return { valid: false, error: 'El nombre en evolución no es válido o contiene caracteres peligrosos' };
    }
  }

  if (n.etapa !== undefined && (typeof n.etapa !== 'string' || n.etapa.length > 50 || SCRIPT_PATTERN.test(n.etapa))) {
    return { valid: false, error: 'El campo etapa en evolución contiene caracteres no permitidos' };
  }

  if (
    n.metodo !== undefined &&
    n.metodo !== null &&
    (typeof n.metodo !== 'string' || n.metodo.length > 100 || SCRIPT_PATTERN.test(n.metodo))
  ) {
    return { valid: false, error: 'El método de evolución contiene caracteres no permitidos' };
  }

  if (n.imagen !== undefined && n.imagen !== null && !validateImageUrl(n.imagen)) {
    return { valid: false, error: 'La URL de imagen en el nodo de evolución no es segura o es inválida' };
  }

  const children = n.evolves_to ?? n.evoluciones;
  if (children !== undefined) {
    if (!Array.isArray(children)) {
      return { valid: false, error: 'Las evoluciones hijas deben ser una lista' };
    }
    if (children.length > 10) {
      return { valid: false, error: 'Un nodo de evolución no puede ramificarse en más de 10 evoluciones directas' };
    }
    for (const child of children) {
      const childRes = validateEvolutionNodeZod(child, depth + 1);
      if (!childRes.valid) return childRes;
    }
  }

  return { valid: true };
}

/**
 * Megaevolución (solo lectura, cuelga del Pokémon base): lista blanca cerrada anti mass assignment.
 * No admite `id`: las megaevoluciones no tienen número de Pokédex Nacional propio.
 */
export const ALLOWED_MEGA_KEYS = [
  'clave',
  'nombre',
  'imagen',
  'tipos',
  'habilidades',
  'stats',
  'peso',
  'altura',
] as const;
export const MAX_MEGAEVOLUCIONES = 6;
const MEGA_CLAVE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateShortTextList(
  value: unknown,
  label: string,
  minItems: number,
  maxItems: number,
  maxLength: number,
): string | null {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    return `${label} de la megaevolución debe ser una lista de ${minItems} a ${maxItems} elementos`;
  }
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > maxLength || SCRIPT_PATTERN.test(item)) {
      return `Cada elemento de ${label} de la megaevolución debe ser un texto de hasta ${maxLength} caracteres sin HTML`;
    }
  }
  return null;
}

export function validateMegaEvolutionZod(mega: unknown): { valid: boolean; error?: string } {
  if (!mega || typeof mega !== 'object' || Array.isArray(mega)) {
    return { valid: false, error: 'Cada megaevolución debe ser un objeto' };
  }
  const m = mega as Record<string, unknown>;

  for (const key of Object.keys(m)) {
    if (!(ALLOWED_MEGA_KEYS as readonly string[]).includes(key)) {
      return { valid: false, error: `La megaevolución contiene una clave no permitida: '${key}'` };
    }
  }

  if (typeof m.clave !== 'string' || m.clave.length > 60 || !MEGA_CLAVE_PATTERN.test(m.clave)) {
    return {
      valid: false,
      error: 'La clave de la megaevolución debe ser un slug de hasta 60 caracteres (a-z, 0-9 y guiones)',
    };
  }
  if (
    typeof m.nombre !== 'string' ||
    !m.nombre.trim() ||
    m.nombre.trim().length > 80 ||
    SCRIPT_PATTERN.test(m.nombre)
  ) {
    return { valid: false, error: 'El nombre de la megaevolución es requerido, de hasta 80 caracteres y sin HTML' };
  }
  if (!validateImageUrl(m.imagen)) {
    return { valid: false, error: 'La imagen de la megaevolución debe ser una URL https o ruta relativa segura' };
  }

  const tiposError = validateShortTextList(m.tipos, 'tipos', 1, 2, 30);
  if (tiposError) return { valid: false, error: tiposError };
  const habilidadesError = validateShortTextList(m.habilidades, 'habilidades', 0, 3, 50);
  if (habilidadesError) return { valid: false, error: habilidadesError };

  const stats = StatsSchema.safeParse(m.stats);
  if (!stats.success) {
    return { valid: false, error: stats.error.issues[0]?.message || 'Stats de la megaevolución inválidos' };
  }
  for (const key of ALLOWED_STATS_KEYS) {
    if (!(key in (m.stats as Record<string, unknown>))) {
      return { valid: false, error: `Falta el stat '${key}' en la megaevolución` };
    }
  }

  const peso = strictFiniteNumber(
    0,
    10000,
    'El peso de la megaevolución debe ser un número positivo menor o igual a 10.000 kg',
  ).safeParse(m.peso);
  if (!peso.success)
    return { valid: false, error: peso.error.issues[0]?.message || 'Peso de la megaevolución inválido' };
  const altura = strictFiniteNumber(
    0,
    200,
    'La altura de la megaevolución debe ser un número positivo menor o igual a 200 m',
  ).safeParse(m.altura);
  if (!altura.success)
    return { valid: false, error: altura.error.issues[0]?.message || 'Altura de la megaevolución inválida' };

  return { valid: true };
}
