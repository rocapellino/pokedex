import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePokemonPayload, validateImageUrl } from '../src/validation/pokemon.js';
import {
  generateSessionToken,
  verifySessionToken,
  revokeSessionToken,
  getSessionSecret,
  verifyTokenSignature,
} from '../src/services/auth.js';
import crypto from 'crypto';

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

  assert.equal(validateImageUrl('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'), true);
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

test('⚡ Escalabilidad: cálculo de nextId con reduce soporta grandes colecciones sin stack overflow', () => {
  const largeCollection = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
  const nextId = largeCollection.reduce((max, p) => Math.max(max, p.id), 1008) + 1;
  assert.equal(nextId, 5001);
});

test('🔐 Auth Session: generateSessionToken genera token HMAC válido y estructurado', async () => {
  const session = generateSessionToken();
  assert.ok(session.token);
  assert.ok(session.expiresIn > 0);
  assert.ok(session.expiresAt > Date.now());
  assert.equal(await verifySessionToken(session.token), true);
});

test('🔐 Auth Session: verifySessionToken rechaza tokens expirados', async () => {
  // Generar token con TTL de 10ms
  const expiredSession = generateSessionToken(10);
  await new Promise(r => setTimeout(r, 25));
  assert.equal(await verifySessionToken(expiredSession.token), false);
});

test('🔐 Auth Session: verifySessionToken rechaza firmas alteradas o datos modificados', async () => {
  const session = generateSessionToken();
  const [b64Payload, signature] = session.token.split('.');
  
  // Alterar firma
  const tamperedSig = signature.slice(0, -2) + 'aa';
  assert.equal(await verifySessionToken(`${b64Payload}.${tamperedSig}`), false);

  // Alterar payload decodificado
  const tamperedPayload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 100000, jti: 'test' })).toString('base64url');
  assert.equal(await verifySessionToken(`${tamperedPayload}.${signature}`), false);
});

test('🔐 Auth Session: verifySessionToken rechaza tokens malformados, vacíos o nulos', async () => {
  assert.equal(await verifySessionToken(''), false);
  assert.equal(await verifySessionToken('not-a-token'), false);
  assert.equal(await verifySessionToken('header.payload.signature'), false);
  assert.equal(await verifySessionToken(null as any), false);
  assert.equal(await verifySessionToken(undefined as any), false);
});

test('🔐 Auth Session: verifyTokenSignature rechaza límites y tipos anómalos en payload (exp, jti, role)', async () => {
  const secret = getSessionSecret();

  const sign = (payload: any) => {
    const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(pB64).digest('base64url');
    return `${pB64}.${sig}`;
  };

  // 1. exp = Infinity
  const tokenInf = sign({ role: 'admin', exp: Infinity, jti: '0123456789abcdef0123456789abcdef' });
  assert.equal(verifyTokenSignature(tokenInf).valid, false);
  assert.equal(await verifySessionToken(tokenInf), false);

  // 2. exp descomunal (> año 2100)
  const tokenOverYear2100 = sign({ role: 'admin', exp: 999999999999999999, jti: '0123456789abcdef0123456789abcdef' });
  assert.equal(verifyTokenSignature(tokenOverYear2100).valid, false);
  assert.equal(await verifySessionToken(tokenOverYear2100), false);

  // 3. exp negativo o cero
  const tokenNeg = sign({ role: 'admin', exp: -500, jti: '0123456789abcdef0123456789abcdef' });
  assert.equal(verifyTokenSignature(tokenNeg).valid, false);
  assert.equal(await verifySessionToken(tokenNeg), false);

  // 4. exp float no entero
  const tokenFloat = sign({ role: 'admin', exp: 1725800000.5, jti: '0123456789abcdef0123456789abcdef' });
  assert.equal(verifyTokenSignature(tokenFloat).valid, false);
  assert.equal(await verifySessionToken(tokenFloat), false);

  // 5. jti excesivamente largo (>64 chars)
  const hugeJti = 'a'.repeat(256);
  const tokenHugeJti = sign({ role: 'admin', exp: Date.now() + 60000, jti: hugeJti });
  assert.equal(verifyTokenSignature(tokenHugeJti).valid, false);
  assert.equal(await verifySessionToken(tokenHugeJti), false);

  // 6. jti no hexadecimal
  const tokenNonHexJti = sign({ role: 'admin', exp: Date.now() + 60000, jti: 'not-hex-characters-!!!' });
  assert.equal(verifyTokenSignature(tokenNonHexJti).valid, false);
  assert.equal(await verifySessionToken(tokenNonHexJti), false);

  // 7. role apócrifo
  const tokenUserRole = sign({ role: 'user', exp: Date.now() + 60000, jti: '0123456789abcdef0123456789abcdef' });
  assert.equal(verifyTokenSignature(tokenUserRole).valid, false);
  assert.equal(await verifySessionToken(tokenUserRole), false);
});

test('🔐 Auth Session: getSessionSecret falla cerrado en producción si no hay secretos configurados', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.ADMIN_SESSION_SECRET;
  const originalKey = process.env.ADMIN_API_KEY;

  try {
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_API_KEY;
    process.env.NODE_ENV = 'production';

    assert.throws(() => {
      getSessionSecret();
    }, /Configuración de seguridad crítica faltante/);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.ADMIN_SESSION_SECRET = originalSecret;
    if (originalKey) process.env.ADMIN_API_KEY = originalKey;
  }
});

test('🔐 Auth Session: getSessionSecret en producción exige ADMIN_SESSION_SECRET y no acepta ADMIN_API_KEY como fallback', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.ADMIN_SESSION_SECRET;
  const originalKey = process.env.ADMIN_API_KEY;

  try {
    delete process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_API_KEY = 'super-secret-api-key-only';
    process.env.NODE_ENV = 'production';

    assert.throws(() => {
      getSessionSecret();
    }, /ADMIN_SESSION_SECRET es obligatorio en producción/);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.ADMIN_SESSION_SECRET = originalSecret;
    if (originalKey) process.env.ADMIN_API_KEY = originalKey;
  }
});

test('🔐 Auth Session: getSessionSecret genera clave efímera segura en modo desarrollo/test', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.ADMIN_SESSION_SECRET;
  const originalKey = process.env.ADMIN_API_KEY;

  try {
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_API_KEY;
    process.env.NODE_ENV = 'development';

    const key1 = getSessionSecret();
    const key2 = getSessionSecret();

    assert.ok(key1 && typeof key1 === 'string');
    assert.equal(key1.length, 64); // 32 bytes hex
    assert.equal(key1, key2); // Mismo secreto por ciclo de vida
    assert.notEqual(key1, 'pokedex-internal-hmac-session-secret-entropy');
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.ADMIN_SESSION_SECRET = originalSecret;
    if (originalKey) process.env.ADMIN_API_KEY = originalKey;
  }
});

test('🔐 Auth Session: revokeSessionToken revoca el token por jti y verifySessionToken lo rechaza inmediatamente', async () => {
  const { token } = generateSessionToken();
  assert.equal(await verifySessionToken(token), true);

  const revoked = await revokeSessionToken(token);
  assert.equal(revoked, true);
  assert.equal(await verifySessionToken(token), false);
});

test('🔐 Auth Session: revokeSessionToken con token de corta duración expira y se autolimpia', async () => {
  // Generar token con 30ms de validez
  const { token } = generateSessionToken(30);
  assert.equal(await verifySessionToken(token), true);

  await revokeSessionToken(token);
  assert.equal(await verifySessionToken(token), false);

  // Esperar a que el token expire naturalmente
  await new Promise(r => setTimeout(r, 50));
  // Debe seguir siendo rechazado por haber expirado
  assert.equal(await verifySessionToken(token), false);
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
    evoluciones: [
      { id: 5, nombre: '<script>alert("xss")</script>' },
    ],
  };
  assert.equal(validatePokemonPayload(xssEvolution).valid, false);

  // Rechaza URL insegura en imagen de evolución
  const badImgEvolution = {
    nombre: 'Charmander',
    tipo: 'Fuego',
    evoluciones: [
      { id: 5, nombre: 'Charmeleon', imagen: 'javascript:alert(1)' },
    ],
  };
  assert.equal(validatePokemonPayload(badImgEvolution).valid, false);
});


