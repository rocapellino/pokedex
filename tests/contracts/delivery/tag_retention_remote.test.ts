/**
 * ==============================================================================
 * tests/contracts/delivery/tag_retention_remote.test.ts
 *
 * Pruebas de integración y contrato para la capa de API remota de retención de tags:
 *   - Desreferenciación y borrado seguro de tags anotados vs tags ligeros.
 *   - Verificación de precondiciones y detección de mutaciones concurrentes de SHA.
 *   - Paginación estricta y corte de seguridad FAIL-CLOSED ante inventario truncado.
 *   - Manejo de códigos de estado HTTP (404, 403, 500).
 *   - Garantía determinista de que el modo dry-run nunca invoca el método DELETE.
 *   - Verificación de integridad previa de los tags conservados antes de purgar.
 * ==============================================================================
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyTagRetention,
  deleteRemoteTag,
  fetchRemoteTagRef,
  fetchRemoteTags,
} from '../../../scripts/tag-retention.js';

test('🏷️ Remoto [P1]: fetchRemoteTagRef desreferencia tags anotados a su commit destino', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    // 1. Consulta de la referencia refs/tags/v3.0.0 (tag anotado)
    if (url.includes('/git/ref/tags/v3.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.0.0',
          object: {
            sha: 'tag-object-sha-1111111111111111111111111111111111111111',
            type: 'tag',
            url: 'https://api.github.com/repos/rocapellino/pokedex/git/tags/tag-object-sha-1111111111111111111111111111111111111111',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 2. Consulta del objeto tag para resolver el commit SHA
    if (url.includes('/git/tags/tag-object-sha-1111111111111111111111111111111111111111')) {
      return new Response(
        JSON.stringify({
          sha: 'tag-object-sha-1111111111111111111111111111111111111111',
          object: {
            sha: 'commit-target-sha-2222222222222222222222222222222222222222',
            type: 'commit',
          },
          tag: 'v3.0.0',
          message: 'Release v3.0.0\n',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  const refDetail = await fetchRemoteTagRef('mock-token', 'rocapellino', 'pokedex', 'v3.0.0', mockFetch);

  assert.ok(refDetail, 'Debe devolver el detalle de la referencia');
  assert.equal(refDetail.isAnnotated, true, 'Debe identificar el tag como anotado');
  assert.equal(refDetail.refSha, 'tag-object-sha-1111111111111111111111111111111111111111');
  assert.equal(refDetail.targetCommitSha, 'commit-target-sha-2222222222222222222222222222222222222222');
});

test('🏷️ Remoto [P1]: fetchRemoteTagRef procesa tags ligeros sin llamadas secundarias innecesarias', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    callCount++;
    const url = input.toString();

    if (url.includes('/git/ref/tags/v2.1.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v2.1.0',
          object: {
            sha: 'lightweight-commit-sha-3333333333333333333333333333333333333333',
            type: 'commit',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  const refDetail = await fetchRemoteTagRef('mock-token', 'rocapellino', 'pokedex', 'v2.1.0', mockFetch);

  assert.ok(refDetail);
  assert.equal(refDetail.isAnnotated, false, 'Tag ligero no es anotado');
  assert.equal(refDetail.refSha, 'lightweight-commit-sha-3333333333333333333333333333333333333333');
  assert.equal(refDetail.targetCommitSha, 'lightweight-commit-sha-3333333333333333333333333333333333333333');
  assert.equal(callCount, 1, 'Solo debe realizar una única consulta HTTP');
});

test('🏷️ Remoto [P1]: deleteRemoteTag permite borrar tags anotados cuando expectedSha coincide con el commit destino', async () => {
  let deletedMethod: string | null = null;
  let deletedUrl: string | null = null;

  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();

    if (init?.method === 'DELETE') {
      deletedMethod = 'DELETE';
      deletedUrl = url;
      return new Response(null, { status: 204 });
    }

    if (url.includes('/git/ref/tags/v1.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: 'annotated-tag-obj-sha-4444444444444444444444444444444444444444',
            type: 'tag',
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes('/git/tags/annotated-tag-obj-sha-4444444444444444444444444444444444444444')) {
      return new Response(
        JSON.stringify({
          sha: 'annotated-tag-obj-sha-4444444444444444444444444444444444444444',
          object: {
            sha: 'commit-sha-from-tags-api-5555555555555555555555555555555555555555',
            type: 'commit',
          },
        }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  // En el flujo real, GET /tags entrega el commit.sha ('commit-sha-from-tags-api-5555...')
  const result = await deleteRemoteTag(
    'mock-token',
    'rocapellino',
    'pokedex',
    'v1.0.0',
    'commit-sha-from-tags-api-5555555555555555555555555555555555555555',
    mockFetch,
  );

  assert.equal(result, true);
  assert.equal(deletedMethod, 'DELETE');
  const finalDeletedUrl = deletedUrl as unknown as string;
  assert.ok(typeof finalDeletedUrl === 'string' && finalDeletedUrl.includes('/git/refs/tags/v1.0.0'));
});

test('🏷️ Remoto [P1]: deleteRemoteTag detecta mutaciones de SHA y aborta por seguridad (FAIL-CLOSED)', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/git/ref/tags/v1.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: 'mutated-commit-sha-9999999999999999999999999999999999999999',
            type: 'commit',
          },
        }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  await assert.rejects(
    async () => {
      await deleteRemoteTag(
        'mock-token',
        'rocapellino',
        'pokedex',
        'v1.0.0',
        'expected-original-sha-0000000000000000000000000000000000000000',
        mockFetch,
      );
    },
    {
      name: 'Error',
      message: /Conflicto concurrente en tag v1.0.0: SHA actual/,
    },
  );
});

test('🏷️ Remoto [P1]: fetchRemoteTags aborta de forma FAIL-CLOSED si se supera el límite de seguridad de páginas', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    const pageMatch = url.match(/page=(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;

    // Simular un lote de 2 items por página con link rel="next"
    return new Response(
      JSON.stringify([
        { name: `v1.${page}.0`, commit: { sha: `sha-${page}-0` } },
        { name: `v1.${page}.1`, commit: { sha: `sha-${page}-1` } },
      ]),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          Link: `<https://api.github.com/repos/rocapellino/pokedex/tags?page=${page + 1}>; rel="next"`,
        },
      },
    );
  };

  // Configurar límite en 2 páginas máximo
  await assert.rejects(
    async () => {
      await fetchRemoteTags('mock-token', 'rocapellino', 'pokedex', {
        maxPages: 2,
        perPage: 2,
        fetchFn: mockFetch,
      });
    },
    {
      name: 'Error',
      message:
        /Límite de seguridad superado: el repositorio contiene más de 4 tags \(2 páginas\)\. Detención de seguridad FAIL-CLOSED/,
    },
  );
});

test('🏷️ Remoto [P2]: fetchRemoteTags maneja errores HTTP 401/403 con mensajes claros', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response('Bad credentials', { status: 401 });
  };

  await assert.rejects(
    async () => {
      await fetchRemoteTags('bad-token', 'rocapellino', 'pokedex', { fetchFn: mockFetch });
    },
    {
      name: 'Error',
      message: /Error 401 al consultar tags de rocapellino\/pokedex: Bad credentials/,
    },
  );
});

test('🏷️ Remoto [P2]: fetchRemoteTagRef devuelve null de forma segura ante 404 (tag no existente)', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response('Not Found', { status: 404 });
  };

  const result = await fetchRemoteTagRef('mock-token', 'rocapellino', 'pokedex', 'v9.9.9', mockFetch);
  assert.equal(result, null);
});

test('🏷️ Remoto [P2]: deleteRemoteTag devuelve false si el tag ya no existe en el remoto', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response('Not Found', { status: 404 });
  };

  const result = await deleteRemoteTag('mock-token', 'rocapellino', 'pokedex', 'v9.9.9', undefined, mockFetch);
  assert.equal(result, false);
});

test('🏷️ Remoto [P2]: deleteRemoteTag maneja fallos HTTP 500 del endpoint DELETE', async () => {
  const mockFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      return new Response('Internal Server Error', { status: 500 });
    }
    return new Response(
      JSON.stringify({
        ref: 'refs/tags/v1.0.0',
        object: { sha: 'sha-1.0.0', type: 'commit' },
      }),
      { status: 200 },
    );
  };

  await assert.rejects(
    async () => {
      await deleteRemoteTag('mock-token', 'rocapellino', 'pokedex', 'v1.0.0', 'sha-1.0.0', mockFetch);
    },
    {
      name: 'Error',
      message: /Error 500 al eliminar refs\/tags\/v1.0.0: Internal Server Error/,
    },
  );
});

test('🏷️ Remoto [P2]: applyTagRetention con dryRun=true garantiza que NUNCA invoca el método DELETE', async () => {
  const httpMethodsUsed: string[] = [];

  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET';
    httpMethodsUsed.push(method);
    const url = input.toString();

    // Responder al inventario con tags históricos a purgar
    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.0', commit: { sha: 'sha-v320' } },
          { name: 'v3.2.1', commit: { sha: 'sha-v321' } }, // se retiene
          { name: 'v1.0.0', commit: { sha: 'sha-v100' } }, // candidato a purga por Major
        ]),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  const result = await applyTagRetention({
    token: 'valid-test-token',
    owner: 'rocapellino',
    repo: 'pokedex',
    dryRun: true,
    fetchFn: mockFetch,
    protectedTags: new Map(),
  });

  assert.equal(result.dryRun, true);
  assert.ok(result.pruned.length > 0, 'Debe identificar candidatos a purga');
  assert.ok(!httpMethodsUsed.includes('DELETE'), 'El método DELETE NUNCA debe ser invocado en modo dryRun=true');
});

test('🏷️ Remoto [P2]: applyTagRetention con dryRun=false aborta si un tag retenido falta en el remoto', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: 'sha-v321' } }, // Retenido (último patch)
          { name: 'v3.2.0', commit: { sha: 'sha-v320' } }, // Candidato a purga (superado por v3.2.1)
          { name: 'v1.0.0', commit: { sha: 'sha-v100' } }, // Retenido
        ]),
        { status: 200 },
      );
    }

    // La comprobación previa de integridad de v3.2.1 devuelve 404 (inconsistencia)
    if (url.includes('/git/ref/tags/v3.2.1')) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response('Not Found', { status: 404 });
  };

  await assert.rejects(
    async () => {
      await applyTagRetention({
        token: 'valid-test-token',
        owner: 'rocapellino',
        repo: 'pokedex',
        dryRun: false,
        fetchFn: mockFetch,
        protectedTags: new Map(),
      });
    },
    {
      name: 'Error',
      message:
        /Inconsistencia crítica: El tag retenido v3.2.1 no se encontró en el remoto. Abortando purga por seguridad./,
    },
  );
});
