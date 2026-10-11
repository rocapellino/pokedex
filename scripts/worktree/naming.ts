/**
 * Tipos de prefijo canónicos para ramas y tareas de pokédex.
 * Basados en Conventional Commits y las convenciones del repositorio.
 */
export const ALLOWED_TASK_TYPES = ['feat', 'fix', 'chore', 'ci', 'docs', 'test', 'refactor', 'perf', 'revert'] as const;

export type TaskType = (typeof ALLOWED_TASK_TYPES)[number];

export interface TaskNamingInput {
  type: string;
  scope?: string;
  slug: string;
  ticketId?: string; // e.g. 'AUD-SEC-001' o 'PER-123'
}

export interface CanonicalNamingResult {
  branchName: string;
  folderName: string;
  ticketId?: string;
}

/**
 * Normaliza una cadena para uso seguro en ramas de Git y nombres de directorios en cualquier SO.
 * Convierte espacios y caracteres especiales a guiones medios '-', elimina acentos y pasa a minúsculas.
 */
export function sanitizeSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes y diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-') // Reemplazar caracteres no alfanuméricos por guión
    .replace(/^-+|-+$/g, '') // Podar guiones iniciales o finales
    .replace(/-+/g, '-'); // Colapsar guiones repetidos
}

/**
 * Normaliza un identificador de ticket/auditoría (ej. aud-sec-001 -> AUD-SEC-001).
 */
export function sanitizeTicketId(ticketId?: string): string | undefined {
  if (!ticketId?.trim()) {
    return undefined;
  }
  const clean = ticketId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-');
  return clean || undefined;
}

/**
 * Genera el nombre canónico de rama y directorio a partir de parámetros estructurados.
 *
 * Convención de rama:
 *   `<type>/<slug>` o `<type>/<scope>-<slug>` o `<type>/<ticket>-<slug>`
 *
 * Convención de carpeta (folderName seguro para sistema de archivos y sin barras anidadas):
 *   `<type>--<slug>` o `<type>--<scope>-<slug>` o `<type>--<ticket>-<slug>`
 */
export function generateCanonicalNaming(input: TaskNamingInput): CanonicalNamingResult {
  const rawType = input.type.trim().toLowerCase();
  if (!ALLOWED_TASK_TYPES.includes(rawType as TaskType)) {
    throw new Error(`Tipo de tarea '${input.type}' inválido. Tipos permitidos: ${ALLOWED_TASK_TYPES.join(', ')}`);
  }

  const cleanSlug = sanitizeSlug(input.slug);
  if (!cleanSlug) {
    throw new Error('El slug o descripción de la tarea no puede estar vacío.');
  }

  const cleanScope = input.scope ? sanitizeSlug(input.scope) : undefined;
  const cleanTicket = sanitizeTicketId(input.ticketId);

  // Construcción del segmento descriptor
  const descriptorParts: string[] = [];
  if (cleanTicket) {
    descriptorParts.push(cleanTicket.toLowerCase());
  } else if (cleanScope) {
    descriptorParts.push(cleanScope);
  }
  descriptorParts.push(cleanSlug);

  const descriptor = descriptorParts.join('-');

  // Rama: utiliza barra '/' para agrupar en Git
  const branchName = `${rawType}/${descriptor}`;

  // Directorio de worktree: utiliza doble guión '--' para aplanar y evitar colisiones de rutas
  const folderName = `${rawType}--${descriptor}`;

  return {
    branchName,
    folderName,
    ticketId: cleanTicket,
  };
}

/**
 * Parsea un nombre de rama o carpeta existente e intenta deducir su información canónica.
 */
export function parseExistingBranchOrFolder(identifier: string): Partial<CanonicalNamingResult> {
  const trimmed = identifier.trim();
  // Si tiene barra, asumimos formato rama: type/descriptor
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    const type = parts[0].toLowerCase();
    const rest = parts.slice(1).join('-');
    return {
      branchName: trimmed,
      folderName: `${type}--${sanitizeSlug(rest)}`,
    };
  }

  // Si tiene doble guión: type--descriptor
  if (trimmed.includes('--')) {
    const [type, ...rest] = trimmed.split('--');
    return {
      branchName: `${type.toLowerCase()}/${sanitizeSlug(rest.join('-'))}`,
      folderName: trimmed,
    };
  }

  // Si es un identificador plano (ej. implement_worktree_governance)
  const safe = sanitizeSlug(trimmed);
  return {
    branchName: safe,
    folderName: safe,
  };
}
