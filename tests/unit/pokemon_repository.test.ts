import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMemoryMapSize,
  isWritableStorageAvailable,
  getAllPokemons,
  getPokemonById,
  savePokemon,
  deletePokemon,
  getNextPokemonId
} from '../../apps/backend/src/services/pokemon.repository.js';
import { Pokemon } from '../../apps/backend/src/types.js';
import { validatePokemonPayload } from '../../apps/backend/src/validation/pokemon.js';

test('🐾 PokemonRepository [Unit]: inicialización de catálogo y reporte de memoria', () => {
  const size = getMemoryMapSize();
  assert.ok(size >= 9, 'El almacén en memoria debe contener al menos los 9 Pokémon iniciales');
});

test('🐾 PokemonRepository [Unit]: isWritableStorageAvailable aplica Fail-Closed cuando PG está configurado pero inactivo', () => {
  const origDbUrl = process.env.DATABASE_URL;

  try {
    // 1. En entorno standalone/local sin PG configurado, escritura permitida en memoria
    delete process.env.DATABASE_URL;
    assert.equal(isWritableStorageAvailable(), true);

    // 2. Con DATABASE_URL configurada pero sin conexión activa a PG, falla cerrado
    process.env.DATABASE_URL = 'postgresql://fake:fake@127.0.0.1:5432/pokedex';
    assert.equal(isWritableStorageAvailable(), false);
  } finally {
    if (origDbUrl) {
      process.env.DATABASE_URL = origDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
});

test('🐾 PokemonRepository [Unit]: getAllPokemons paginación y ordenamiento ascendente', async () => {
  const res = await getAllPokemons({ limit: 3, offset: 0 });
  assert.equal(res.pokemons.length, 3);
  assert.ok(res.total >= 9);

  // Verificar orden ascendente por ID
  for (let i = 0; i < res.pokemons.length - 1; i++) {
    assert.ok(res.pokemons[i].id < res.pokemons[i + 1].id, 'Los Pokémon deben estar ordenados por id asc');
  }

  // Segunda página
  const resPage2 = await getAllPokemons({ limit: 3, offset: 3 });
  assert.equal(resPage2.pokemons.length, 3);
  assert.notEqual(res.pokemons[0].id, resPage2.pokemons[0].id);
});

test('🐾 PokemonRepository [Unit]: getAllPokemons filtrado insensible por tipo y búsqueda de texto', async () => {
  // Filtro por tipo primario o secundario
  const aguaPokemons = await getAllPokemons({ type: 'agua' });
  assert.ok(aguaPokemons.pokemons.length > 0);
  for (const p of aguaPokemons.pokemons) {
    const matchesTipo = p.tipo.toLowerCase() === 'agua';
    const matchesTipos = p.tipos?.some(t => t.toLowerCase() === 'agua');
    assert.ok(matchesTipo || matchesTipos, `El Pokémon ${p.nombre} debe ser de tipo agua`);
  }

  // Búsqueda por substring en el nombre
  const searchChar = await getAllPokemons({ search: 'char' });
  assert.ok(searchChar.pokemons.length > 0);
  for (const p of searchChar.pokemons) {
    assert.match(p.nombre.toLowerCase(), /char/);
  }

  // Búsqueda sin coincidencias
  const notFound = await getAllPokemons({ search: 'inexistente-xyz-123' });
  assert.equal(notFound.pokemons.length, 0);
  assert.equal(notFound.total, 0);
});

test('🐾 PokemonRepository [Unit]: getPokemonById retorna entidad exacta o null', async () => {
  // ID 1 (Bulbasaur)
  const p1 = await getPokemonById(1);
  assert.ok(p1 !== null);
  assert.equal(p1?.id, 1);
  assert.equal(p1?.nombre, 'Bulbasaur');

  // ID inexistente
  const notFound = await getPokemonById(999999);
  assert.equal(notFound, null);
});

test('🐾 PokemonRepository [Unit]: ciclo completo de savePokemon y deletePokemon en memoria', async () => {
  const origDbUrl = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;

    const testPokemon: Pokemon = {
      id: 8888,
      nombre: 'UnitMon',
      tipo: 'Eléctrico',
      tipos: ['Eléctrico'],
      imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/8888.png',
      caracteristicas: {
        peso: 15.5,
        altura: 0.8,
        fuerza: 60,
        descripcion: 'Pokémon de prueba para repositorio unitario'
      },
      habilidades: ['Impactrueno', 'Rayo']
    };

    // Validar con esquema antes de persistir
    const validation = validatePokemonPayload(testPokemon);
    assert.equal(validation.valid, true);

    // Guardar
    await savePokemon(testPokemon);
    const retrieved = await getPokemonById(8888);
    assert.deepEqual(retrieved, testPokemon);

    // Actualizar
    const updatedPokemon: Pokemon = {
      ...testPokemon,
      nombre: 'UnitMon Mega',
      fuerza: 95
    };
    await savePokemon(updatedPokemon);
    const retrievedUpdated = await getPokemonById(8888);
    assert.equal(retrievedUpdated?.nombre, 'UnitMon Mega');
    assert.equal(retrievedUpdated?.fuerza, 95);

    // Eliminar
    const deleted = await deletePokemon(8888);
    assert.equal(deleted, true);

    // Re-verificar que fue eliminado
    const retrievedAfterDelete = await getPokemonById(8888);
    assert.equal(retrievedAfterDelete, null);

    // Intento de eliminación repetida retorna false
    const deleteAgain = await deletePokemon(8888);
    assert.equal(deleteAgain, false);
  } finally {
    if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
  }
});

test('🐾 PokemonRepository [Unit]: savePokemon y deletePokemon fallan cerrado si PG está configurado pero caído', async () => {
  const origDbUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgresql://fake:fake@127.0.0.1:5432/pokedex';

    const dummyPokemon: Pokemon = {
      id: 7777,
      nombre: 'FailClosedMon',
      tipo: 'Fuego',
      imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7777.png',
      caracteristicas: {
        peso: 10,
        altura: 1,
        fuerza: 40,
        descripcion: 'Pokemon de prueba fail closed'
      }
    };

    await assert.rejects(
      async () => {
        await savePokemon(dummyPokemon);
      },
      /Almacenamiento persistente \(PostgreSQL\) no disponible para escritura/
    );

    await assert.rejects(
      async () => {
        await deletePokemon(7777);
      },
      /Almacenamiento persistente \(PostgreSQL\) no disponible para eliminación/
    );
  } finally {
    if (origDbUrl) {
      process.env.DATABASE_URL = origDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
});

test('🐾 PokemonRepository [Unit]: getNextPokemonId genera IDs secuenciales continuos mayores a 1008', async () => {
  const id1 = await getNextPokemonId();
  const id2 = await getNextPokemonId();
  const id3 = await getNextPokemonId();

  assert.ok(id1 > 1008, 'El primer id generado debe superar el catálogo inicial (1008)');
  assert.ok(id2 > id1, 'Los IDs sucesivos deben ser crecientes');
  assert.ok(id3 > id2, 'Los IDs sucesivos deben ser crecientes');
});
