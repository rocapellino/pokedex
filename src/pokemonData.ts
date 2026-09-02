export interface PokemonEvolution {
  id: number;
  nombre: string;
  etapa: string;
  metodo: string | null;
  imagen: string;
}

export interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
}

export interface PokemonCharacteristics {
  peso: number;
  altura: number;
  fuerza: number;
  edad: number;
  categoria?: string;
  descripcion?: string;
  habitat?: string;
}

export interface Pokemon {
  id: number;
  nombre: string;
  imagen: string;
  caracteristicas: PokemonCharacteristics;
  habilidades: string[];
  tipo: string;
  tipos?: string[];
  habitat: string;
  stats?: PokemonStats;
  evoluciones?: PokemonEvolution[];
}

export const INITIAL_POKEMONS: Pokemon[] = [
  // Gen I - Kanto
  {
    id: 1,
    nombre: "Bulbasaur",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png",
    caracteristicas: {
      peso: 6.9,
      altura: 0.7,
      fuerza: 49,
      edad: 3,
      categoria: "Semilla",
      descripcion: "Tras nacer, crece alimentándose de los nutrientes de la semilla de su lomo.",
      habitat: "Kanto"
    },
    habilidades: ["Espesura", "Clorofila"],
    tipo: "Planta",
    tipos: ["Planta", "Veneno"],
    habitat: "Kanto",
    stats: { hp: 45, attack: 49, defense: 49, sp_attack: 65, sp_defense: 65, speed: 45 },
    evoluciones: [
      { id: 1, nombre: "Bulbasaur", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png" },
      { id: 2, nombre: "Ivysaur", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/2.png" },
      { id: 3, nombre: "Venusaur", etapa: "Fase 2", metodo: "Nivel 32", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/3.png" }
    ]
  },
  {
    id: 4,
    nombre: "Charmander",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/4.png",
    caracteristicas: {
      peso: 8.5,
      altura: 0.6,
      fuerza: 52,
      edad: 4,
      categoria: "Lagartija",
      descripcion: "La llama de su cola indica su fuerza vital. Si está débil, arderá tenuemente.",
      habitat: "Kanto"
    },
    habilidades: ["Mar llamas", "Poder solar"],
    tipo: "Fuego",
    tipos: ["Fuego"],
    habitat: "Kanto",
    stats: { hp: 39, attack: 52, defense: 43, sp_attack: 60, sp_defense: 50, speed: 65 },
    evoluciones: [
      { id: 4, nombre: "Charmander", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/4.png" },
      { id: 5, nombre: "Charmeleon", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/5.png" },
      { id: 6, nombre: "Charizard", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png" }
    ]
  },
  {
    id: 7,
    nombre: "Squirtle",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/7.png",
    caracteristicas: {
      peso: 9.0,
      altura: 0.5,
      fuerza: 48,
      edad: 4,
      categoria: "Tortuguita",
      descripcion: "Se protege dentro de su caparazón y luego dispara agua a presión contra el rival.",
      habitat: "Kanto"
    },
    habilidades: ["Torrente", "Cura lluvia"],
    tipo: "Agua",
    tipos: ["Agua"],
    habitat: "Kanto",
    stats: { hp: 44, attack: 48, defense: 65, sp_attack: 50, sp_defense: 64, speed: 43 },
    evoluciones: [
      { id: 7, nombre: "Squirtle", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/7.png" },
      { id: 8, nombre: "Wartortle", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/8.png" },
      { id: 9, nombre: "Blastoise", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/9.png" }
    ]
  },
  {
    id: 25,
    nombre: "Pikachu",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
    caracteristicas: {
      peso: 6.0,
      altura: 0.4,
      fuerza: 55,
      edad: 5,
      categoria: "Ratón",
      descripcion: "Tiene pequeñas bolsas en las mejillas donde almacena electricidad mientras duerme.",
      habitat: "Kanto"
    },
    habilidades: ["Electricidad estática", "Pararrayos"],
    tipo: "Eléctrico",
    tipos: ["Eléctrico"],
    habitat: "Kanto",
    stats: { hp: 35, attack: 55, defense: 40, sp_attack: 50, sp_defense: 50, speed: 90 },
    evoluciones: [
      { id: 172, nombre: "Pichu", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/172.png" },
      { id: 25, nombre: "Pikachu", etapa: "Fase 1", metodo: "Amistad alta", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png" },
      { id: 26, nombre: "Raichu", etapa: "Fase 2", metodo: "Piedra Trueno", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/26.png" }
    ]
  },
  {
    id: 39,
    nombre: "Jigglypuff",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/39.png",
    caracteristicas: {
      peso: 5.5,
      altura: 0.5,
      fuerza: 45,
      edad: 4,
      categoria: "Globo",
      descripcion: "Canta una dulce melodía con una longitud de onda precisa que adormece a quien la oye.",
      habitat: "Kanto"
    },
    habilidades: ["Gran encanto", "Tenacidad"],
    tipo: "Normal",
    tipos: ["Normal", "Hada"],
    habitat: "Kanto",
    stats: { hp: 115, attack: 45, defense: 20, sp_attack: 45, sp_defense: 25, speed: 20 },
    evoluciones: [
      { id: 174, nombre: "Igglybuff", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/174.png" },
      { id: 39, nombre: "Jigglypuff", etapa: "Fase 1", metodo: "Amistad alta", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/39.png" },
      { id: 40, nombre: "Wigglytuff", etapa: "Fase 2", metodo: "Piedra Lunar", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/40.png" }
    ]
  },
  {
    id: 68,
    nombre: "Machamp",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/68.png",
    caracteristicas: {
      peso: 130.0,
      altura: 1.6,
      fuerza: 130,
      edad: 8,
      categoria: "Superpoder",
      descripcion: "Puede asestar hasta mil puñetazos en cuestión de dos segundos con sus cuatro brazos.",
      habitat: "Kanto"
    },
    habilidades: ["Agallas", "Indefenso"],
    tipo: "Lucha",
    tipos: ["Lucha"],
    habitat: "Kanto",
    stats: { hp: 90, attack: 130, defense: 80, sp_attack: 65, sp_defense: 85, speed: 55 },
    evoluciones: [
      { id: 66, nombre: "Machop", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/66.png" },
      { id: 67, nombre: "Machoke", etapa: "Fase 1", metodo: "Nivel 28", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/67.png" },
      { id: 68, nombre: "Machamp", etapa: "Fase 2", metodo: "Intercambio", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/68.png" }
    ]
  },
  {
    id: 94,
    nombre: "Gengar",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png",
    caracteristicas: {
      peso: 40.5,
      altura: 1.5,
      fuerza: 65,
      edad: 7,
      categoria: "Sombra",
      descripcion: "Se esconde en las sombras de la gente por las noches y absorbe el calor circundante.",
      habitat: "Kanto"
    },
    habilidades: ["Cuerpo maldito"],
    tipo: "Fantasma",
    tipos: ["Fantasma", "Veneno"],
    habitat: "Kanto",
    stats: { hp: 60, attack: 65, defense: 60, sp_attack: 130, sp_defense: 75, speed: 110 },
    evoluciones: [
      { id: 92, nombre: "Gastly", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/92.png" },
      { id: 93, nombre: "Haunter", etapa: "Fase 1", metodo: "Nivel 25", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/93.png" },
      { id: 94, nombre: "Gengar", etapa: "Fase 2", metodo: "Intercambio", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png" }
    ]
  },
  {
    id: 95,
    nombre: "Onix",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/95.png",
    caracteristicas: {
      peso: 210.0,
      altura: 8.8,
      fuerza: 45,
      edad: 12,
      categoria: "Serpiente Roca",
      descripcion: "A medida que cava en el suelo, su cuerpo va absorbiendo rocas y minerales duros.",
      habitat: "Kanto"
    },
    habilidades: ["Cabeza roca", "Robustez"],
    tipo: "Roca",
    tipos: ["Roca", "Tierra"],
    habitat: "Kanto",
    stats: { hp: 35, attack: 45, defense: 160, sp_attack: 30, sp_defense: 45, speed: 70 },
    evoluciones: [
      { id: 95, nombre: "Onix", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/95.png" },
      { id: 208, nombre: "Steelix", etapa: "Fase 1", metodo: "Revestimiento Metálico", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/208.png" }
    ]
  },
  {
    id: 133,
    nombre: "Eevee",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png",
    caracteristicas: {
      peso: 6.5,
      altura: 0.3,
      fuerza: 55,
      edad: 3,
      categoria: "Evolución",
      descripcion: "Su estructura genética única le permite mutar y adaptarse a cualquier entorno.",
      habitat: "Kanto"
    },
    habilidades: ["Fuga", "Adaptable"],
    tipo: "Normal",
    tipos: ["Normal"],
    habitat: "Kanto",
    stats: { hp: 55, attack: 55, defense: 50, sp_attack: 45, sp_defense: 65, speed: 55 },
    evoluciones: [
      { id: 133, nombre: "Eevee", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png" },
      { id: 134, nombre: "Vaporeon", etapa: "Fase 1", metodo: "Piedra Agua", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/134.png" },
      { id: 135, nombre: "Jolteon", etapa: "Fase 1", metodo: "Piedra Trueno", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/135.png" },
      { id: 136, nombre: "Flareon", etapa: "Fase 1", metodo: "Piedra Fuego", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/136.png" }
    ]
  },
  {
    id: 143,
    nombre: "Snorlax",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png",
    caracteristicas: {
      peso: 460.0,
      altura: 2.1,
      fuerza: 110,
      edad: 10,
      categoria: "Dormilón",
      descripcion: "Come 400 kilos de comida al día y no para hasta saciarse. Después se duerme profundamente.",
      habitat: "Kanto"
    },
    habilidades: ["Inmunidad", "Sebo"],
    tipo: "Normal",
    tipos: ["Normal"],
    habitat: "Kanto",
    stats: { hp: 160, attack: 110, defense: 65, sp_attack: 65, sp_defense: 110, speed: 30 },
    evoluciones: [
      { id: 446, nombre: "Munchlax", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/446.png" },
      { id: 143, nombre: "Snorlax", etapa: "Fase 1", metodo: "Amistad alta", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png" }
    ]
  },
  {
    id: 149,
    nombre: "Dragonite",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/149.png",
    caracteristicas: {
      peso: 210.0,
      altura: 2.2,
      fuerza: 134,
      edad: 15,
      categoria: "Dragón",
      descripcion: "Es capaz de dar la vuelta al mundo en tan solo dieciséis horas gracias a sus poderosas alas.",
      habitat: "Kanto"
    },
    habilidades: ["Foco interno", "Compensación"],
    tipo: "Dragón",
    tipos: ["Dragón", "Volador"],
    habitat: "Kanto",
    stats: { hp: 91, attack: 134, defense: 95, sp_attack: 100, sp_defense: 100, speed: 80 },
    evoluciones: [
      { id: 147, nombre: "Dratini", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/147.png" },
      { id: 148, nombre: "Dragonair", etapa: "Fase 1", metodo: "Nivel 30", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/148.png" },
      { id: 149, nombre: "Dragonite", etapa: "Fase 2", metodo: "Nivel 55", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/149.png" }
    ]
  },
  {
    id: 150,
    nombre: "Mewtwo",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png",
    caracteristicas: {
      peso: 122.0,
      altura: 2.0,
      fuerza: 110,
      edad: 6,
      categoria: "Genético",
      descripcion: "Fue creado por recombinación genética de Mew. Su poder de combate es temible e inigualable.",
      habitat: "Kanto"
    },
    habilidades: ["Presión", "Nerviosismo"],
    tipo: "Psíquico",
    tipos: ["Psíquico"],
    habitat: "Kanto",
    stats: { hp: 106, attack: 110, defense: 90, sp_attack: 154, sp_defense: 90, speed: 130 },
    evoluciones: []
  },

  // Gen II - Johto
  {
    id: 152,
    nombre: "Chikorita",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/152.png",
    caracteristicas: {
      peso: 6.4,
      altura: 0.9,
      fuerza: 49,
      edad: 3,
      categoria: "Hoja",
      descripcion: "Agita la hoja de su cabeza para despedir un dulce aroma que calma a los combatientes.",
      habitat: "Johto"
    },
    habilidades: ["Espesura", "Defensa hoja"],
    tipo: "Planta",
    tipos: ["Planta"],
    habitat: "Johto",
    stats: { hp: 45, attack: 49, defense: 65, sp_attack: 49, sp_defense: 65, speed: 45 },
    evoluciones: [
      { id: 152, nombre: "Chikorita", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/152.png" },
      { id: 153, nombre: "Bayleef", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/153.png" },
      { id: 154, nombre: "Meganium", etapa: "Fase 2", metodo: "Nivel 32", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/154.png" }
    ]
  },
  {
    id: 155,
    nombre: "Cyndaquil",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/155.png",
    caracteristicas: {
      peso: 7.9,
      altura: 0.5,
      fuerza: 52,
      edad: 3,
      categoria: "Ratón Fuego",
      descripcion: "Es tímido y suele enroscarse formando una bola. Si es atacado, enciende las llamas de su lomo.",
      habitat: "Johto"
    },
    habilidades: ["Mar llamas", "Absorbe fuego"],
    tipo: "Fuego",
    tipos: ["Fuego"],
    habitat: "Johto",
    stats: { hp: 39, attack: 52, defense: 43, sp_attack: 60, sp_defense: 50, speed: 65 },
    evoluciones: [
      { id: 155, nombre: "Cyndaquil", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/155.png" },
      { id: 156, nombre: "Quilava", etapa: "Fase 1", metodo: "Nivel 14", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/156.png" },
      { id: 157, nombre: "Typhlosion", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/157.png" }
    ]
  },
  {
    id: 158,
    nombre: "Totodile",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/158.png",
    caracteristicas: {
      peso: 9.5,
      altura: 0.6,
      fuerza: 65,
      edad: 3,
      categoria: "Fauces",
      descripcion: "Aunque es pequeño, sus fuertes mandíbulas pueden destrozar cualquier cosa sin vacilar.",
      habitat: "Johto"
    },
    habilidades: ["Torrente", "Potencia bruta"],
    tipo: "Agua",
    tipos: ["Agua"],
    habitat: "Johto",
    stats: { hp: 50, attack: 65, defense: 64, sp_attack: 44, sp_defense: 48, speed: 43 },
    evoluciones: [
      { id: 158, nombre: "Totodile", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/158.png" },
      { id: 159, nombre: "Croconaw", etapa: "Fase 1", metodo: "Nivel 18", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/159.png" },
      { id: 160, nombre: "Feraligatr", etapa: "Fase 2", metodo: "Nivel 30", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/160.png" }
    ]
  },
  {
    id: 212,
    nombre: "Scizor",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/212.png",
    caracteristicas: {
      peso: 118.0,
      altura: 1.8,
      fuerza: 130,
      edad: 9,
      categoria: "Tenaza",
      descripcion: "Sus pinzas de acero contienen masa acerada que destroza objetos duros como piedras.",
      habitat: "Johto"
    },
    habilidades: ["Experto", "Enjambre"],
    tipo: "Bicho",
    tipos: ["Bicho", "Acero"],
    habitat: "Johto",
    stats: { hp: 70, attack: 130, defense: 100, sp_attack: 55, sp_defense: 80, speed: 65 },
    evoluciones: [
      { id: 123, nombre: "Scyther", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/123.png" },
      { id: 212, nombre: "Scizor", etapa: "Fase 1", metodo: "Revestimiento Metálico", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/212.png" }
    ]
  },
  {
    id: 248,
    nombre: "Tyranitar",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/248.png",
    caracteristicas: {
      peso: 202.0,
      altura: 2.0,
      fuerza: 134,
      edad: 18,
      categoria: "Coraza",
      descripcion: "Su cuerpo es tan resistente que no le afectan la mayoría de los ataques comunes.",
      habitat: "Johto"
    },
    habilidades: ["Chorro arena", "Nerviosismo"],
    tipo: "Roca",
    tipos: ["Roca", "Siniestro"],
    habitat: "Johto",
    stats: { hp: 100, attack: 134, defense: 110, sp_attack: 95, sp_defense: 100, speed: 61 },
    evoluciones: [
      { id: 246, nombre: "Larvitar", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/246.png" },
      { id: 247, nombre: "Pupitar", etapa: "Fase 1", metodo: "Nivel 30", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/247.png" },
      { id: 248, nombre: "Tyranitar", etapa: "Fase 2", metodo: "Nivel 55", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/248.png" }
    ]
  },

  // Gen III - Hoenn
  {
    id: 252,
    nombre: "Treecko",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/252.png",
    caracteristicas: {
      peso: 5.0,
      altura: 0.5,
      fuerza: 45,
      edad: 3,
      categoria: "Gecko Bosque",
      descripcion: "Las plantas de sus pies tienen ganchos diminutos que le permiten trepar por paredes verticales.",
      habitat: "Hoenn"
    },
    habilidades: ["Espesura", "Liviano"],
    tipo: "Planta",
    tipos: ["Planta"],
    habitat: "Hoenn",
    stats: { hp: 40, attack: 45, defense: 35, sp_attack: 65, sp_defense: 55, speed: 70 },
    evoluciones: [
      { id: 252, nombre: "Treecko", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/252.png" },
      { id: 253, nombre: "Grovyle", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/253.png" },
      { id: 254, nombre: "Sceptile", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/254.png" }
    ]
  },
  {
    id: 255,
    nombre: "Torchic",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/255.png",
    caracteristicas: {
      peso: 2.5,
      altura: 0.4,
      fuerza: 60,
      edad: 3,
      categoria: "Polluelo",
      descripcion: "En su interior arde un fuego que produce calor reconfortante cuando se le abraza.",
      habitat: "Hoenn"
    },
    habilidades: ["Mar llamas", "Impulso"],
    tipo: "Fuego",
    tipos: ["Fuego"],
    habitat: "Hoenn",
    stats: { hp: 45, attack: 60, defense: 40, sp_attack: 70, sp_defense: 50, speed: 45 },
    evoluciones: [
      { id: 255, nombre: "Torchic", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/255.png" },
      { id: 256, nombre: "Combusken", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/256.png" },
      { id: 257, nombre: "Blaziken", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/257.png" }
    ]
  },
  {
    id: 258,
    nombre: "Mudkip",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/258.png",
    caracteristicas: {
      peso: 7.6,
      altura: 0.4,
      fuerza: 70,
      edad: 3,
      categoria: "Pez Lodo",
      descripcion: "La aleta de su cabeza actúa como un radar ultrasensible capaz de percibir corrientes.",
      habitat: "Hoenn"
    },
    habilidades: ["Torrente", "Humedad"],
    tipo: "Agua",
    tipos: ["Agua"],
    habitat: "Hoenn",
    stats: { hp: 50, attack: 70, defense: 50, sp_attack: 50, sp_defense: 50, speed: 40 },
    evoluciones: [
      { id: 258, nombre: "Mudkip", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/258.png" },
      { id: 259, nombre: "Marshtomp", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/259.png" },
      { id: 260, nombre: "Swampert", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/260.png" }
    ]
  },
  {
    id: 282,
    nombre: "Gardevoir",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/282.png",
    caracteristicas: {
      peso: 48.4,
      altura: 1.6,
      fuerza: 65,
      edad: 10,
      categoria: "Envolvente",
      descripcion: "Es capaz de predecir el futuro. Arriesgará su vida para proteger a su entrenador.",
      habitat: "Hoenn"
    },
    habilidades: ["Sincronía", "Rastreo"],
    tipo: "Psíquico",
    tipos: ["Psíquico", "Hada"],
    habitat: "Hoenn",
    stats: { hp: 68, attack: 65, defense: 65, sp_attack: 125, sp_defense: 115, speed: 80 },
    evoluciones: [
      { id: 280, nombre: "Ralts", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/280.png" },
      { id: 281, nombre: "Kirlia", etapa: "Fase 1", metodo: "Nivel 20", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/281.png" },
      { id: 282, nombre: "Gardevoir", etapa: "Fase 2", metodo: "Nivel 30", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/282.png" }
    ]
  },
  {
    id: 384,
    nombre: "Rayquaza",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/384.png",
    caracteristicas: {
      peso: 206.5,
      altura: 7.0,
      fuerza: 150,
      edad: 500,
      categoria: "Cielo",
      descripcion: "Vive en la capa de ozono desde hace cientos de millones de años, alimentándose de meteoritos.",
      habitat: "Hoenn"
    },
    habilidades: ["Bucle aire"],
    tipo: "Dragón",
    tipos: ["Dragón", "Volador"],
    habitat: "Hoenn",
    stats: { hp: 105, attack: 150, defense: 90, sp_attack: 150, sp_defense: 90, speed: 95 },
    evoluciones: []
  },

  // Gen IV - Sinnoh
  {
    id: 448,
    nombre: "Lucario",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png",
    caracteristicas: {
      peso: 54.0,
      altura: 1.2,
      fuerza: 110,
      edad: 7,
      categoria: "Aura",
      descripcion: "Puede captar el aura que emiten todos los seres vivos para leer sus pensamientos y movimientos.",
      habitat: "Sinnoh"
    },
    habilidades: ["Foco interno", "Impasible"],
    tipo: "Lucha",
    tipos: ["Lucha", "Acero"],
    habitat: "Sinnoh",
    stats: { hp: 70, attack: 110, defense: 70, sp_attack: 115, sp_defense: 70, speed: 90 },
    evoluciones: [
      { id: 447, nombre: "Riolu", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/447.png" },
      { id: 448, nombre: "Lucario", etapa: "Fase 1", metodo: "Amistad + Día", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png" }
    ]
  },
  {
    id: 445,
    nombre: "Garchomp",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png",
    caracteristicas: {
      peso: 95.0,
      altura: 1.9,
      fuerza: 130,
      edad: 14,
      categoria: "Mach",
      descripcion: "Vuela a la velocidad del sonido gracias a sus escamas finas y alas aerodinámicas.",
      habitat: "Sinnoh"
    },
    habilidades: ["Velo arena", "Piel tosca"],
    tipo: "Dragón",
    tipos: ["Dragón", "Tierra"],
    habitat: "Sinnoh",
    stats: { hp: 108, attack: 130, defense: 95, sp_attack: 80, sp_defense: 85, speed: 102 },
    evoluciones: [
      { id: 443, nombre: "Gible", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/443.png" },
      { id: 444, nombre: "Gabite", etapa: "Fase 1", metodo: "Nivel 24", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/444.png" },
      { id: 445, nombre: "Garchomp", etapa: "Fase 2", metodo: "Nivel 48", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png" }
    ]
  },
  {
    id: 471,
    nombre: "Glaceon",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/471.png",
    caracteristicas: {
      peso: 25.9,
      altura: 0.8,
      fuerza: 60,
      edad: 5,
      categoria: "Nieve Fresca",
      descripcion: "Controla la temperatura de su cuerpo a voluntad y congela el aire que lo rodea creando polvo de diamante.",
      habitat: "Sinnoh"
    },
    habilidades: ["Manto níveo", "Gélido"],
    tipo: "Hielo",
    tipos: ["Hielo"],
    habitat: "Sinnoh",
    stats: { hp: 65, attack: 60, defense: 110, sp_attack: 130, sp_defense: 95, speed: 65 },
    evoluciones: [
      { id: 133, nombre: "Eevee", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png" },
      { id: 471, nombre: "Glaceon", etapa: "Fase 1", metodo: "Piedra Hielo", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/471.png" }
    ]
  },

  // Gen V - Teselia
  {
    id: 609,
    nombre: "Chandelure",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/609.png",
    caracteristicas: {
      peso: 34.3,
      altura: 1.0,
      fuerza: 55,
      edad: 8,
      categoria: "Señuelo",
      descripcion: "Sus llamas no queman el cuerpo sino el alma del enemigo, dejándolo en trance eterno.",
      habitat: "Teselia"
    },
    habilidades: ["Absorbe fuego", "Cuerpo llama"],
    tipo: "Fantasma",
    tipos: ["Fantasma", "Fuego"],
    habitat: "Teselia",
    stats: { hp: 60, attack: 55, defense: 90, sp_attack: 145, sp_defense: 90, speed: 80 },
    evoluciones: [
      { id: 607, nombre: "Litwick", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/607.png" },
      { id: 608, nombre: "Lampent", etapa: "Fase 1", metodo: "Nivel 41", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/608.png" },
      { id: 609, nombre: "Chandelure", etapa: "Fase 2", metodo: "Piedra Noche", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/609.png" }
    ]
  },
  {
    id: 635,
    nombre: "Hydreigon",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/635.png",
    caracteristicas: {
      peso: 160.0,
      altura: 1.8,
      fuerza: 105,
      edad: 15,
      categoria: "Voraz",
      descripcion: "Tiene tres cabezas, pero solo la central tiene cerebro. Ataca a todo lo que se mueve.",
      habitat: "Teselia"
    },
    habilidades: ["Levitación"],
    tipo: "Siniestro",
    tipos: ["Siniestro", "Dragón"],
    habitat: "Teselia",
    stats: { hp: 92, attack: 105, defense: 90, sp_attack: 125, sp_defense: 90, speed: 98 },
    evoluciones: [
      { id: 633, nombre: "Deino", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/633.png" },
      { id: 634, nombre: "Zweilous", etapa: "Fase 1", metodo: "Nivel 50", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/634.png" },
      { id: 635, nombre: "Hydreigon", etapa: "Fase 2", metodo: "Nivel 64", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/635.png" }
    ]
  },

  // Gen VI - Kalos
  {
    id: 658,
    nombre: "Greninja",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png",
    caracteristicas: {
      peso: 40.0,
      altura: 1.5,
      fuerza: 95,
      edad: 7,
      categoria: "Ninja",
      descripcion: "Comprime agua para formar estrellas ninja arrojadizas que cortan el metal sólido.",
      habitat: "Kalos"
    },
    habilidades: ["Torrente", "Mutatipo"],
    tipo: "Agua",
    tipos: ["Agua", "Siniestro"],
    habitat: "Kalos",
    stats: { hp: 72, attack: 95, defense: 67, sp_attack: 103, sp_defense: 71, speed: 122 },
    evoluciones: [
      { id: 656, nombre: "Froakie", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/656.png" },
      { id: 657, nombre: "Frogadier", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/657.png" },
      { id: 658, nombre: "Greninja", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png" }
    ]
  },
  {
    id: 700,
    nombre: "Sylveon",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/700.png",
    caracteristicas: {
      peso: 23.5,
      altura: 1.0,
      fuerza: 65,
      edad: 6,
      categoria: "Vínculo",
      descripcion: "Envuelve con sus cintas sensoriales los brazos de su entrenador querido para calmar su ánimo.",
      habitat: "Kalos"
    },
    habilidades: ["Gran encanto", "Piel férrea"],
    tipo: "Hada",
    tipos: ["Hada"],
    habitat: "Kalos",
    stats: { hp: 95, attack: 65, defense: 65, sp_attack: 110, sp_defense: 130, speed: 60 },
    evoluciones: [
      { id: 133, nombre: "Eevee", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png" },
      { id: 700, nombre: "Sylveon", etapa: "Fase 1", metodo: "Afecto alto + Mov. Hada", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/700.png" }
    ]
  },

  // Gen VII - Alola
  {
    id: 778,
    nombre: "Mimikyu",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/778.png",
    caracteristicas: {
      peso: 0.7,
      altura: 0.2,
      fuerza: 90,
      edad: 4,
      categoria: "Disfraz",
      descripcion: "Oculta su verdadera apariencia bajo un trapo similar a Pikachu para conseguir el afecto de los demás.",
      habitat: "Alola"
    },
    habilidades: ["Disfraz"],
    tipo: "Fantasma",
    tipos: ["Fantasma", "Hada"],
    habitat: "Alola",
    stats: { hp: 55, attack: 90, defense: 80, sp_attack: 50, sp_defense: 105, speed: 96 },
    evoluciones: []
  },

  // Gen VIII - Galar
  {
    id: 887,
    nombre: "Dragapult",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/887.png",
    caracteristicas: {
      peso: 50.0,
      altura: 3.0,
      fuerza: 120,
      edad: 11,
      categoria: "Sigiloso",
      descripcion: "Lleva Dreepy en sus cuernos que dispara a velocidades supersónicas durante el combate.",
      habitat: "Galar"
    },
    habilidades: ["Cuerpo claro", "Allanamiento"],
    tipo: "Dragón",
    tipos: ["Dragón", "Fantasma"],
    habitat: "Galar",
    stats: { hp: 88, attack: 120, defense: 75, sp_attack: 100, sp_defense: 75, speed: 142 },
    evoluciones: [
      { id: 885, nombre: "Dreepy", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/885.png" },
      { id: 886, nombre: "Drakloak", etapa: "Fase 1", metodo: "Nivel 50", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/886.png" },
      { id: 887, nombre: "Dragapult", etapa: "Fase 2", metodo: "Nivel 60", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/887.png" }
    ]
  },

  // Gen IX - Paldea
  {
    id: 906,
    nombre: "Sprigatito",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/906.png",
    caracteristicas: {
      peso: 4.1,
      altura: 0.4,
      fuerza: 61,
      edad: 2,
      categoria: "Gato Planta",
      descripcion: "Frota sus patitas delanteras para despedir una fragancia embriagadora que cautiva a sus rivales.",
      habitat: "Paldea"
    },
    habilidades: ["Espesura", "Mutatipo"],
    tipo: "Planta",
    tipos: ["Planta"],
    habitat: "Paldea",
    stats: { hp: 40, attack: 61, defense: 54, sp_attack: 45, sp_defense: 45, speed: 65 },
    evoluciones: [
      { id: 906, nombre: "Sprigatito", etapa: "Base", metodo: null, imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/906.png" },
      { id: 907, nombre: "Floragato", etapa: "Fase 1", metodo: "Nivel 16", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/907.png" },
      { id: 908, nombre: "Meowscarada", etapa: "Fase 2", metodo: "Nivel 36", imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/908.png" }
    ]
  },
  {
    id: 1008,
    nombre: "Miraidon",
    imagen: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1008.png",
    caracteristicas: {
      peso: 240.0,
      altura: 3.5,
      fuerza: 85,
      edad: 100,
      categoria: "Paradoja",
      descripcion: "Se cree que es un Pokémon legendario de una era lejana y futurista con dominio de la energía eléctrica.",
      habitat: "Paldea"
    },
    habilidades: ["Motor hadrónico"],
    tipo: "Eléctrico",
    tipos: ["Eléctrico", "Dragón"],
    habitat: "Paldea",
    stats: { hp: 100, attack: 85, defense: 100, sp_attack: 135, sp_defense: 115, speed: 135 },
    evoluciones: []
  }
];
