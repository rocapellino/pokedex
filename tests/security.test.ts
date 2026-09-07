import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePokemonPayload, validateImageUrl } from '../src/validation/pokemon.js';

test('🛡️ Seguridad: validatePokemonPayload rechaza inyecciones XSS en nombre', () => {
  const result = validatePokemonPayload({
    nombre: '<script>alert("xss")</script>',
    tipo: 'Fuego',
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /código HTML o scripts no permitidos/);
});

test('🛡️ Seguridad: validatePokemonPayload rechaza inyecciones XSS con onerror en descripción', () => {
  const result = validatePokemonPayload({
    nombre: 'Pikachu',
    tipo: 'Electrico',
    caracteristicas: {
      descripcion: '<img src=x onerror=alert(1)>',
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /código HTML o scripts no permitidos/);
});

test('🛡️ Seguridad: validatePokemonPayload rechaza javascript: pseudo-protocolo en tipos', () => {
  const result = validatePokemonPayload({
    nombre: 'Mew',
    tipo: 'Psíquico',
    tipos: ['Psíquico', 'javascript:alert(1)'],
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /scripts no permitidos/);
});

test('🛡️ Seguridad: validateImageUrl rechaza URLs inseguras o pseudo-protocolos', () => {
  assert.equal(validateImageUrl('javascript:alert(1)'), false);
  assert.equal(validateImageUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), false);
  assert.equal(validateImageUrl('vbscript:msgbox(1)'), false);
  assert.equal(validateImageUrl('ftp://evil.com/img.png'), false);
  assert.equal(validateImageUrl('not-a-valid-url'), false);

  assert.equal(validateImageUrl('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'), true);
  assert.equal(validateImageUrl('http://localhost:3000/images/pokemon.png'), true);
  assert.equal(validateImageUrl('/static/pokemon.png'), true);
});

test('🛡️ Seguridad: validatePokemonPayload rechaza URL maliciosa en campo imagen', () => {
  const result = validatePokemonPayload({
    nombre: 'Gengar',
    tipo: 'Fantasma',
    imagen: 'javascript:alert(document.cookie)',
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /imagen.*URL válida/i);
});

test('🛡️ Seguridad: validatePokemonPayload rechaza campos desconocidos en stats (anti-inyección/mass assignment)', () => {
  const result = validatePokemonPayload({
    nombre: 'Alakazam',
    tipo: 'Psíquico',
    stats: {
      hp: 55,
      attack: 50,
      defense: 45,
      sp_attack: 135,
      sp_defense: 95,
      speed: 120,
      injectedField: 999,
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /clave no permitida/i);
});

test('🛡️ Seguridad: validatePokemonPayload rechaza campos desconocidos en caracteristicas (anti mass-assignment)', () => {
  const result = validatePokemonPayload({
    nombre: 'Dragonite',
    tipo: 'Dragón',
    caracteristicas: {
      peso: 210,
      altura: 2.2,
      fuerza: 95,
      isAdmin: true,
    } as any,
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /propiedad no permitida/i);
});

test('🛡️ Validación: rechaza payloads no válidos (null, strings, arrays)', () => {
  assert.equal(validatePokemonPayload(null).valid, false);
  assert.equal(validatePokemonPayload('invalid string').valid, false);
  assert.equal(validatePokemonPayload([1, 2, 3]).valid, false);
});

test('🛡️ Validación: rechaza pesos y alturas físicas desmedidas o negativas', () => {
  const negPeso = validatePokemonPayload({
    nombre: 'Snorlax',
    tipo: 'Normal',
    caracteristicas: { peso: -5 },
  });
  assert.equal(negPeso.valid, false);

  const overflowAltura = validatePokemonPayload({
    nombre: 'Wailord',
    tipo: 'Agua',
    caracteristicas: { altura: 999 },
  });
  assert.equal(overflowAltura.valid, false);
});

test('🛡️ Validación: rechaza stats fuera del rango 0-1000', () => {
  const invalidStat = validatePokemonPayload({
    nombre: 'Mewtwo',
    tipo: 'Psíquico',
    stats: { attack: 5000 },
  });
  assert.equal(invalidStat.valid, false);
  assert.match(invalidStat.error || '', /El stat 'attack' debe ser un entero entre 0 y 1.000/);
});

test('🛡️ Seguridad: validatePokemonPayload acepta payloads legítimos completos', () => {
  const result = validatePokemonPayload({
    nombre: 'Charizard',
    tipo: 'Fuego',
    tipos: ['Fuego', 'Volador'],
    fuerza: 84,
    imagen: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
    caracteristicas: {
      peso: 90.5,
      altura: 1.7,
      descripcion: 'Un Pokémon noble que escupe llamas intensas.',
      habitat: 'Montañas',
    },
    habilidades: ['Mar llamas', 'Poder solar'],
    stats: { hp: 78, attack: 84, defense: 78, sp_attack: 109, sp_defense: 85, speed: 100 },
  });
  assert.equal(result.valid, true);
});

test('⚡ Escalabilidad: cálculo de nextId con reduce soporta grandes colecciones sin stack overflow', () => {
  const largeCollection = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
  const nextId = largeCollection.reduce((max, p) => Math.max(max, p.id), 1008) + 1;
  assert.equal(nextId, 5001);
});
