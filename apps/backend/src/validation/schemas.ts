import { z } from 'zod';

// ==============================================================================
// Esquemas Declarativos Zod & Sanitización de Datos (Pokédex API)
// ==============================================================================

import { SCRIPT_PATTERN, isPrivateOrRestrictedIp, validateImageUrl } from './network-security.js';
import {
  ALLOWED_MEGA_KEYS,
  type EvolutionNode,
  MAX_MEGAEVOLUCIONES,
  validateEvolutionNodeZod,
  validateMegaEvolutionZod,
} from './pokemon-evolution.schema.js';
import {
  ALLOWED_CARACTERISTICAS_KEYS,
  ALLOWED_STATS_KEYS,
  CaracteristicasSchema,
  StatsSchema,
  strictFiniteNumber,
  strictInteger,
} from './pokemon-stats.schema.js';

export {
  SCRIPT_PATTERN,
  isPrivateOrRestrictedIp,
  validateImageUrl,
  strictInteger,
  strictFiniteNumber,
  ALLOWED_STATS_KEYS,
  StatsSchema,
  ALLOWED_CARACTERISTICAS_KEYS,
  CaracteristicasSchema,
  type EvolutionNode,
  validateEvolutionNodeZod,
  ALLOWED_MEGA_KEYS,
  MAX_MEGAEVOLUCIONES,
  validateMegaEvolutionZod,
};

export const PokemonPayloadSchema = z.record(z.string(), z.unknown()).superRefine((body, ctx) => {
  // 1. Nombre
  if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo nombre es requerido y no puede estar vacío' });
    return;
  }
  const nombreTrimmed = body.nombre.trim();
  if (nombreTrimmed.length > 60) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El nombre no puede exceder los 60 caracteres' });
    return;
  }
  if (SCRIPT_PATTERN.test(nombreTrimmed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El campo nombre contiene código HTML o scripts no permitidos (prevención XSS)',
    });
    return;
  }

  // 2. Tipo
  if (typeof body.tipo !== 'string' || !body.tipo.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo tipo es requerido' });
    return;
  }
  const tipoTrimmed = body.tipo.trim();
  if (tipoTrimmed.length > 30) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El tipo no puede exceder los 30 caracteres' });
    return;
  }
  if (SCRIPT_PATTERN.test(tipoTrimmed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El campo tipo contiene código HTML o scripts no permitidos (prevención XSS)',
    });
    return;
  }

  // 3. Imagen
  if (body.imagen !== undefined && body.imagen !== null && body.imagen !== '') {
    if (!validateImageUrl(body.imagen)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El campo imagen debe ser una URL válida con protocolo https o ruta relativa segura',
      });
      return;
    }
  }

  // 4. Tipos adicionales
  if (body.tipos !== undefined) {
    if (!Array.isArray(body.tipos)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo tipos debe ser un arreglo de nombres de tipos' });
      return;
    }
    if (body.tipos.length > 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Un Pokémon no puede tener más de 5 tipos' });
      return;
    }
    for (const t of body.tipos) {
      if (typeof t !== 'string' || !t.trim() || t.trim().length > 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Cada elemento en tipos debe ser un texto de máximo 30 caracteres',
        });
        return;
      }
      if (SCRIPT_PATTERN.test(t)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo tipos contiene scripts no permitidos' });
        return;
      }
    }
  }

  // 5. Peso y Altura
  const caract = body.caracteristicas as Record<string, unknown> | undefined;
  const rawPeso = caract?.peso ?? body.peso;
  if (rawPeso !== undefined && rawPeso !== null) {
    let pVal: number | null = null;
    if (typeof rawPeso === 'number' && Number.isFinite(rawPeso)) pVal = rawPeso;
    else if (typeof rawPeso === 'string' && /^-?\d+(\.\d+)?$/.test(rawPeso.trim())) {
      const parsed = Number(rawPeso.trim());
      if (Number.isFinite(parsed)) pVal = parsed;
    }
    if (pVal === null || pVal <= 0 || pVal > 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El peso debe ser un número positivo menor o igual a 10.000 kg',
      });
      return;
    }
  }

  const rawAltura = caract?.altura ?? body.altura;
  if (rawAltura !== undefined && rawAltura !== null) {
    let aVal: number | null = null;
    if (typeof rawAltura === 'number' && Number.isFinite(rawAltura)) aVal = rawAltura;
    else if (typeof rawAltura === 'string' && /^-?\d+(\.\d+)?$/.test(rawAltura.trim())) {
      const parsed = Number(rawAltura.trim());
      if (Number.isFinite(parsed)) aVal = parsed;
    }
    if (aVal === null || aVal <= 0 || aVal > 200) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La altura debe ser un número positivo menor o igual a 200 m',
      });
      return;
    }
  }

  // 6. Fuerza y Edad
  const rawFuerza = body.fuerza ?? caract?.fuerza;
  if (rawFuerza !== undefined && rawFuerza !== null) {
    let fVal: number | null = null;
    if (typeof rawFuerza === 'number' && Number.isInteger(rawFuerza)) fVal = rawFuerza;
    else if (typeof rawFuerza === 'string' && /^-?\d+$/.test(rawFuerza.trim())) {
      const parsed = Number(rawFuerza.trim());
      if (Number.isSafeInteger(parsed)) fVal = parsed;
    }
    if (fVal === null || fVal < 0 || fVal > 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La fuerza debe ser un número entero entre 0 y 1.000' });
      return;
    }
  }

  const rawEdad = caract?.edad ?? body.edad;
  if (rawEdad !== undefined && rawEdad !== null) {
    let eVal: number | null = null;
    if (typeof rawEdad === 'number' && Number.isInteger(rawEdad)) eVal = rawEdad;
    else if (typeof rawEdad === 'string' && /^-?\d+$/.test(rawEdad.trim())) {
      const parsed = Number(rawEdad.trim());
      if (Number.isSafeInteger(parsed)) eVal = parsed;
    }
    if (eVal === null || eVal < 0 || eVal > 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La edad debe ser un número entero positivo razonable (máx 10.000)',
      });
      return;
    }
  }

  // 7. Características
  if (body.caracteristicas !== undefined && body.caracteristicas !== null) {
    if (typeof body.caracteristicas !== 'object' || Array.isArray(body.caracteristicas)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo caracteristicas debe ser un objeto válido' });
      return;
    }
    const cRes = CaracteristicasSchema.safeParse(body.caracteristicas);
    if (!cRes.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: cRes.error.issues[0]?.message || 'Características inválidas',
      });
      return;
    }
  }

  // 8. Habilidades
  if (body.habilidades !== undefined) {
    if (Array.isArray(body.habilidades)) {
      if (body.habilidades.length > 10) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Un Pokémon no puede tener más de 10 habilidades' });
        return;
      }
      for (const h of body.habilidades) {
        if (typeof h !== 'string' || h.length > 50) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Cada habilidad debe ser un texto de máximo 50 caracteres',
          });
          return;
        }
        if (SCRIPT_PATTERN.test(h)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La habilidad contiene código no permitido' });
          return;
        }
      }
    } else if (typeof body.habilidades === 'string') {
      if (body.habilidades.length > 50) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La habilidad no puede exceder los 50 caracteres' });
        return;
      }
      if (SCRIPT_PATTERN.test(body.habilidades)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La habilidad contiene código no permitido' });
        return;
      }
    } else {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo habilidades debe ser una lista o texto' });
      return;
    }
  }

  // 9. Stats
  if (body.stats !== undefined) {
    if (typeof body.stats !== 'object' || body.stats === null || Array.isArray(body.stats)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo stats debe ser un objeto numérico' });
      return;
    }
    const sRes = StatsSchema.safeParse(body.stats);
    if (!sRes.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: sRes.error.issues[0]?.message || 'Stats inválidos' });
      return;
    }
  }

  // 10. Evoluciones
  if (body.evoluciones !== undefined && body.evoluciones !== null) {
    if (Array.isArray(body.evoluciones)) {
      if (body.evoluciones.length > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La lista de evoluciones no puede exceder los 20 elementos',
        });
        return;
      }
      for (const node of body.evoluciones) {
        const evoRes = validateEvolutionNodeZod(node, 0);
        if (!evoRes.valid) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: evoRes.error });
          return;
        }
      }
    } else if (typeof body.evoluciones === 'object') {
      const arbol = (body.evoluciones as { arbol?: unknown }).arbol;
      if (arbol) {
        const evoRes = validateEvolutionNodeZod(arbol, 0);
        if (!evoRes.valid) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: evoRes.error });
          return;
        }
      }
    } else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El campo evoluciones debe ser una lista o un objeto con árbol de evoluciones',
      });
      return;
    }
  }

  // 11. Megaevoluciones (solo lectura; la API no las persiste desde el cliente)
  if (body.megaevoluciones !== undefined && body.megaevoluciones !== null) {
    if (!Array.isArray(body.megaevoluciones)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo megaevoluciones debe ser una lista' });
      return;
    }
    if (body.megaevoluciones.length > MAX_MEGAEVOLUCIONES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Un Pokémon no puede tener más de ${MAX_MEGAEVOLUCIONES} megaevoluciones`,
      });
      return;
    }
    const claves = new Set<string>();
    for (const mega of body.megaevoluciones) {
      const megaRes = validateMegaEvolutionZod(mega);
      if (!megaRes.valid) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: megaRes.error });
        return;
      }
      const clave = (mega as { clave: string }).clave;
      if (claves.has(clave)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `La megaevolución '${clave}' está repetida` });
        return;
      }
      claves.add(clave);
    }
  }
});

export type PokemonPayload = z.infer<typeof PokemonPayloadSchema>;
