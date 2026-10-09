import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, nextClientIp, randomSecret, startApp, type RunningApp } from '../helpers/http-app.js';

const ADMIN_KEY = randomSecret('admin');

let server: RunningApp;
let previousKey: string | undefined;

before(async () => {
  previousKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  server = await startApp();
});

after(async () => {
  if (previousKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = previousKey;
  await server.close();
});

// Cada test usa su propia IP: el limitador de autenticación admite 5 peticiones por minuto y por IP.
const call = (path: string, options: Parameters<typeof api>[2] = {}) =>
  api(server.baseUrl, path, { clientIp: nextClientIp(), ...options });

const cookieOf = (setCookie: string | null) => (setCookie ?? '').split(';')[0];

/** Abre una sesión y devuelve la cookie y la IP con la que se emitió. */
async function login(): Promise<{ cookie: string; ip: string; expiresAt: number }> {
  const ip = nextClientIp();
  const res = await api(server.baseUrl, '/api/v1/auth/session', {
    method: 'POST',
    json: { apiKey: ADMIN_KEY },
    clientIp: ip,
  });
  assert.equal(res.status, 200);
  return { cookie: cookieOf(res.headers.get('set-cookie')), ip, expiresAt: res.body.expiresAt };
}

// ------------------------------------------------------------------------------
// POST /api/v1/auth/session
// ------------------------------------------------------------------------------
test('🔑 POST /auth/session: la clave correcta emite una cookie de sesión HttpOnly sin exponer el token', async () => {
  const res = await call('/api/v1/auth/session', { method: 'POST', json: { apiKey: ADMIN_KEY } });

  assert.equal(res.status, 200);
  assert.equal(res.body.authenticated, true);
  assert.ok(res.body.expires_in > 0);
  assert.ok(res.body.expiresAt > Date.now());
  assert.equal(res.body.token, undefined, 'el token solo viaja en la cookie');

  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /^pokedex_admin_session=.+/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);
});

test('🔑 POST /auth/session: ignora espacios alrededor de la clave', async () => {
  const res = await call('/api/v1/auth/session', { method: 'POST', json: { apiKey: `  ${ADMIN_KEY}  ` } });
  assert.equal(res.status, 200);
});

test('🔑 POST /auth/session: clave incorrecta, ausente o no textual responde 401 sin cookie', async () => {
  for (const json of [{ apiKey: 'incorrecta' }, {}, { apiKey: 12345 }, { apiKey: '' }]) {
    const res = await call('/api/v1/auth/session', { method: 'POST', json });
    assert.equal(res.status, 401, `payload ${JSON.stringify(json)}`);
    assert.match(res.body.detail, /inválida/);
    assert.equal(res.headers.get('set-cookie'), null);
  }
});

test('🔑 POST /auth/session: sin ADMIN_API_KEY en el servidor responde 503 (fail-closed)', async () => {
  delete process.env.ADMIN_API_KEY;
  try {
    const res = await call('/api/v1/auth/session', { method: 'POST', json: { apiKey: ADMIN_KEY } });
    assert.equal(res.status, 503);
    assert.match(res.body.detail, /ADMIN_API_KEY/);
  } finally {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  }
});

test('🔑 POST /auth/session: el limitador corta con 429 tras 5 intentos desde la misma IP', async () => {
  const ip = nextClientIp();
  const statuses: number[] = [];
  for (let i = 0; i < 7; i++) {
    const res = await api(server.baseUrl, '/api/v1/auth/session', {
      method: 'POST',
      json: { apiKey: 'mala' },
      clientIp: ip,
    });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.ok(
    statuses.slice(5).every((s) => s === 429),
    `los intentos 6 y 7 deben recibir 429, recibido ${statuses}`,
  );
});

// ------------------------------------------------------------------------------
// GET /api/v1/auth/session
// ------------------------------------------------------------------------------
test('🔍 GET /auth/session: sin token o con token inválido informa authenticated=false', async () => {
  const anonymous = await call('/api/v1/auth/session');
  assert.equal(anonymous.status, 200);
  assert.deepEqual(anonymous.body, { authenticated: false });

  const forged = await call('/api/v1/auth/session', { headers: { cookie: 'pokedex_admin_session=falso.falso' } });
  assert.equal(forged.status, 200);
  assert.deepEqual(forged.body, { authenticated: false });
});

test('🔍 GET /auth/session: la cookie emitida, el Bearer y X-Session-Token se reconocen como sesión vigente', async () => {
  const { cookie, expiresAt } = await login();
  const token = decodeURIComponent(cookie.split('=').slice(1).join('='));

  const byCookie = await call('/api/v1/auth/session', { headers: { cookie } });
  assert.equal(byCookie.body.authenticated, true);
  assert.equal(byCookie.body.expiresAt, expiresAt);

  const byBearer = await call('/api/v1/auth/session', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(byBearer.body.authenticated, true);

  const byHeader = await call('/api/v1/auth/session', { headers: { 'x-session-token': token } });
  assert.equal(byHeader.body.authenticated, true);
});

// ------------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ------------------------------------------------------------------------------
test('🚪 POST /auth/logout: limpia la cookie y revoca el token, que deja de ser válido', async () => {
  const { cookie } = await login();
  assert.equal((await call('/api/v1/auth/session', { headers: { cookie } })).body.authenticated, true);

  const out = await call('/api/v1/auth/logout', { method: 'POST', headers: { cookie } });
  assert.equal(out.status, 200);
  assert.match(out.body.detail, /revocado/);
  assert.match(out.headers.get('set-cookie') ?? '', /pokedex_admin_session=;.*Max-Age=0/);

  const after = await call('/api/v1/auth/session', { headers: { cookie } });
  assert.deepEqual(after.body, { authenticated: false }, 'el token revocado no debe reutilizarse (replay)');
});

test('🚪 POST /auth/logout: sin token responde 200 de forma idempotente', async () => {
  const res = await call('/api/v1/auth/logout', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=0/);
});

test('🚪 POST /auth/logout: un token con firma apócrifa responde 400', async () => {
  const forged = await call('/api/v1/auth/logout', {
    method: 'POST',
    headers: { cookie: 'pokedex_admin_session=eyJyb2xlIjoiYWRtaW4ifQ.firmafalsa' },
  });
  assert.equal(forged.status, 400);
  assert.match(forged.body.detail, /inválido|apócrifa/);
});
