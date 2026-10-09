import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, nextClientIp, startApp, type RunningApp } from '../helpers/http-app.js';

const ADMIN_KEY = 'test-admin-key-routes-pokemons-1234567890';
const IMAGE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png';
const auth = { 'x-api-key': ADMIN_KEY };

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  nombre: 'Rutamon',
  tipo: 'Fuego',
  fuerza: 70,
  imagen: IMAGE,
  caracteristicas: { peso: 5, altura: 1, habitat: 'Bosque' },
  ...overrides,
});

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

const call = (path: string, options: Parameters<typeof api>[2] = {}) =>
  api(server.baseUrl, path, { clientIp: nextClientIp(), ...options });

// ------------------------------------------------------------------------------
// Lectura
// ------------------------------------------------------------------------------
test('🌐 GET /pokemons: lista paginada con X-Total-Count, ETag y Cache-Control', async () => {
  const res = await call('/pokemons?limit=5');

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 5);
  assert.ok(Number(res.headers.get('x-total-count')) >= 5, 'X-Total-Count debe informar el total del catálogo');
  assert.match(res.headers.get('etag') ?? '', /^".+"$/);
  assert.match(res.headers.get('cache-control') ?? '', /max-age=60/);
  assert.match(res.headers.get('access-control-expose-headers') ?? '', /ETag/);
});

test('🌐 GET /pokemons: limit se acota al máximo de la API y offset avanza la página', async () => {
  const capped = await call('/pokemons?limit=100000');
  assert.equal(capped.status, 200);
  assert.ok(capped.body.length <= 100, 'limit debe acotarse al máximo de página');

  const first = await call('/pokemons?limit=2&offset=0');
  const second = await call('/pokemons?limit=2&offset=2');
  assert.equal(first.body.length, 2);
  assert.equal(second.body.length, 2);
  assert.notDeepEqual(
    first.body.map((p: { id: number }) => p.id),
    second.body.map((p: { id: number }) => p.id),
    'offset debe devolver una página distinta',
  );
});

test('🌐 GET /pokemons: filtra por tipo y por nombre; "all" no restringe', async () => {
  const all = await call('/pokemons?limit=100&tipo=all');
  const fire = await call('/pokemons?limit=100&tipo=Fuego');
  assert.equal(fire.status, 200);
  assert.ok(fire.body.length > 0 && fire.body.length < all.body.length);
  assert.ok(
    fire.body.every((p: { tipos: string[] }) => p.tipos.includes('Fuego')),
    'el filtro cubre también el tipo secundario',
  );

  const byName = await call('/pokemons?nombre=pikachu');
  assert.equal(byName.status, 200);
  assert.ok(byName.body.some((p: { nombre: string }) => p.nombre === 'Pikachu'));
  assert.ok(byName.body.every((p: { nombre: string }) => /pikachu/i.test(p.nombre)));
});

test('🌐 GET /pokemons: If-None-Match con el ETag vigente responde 304 sin cuerpo', async () => {
  const first = await call('/pokemons?limit=3');
  const etag = first.headers.get('etag') as string;

  const cached = await call('/pokemons?limit=3', { headers: { 'if-none-match': etag } });
  assert.equal(cached.status, 304);
  assert.equal(cached.text, '');
});

test('🌐 GET /pokemons/:id: devuelve el Pokémon, 304 con ETag, 400 si el id no es entero y 404 si no existe', async () => {
  const found = await call('/pokemons/25');
  assert.equal(found.status, 200);
  assert.equal(found.body.id, 25);
  assert.equal(found.body.nombre, 'Pikachu');

  const notModified = await call('/pokemons/25', { headers: { 'if-none-match': found.headers.get('etag') as string } });
  assert.equal(notModified.status, 304);

  const invalid = await call('/pokemons/abc');
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.detail, /número entero/);

  const missing = await call('/pokemons/999999');
  assert.equal(missing.status, 404);
  assert.match(missing.body.detail, /no encontrado/);
});

// ------------------------------------------------------------------------------
// Autenticación de las mutaciones
// ------------------------------------------------------------------------------
test('🔐 Mutaciones: sin credencial o con clave incorrecta responden 401 y no crean nada', async () => {
  const before = Number((await call('/pokemons?limit=1')).headers.get('x-total-count'));

  const anonymous = await call('/pokemons', { method: 'POST', json: validPayload() });
  assert.equal(anonymous.status, 401);

  const wrongKey = await call('/pokemons', { method: 'POST', json: validPayload(), headers: { 'x-api-key': 'otra' } });
  assert.equal(wrongKey.status, 401);

  const after = Number((await call('/pokemons?limit=1')).headers.get('x-total-count'));
  assert.equal(after, before, 'una mutación rechazada no debe alterar el catálogo');
});

test('🔐 Mutaciones: sin ADMIN_API_KEY configurada el servidor responde 503 (fail-closed)', async () => {
  delete process.env.ADMIN_API_KEY;
  try {
    const res = await call('/pokemons', { method: 'POST', json: validPayload(), headers: auth });
    assert.equal(res.status, 503);
    assert.match(res.body.detail, /ADMIN_API_KEY/);
  } finally {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  }
});

test('🔐 Mutaciones: una sesión emitida por /api/v1/auth/session (cookie) autoriza la edición con un Origin permitido', async () => {
  const created = await call('/pokemons', {
    method: 'POST',
    json: validPayload({ nombre: 'Sesionmon' }),
    headers: auth,
  });
  assert.equal(created.status, 201);

  const ip = nextClientIp();
  const session = await api(server.baseUrl, '/api/v1/auth/session', {
    method: 'POST',
    json: { apiKey: ADMIN_KEY },
    clientIp: ip,
  });
  assert.equal(session.status, 200);
  const cookie = (session.headers.get('set-cookie') as string).split(';')[0];

  // Sin CORS_ORIGINS, la capa CORS y la defensa CSRF aceptan los orígenes locales de desarrollo.
  const withOrigin = await api(server.baseUrl, `/pokemons/${created.body.id}`, {
    method: 'PUT',
    json: { fuerza: 99 },
    clientIp: ip,
    headers: { cookie, origin: 'http://localhost:3000' },
  });
  assert.equal(withOrigin.status, 200);
  assert.equal(withOrigin.body.fuerza, 99);

  const withoutOrigin = await api(server.baseUrl, `/pokemons/${created.body.id}`, {
    method: 'PUT',
    json: { fuerza: 11 },
    clientIp: ip,
    headers: { cookie },
  });
  assert.equal(withoutOrigin.status, 403, 'una mutación por cookie sin Origin ni Referer debe rechazarse (CSRF)');
});

// ------------------------------------------------------------------------------
// Alta, edición y baja
// ------------------------------------------------------------------------------
test('✏️ POST /pokemons: valida el payload (422) y crea el Pokémon (201) disponible en la lectura', async () => {
  const hostile = await call('/pokemons', {
    method: 'POST',
    json: validPayload({ nombre: '<script>x</script>' }),
    headers: auth,
  });
  assert.equal(hostile.status, 422);
  assert.match(hostile.body.detail, /HTML|scripts/);

  const created = await call('/pokemons', { method: 'POST', json: validPayload(), headers: auth });
  assert.equal(created.status, 201);
  assert.equal(created.body.nombre, 'Rutamon');
  assert.ok(Number.isInteger(created.body.id));

  const read = await call(`/pokemons/${created.body.id}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.nombre, 'Rutamon');
  assert.equal(read.body.tipo, 'Fuego');
});

test('✏️ PUT /pokemons/:id: fusiona los campos enviados, conserva el resto y valida el resultado', async () => {
  const created = await call('/pokemons', { method: 'POST', json: validPayload({ nombre: 'Editmon' }), headers: auth });
  const id = created.body.id;

  const updated = await call(`/pokemons/${id}`, { method: 'PUT', json: { fuerza: 88 }, headers: auth });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.fuerza, 88);
  assert.equal(updated.body.nombre, 'Editmon', 'los campos no enviados se conservan');

  const persisted = await call(`/pokemons/${id}`);
  assert.equal(persisted.body.fuerza, 88);

  const invalid = await call(`/pokemons/${id}`, { method: 'PUT', json: { fuerza: 'mucha' }, headers: auth });
  assert.equal(invalid.status, 422);

  const badId = await call('/pokemons/abc', { method: 'PUT', json: { fuerza: 1 }, headers: auth });
  assert.equal(badId.status, 400);

  const missing = await call('/pokemons/999999', { method: 'PUT', json: { fuerza: 1 }, headers: auth });
  assert.equal(missing.status, 404);
});

test('🗑️ DELETE /pokemons/:id: elimina el Pokémon y la lectura posterior responde 404', async () => {
  const created = await call('/pokemons', {
    method: 'POST',
    json: validPayload({ nombre: 'Borramon' }),
    headers: auth,
  });
  const id = created.body.id;

  const removed = await call(`/pokemons/${id}`, { method: 'DELETE', headers: auth });
  assert.equal(removed.status, 200);
  assert.match(removed.body.mensaje, /eliminado correctamente/);
  assert.equal(removed.body.pokemon_eliminado.nombre, 'Borramon');

  assert.equal((await call(`/pokemons/${id}`)).status, 404);
  assert.equal((await call(`/pokemons/${id}`, { method: 'DELETE', headers: auth })).status, 404);
  assert.equal((await call('/pokemons/abc', { method: 'DELETE', headers: auth })).status, 400);
});
