import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLinear, LINEAR_API_URL } from '../../scripts/lib/linear.js';

test('🔗 Linear Client: constante LINEAR_API_URL apunta al endpoint oficial GraphQL', () => {
  assert.equal(LINEAR_API_URL, 'https://api.linear.app/graphql');
});

test('🔗 Linear Client: fetchLinear resuelve payload data ante respuesta GraphQL válida', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://api.linear.app/graphql');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.query, 'query { viewer { id } }');
      return new Response(JSON.stringify({ data: { viewer: { id: 'usr-123' } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await fetchLinear<{ viewer: { id: string } }>(
      'query { viewer { id } }',
      {},
      { apiKey: 'lin_api_test' },
    );
    assert.deepEqual(res, { viewer: { id: 'usr-123' } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('🔗 Linear Client: fetchLinear propaga error HTTP ante status no exitoso', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      return new Response('Unauthorized', { status: 401 });
    };

    await assert.rejects(async () => {
      await fetchLinear('query { viewer { id } }', {}, { apiKey: 'bad_token' });
    }, /Linear API HTTP Error 401/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('🔗 Linear Client: fetchLinear lanza error ante errores en el cuerpo GraphQL', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ errors: [{ message: 'Field not found on Type' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await assert.rejects(async () => {
      await fetchLinear('query { invalidField }', {}, { apiKey: 'lin_api_test' });
    }, /Linear GraphQL Error/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
