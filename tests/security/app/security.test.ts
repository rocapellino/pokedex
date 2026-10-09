import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePokemonPayload, validateImageUrl } from '../../../apps/backend/src/validation/pokemon.js';

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
  assert.equal(validateImageUrl('//evil.com/image.png'), false);
  assert.equal(validateImageUrl('http://evil.com/image.png'), false);

  assert.equal(
    validateImageUrl('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'),
    true,
  );
  assert.equal(validateImageUrl('/static/pokemon.png'), true);

  // localhost en desarrollo/test (HTTP permitido para tooling local)
  assert.equal(validateImageUrl('http://localhost:3000/images/pokemon.png'), true);
  assert.equal(validateImageUrl('http://127.0.0.1:3000/images/pokemon.png'), true);

  // localhost en producción (exige HTTPS o rutas locales relativas, rechazando HTTP inseguro)
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(validateImageUrl('http://localhost:3000/images/pokemon.png'), false);
    assert.equal(validateImageUrl('https://localhost:3000/images/pokemon.png'), true);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test('🛡️ Seguridad: validateImageUrl rechaza IPs privadas RFC 1918, IMDS e IPv6 restringidas (Anti-SSRF)', () => {
  // RFC 1918
  assert.equal(validateImageUrl('https://10.0.0.1/malicious.png'), false);
  assert.equal(validateImageUrl('https://172.16.0.1/malicious.png'), false);
  assert.equal(validateImageUrl('https://172.31.255.255/malicious.png'), false);
  assert.equal(validateImageUrl('https://192.168.1.1/malicious.png'), false);

  // Cloud Metadata IMDS
  assert.equal(validateImageUrl('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(validateImageUrl('https://metadata.google.internal/computeMetadata/v1/'), false);

  // Loopback / Non-routable
  assert.equal(validateImageUrl('https://0.0.0.0/test.png'), false);
  assert.equal(validateImageUrl('https://[::1]/test.png'), false);
});

test('🛡️ Seguridad: validatePokemonPayload rechaza valores numéricos corruptos con sufijos de texto', () => {
  const basePayload = {
    nombre: 'Pikachu',
    tipo: 'Eléctrico',
  };

  // Caracteristicas con string corrupto tipo '100abc'
  assert.equal(validatePokemonPayload({ ...basePayload, peso: '100abc' as any }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePayload, altura: '50px' as any }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePayload, fuerza: '10foo' as any }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePayload, caracteristicas: { peso: '200kg' as any } }).valid, false);

  // Stats con string corrupto tipo '500xyz' o decimales donde debe ser entero
  assert.equal(validatePokemonPayload({ ...basePayload, stats: { hp: '100abc' as any } }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePayload, stats: { attack: 55.5 } }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePayload, stats: { defense: NaN } }).valid, false);
  assert.equal(validatePokemonPayload({ ...basePayload, stats: { speed: Infinity } }).valid, false);
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

test('🛡️ Seguridad: validatePokemonPayload valida estructura y límites en evoluciones', () => {
  const validPayload = {
    nombre: 'Charmander',
    tipo: 'Fuego',
    evoluciones: [
      { id: 5, nombre: 'Charmeleon', etapa: 'Fase 1' },
      { id: 6, nombre: 'Charizard', etapa: 'Fase 2' },
    ],
  };
  assert.equal(validatePokemonPayload(validPayload).valid, true);

  // Rechaza inyección XSS en nombre de evolución
  const xssEvolution = {
    nombre: 'Charmander',
    tipo: 'Fuego',
    evoluciones: [{ id: 5, nombre: '<script>alert("xss")</script>' }],
  };
  assert.equal(validatePokemonPayload(xssEvolution).valid, false);

  // Rechaza URL insegura en imagen de evolución
  const badImgEvolution = {
    nombre: 'Charmander',
    tipo: 'Fuego',
    evoluciones: [{ id: 5, nombre: 'Charmeleon', imagen: 'javascript:alert(1)' }],
  };
  assert.equal(validatePokemonPayload(badImgEvolution).valid, false);
});
