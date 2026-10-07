/**
 * Matriz de Tipos y Cálculo de Debilidades de Pokémon
 * Define las ventajas de tipo oficiales de la franquicia y el cálculo elemental.
 */

export const TYPE_WEAKNESSES: Record<string, string[]> = {
  Normal: ['Lucha'],
  Fuego: ['Agua', 'Tierra', 'Roca'],
  Agua: ['Planta', 'Eléctrico'],
  Planta: ['Fuego', 'Volador', 'Hielo', 'Veneno', 'Bicho'],
  Eléctrico: ['Tierra'],
  Hielo: ['Fuego', 'Lucha', 'Roca', 'Acero'],
  Lucha: ['Volador', 'Psíquico', 'Hada'],
  Veneno: ['Tierra', 'Psíquico'],
  Tierra: ['Agua', 'Planta', 'Hielo'],
  Volador: ['Eléctrico', 'Hielo', 'Roca'],
  Psíquico: ['Bicho', 'Fantasma', 'Siniestro'],
  Psíquica: ['Bicho', 'Fantasma', 'Siniestro'],
  Bicho: ['Fuego', 'Volador', 'Roca'],
  Roca: ['Agua', 'Planta', 'Lucha', 'Tierra', 'Acero'],
  Fantasma: ['Fantasma', 'Siniestro'],
  Dragón: ['Hielo', 'Dragón', 'Hada'],
  Acero: ['Fuego', 'Lucha', 'Tierra'],
  Siniestro: ['Lucha', 'Bicho', 'Hada'],
  Hada: ['Veneno', 'Acero'],
};

/**
 * Calcula el conjunto unificado de debilidades elementales para uno o más tipos.
 */
export function calculateWeaknesses(types: string[]): string[] {
  const weakSet = new Set<string>();
  types.forEach((t) => {
    const list = TYPE_WEAKNESSES[t] || [];
    list.forEach((w) => {
      weakSet.add(w);
    });
  });
  return Array.from(weakSet);
}

/** Indica si el Pokémon base tiene al menos una megaevolución registrada. */
export function hasMegaEvolution(pokemon: { megaevoluciones?: unknown[] }): boolean {
  return Array.isArray(pokemon.megaevoluciones) && pokemon.megaevoluciones.length > 0;
}

/** Etiqueta en español de cada clasificación, para insignias y chips. */
export const CLASSIFICATION_LABELS = { legendario: 'Legendario', mitico: 'Mítico' } as const;

/** Clasificación válida del Pokémon (`legendario` o `mitico`) o `undefined` si es una especie común. */
export function getClassification(pokemon: {
  clasificacion?: unknown;
}): keyof typeof CLASSIFICATION_LABELS | undefined {
  const value = pokemon.clasificacion;
  return value === 'legendario' || value === 'mitico' ? value : undefined;
}
