// ==============================================================================
// Textos Heredados de la Muestra Inicial (`sample`)
// ==============================================================================
// Registra los valores de `descripcion`, `categoria` y `habilidades` que tenían las
// 35 especies de `initialPokemons.ts` antes de su alineación con el catálogo nacional
// (`full`), así como los fallbacks en inglés previos de #906, #1007 y #1008.
//
// El seed job (`planSampleTextAlignment`) solo actualiza un campo persistido si su
// valor actual coincide con alguno de estos candidatos heredados: así alinea
// automáticamente `pokedex/preprod` sin pisar ninguna edición manual del backoffice.

export interface LegacyTextCandidates {
  readonly descripcion?: readonly string[];
  readonly categoria?: readonly string[];
  readonly habilidades?: readonly (readonly string[])[];
}

export const LEGACY_SAMPLE_TEXTS: ReadonlyMap<number, LegacyTextCandidates> = new Map<number, LegacyTextCandidates>([
  [
    1,
    {
      descripcion: [
        'A Bulbasaur es fácil verle echándose una siesta al sol. La semilla que tiene en el lomo va creciendo cada vez más a medida que absorbe los rayos del sol.',
      ],
    },
  ],
  [
    2,
    {
      descripcion: [
        'Este Pokémon tiene un bulbo en el lomo. Dicen que, al absorber nutrientes, el bulbo se transforma en una flor grande.',
      ],
    },
  ],
  [
    3,
    {
      descripcion: [
        'La flor que tiene en el lomo libera un aroma embriagador que calma los ánimos de aquellos que están librando un combate.',
      ],
    },
  ],
  [
    4,
    {
      descripcion: [
        'La llama que tiene en la punta de la cola arde según sus sentimientos. Llamea levemente si está alegre y arde con fuerza si se enfada.',
      ],
      habilidades: [['Mar llamas', 'Poder solar']],
    },
  ],
  [
    5,
    {
      descripcion: [
        'Tiene una naturaleza agresiva. En combate agita su cola llameante y arremete con afiladas garras.',
      ],
      habilidades: [['Mar llamas', 'Poder solar']],
    },
  ],
  [
    6,
    {
      descripcion: ['Escupe un fuego tan caliente que funde las rocas. Causa incendios forestales sin querer.'],
      habilidades: [['Mar llamas', 'Poder solar']],
    },
  ],
  [
    7,
    {
      descripcion: ['Cuando se siente amenazado, esconde las extremidades en el caparazón y dispara agua a presión.'],
      habilidades: [['Torrente', 'Cura lluvia']],
    },
  ],
  [
    8,
    {
      descripcion: ['Se le considera un símbolo de longevidad. El pelaje de su cola va oscureciéndose con la edad.'],
      habilidades: [['Torrente', 'Cura lluvia']],
    },
  ],
  [
    9,
    {
      descripcion: [
        'Dispara potentes chorros de agua por los cañones de su caparazón con una fuerza capaz de perforar el acero macizo.',
      ],
      habilidades: [['Torrente', 'Cura lluvia']],
    },
  ],
  [
    25,
    {
      descripcion: [
        'Las bolsas de las mejillas están llenas de electricidad que libera cuando se asusta o cuando ataca.',
      ],
      habilidades: [['Electricidad estática', 'Pararrayos']],
    },
  ],
  [
    26,
    {
      descripcion: [
        'Su larga cola le sirve de toma de tierra para protegerse de sus propias e intensas descargas eléctricas.',
      ],
      habilidades: [['Electricidad estática', 'Pararrayos']],
    },
  ],
  [
    94,
    {
      descripcion: [
        'Para quitarle la vida a su presa, se desliza en su sombra y espera su oportunidad en silencio sepulcral.',
      ],
      habilidades: [['Cuerpo maldito']],
    },
  ],
  [
    133,
    {
      descripcion: [
        'Su genética es tan irregular que contiene la clave para evolucionar en multitud de formas diferentes según su entorno.',
      ],
    },
  ],
  [
    143,
    {
      descripcion: [
        'No se siente satisfecho hasta que se zampa 400 kilos de comida cada día. Cuando termina, se queda dormido de golpe.',
      ],
      categoria: ['Dormilón'],
    },
  ],
  [
    150,
    {
      descripcion: [
        'Fue creado por científicos manipulando los genes de Mew. Dicen que posee el corazón más salvaje de entre todos los Pokémon.',
      ],
    },
  ],
  [
    155,
    {
      descripcion: [
        'Es tímido y suele enroscarse en una bola. Cuando se asusta, las llamas de su lomo arden con más intensidad.',
      ],
      habilidades: [['Mar llamas', 'Absorbe fuego']],
    },
  ],
  [
    158,
    {
      descripcion: [
        'A pesar de su menudo tamaño, sus mandíbulas son muy poderosas. Muerde cualquier cosa que se mueva por puro juego.',
      ],
      habilidades: [['Torrente', 'Potencia bruta']],
    },
  ],
  [
    172,
    {
      descripcion: [
        'Aún no domina el almacenamiento eléctrico. Ante cualquier susto o sorpresa, libera una pequeña descarga involuntaria.',
      ],
      categoria: ['Ratón Pequeño'],
      habilidades: [['Electricidad estática', 'Pararrayos']],
    },
  ],
  [
    248,
    {
      descripcion: ['Tan imponente que puede destruir una montaña entera con una sola pata para hacer allí su nido.'],
      habilidades: [['Chorro arena', 'Nerviosismo']],
    },
  ],
  [
    254,
    {
      descripcion: [
        'Las hojas que le crecen en los brazos son tan afiladas como katanas. Se mueve de rama en rama con una agilidad pasmosa.',
      ],
    },
  ],
  [
    257,
    {
      descripcion: [
        'En combate, desprende llamas abrasadoras por las muñecas y propina patadas devastadoras a sus oponentes.',
      ],
      habilidades: [['Mar llamas', 'Impulso']],
    },
  ],
  [
    384,
    {
      descripcion: [
        'Vive en la capa de ozono desde hace cientos de millones de años, alimentándose de meteoritos y partículas en el aire.',
      ],
      habilidades: [['Bucle aire']],
    },
  ],
  [
    445,
    {
      descripcion: ['Vuela a velocidades supersónicas plegando sus alas. Nunca deja escapar a su presa en combate.'],
      habilidades: [['Velo arena', 'Piel tosca']],
    },
  ],
  [
    448,
    {
      descripcion: [
        'Capta el aura de todas las cosas. Es capaz de comprender los sentimientos humanos a través de ella.',
      ],
      habilidades: [['Impasible', 'Foco interno', 'Justiciero']],
    },
  ],
  [
    571,
    {
      descripcion: [
        'Crea ilusiones tan vívidas que resultan indistinguibles de la realidad para engañar y proteger su manada.',
      ],
    },
  ],
  [
    609,
    {
      descripcion: ['Absorbe las almas de sus víctimas para alimentar sus extrañas llamas espectrales.'],
      habilidades: [['Absorbe fuego', 'Cuerpo llama', 'Allanamiento']],
    },
  ],
  [
    658,
    {
      descripcion: [
        'Comprime agua para crear shurikens que lanza a gran velocidad. Desaparece y reaparece cual ninja veloz.',
      ],
      habilidades: [['Torrente', 'Mutatipo', 'Fuerte afecto']],
    },
  ],
  [
    700,
    {
      descripcion: [
        'Envía ondas tranquilizadoras mediante sus apéndices sensitivos para disipar cualquier hostilidad.',
      ],
      habilidades: [['Gran encanto', 'Piel feérica']],
    },
  ],
  [
    724,
    {
      descripcion: [
        'Dispara sus plumas como flechas con una puntería milimétrica. Oculta su presencia en la espesura del follaje.',
      ],
    },
  ],
  [
    778,
    {
      descripcion: [
        'Lleva un disfraz hecho a mano parecido a Pikachu porque se siente solitario y busca el afecto humano.',
      ],
    },
  ],
  [
    815,
    {
      descripcion: ['Convierte piedras en balones ígneos con sus increíbles habilidades de regate y remate.'],
      habilidades: [['Mar llamas', 'Líbero']],
    },
  ],
  [
    887,
    {
      descripcion: ['Lleva dos Dreepy en sus cuernos y los dispara a velocidad de combate como torpedos vivos.'],
      categoria: ['Sigiloso'],
      habilidades: [['Cuerpo puro', 'Allanamiento', 'Bucle aire']],
    },
  ],
  [
    906,
    {
      descripcion: [
        'The sweet scent its body gives off mesmerizes those around it. The scent grows stronger when this Pokémon is in the sun.',
      ],
      categoria: ['Grass Cat'],
    },
  ],
  [
    1007,
    {
      descripcion: [
        'This Pokémon resembles Cyclizar, but it is far burlier and more ferocious. Nothing is known about its ecology or other features.',
      ],
      categoria: ['Paradox'],
      habilidades: [['Latido paleo']],
    },
  ],
  [
    1008,
    {
      descripcion: [
        'This seems to be the Iron Serpent mentioned in an old book. The Iron Serpent is said to have turned the land to ash with its lightning.',
      ],
      categoria: ['Paradox'],
      habilidades: [['Motor hadrónico']],
    },
  ],
]);
