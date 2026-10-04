import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_PAGE_SIZE, fetchAllPokemons } from '../../apps/frontend/src/shared/api.js';

/**
 * Regresión (pre-prod, 2026-10-04): con el catálogo nacional (1025) la vista
 * pública mostraba solo 50 Pokémon, porque fetchAllPokemons() pedía `/pokemons`
 * sin parámetros y la API devuelve una página por defecto.
 */
function stubCatalog(total: number) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.pathname + url.search);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({ id: offset + i + 1, nombre: `P${offset + i + 1}` }));
    return new Response(JSON.stringify(items), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Total-Count': String(total) } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('🧭 Catálogo: fetchAllPokemons descarga todas las páginas hasta X-Total-Count', async () => {
  const stub = stubCatalog(1025);
  try {
    const pokemons = await fetchAllPokemons();
    assert.equal(pokemons.length, 1025);
    assert.deepEqual(pokemons.map((p) => p.id), Array.from({ length: 1025 }, (_, i) => i + 1), 'Sin huecos ni duplicados');
    assert.equal(stub.calls.length, Math.ceil(1025 / CATALOG_PAGE_SIZE));
    assert.ok(stub.calls.every((c) => c.includes(`limit=${CATALOG_PAGE_SIZE}`)), 'Cada página debe pedir el máximo permitido por la API');
  } finally {
    stub.restore();
  }
});

test('🧭 Catálogo: un catálogo menor a una página se resuelve con una sola petición', async () => {
  const stub = stubCatalog(35);
  try {
    assert.equal((await fetchAllPokemons()).length, 35);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test('🧭 Catálogo: termina aunque el total cambie durante la descarga', async () => {
  const stub = stubCatalog(0);
  try {
    assert.deepEqual(await fetchAllPokemons(), []);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});
