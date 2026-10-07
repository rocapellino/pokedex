import type { EvolutionNode, MegaEvolution, Pokemon } from '../../apps/frontend/src/types.js';

/**
 * Datos de ejemplo compartidos por las pruebas de paridad (`html_parity*.test.ts`) y de inyección del
 * render HTML. No son datos reales: cubren las ramas de cada plantilla (valores ausentes, cadenas
 * evolutivas planas, lineales y ramificadas, megaevoluciones, caracteres especiales).
 */

export const pikachu: Pokemon = {
  id: 25,
  nombre: 'Pikachu',
  tipo: 'Eléctrico',
  tipos: ['Eléctrico'],
  fuerza: 55,
  imagen: 'https://img.example.com/pikachu.png',
  habilidades: ['Elec. estática', 'Pararrayos'],
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque Verde' },
  stats: { hp: 35, attack: 55, defense: 40, sp_attack: 50, sp_defense: 50, speed: 90 },
  evoluciones: [
    { id: 172, nombre: 'Pichu', etapa: 'Bebé' },
    { id: 25, nombre: 'Pikachu', etapa: 'Fase 1', metodo: 'Amistad' },
    { id: 26, nombre: 'Raichu', etapa: 'Fase 2', metodo: 'Piedra trueno' },
  ],
};

export const charizard: Pokemon = {
  id: 6,
  nombre: 'Charizard',
  tipo: 'Fuego',
  tipos: ['Fuego', 'Volador'],
  fuerza: 84,
  imagen: 'https://img.example.com/charizard.png',
  habilidades: ['Mar llamas'],
  caracteristicas: { peso: 90.5, altura: 1.7, habitat: 'Montaña' },
  evoluciones: {
    arbol: {
      id: 4,
      nombre: 'Charmander',
      etapa: 'Base',
      evolves_to: [
        { id: 5, nombre: 'Charmeleon', etapa: 'Fase 1', evolves_to: [{ id: 6, nombre: 'Charizard', etapa: 'Fase 2' }] },
      ],
    },
  },
  megaevoluciones: [{ nombre: 'Mega-Charizard X', tipo: 'Fuego', stats: { hp: 78, attack: 130 } }],
} as unknown as Pokemon;

/** Datos ausentes y caracteres especiales en el nombre: ejercita los valores por defecto y el escapado. */
export const sparse = {
  id: 1,
  nombre: `Nidoran<&"'>`,
  tipo: 'Veneno',
  habilidades: 'Punto tóxico',
} as unknown as Pokemon;

export const megaX: MegaEvolution = {
  clave: 'charizard-mega-x',
  nombre: 'Mega-Charizard X',
  imagen: 'https://img.example.com/10034.png',
  tipos: ['Fuego', 'Dragón'],
  habilidades: ['Garra Dura'],
  stats: { hp: 78, attack: 130, defense: 111, sp_attack: 130, sp_defense: 85, speed: 100 },
  peso: 110.5,
  altura: 1.7,
};

export const megaY: MegaEvolution = {
  ...megaX,
  clave: 'charizard-mega-y',
  nombre: 'Mega-Charizard Y',
  tipos: ['Fuego', 'Volador'],
  habilidades: ['Sequía'],
  stats: { hp: 78, attack: 104, defense: 78, sp_attack: 159, sp_defense: 115, speed: 100 },
};

/** Charizard completo: estadísticas, dos megaevolución y cadena evolutiva lineal. */
export const charizardMega: Pokemon = {
  id: 6,
  nombre: 'Charizard',
  imagen: 'https://img.example.com/6.png',
  tipo: 'Fuego',
  tipos: ['Fuego', 'Volador'],
  fuerza: 84,
  caracteristicas: { peso: 90.5, altura: 1.7, fuerza: 84, habitat: 'Montañas', descripcion: 'Escupe fuego abrasador.' },
  habilidades: ['Mar Llamas'],
  stats: { hp: 78, attack: 84, defense: 78, sp_attack: 109, sp_defense: 85, speed: 100 },
  evoluciones: {
    arbol: {
      id: 4,
      nombre: 'Charmander',
      imagen: 'https://img.example.com/4.png',
      evolves_to: [
        {
          id: 5,
          nombre: 'Charmeleon',
          metodo: 'Nivel 16',
          evolves_to: [{ id: 6, nombre: 'Charizard', metodo: 'Nivel 36' }],
        },
      ],
    },
  },
  megaevoluciones: [megaX, megaY],
};

export const charizardOneMega: Pokemon = { ...charizardMega, megaevoluciones: [megaX] };

const node = (id: number, nombre: string, metodo?: string, evolves_to?: EvolutionNode[]): EvolutionNode => ({
  id,
  nombre,
  imagen: `https://img.example.com/${id}.png`,
  ...(metodo ? { metodo } : {}),
  ...(evolves_to ? { evolves_to } : {}),
});

type Evoluciones = NonNullable<Pokemon['evoluciones']>;

export const EVOLUTIONS: Record<string, Evoluciones | undefined> = {
  'flat-1': [{ id: 132, nombre: 'Ditto' }],
  'flat-3': pikachu.evoluciones,
  'linear-tree': {
    arbol: node(4, 'Charmander', undefined, [node(5, 'Charmeleon', 'Nivel 16', [node(6, 'Charizard', 'Nivel 36')])]),
  },
  'branched-leaves': {
    arbol: node(133, 'Eevee', undefined, [
      node(134, 'Vaporeon', 'Piedra agua'),
      node(135, 'Jolteon', 'Piedra trueno'),
      node(136, 'Flareon', 'Piedra fuego'),
    ]),
    es_ramificada: true,
  },
  'branched-prefix': {
    arbol: node(43, 'Oddish', undefined, [
      node(44, 'Gloom', 'Nivel 21', [node(45, 'Vileplume', 'Piedra hoja'), node(182, 'Bellossom', 'Piedra sol')]),
    ]),
    es_ramificada: true,
  },
  'single-tree': { arbol: node(132, 'Ditto') },
  'no-tree': {},
  undefined: undefined,
};

/** Catálogo pequeño: da tipos a los nodos de la cadena evolutiva (los ausentes caen en "Normal"). */
export const CATALOG: Pokemon[] = [
  charizardMega,
  pikachu,
  { id: 5, nombre: 'Charmeleon', tipo: 'Fuego' },
  { id: 4, nombre: 'Charmander', tipo: 'Fuego' },
  { id: 134, nombre: 'Vaporeon', tipo: 'Agua' },
  { id: 135, nombre: 'Jolteon', tipo: 'Eléctrico' },
  { id: 45, nombre: 'Vileplume', tipo: 'Planta', tipos: ['Planta', 'Veneno'] },
];

/** Pokémon con una cadena ramificada, para el modal completo. */
export const eevee: Pokemon = {
  id: 133,
  nombre: 'Eevee',
  tipo: 'Normal',
  imagen: 'https://img.example.com/133.png',
  habilidades: ['Fuga', 'Adaptable'],
  caracteristicas: { peso: 6.5, altura: 0.3, habitat: 'Urbano' },
  stats: { hp: 55, attack: 55, defense: 50, sp_attack: 45, sp_defense: 65, speed: 55 },
  evoluciones: EVOLUTIONS['branched-leaves'],
};
