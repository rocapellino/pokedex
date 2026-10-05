/**
 * ==============================================================================
 * CSRF en mutaciones administrativas autenticadas por cookie (AUD-SEC-CSRF-001)
 * ==============================================================================
 *
 * verifyAdmin comparaba el origen con `originHost.includes(req.headers.host)`:
 * `http://pokedex.lan.evil.test` contiene `pokedex.lan` y pasaba. Además, una
 * mutación por cookie sin `Origin` ni `Referer` no se validaba. Los navegadores
 * envían `Origin` en todo POST/PUT/PATCH/DELETE, así que exigirlo no afecta al
 * frontend; los clientes sin navegador usan Bearer o API key, que no son cookie.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { verifyAdmin } from '../../apps/backend/src/middleware/auth.js';
import { generateSessionToken } from '../../apps/backend/src/services/auth.js';

process.env.ADMIN_API_KEY = 'test-admin-api-key-csrf-0123456789abcdef';
delete process.env.REDIS_URL;
delete process.env.CORS_ORIGINS;

const HOST = 'pokedex.proxmox.internal.lan';

interface Outcome {
  status: number | null;
  nextCalled: boolean;
}

async function runVerifyAdmin(method: string, headers: Record<string, string>): Promise<Outcome> {
  const outcome: Outcome = { status: null, nextCalled: false };
  const req = {
    method,
    path: '/pokemons',
    headers: { host: HOST, ...headers },
    ip: '10.0.0.1',
    socket: {},
  } as unknown as Request;
  const res = {
    status(code: number) {
      outcome.status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  await verifyAdmin(req, res, () => {
    outcome.nextCalled = true;
  });
  return outcome;
}

function sessionCookie(): string {
  return `pokedex_admin_session=${encodeURIComponent(generateSessionToken().token)}`;
}

test('🛡️ AUD-SEC-CSRF-001: rechaza un origen que solo contiene el host como subcadena', async () => {
  const result = await runVerifyAdmin('POST', { cookie: sessionCookie(), origin: `http://${HOST}.evil.test` });
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 403);
});

test('🛡️ AUD-SEC-CSRF-001: rechaza una mutación por cookie sin Origin ni Referer', async () => {
  const result = await runVerifyAdmin('DELETE', { cookie: sessionCookie() });
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 403);
});

test('🛡️ AUD-SEC-CSRF-001: acepta una mutación por cookie desde el mismo host', async () => {
  const result = await runVerifyAdmin('POST', { cookie: sessionCookie(), origin: `https://${HOST}` });
  assert.equal(result.nextCalled, true);
});

test('🛡️ AUD-SEC-CSRF-001: acepta un Referer del mismo host cuando falta Origin', async () => {
  const result = await runVerifyAdmin('PUT', { cookie: sessionCookie(), referer: `https://${HOST}/backoffice.html` });
  assert.equal(result.nextCalled, true);
});

test('🛡️ AUD-SEC-CSRF-001: acepta un origen configurado en CORS_ORIGINS', async () => {
  process.env.CORS_ORIGINS = 'https://admin.internal.lan';
  try {
    const result = await runVerifyAdmin('POST', { cookie: sessionCookie(), origin: 'https://admin.internal.lan' });
    assert.equal(result.nextCalled, true);
  } finally {
    delete process.env.CORS_ORIGINS;
  }
});

test('🛡️ AUD-SEC-CSRF-001: Bearer sin Origin no es CSRF-able y se acepta', async () => {
  const result = await runVerifyAdmin('POST', { authorization: `Bearer ${generateSessionToken().token}` });
  assert.equal(result.nextCalled, true);
});

test('🛡️ AUD-SEC-CSRF-001: las lecturas por cookie no exigen Origin', async () => {
  const result = await runVerifyAdmin('GET', { cookie: sessionCookie() });
  assert.equal(result.nextCalled, true);
});
