// ==============================================================================
// Módulo de Validación Estructurada & Sanitización de Datos (Pokédex API)
// ==============================================================================
// Respaldado por esquemas declarativos Zod (apps/backend/src/validation/schemas.ts)

import {
  PokemonPayloadSchema,
  validateImageUrl,
  SCRIPT_PATTERN,
} from './schemas.js';
import type { PokemonPayload } from './schemas.js';

export { validateImageUrl, SCRIPT_PATTERN };
export type { PokemonPayload };

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida un payload de creación/edición de Pokémon utilizando esquemas Zod declarativos.
 * Retorna un ValidationResult ({ valid: boolean, error?: string }) para compatibilidad total
 * con los controladores de Express y la suite de tests de seguridad/pentest.
 */
export function validatePokemonPayload(body: any): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'El cuerpo de la petición debe ser un objeto JSON válido' };
  }

  const result = PokemonPayloadSchema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      valid: false,
      error: firstIssue?.message || 'Payload de Pokémon inválido',
    };
  }

  return { valid: true };
}
