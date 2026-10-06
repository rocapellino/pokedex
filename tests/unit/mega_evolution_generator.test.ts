import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMegaEvolutions,
  enrichCatalogWithMegas,
  isMegaFormName,
  megaDisplayName,
  type PokeApiLike,
} from '../../scripts/generate-pokemon-catalog.js';
import type { Pokemon } from '../../apps/backend/src/types.js';

test('🧬 Generador: isMegaFormName reconoce las formas mega y no confunde nombres de especie', () => {
  for (const name of [
    'venusaur-mega',
    'charizard-mega-x',
    'absol-mega-z',
    'meowstic-male-mega',
    'tatsugiri-curly-mega',
    'magearna-original-mega',
  ]) {
    assert.equal(isMegaFormName(name), true, name);
  }
  for (const name of ['meganium', 'charizard', 'charizard-gmax', 'pikachu-rock-star', 'mega', 'megalopolis']) {
    assert.equal(isMegaFormName(name), name === 'mega', name);
  }
});

test('🧬 Generador: megaDisplayName compone el nombre oficial en español', () => {
  assert.equal(megaDisplayName('venusaur-mega', 'venusaur', 'Venusaur'), 'Mega-Venusaur');
  assert.equal(megaDisplayName('charizard-mega-x', 'charizard', 'Charizard'), 'Mega-Charizard X');
  assert.equal(megaDisplayName('garchomp-mega-z', 'garchomp', 'Garchomp'), 'Mega-Garchomp Z');
  assert.equal(megaDisplayName('meowstic-male-mega', 'meowstic', 'Meowstic'), 'Mega-Meowstic (macho)');
  assert.equal(megaDisplayName('meowstic-female-mega', 'meowstic', 'Meowstic'), 'Mega-Meowstic (hembra)');
  assert.equal(megaDisplayName('tatsugiri-curly-mega', 'tatsugiri', 'Tatsugiri'), 'Mega-Tatsugiri (Forma Curvada)');
  assert.equal(megaDisplayName('tatsugiri-droopy-mega', 'tatsugiri', 'Tatsugiri'), 'Mega-Tatsugiri (Forma Lánguida)');
  assert.equal(megaDisplayName('tatsugiri-stretchy-mega', 'tatsugiri', 'Tatsugiri'), 'Mega-Tatsugiri (Forma Estirada)');
  assert.equal(megaDisplayName('magearna-original-mega', 'magearna', 'Magearna'), 'Mega-Magearna (Color Original)');
});

test('🧬 Generador: un calificativo desconocido cae a su slug legible y no rompe el nombre', () => {
  assert.equal(megaDisplayName('foo-nuevaforma-mega', 'foo', 'Foo'), 'Mega-Foo (Nuevaforma)');
});

test('🧬 Generador: el slug de la especie se trata como texto literal, no como expresión regular', () => {
  // Con `new RegExp(slug)`, el `.` coincidiría con cualquier carácter y recortaría `axb-` por error.
  assert.equal(megaDisplayName('a.b-mega-x', 'a.b', 'A.B'), 'Mega-A.B X');
  assert.equal(megaDisplayName('axb-mega-x', 'a.b', 'A.B'), 'Mega-A.B X (Axb)');
  assert.equal(megaDisplayName('mr-mime-mega', 'mr-mime', 'Mr. Mime'), 'Mega-Mr. Mime');
});

// ------------------------------------------------------------------------------
// Doble de PokeAPI
// ------------------------------------------------------------------------------

interface FakeForm {
  id: number;
  species: string;
  types: string[];
  abilities: string[];
  stats: number[];
  weight: number;
  height: number;
  formNameEs?: string;
}

const STAT_ORDER = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

const FORMS: Record<string, FakeForm> = {
  'charizard-mega-y': {
    id: 10035,
    species: 'charizard',
    types: ['fire', 'flying'],
    abilities: ['drought'],
    stats: [78, 104, 78, 159, 115, 100],
    weight: 1005,
    height: 17,
    formNameEs: 'Mega-Charizard Y',
  },
  'charizard-mega-x': {
    id: 10034,
    species: 'charizard',
    types: ['fire', 'dragon'],
    abilities: ['tough-claws'],
    stats: [78, 130, 111, 130, 85, 100],
    weight: 1105,
    height: 17,
    formNameEs: 'Mega-Charizard X',
  },
  'clefable-mega': {
    id: 10278,
    species: 'clefable',
    types: ['fairy', 'flying'],
    abilities: ['magic-bounce'],
    stats: [95, 80, 93, 135, 110, 70],
    weight: 423,
    height: 17,
  },
};

const SPECIES_ID: Record<string, number> = { charizard: 6, clefable: 36 };
const SPECIES_ES: Record<string, string> = { charizard: 'Charizard', clefable: 'Clefable' };
const ABILITY_ES: Record<string, string> = {
  drought: 'Sequía',
  'tough-claws': 'Garra Dura',
  'magic-bounce': 'Espejo Mágico',
};

function createFakeApi(extraNames: string[] = []): { api: PokeApiLike; calls: string[] } {
  const calls: string[] = [];
  const api: PokeApiLike = {
    async get<T>(url: string): Promise<T> {
      calls.push(url);
      const form = /^pokemon\/(.+)$/.exec(url);
      if (form && FORMS[form[1]]) {
        const f = FORMS[form[1]];
        return {
          id: f.id,
          species: { name: f.species, url: `https://pokeapi.co/api/v2/pokemon-species/${SPECIES_ID[f.species]}/` },
          height: f.height,
          weight: f.weight,
          types: f.types.map((name, i) => ({ slot: i + 1, type: { name, url: '' } })),
          abilities: f.abilities.map((name, i) => ({ slot: i + 1, ability: { name, url: `ability/${name}` } })),
          stats: f.stats.map((base_stat, i) => ({ base_stat, stat: { name: STAT_ORDER[i], url: '' } })),
          sprites: { other: { 'official-artwork': { front_default: `https://art.test/${f.id}.png` } } },
        } as T;
      }
      const formEs = /^pokemon-form\/(.+)$/.exec(url);
      if (formEs) {
        const f = FORMS[formEs[1]];
        if (!f) throw new Error(`HTTP 404 en ${url}`);
        return {
          form_names: f.formNameEs ? [{ name: f.formNameEs, language: { name: 'es', url: '' } }] : [],
        } as T;
      }
      const ability = /^ability\/(.+)$/.exec(url);
      if (ability) {
        return { names: [{ name: ABILITY_ES[ability[1]], language: { name: 'es', url: '' } }] } as T;
      }
      const species = /^pokemon-species\/(\d+)$/.exec(url);
      if (species) {
        const slug = Object.keys(SPECIES_ID).find((k) => SPECIES_ID[k] === Number(species[1])) as string;
        return {
          id: Number(species[1]),
          name: slug,
          names: [{ name: SPECIES_ES[slug], language: { name: 'es', url: '' } }],
        } as T;
      }
      if (url === 'pokemon?limit=100000') {
        return {
          results: [...Object.keys(FORMS), 'charizard', 'meganium', ...extraNames].map((name) => ({ name, url: '' })),
        } as T;
      }
      throw new Error(`URL inesperada en el doble: ${url}`);
    },
  };
  return { api, calls };
}

const translator = {
  async resourceName(resource: { name: string }): Promise<string> {
    return ABILITY_ES[resource.name] ?? resource.name;
  },
};

test('🧬 Generador: buildMegaEvolutions arma la forma completa y la ordena por ID de forma (X antes que Y)', async () => {
  const { api } = createFakeApi();
  const megas = await buildMegaEvolutions(
    'charizard',
    'Charizard',
    ['charizard-mega-y', 'charizard-mega-x'],
    api,
    translator,
  );

  assert.deepEqual(
    megas.map((m) => m.clave),
    ['charizard-mega-x', 'charizard-mega-y'],
  );
  assert.deepEqual(megas[0], {
    clave: 'charizard-mega-x',
    nombre: 'Mega-Charizard X',
    imagen: 'https://art.test/10034.png',
    tipos: ['Fuego', 'Dragón'],
    habilidades: ['Garra Dura'],
    stats: { hp: 78, attack: 130, defense: 111, sp_attack: 130, sp_defense: 85, speed: 100 },
    peso: 110.5,
    altura: 1.7,
  });
});

test('🧬 Generador: sin nombre oficial en español compone el nombre con la convención', async () => {
  const { api } = createFakeApi();
  const [mega] = await buildMegaEvolutions('clefable', 'Clefable', ['clefable-mega'], api, translator);

  assert.equal(mega.nombre, 'Mega-Clefable');
  assert.deepEqual(mega.tipos, ['Hada', 'Volador']);
});

test('🧬 Generador: enrichCatalogWithMegas agrupa por especie, no toca el resto y quita megas obsoletas', async () => {
  const { api } = createFakeApi();
  const base = (id: number, nombre: string): Pokemon => ({
    id,
    nombre,
    imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
    tipo: 'Fuego',
    caracteristicas: { peso: 1, altura: 1, fuerza: 50 },
    habilidades: ['A'],
  });
  const stale = { ...base(7, 'Squirtle'), megaevoluciones: [] as never[] };
  const catalog = [{ ...base(6, 'Charizard'), fuerza: 99 }, stale, { ...base(36, 'Clefable') }];

  const enriched = await enrichCatalogWithMegas(catalog, api, translator);

  assert.deepEqual(
    enriched[0].megaevoluciones?.map((m) => m.clave),
    ['charizard-mega-x', 'charizard-mega-y'],
  );
  assert.equal(enriched[0].fuerza, 99, 'conserva el resto de la entrada');
  assert.equal('megaevoluciones' in enriched[1], false, 'una especie sin megas queda sin el campo');
  assert.deepEqual(
    enriched[2].megaevoluciones?.map((m) => m.clave),
    ['clefable-mega'],
  );
  assert.equal('megaevoluciones' in catalog[1], true, 'no muta el catálogo de entrada');
});

test('🧬 Generador: falla si hay megaevoluciones de una especie ausente del catálogo', async () => {
  const { api } = createFakeApi();

  await assert.rejects(
    enrichCatalogWithMegas(
      [
        {
          id: 6,
          nombre: 'Charizard',
          imagen:
            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
          tipo: 'Fuego',
          caracteristicas: { peso: 1, altura: 1, fuerza: 50 },
          habilidades: ['A'],
        },
      ],
      api,
      translator,
    ),
    /ausentes del catálogo: 36/,
  );
});
