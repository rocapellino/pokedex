import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionCookie, extractSessionTokenFromRequest } from '../../apps/backend/server.js';

test('🍪 Sesión [Unit]: extractSessionTokenFromRequest lee el token de la cookie HttpOnly', () => {
  const req = {
    headers: {
      cookie: 'pokedex_admin_session=abc123.token; other=value',
    },
  } as any;

  assert.equal(extractSessionTokenFromRequest(req), 'abc123.token');
});

test('🍪 Sesión [Unit]: buildSessionCookie emite una cookie segura con HttpOnly, Secure y SameSite', () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const cookie = buildSessionCookie('abc123.token', 3600);
    assert.match(cookie, /pokedex_admin_session=abc123\.token/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Max-Age=3600/i);
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});
