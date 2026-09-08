// ==============================================================================
// Módulo de Validación Estructurada & Sanitización de Datos (Pokédex API)
// ==============================================================================

const SCRIPT_PATTERN = /<[^>]*>|javascript:|onerror=|onload=|eval\(|<script/i;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida de forma estricta si un valor es un número finito real.
 * Rechaza cadenas con caracteres extra tipo '100abc' o valores NaN/Infinity.
 */
function parseStrictFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Valida de forma estricta si un valor es un entero seguro.
 */
function parseStrictInteger(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Valida que una URL de imagen sea segura:
 * - Rechaza pseudo-protocolos y scripts
 * - Rechaza URLs protocol-relative ('//evil.com')
 * - Acepta rutas relativas locales puras ('/static/...')
 * - Exige HTTPS para orígenes externos (HTTP solo para localhost de desarrollo)
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
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    }
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validatePokemonPayload(body: any): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'El cuerpo de la petición debe ser un objeto JSON válido' };
  }

  // 1. Validación de Nombre
  if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return { valid: false, error: 'El campo nombre es requerido y no puede estar vacío' };
  }
  const nombreTrimmed = body.nombre.trim();
  if (nombreTrimmed.length > 60) {
    return { valid: false, error: 'El nombre no puede exceder los 60 caracteres' };
  }
  if (SCRIPT_PATTERN.test(nombreTrimmed)) {
    return { valid: false, error: 'El campo nombre contiene código HTML o scripts no permitidos (prevención XSS)' };
  }

  // 2. Validación de Tipo
  if (typeof body.tipo !== 'string' || !body.tipo.trim()) {
    return { valid: false, error: 'El campo tipo es requerido' };
  }
  const tipoTrimmed = body.tipo.trim();
  if (tipoTrimmed.length > 30) {
    return { valid: false, error: 'El tipo no puede exceder los 30 caracteres' };
  }
  if (SCRIPT_PATTERN.test(tipoTrimmed)) {
    return { valid: false, error: 'El campo tipo contiene código HTML o scripts no permitidos (prevención XSS)' };
  }

  // 3. Validación Estricta de URL de Imagen
  if (body.imagen !== undefined && body.imagen !== null && body.imagen !== '') {
    if (!validateImageUrl(body.imagen)) {
      return { valid: false, error: 'El campo imagen debe ser una URL válida con protocolo https o ruta relativa segura' };
    }
  }

  // 4. Validación de Tipos Adicionales
  if (body.tipos !== undefined) {
    if (!Array.isArray(body.tipos)) {
      return { valid: false, error: 'El campo tipos debe ser un arreglo de nombres de tipos' };
    }
    if (body.tipos.length > 5) {
      return { valid: false, error: 'Un Pokémon no puede tener más de 5 tipos' };
    }
    for (const t of body.tipos) {
      if (typeof t !== 'string' || !t.trim() || t.trim().length > 30) {
        return { valid: false, error: 'Cada elemento en tipos debe ser un texto de máximo 30 caracteres' };
      }
      if (SCRIPT_PATTERN.test(t)) {
        return { valid: false, error: 'El campo tipos contiene scripts no permitidos' };
      }
    }
  }

  // 5. Métricas Físicas: Peso y Altura
  const rawPeso = body.caracteristicas?.peso ?? body.peso;
  if (rawPeso !== undefined && rawPeso !== null) {
    const peso = parseStrictFiniteNumber(rawPeso);
    if (peso === null || peso <= 0 || peso > 10000) {
      return { valid: false, error: 'El peso debe ser un número positivo menor o igual a 10.000 kg' };
    }
  }

  const rawAltura = body.caracteristicas?.altura ?? body.altura;
  if (rawAltura !== undefined && rawAltura !== null) {
    const altura = parseStrictFiniteNumber(rawAltura);
    if (altura === null || altura <= 0 || altura > 200) {
      return { valid: false, error: 'La altura debe ser un número positivo menor o igual a 200 m' };
    }
  }

  // 6. Fuerza y Edad
  const rawFuerza = body.fuerza ?? body.caracteristicas?.fuerza;
  if (rawFuerza !== undefined && rawFuerza !== null) {
    const fuerza = parseStrictInteger(rawFuerza);
    if (fuerza === null || fuerza < 0 || fuerza > 1000) {
      return { valid: false, error: 'La fuerza debe ser un número entero entre 0 y 1.000' };
    }
  }

  const rawEdad = body.caracteristicas?.edad ?? body.edad;
  if (rawEdad !== undefined && rawEdad !== null) {
    const edad = parseStrictInteger(rawEdad);
    if (edad === null || edad < 0 || edad > 10000) {
      return { valid: false, error: 'La edad debe ser un número entero positivo razonable (máx 10.000)' };
    }
  }

  // 7. Características Textuales & Whitelist Anti Mass-Assignment
  if (body.caracteristicas !== undefined && body.caracteristicas !== null) {
    if (typeof body.caracteristicas !== 'object' || Array.isArray(body.caracteristicas)) {
      return { valid: false, error: 'El campo caracteristicas debe ser un objeto válido' };
    }

    const allowedCaractKeys = ['peso', 'altura', 'fuerza', 'edad', 'categoria', 'descripcion', 'habitat'];
    for (const k of Object.keys(body.caracteristicas)) {
      if (!allowedCaractKeys.includes(k)) {
        return { valid: false, error: `El campo caracteristicas contiene una propiedad no permitida: '${k}'` };
      }
    }

    if (body.caracteristicas.descripcion !== undefined) {
      const desc = String(body.caracteristicas.descripcion);
      if (desc.length > 1000) {
        return { valid: false, error: 'La descripción no puede exceder los 1.000 caracteres' };
      }
      if (SCRIPT_PATTERN.test(desc)) {
        return { valid: false, error: 'La descripción contiene código HTML o scripts no permitidos (prevención XSS)' };
      }
    }

    if (body.caracteristicas.categoria !== undefined) {
      const cat = String(body.caracteristicas.categoria);
      if (cat.length > 60) {
        return { valid: false, error: 'La categoría no puede exceder los 60 caracteres' };
      }
      if (SCRIPT_PATTERN.test(cat)) {
        return { valid: false, error: 'La categoría contiene caracteres no permitidos' };
      }
    }

    if (body.caracteristicas.habitat !== undefined) {
      const hab = String(body.caracteristicas.habitat);
      if (hab.length > 50) {
        return { valid: false, error: 'El hábitat no puede exceder los 50 caracteres' };
      }
      if (SCRIPT_PATTERN.test(hab)) {
        return { valid: false, error: 'El hábitat contiene caracteres no permitidos' };
      }
    }
  }

  // 8. Validación de Habilidades
  if (body.habilidades !== undefined) {
    if (Array.isArray(body.habilidades)) {
      if (body.habilidades.length > 10) {
        return { valid: false, error: 'Un Pokémon no puede tener más de 10 habilidades' };
      }
      for (const h of body.habilidades) {
        if (typeof h !== 'string' || h.length > 50) {
          return { valid: false, error: 'Cada habilidad debe ser un texto de máximo 50 caracteres' };
        }
        if (SCRIPT_PATTERN.test(h)) {
          return { valid: false, error: 'La habilidad contiene código no permitido' };
        }
      }
    } else if (typeof body.habilidades === 'string') {
      if (body.habilidades.length > 50) {
        return { valid: false, error: 'La habilidad no puede exceder los 50 caracteres' };
      }
      if (SCRIPT_PATTERN.test(body.habilidades)) {
        return { valid: false, error: 'La habilidad contiene código no permitido' };
      }
    } else {
      return { valid: false, error: 'El campo habilidades debe ser una lista o texto' };
    }
  }

  // 9. Validación Estricta de Stats (Whitelist cerrado)
  if (body.stats !== undefined) {
    if (typeof body.stats !== 'object' || body.stats === null || Array.isArray(body.stats)) {
      return { valid: false, error: 'El campo stats debe ser un objeto numérico' };
    }
    const validKeys = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'];
    for (const key of Object.keys(body.stats)) {
      if (!validKeys.includes(key)) {
        return { valid: false, error: `El campo stats contiene una clave no permitida: '${key}'` };
      }
      const val = parseStrictInteger(body.stats[key]);
      if (val === null || val < 0 || val > 1000) {
        return { valid: false, error: `El stat '${key}' debe ser un entero entre 0 y 1.000` };
      }
    }
  }

  // 10. Validación Estricta del Campo Evoluciones (anti-DoS, profundidad máxima y URLs seguras)
  if (body.evoluciones !== undefined && body.evoluciones !== null) {
    if (Array.isArray(body.evoluciones)) {
      if (body.evoluciones.length > 20) {
        return { valid: false, error: 'La lista de evoluciones no puede exceder los 20 elementos' };
      }
      for (const node of body.evoluciones) {
        const evoRes = validateEvolutionNode(node, 0);
        if (!evoRes.valid) return evoRes;
      }
    } else if (typeof body.evoluciones === 'object') {
      const arbol = (body.evoluciones as any).arbol;
      if (arbol) {
        const evoRes = validateEvolutionNode(arbol, 0);
        if (!evoRes.valid) return evoRes;
      }
    } else {
      return { valid: false, error: 'El campo evoluciones debe ser una lista o un objeto con árbol de evoluciones' };
    }
  }

  return { valid: true };
}

function validateEvolutionNode(node: unknown, depth: number = 0): ValidationResult {
  if (depth > 5) {
    return { valid: false, error: 'El árbol de evoluciones excede la profundidad máxima permitida de 5 niveles' };
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { valid: false, error: 'Cada nodo de evolución debe ser un objeto' };
  }
  const n = node as Record<string, any>;
  if (n.id !== undefined) {
    const id = parseStrictInteger(n.id);
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
  if (n.evolves_to !== undefined) {
    if (!Array.isArray(n.evolves_to)) {
      return { valid: false, error: 'El campo evolves_to debe ser una lista de evoluciones' };
    }
    if (n.evolves_to.length > 10) {
      return { valid: false, error: 'Un nodo de evolución no puede ramificarse en más de 10 evoluciones directas' };
    }
    for (const child of n.evolves_to) {
      const childRes = validateEvolutionNode(child, depth + 1);
      if (!childRes.valid) return childRes;
    }
  }
  return { valid: true };
}
