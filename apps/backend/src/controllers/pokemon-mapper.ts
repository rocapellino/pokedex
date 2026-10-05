import type { Pokemon } from '../types.js';

/**
 * Prevención de Log Injection / CWE-117 (tssecurity:S5145).
 * Neutraliza caracteres de control (\r, \n, \t) y limita a 100 caracteres.
 */
export function sanitizeLogString(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/[\r\n\t]/g, '_')
    .slice(0, 100);
}

/**
 * Construye una nueva entidad Pokémon validada a partir de un payload entrante.
 * Garantiza saneamiento de tipos, límites máximos de longitud y valores por defecto canónicos.
 */
// biome-ignore lint/suspicious/noExplicitAny: payload ya validado por validatePokemonPayload; acceso dinámico por clave
export function buildPokemonFromPayload(newId: number, body: Record<string, any>): Pokemon {
  const rawDesc = body.caracteristicas?.descripcion || `${body.nombre} registrado recientemente en la Pokédex.`;

  return {
    id: newId,
    nombre: String(body.nombre).trim().slice(0, 60),
    imagen:
      body.imagen ||
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${newId}.png`,
    tipo: String(body.tipo).trim().slice(0, 30),
    tipos: Array.isArray(body.tipos)
      ? body.tipos.map((t: unknown) => String(t).slice(0, 30))
      : [String(body.tipo).trim()],
    habitat: String(body.habitat || body.caracteristicas?.habitat || 'Kanto').slice(0, 50),
    fuerza: Number.parseInt(String(body.fuerza || body.caracteristicas?.fuerza || 50), 10),
    caracteristicas: {
      peso: Number.parseFloat(String(body.caracteristicas?.peso || 10.0)),
      altura: Number.parseFloat(String(body.caracteristicas?.altura || 1.0)),
      fuerza: Number.parseInt(String(body.fuerza || body.caracteristicas?.fuerza || 50), 10),
      edad: Number.parseInt(String(body.caracteristicas?.edad || 5), 10),
      categoria: String(body.caracteristicas?.categoria || 'Descubierto').slice(0, 60),
      descripcion: String(rawDesc).slice(0, 1000),
      habitat: String(body.habitat || body.caracteristicas?.habitat || 'Kanto').slice(0, 50),
    },
    habilidades: Array.isArray(body.habilidades)
      ? body.habilidades.map((h: unknown) => String(h).slice(0, 50))
      : [String(body.habilidades || 'Adaptable').slice(0, 50)],
    stats: body.stats || {
      hp: 50,
      attack: Number.parseInt(String(body.fuerza || body.caracteristicas?.fuerza || 50), 10),
      defense: 50,
      sp_attack: 50,
      sp_defense: 50,
      speed: 50,
    },
    evoluciones: body.evoluciones || [],
  };
}

/**
 * Aplica mutaciones parciales sobre un Pokémon existente respetando inmutabilidad y contratos de tipos.
 */
// biome-ignore lint/suspicious/noExplicitAny: payload ya validado por validatePokemonPayload; acceso dinámico por clave
export function applyPokemonUpdates(existing: Pokemon, body: Record<string, any>): Pokemon {
  return {
    id: existing.id,
    nombre: body.nombre ? String(body.nombre).trim().slice(0, 60) : existing.nombre,
    imagen: body.imagen || existing.imagen,
    tipo: body.tipo ? String(body.tipo).trim().slice(0, 30) : existing.tipo,
    tipos: body.tipos
      ? Array.isArray(body.tipos)
        ? body.tipos.map((t: unknown) => String(t).slice(0, 30))
        : [String(body.tipos)]
      : existing.tipos,
    habitat: body.habitat ? String(body.habitat).slice(0, 50) : existing.habitat,
    fuerza: body.fuerza !== undefined ? Number.parseInt(String(body.fuerza), 10) : existing.fuerza,
    habilidades: body.habilidades
      ? Array.isArray(body.habilidades)
        ? body.habilidades.map((h: unknown) => String(h).slice(0, 50))
        : [String(body.habilidades)]
      : existing.habilidades,
    caracteristicas: {
      peso:
        body.caracteristicas?.peso !== undefined
          ? Number.parseFloat(String(body.caracteristicas.peso))
          : existing.caracteristicas.peso,
      altura:
        body.caracteristicas?.altura !== undefined
          ? Number.parseFloat(String(body.caracteristicas.altura))
          : existing.caracteristicas.altura,
      fuerza:
        body.fuerza !== undefined
          ? Number.parseInt(String(body.fuerza), 10)
          : body.caracteristicas?.fuerza !== undefined
            ? Number.parseInt(String(body.caracteristicas.fuerza), 10)
            : existing.caracteristicas.fuerza,
      edad:
        body.caracteristicas?.edad !== undefined
          ? Number.parseInt(String(body.caracteristicas.edad), 10)
          : existing.caracteristicas.edad,
      categoria:
        body.caracteristicas?.categoria !== undefined
          ? String(body.caracteristicas.categoria).slice(0, 60)
          : existing.caracteristicas.categoria,
      descripcion:
        body.caracteristicas?.descripcion !== undefined
          ? String(body.caracteristicas.descripcion).slice(0, 1000)
          : existing.caracteristicas.descripcion,
      habitat:
        body.habitat !== undefined
          ? String(body.habitat).slice(0, 50)
          : body.caracteristicas?.habitat !== undefined
            ? String(body.caracteristicas.habitat).slice(0, 50)
            : existing.caracteristicas.habitat,
    },
    stats: body.stats
      ? {
          hp: body.stats.hp !== undefined ? Number.parseInt(String(body.stats.hp), 10) : (existing.stats?.hp ?? 50),
          attack:
            body.stats.attack !== undefined
              ? Number.parseInt(String(body.stats.attack), 10)
              : (existing.stats?.attack ?? 50),
          defense:
            body.stats.defense !== undefined
              ? Number.parseInt(String(body.stats.defense), 10)
              : (existing.stats?.defense ?? 50),
          sp_attack:
            body.stats.sp_attack !== undefined
              ? Number.parseInt(String(body.stats.sp_attack), 10)
              : (existing.stats?.sp_attack ?? 50),
          sp_defense:
            body.stats.sp_defense !== undefined
              ? Number.parseInt(String(body.stats.sp_defense), 10)
              : (existing.stats?.sp_defense ?? 50),
          speed:
            body.stats.speed !== undefined
              ? Number.parseInt(String(body.stats.speed), 10)
              : (existing.stats?.speed ?? 50),
        }
      : existing.stats,
    evoluciones: body.evoluciones !== undefined ? body.evoluciones : existing.evoluciones,
  };
}
