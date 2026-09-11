import { z } from 'zod';

// ==============================================================================
// Esquemas Declarativos Zod & Sanitización de Datos (Pokédex API)
// ==============================================================================

const FORBIDDEN_TOKENS_PATTERN = /javascript:|onerror=|onload=|eval\(|<script/i;

export const SCRIPT_PATTERN = {
  test(val: unknown): boolean {
    if (typeof val !== 'string') return false;
    if (val.includes('<') && val.includes('>')) return true;
    return FORBIDDEN_TOKENS_PATTERN.test(val);
  },
};

/**
 * Validador estricto de URLs de imagen contra SSRF y pseudo-protocolos.
 */
export function validateImageUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  const val = value.trim();

  if (val.startsWith('//')) {
    return false;
  }

  if (val.startsWith('/')) {
    return !SCRIPT_PATTERN.test(val);
  }

  try {
    const parsed = new URL(val);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      if (parsed.protocol === 'http:') {
        return process.env.NODE_ENV !== 'production';
      }
      return parsed.protocol === 'https:';
    }
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validador Zod para enteros estrictos (números o strings de solo dígitos).
 * Rechaza cadenas como '100abc', floats '55.5', NaN o Infinity.
 */
export const strictInteger = (fieldName: string, min = 0, max = 1000) =>
  z.preprocess((val) => {
    if (typeof val === 'number') {
      return Number.isInteger(val) ? val : null;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!/^-?\d+$/.test(trimmed)) return null;
      const parsed = Number(trimmed);
      return Number.isSafeInteger(parsed) ? parsed : null;
    }
    return null;
  }, z.number().int().min(min, { message: `El stat '${fieldName}' debe ser un entero entre ${min} y ${max.toLocaleString('es-ES')}` })
      .max(max, { message: `El stat '${fieldName}' debe ser un entero entre ${min} y ${max.toLocaleString('es-ES')}` }));

/**
 * Validador Zod para números finitos estrictos (peso, altura).
 */
export const strictFiniteNumber = (min: number, max: number, errorMsg: string) =>
  z.preprocess((val) => {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? val : null;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, z.number().gt(min, { message: errorMsg }).lte(max, { message: errorMsg }));

/**
 * Esquema de Stats con Whitelist cerrada anti-inyección/mass assignment
 */
export const ALLOWED_STATS_KEYS = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'] as const;

export const StatsSchema = z.record(z.string(), z.unknown()).superRefine((data, ctx) => {
  for (const key of Object.keys(data)) {
    if (!(ALLOWED_STATS_KEYS as readonly string[]).includes(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El campo stats contiene una clave no permitida: '${key}'`,
      });
      return;
    }
    const rawVal = data[key];
    let intVal: number | null = null;
    if (typeof rawVal === 'number' && Number.isInteger(rawVal)) {
      intVal = rawVal;
    } else if (typeof rawVal === 'string' && /^-?\d+$/.test(rawVal.trim())) {
      const parsed = Number(rawVal.trim());
      if (Number.isSafeInteger(parsed)) intVal = parsed;
    }
    if (intVal === null || intVal < 0 || intVal > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El stat '${key}' debe ser un entero entre 0 y 1.000`,
      });
      return;
    }
  }
});

/**
 * Esquema de Características con Whitelist cerrada
 */
export const ALLOWED_CARACTERISTICAS_KEYS = [
  'peso',
  'altura',
  'fuerza',
  'edad',
  'categoria',
  'descripcion',
  'habitat',
] as const;

export const CaracteristicasSchema = z.record(z.string(), z.unknown()).superRefine((data, ctx) => {
  for (const key of Object.keys(data)) {
    if (!(ALLOWED_CARACTERISTICAS_KEYS as readonly string[]).includes(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El campo caracteristicas contiene una propiedad no permitida: '${key}'`,
      });
      return;
    }
  }

  if (data.peso !== undefined && data.peso !== null) {
    let pVal: number | null = null;
    if (typeof data.peso === 'number' && Number.isFinite(data.peso)) pVal = data.peso;
    else if (typeof data.peso === 'string' && /^-?\d+(\.\d+)?$/.test(data.peso.trim())) {
      const parsed = Number(data.peso.trim());
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

  if (data.altura !== undefined && data.altura !== null) {
    let aVal: number | null = null;
    if (typeof data.altura === 'number' && Number.isFinite(data.altura)) aVal = data.altura;
    else if (typeof data.altura === 'string' && /^-?\d+(\.\d+)?$/.test(data.altura.trim())) {
      const parsed = Number(data.altura.trim());
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

  if (data.fuerza !== undefined && data.fuerza !== null) {
    let fVal: number | null = null;
    if (typeof data.fuerza === 'number' && Number.isInteger(data.fuerza)) fVal = data.fuerza;
    else if (typeof data.fuerza === 'string' && /^-?\d+$/.test(data.fuerza.trim())) {
      const parsed = Number(data.fuerza.trim());
      if (Number.isSafeInteger(parsed)) fVal = parsed;
    }
    if (fVal === null || fVal < 0 || fVal > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La fuerza debe ser un número entero entre 0 y 1.000',
      });
      return;
    }
  }

  if (data.edad !== undefined && data.edad !== null) {
    let eVal: number | null = null;
    if (typeof data.edad === 'number' && Number.isInteger(data.edad)) eVal = data.edad;
    else if (typeof data.edad === 'string' && /^-?\d+$/.test(data.edad.trim())) {
      const parsed = Number(data.edad.trim());
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

  if (data.descripcion !== undefined) {
    const desc = String(data.descripcion);
    if (desc.length > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La descripción no puede exceder los 1.000 caracteres',
      });
      return;
    }
    if (SCRIPT_PATTERN.test(desc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La descripción contiene código HTML o scripts no permitidos (prevención XSS)',
      });
      return;
    }
  }

  if (data.categoria !== undefined) {
    const cat = String(data.categoria);
    if (cat.length > 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La categoría no puede exceder los 60 caracteres',
      });
      return;
    }
    if (SCRIPT_PATTERN.test(cat)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La categoría contiene caracteres no permitidos',
      });
      return;
    }
  }

  if (data.habitat !== undefined) {
    const hab = String(data.habitat);
    if (hab.length > 50) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El hábitat no puede exceder los 50 caracteres',
      });
      return;
    }
    if (SCRIPT_PATTERN.test(hab)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El hábitat contiene caracteres no permitidos',
      });
      return;
    }
  }
});

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
  const n = node as Record<string, any>;

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

  if (n.metodo !== undefined && n.metodo !== null && (typeof n.metodo !== 'string' || n.metodo.length > 100 || SCRIPT_PATTERN.test(n.metodo))) {
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
 * Esquema Principal Zod para Pokémon
 */
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo nombre contiene código HTML o scripts no permitidos (prevención XSS)' });
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo tipo contiene código HTML o scripts no permitidos (prevención XSS)' });
    return;
  }

  // 3. Imagen
  if (body.imagen !== undefined && body.imagen !== null && body.imagen !== '') {
    if (!validateImageUrl(body.imagen)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo imagen debe ser una URL válida con protocolo https o ruta relativa segura' });
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
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cada elemento en tipos debe ser un texto de máximo 30 caracteres' });
        return;
      }
      if (SCRIPT_PATTERN.test(t)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo tipos contiene scripts no permitidos' });
        return;
      }
    }
  }

  // 5. Peso y Altura
  const caract = body.caracteristicas as Record<string, any> | undefined;
  const rawPeso = caract?.peso ?? body.peso;
  if (rawPeso !== undefined && rawPeso !== null) {
    let pVal: number | null = null;
    if (typeof rawPeso === 'number' && Number.isFinite(rawPeso)) pVal = rawPeso;
    else if (typeof rawPeso === 'string' && /^-?\d+(\.\d+)?$/.test(rawPeso.trim())) {
      const parsed = Number(rawPeso.trim());
      if (Number.isFinite(parsed)) pVal = parsed;
    }
    if (pVal === null || pVal <= 0 || pVal > 10000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El peso debe ser un número positivo menor o igual a 10.000 kg' });
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La altura debe ser un número positivo menor o igual a 200 m' });
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La edad debe ser un número entero positivo razonable (máx 10.000)' });
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: cRes.error.issues[0]?.message || 'Características inválidas' });
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
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cada habilidad debe ser un texto de máximo 50 caracteres' });
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
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La lista de evoluciones no puede exceder los 20 elementos' });
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
      const arbol = (body.evoluciones as any).arbol;
      if (arbol) {
        const evoRes = validateEvolutionNodeZod(arbol, 0);
        if (!evoRes.valid) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: evoRes.error });
          return;
        }
      }
    } else {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El campo evoluciones debe ser una lista o un objeto con árbol de evoluciones' });
      return;
    }
  }
});

export type PokemonPayload = z.infer<typeof PokemonPayloadSchema>;
