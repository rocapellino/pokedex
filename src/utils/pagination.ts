// ==============================================================================
// Utilidades de Paginación y Control de Límites (Prevención DoS)
// ==============================================================================

export const MAX_PAGE_SIZE = 100;
export const MAX_OFFSET = 10000;
export const DEFAULT_PAGE_SIZE = 50;

export function parsePaginationLimit(limit: unknown): number {
  if (limit === undefined || limit === null || limit === '') {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = parseInt(String(limit), 10);
  if (isNaN(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(MAX_PAGE_SIZE, Math.max(1, parsed || DEFAULT_PAGE_SIZE));
}

export function parsePaginationOffset(offset: unknown): number {
  if (offset === undefined || offset === null || offset === '') {
    return 0;
  }
  const parsed = parseInt(String(offset), 10);
  if (isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(MAX_OFFSET, parsed);
}

export function parsePagination(
  limitOrOptions?: unknown,
  offsetArg?: unknown
): { limit: number; offset: number } {
  if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
    const opts = limitOrOptions as { limit?: unknown; offset?: unknown };
    return {
      limit: parsePaginationLimit(opts.limit),
      offset: parsePaginationOffset(opts.offset),
    };
  }
  return {
    limit: parsePaginationLimit(limitOrOptions),
    offset: parsePaginationOffset(offsetArg),
  };
}
