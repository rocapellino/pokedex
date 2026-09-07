// ==============================================================================
// Módulo de Validación Estructurada & Sanitización de Datos (Pokédex API)
// ==============================================================================

const SCRIPT_PATTERN = /<[^>]*>|javascript:|onerror=|onload=|eval\(|<script/i;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImageUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  const val = value.trim();
  if (val.startsWith('/')) {
    return !SCRIPT_PATTERN.test(val);
  }
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
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
      return { valid: false, error: 'El campo imagen debe ser una URL válida con protocolo http o https' };
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
    const peso = parseFloat(rawPeso);
    if (isNaN(peso) || peso <= 0 || peso > 10000) {
      return { valid: false, error: 'El peso debe ser un número positivo menor o igual a 10.000 kg' };
    }
  }

  const rawAltura = body.caracteristicas?.altura ?? body.altura;
  if (rawAltura !== undefined && rawAltura !== null) {
    const altura = parseFloat(rawAltura);
    if (isNaN(altura) || altura <= 0 || altura > 200) {
      return { valid: false, error: 'La altura debe ser un número positivo menor o igual a 200 m' };
    }
  }

  // 6. Fuerza y Edad
  const rawFuerza = body.fuerza ?? body.caracteristicas?.fuerza;
  if (rawFuerza !== undefined && rawFuerza !== null) {
    const fuerza = parseInt(rawFuerza, 10);
    if (isNaN(fuerza) || fuerza < 0 || fuerza > 1000) {
      return { valid: false, error: 'La fuerza debe ser un número entero entre 0 y 1.000' };
    }
  }

  const rawEdad = body.caracteristicas?.edad ?? body.edad;
  if (rawEdad !== undefined && rawEdad !== null) {
    const edad = parseInt(rawEdad, 10);
    if (isNaN(edad) || edad < 0 || edad > 10000) {
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
      const val = parseInt(body.stats[key], 10);
      if (isNaN(val) || val < 0 || val > 1000) {
        return { valid: false, error: `El stat '${key}' debe ser un entero entre 0 y 1.000` };
      }
    }
  }

  return { valid: true };
}
