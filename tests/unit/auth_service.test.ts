import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getSessionSecret,
  generateSessionToken,
  verifyTokenSignature,
  verifySessionTokenDetailed,
  verifySessionToken,
  revokeSessionTokenDetailed,
  revokeSessionToken,
  isTokenRevoked,
} from '../../apps/backend/src/services/auth.js';

test('🔐 AuthService [Unit]: getSessionSecret opera con clave efímera en desarrollo y falla en producción', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.ADMIN_SESSION_SECRET;

  try {
    // 1. En entorno de test/dev retorna un secreto en memoria
    delete process.env.ADMIN_SESSION_SECRET;
    process.env.NODE_ENV = 'test';
    const secret = getSessionSecret();
    assert.ok(typeof secret === 'string' && secret.length >= 32);

    // 2. Si ADMIN_SESSION_SECRET está configurado, retorna el valor con trim()
    process.env.ADMIN_SESSION_SECRET = '  my-custom-admin-secret-key-1234567890  ';
    assert.equal(getSessionSecret(), 'my-custom-admin-secret-key-1234567890');

    // 3. En producción sin variable de entorno falla cerrado lanzando error
    delete process.env.ADMIN_SESSION_SECRET;
    process.env.NODE_ENV = 'production';
    assert.throws(() => getSessionSecret(), /ADMIN_SESSION_SECRET es obligatorio en producción/);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) {
      process.env.ADMIN_SESSION_SECRET = originalSecret;
    } else {
      delete process.env.ADMIN_SESSION_SECRET;
    }
  }
});

test('🔐 AuthService [Unit]: verifyTokenSignature valida formato estructural y delimitadores', () => {
  // Entradas no string o vacías
  assert.deepEqual(verifyTokenSignature(''), { valid: false, reason: 'invalid_format' });
  assert.deepEqual(verifyTokenSignature(null as any), { valid: false, reason: 'invalid_format' });
  assert.deepEqual(verifyTokenSignature(undefined as any), { valid: false, reason: 'invalid_format' });
  assert.deepEqual(verifyTokenSignature(12345 as any), { valid: false, reason: 'invalid_format' });

  // Delimitadores incorrectos
  assert.deepEqual(verifyTokenSignature('sin-punto'), { valid: false, reason: 'invalid_format' });
  assert.deepEqual(verifyTokenSignature('parte1.parte2.parte3'), { valid: false, reason: 'invalid_format' });
  assert.deepEqual(verifyTokenSignature('..'), { valid: false, reason: 'invalid_format' });
  assert.deepEqual(verifyTokenSignature('solo-un-punto-al-final.'), { valid: false, reason: 'invalid_signature' });
  assert.deepEqual(verifyTokenSignature('.payload-vacio'), { valid: false, reason: 'invalid_signature' });
});

test('🔐 AuthService [Unit]: verifyTokenSignature rechaza firmas HMAC manipuladas con timingSafeEqual', () => {
  const session = generateSessionToken();
  const [payloadBase64, signature] = session.token.split('.');

  // Firma alterada en longitud
  const shortenedSig = signature.slice(0, 10);
  assert.deepEqual(verifyTokenSignature(`${payloadBase64}.${shortenedSig}`), {
    valid: false,
    reason: 'invalid_signature',
  });

  // Firma alterada de igual longitud
  const corruptedChar = signature[0] === 'a' ? 'b' : 'a';
  const tamperedSig = corruptedChar + signature.slice(1);
  assert.deepEqual(verifyTokenSignature(`${payloadBase64}.${tamperedSig}`), {
    valid: false,
    reason: 'invalid_signature',
  });

  // Firma legítima pero generada con una clave secreta apócrifa distinta
  const attackerKey = crypto.randomBytes(32);
  const fakeSig = crypto.createHmac('sha256', attackerKey).update(payloadBase64).digest('base64url');
  assert.deepEqual(verifyTokenSignature(`${payloadBase64}.${fakeSig}`), { valid: false, reason: 'invalid_signature' });
});

test('🔐 AuthService [Unit]: verifyTokenSignature rechaza payloads JSON corruptos o no conformes', () => {
  const secret = getSessionSecret();
  const signCustom = (rawString: string) => {
    const b64 = Buffer.from(rawString, 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  };

  // JSON inválido / corrupto
  const invalidJsonToken = signCustom('{ "incompleto": true');
  assert.deepEqual(verifyTokenSignature(invalidJsonToken), { valid: false, reason: 'invalid_format' });

  // Payload con rol no permitido
  const userRoleToken = signCustom(JSON.stringify({ role: 'guest', exp: Date.now() + 60000, jti: '0123456789abcdef' }));
  assert.deepEqual(verifyTokenSignature(userRoleToken), { valid: false, reason: 'invalid_signature' });

  // Payload con jti ausente, no-string o con caracteres inválidos
  const noJtiToken = signCustom(JSON.stringify({ role: 'admin', exp: Date.now() + 60000 }));
  assert.deepEqual(verifyTokenSignature(noJtiToken), { valid: false, reason: 'invalid_signature' });

  const nonHexJtiToken = signCustom(
    JSON.stringify({ role: 'admin', exp: Date.now() + 60000, jti: 'xyz-not-hex-chars!' }),
  );
  assert.deepEqual(verifyTokenSignature(nonHexJtiToken), { valid: false, reason: 'invalid_signature' });

  const shortJtiToken = signCustom(JSON.stringify({ role: 'admin', exp: Date.now() + 60000, jti: '0123' }));
  assert.deepEqual(verifyTokenSignature(shortJtiToken), { valid: false, reason: 'invalid_signature' });

  // Payload con exp anómalo (negativo, cero, flotante, infinito, año > 2100)
  const negExpToken = signCustom(JSON.stringify({ role: 'admin', exp: -100, jti: '0123456789abcdef' }));
  assert.deepEqual(verifyTokenSignature(negExpToken), { valid: false, reason: 'invalid_signature' });

  const floatExpToken = signCustom(JSON.stringify({ role: 'admin', exp: 1720000000.123, jti: '0123456789abcdef' }));
  assert.deepEqual(verifyTokenSignature(floatExpToken), { valid: false, reason: 'invalid_signature' });

  const futureOverflowExp = signCustom(JSON.stringify({ role: 'admin', exp: 5000000000000, jti: '0123456789abcdef' }));
  assert.deepEqual(verifyTokenSignature(futureOverflowExp), { valid: false, reason: 'invalid_signature' });
});

test('🔐 AuthService [Unit]: generateSessionToken genera tokens válidos con jti de 32 caracteres hex', () => {
  const before = Date.now();
  const session = generateSessionToken(7200000); // 2 horas
  const after = Date.now();

  assert.ok(session.token.includes('.'));
  assert.equal(session.expiresIn, 7200);
  assert.ok(session.expiresAt >= before + 7200000 && session.expiresAt <= after + 7200000);

  const verification = verifyTokenSignature(session.token);
  assert.equal(verification.valid, true);
  assert.ok(verification.payload);
  assert.equal(verification.payload?.role, 'admin');
  assert.equal(verification.payload?.jti.length, 32);
  assert.match(verification.payload?.jti || '', /^[a-f0-9]{32}$/);
});

test('🔐 AuthService [Unit]: verifySessionToken detecta expiración cronológica', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });

  // Token generado con TTL mínimo (10 milisegundos)
  const fastExpiring = generateSessionToken(10);
  assert.equal(await verifySessionToken(fastExpiring.token), true, 'antes de expirar el token es válido');

  // Avanzar el reloj más allá de los 10ms
  t.mock.timers.tick(20);

  const result = await verifySessionTokenDetailed(fastExpiring.token);
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.reason, 'expired');
  }

  const isValidSimple = await verifySessionToken(fastExpiring.token);
  assert.equal(isValidSimple, false);
});

test('🔐 AuthService [Unit]: ciclo completo de revocación local de sesión', async () => {
  const originalRedis = process.env.REDIS_URL;
  try {
    delete process.env.REDIS_URL; // Asegurar modo de fallback local en memoria

    const session = generateSessionToken(60000);

    // Antes de revocación: token válido
    const validBefore = await verifySessionTokenDetailed(session.token);
    assert.equal(validBefore.valid, true);

    const isRevokedBefore = await isTokenRevoked(session.token);
    assert.equal(isRevokedBefore, false);

    // Revocar token
    const revokeResult = await revokeSessionTokenDetailed(session.token);
    assert.deepEqual(revokeResult, { success: true });

    // Después de revocación: rechazado por reason 'revoked'
    const validAfter = await verifySessionTokenDetailed(session.token);
    assert.equal(validAfter.valid, false);
    if (!validAfter.valid) {
      assert.equal(validAfter.reason, 'revoked');
    }

    const isRevokedAfter = await isTokenRevoked(session.token);
    assert.equal(isRevokedAfter, true);

    const validSimple = await verifySessionToken(session.token);
    assert.equal(validSimple, false);
  } finally {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
  }
});

test('🔐 AuthService [Unit]: revokeSessionToken rechaza tokens apócrifos y optimiza tokens ya expirados', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });

  // 1. Token apócrifo
  const badRevoke = await revokeSessionTokenDetailed('token.falso');
  assert.equal(badRevoke.success, false);
  if (!badRevoke.success) {
    assert.equal(badRevoke.reason, 'invalid_signature');
  }

  // 2. Token ya expirado cronológicamente retorna success: true inmediatamente
  const expiredSession = generateSessionToken(5);
  t.mock.timers.tick(15);

  const expiredRevoke = await revokeSessionTokenDetailed(expiredSession.token);
  assert.deepEqual(expiredRevoke, { success: true });
});

test('🔐 AuthService [Unit]: Fail-Closed ante REDIS_URL configurado pero Redis inaccesible', async () => {
  const originalRedis = process.env.REDIS_URL;
  try {
    // Simulamos un entorno multi-pod configurado con Redis no alcanzable
    process.env.REDIS_URL = 'redis://127.0.0.1:9';

    const session = generateSessionToken(60000);

    // En verifySessionTokenDetailed debe retornar service_unavailable
    const verifyRes = await verifySessionTokenDetailed(session.token);
    assert.equal(verifyRes.valid, false);
    if (!verifyRes.valid) {
      assert.equal(verifyRes.reason, 'service_unavailable');
    }

    // En revokeSessionTokenDetailed debe retornar service_unavailable
    const revokeRes = await revokeSessionTokenDetailed(session.token);
    assert.equal(revokeRes.success, false);
    if (!revokeRes.success) {
      assert.equal(revokeRes.reason, 'service_unavailable');
    }

    const revokeBool = await revokeSessionToken(session.token);
    assert.equal(revokeBool, false);
  } finally {
    if (originalRedis) {
      process.env.REDIS_URL = originalRedis;
    } else {
      delete process.env.REDIS_URL;
    }
  }
});

test('🔐 AuthService [Unit]: verifySessionToken rechaza un payload modificado que conserva la firma original', async () => {
  const session = generateSessionToken();
  const [, signature] = session.token.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ role: 'admin', exp: Date.now() + 100000, jti: '0123456789abcdef' }),
  ).toString('base64url');

  assert.deepEqual(verifyTokenSignature(`${tamperedPayload}.${signature}`), {
    valid: false,
    reason: 'invalid_signature',
  });
  assert.equal(await verifySessionToken(`${tamperedPayload}.${signature}`), false);
});

test('🔐 AuthService [Unit]: verifySessionToken rechaza entradas malformadas, vacías o nulas sin lanzar', async () => {
  assert.equal(await verifySessionToken(''), false);
  assert.equal(await verifySessionToken('not-a-token'), false);
  assert.equal(await verifySessionToken('header.payload.signature'), false);
  assert.equal(await verifySessionToken(null as any), false);
  assert.equal(await verifySessionToken(undefined as any), false);
});

test('🔐 AuthService [Unit]: verifyTokenSignature rechaza exp no numérico y jti de longitud excesiva', async () => {
  const secret = getSessionSecret();
  const sign = (payload: object) => {
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  };
  const validJti = '0123456789abcdef0123456789abcdef';

  // JSON.stringify(Infinity) produce null: el exp deja de ser numérico
  const infiniteExp = sign({ role: 'admin', exp: Infinity, jti: validJti });
  assert.deepEqual(verifyTokenSignature(infiniteExp), { valid: false, reason: 'invalid_signature' });
  assert.equal(await verifySessionToken(infiniteExp), false);

  // Control positivo: el mismo payload con un exp válido sí se acepta
  assert.equal(verifyTokenSignature(sign({ role: 'admin', exp: Date.now() + 60000, jti: validJti })).valid, true);

  const hugeJti = sign({ role: 'admin', exp: Date.now() + 60000, jti: 'a'.repeat(256) });
  assert.deepEqual(verifyTokenSignature(hugeJti), { valid: false, reason: 'invalid_signature' });
  assert.equal(await verifySessionToken(hugeJti), false);
});

test('🔐 AuthService [Unit]: en producción ADMIN_API_KEY no sustituye a ADMIN_SESSION_SECRET', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.ADMIN_SESSION_SECRET;
  const originalKey = process.env.ADMIN_API_KEY;

  try {
    delete process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_API_KEY = 'super-secret-api-key-only';
    process.env.NODE_ENV = 'production';

    assert.throws(() => getSessionSecret(), /Configuración de seguridad crítica faltante/);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.ADMIN_SESSION_SECRET = originalSecret;
    else delete process.env.ADMIN_SESSION_SECRET;
    if (originalKey) process.env.ADMIN_API_KEY = originalKey;
    else delete process.env.ADMIN_API_KEY;
  }
});

test('🔐 AuthService [Unit]: sin secreto configurado la clave efímera es de 32 bytes hex y estable en el proceso', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.ADMIN_SESSION_SECRET;

  try {
    delete process.env.ADMIN_SESSION_SECRET;
    process.env.NODE_ENV = 'development';

    const first = getSessionSecret();
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(getSessionSecret(), first, 'el mismo secreto durante el ciclo de vida del proceso');
    assert.notEqual(first, 'pokedex-internal-hmac-session-secret-entropy');
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.ADMIN_SESSION_SECRET = originalSecret;
    else delete process.env.ADMIN_SESSION_SECRET;
  }
});
