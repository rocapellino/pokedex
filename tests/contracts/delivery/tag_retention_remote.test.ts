/**
 * ==============================================================================
 * tests/contracts/delivery/tag_retention_remote.test.ts
 *
 * Pruebas de integración y contrato para la capa de API remota de retención de tags:
 *   - Desreferenciación y borrado seguro de tags anotados vs tags ligeros.
 *   - Verificación estricta de precondiciones y detección de mutaciones concurrentes de SHA.
 *   - Rechazo estricto de prefijos o hashes incompletos/vacíos (sin startsWith, FAIL-CLOSED).
 *   - Detección de desfase entre el commit del inventario evaluado y el commit remoto previo a la purga.
 *   - Paginación estricta y corte de seguridad FAIL-CLOSED ante inventario truncado.
 *   - Manejo de códigos de estado HTTP (404, 401/403, 500).
 *   - Garantía determinista de que el modo dry-run y las fallas de precondición NUNCA invocan DELETE.
 *   - Verificación de integridad previa de los tags conservados antes de purgar.
 * ==============================================================================
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyTagRetention,
  deleteRemoteTag,
  enrichTagsWithRemoteRefs,
  fetchRemoteTagRef,
  fetchRemoteTags,
  parseStrictPositiveInt,
  revalidateGlobalRemoteInventory,
  type GitTagRef,
} from '../../../scripts/tag-retention.js';

// Constantes de hashes SHA-1 válidos (40 caracteres hexadecimales) para pruebas reproducibles
const SHA_TAG_ANNOTATED_1 = '1111111111111111111111111111111111111111';
const SHA_COMMIT_TARGET_2 = '2222222222222222222222222222222222222222';
const SHA_COMMIT_LIGHTWEIGHT_3 = '3333333333333333333333333333333333333333';
const SHA_TAG_ANNOTATED_4 = '4444444444444444444444444444444444444444';
const SHA_COMMIT_TARGET_5 = '5555555555555555555555555555555555555555';
const SHA_TAG_MUTATED_7 = '7777777777777777777777777777777777777777';
const SHA_COMMIT_MUTATED_9 = '9999999999999999999999999999999999999999';
const SHA_VALID_FALLBACK_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_VALID_FALLBACK_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test('🏷️ Remoto [P1]: fetchRemoteTagRef desreferencia tags anotados a su commit destino', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    // 1. Consulta de la referencia refs/tags/v3.0.0 (tag anotado)
    if (url.includes('/git/ref/tags/v3.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.0.0',
          object: {
            sha: SHA_TAG_ANNOTATED_1,
            type: 'tag',
            url: `https://api.github.com/repos/rocapellino/pokedex/git/tags/${SHA_TAG_ANNOTATED_1}`,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 2. Consulta del objeto tag para resolver el commit SHA
    if (url.includes(`/git/tags/${SHA_TAG_ANNOTATED_1}`)) {
      return new Response(
        JSON.stringify({
          sha: SHA_TAG_ANNOTATED_1,
          object: {
            sha: SHA_COMMIT_TARGET_2,
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
  assert.equal(refDetail.refSha, SHA_TAG_ANNOTATED_1);
  assert.equal(refDetail.targetCommitSha, SHA_COMMIT_TARGET_2);
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
            sha: SHA_COMMIT_LIGHTWEIGHT_3,
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
  assert.equal(refDetail.refSha, SHA_COMMIT_LIGHTWEIGHT_3);
  assert.equal(refDetail.targetCommitSha, SHA_COMMIT_LIGHTWEIGHT_3);
  assert.equal(callCount, 1, 'Solo debe realizar una única consulta HTTP');
});

test('🏷️ Remoto [P1]: deleteRemoteTag permite borrar tags anotados cuando coinciden commitSha y refSha exactos', async () => {
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
            sha: SHA_TAG_ANNOTATED_4,
            type: 'tag',
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes(`/git/tags/${SHA_TAG_ANNOTATED_4}`)) {
      return new Response(
        JSON.stringify({
          sha: SHA_TAG_ANNOTATED_4,
          object: {
            sha: SHA_COMMIT_TARGET_5,
            type: 'commit',
          },
        }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  const result = await deleteRemoteTag(
    'mock-token',
    'rocapellino',
    'pokedex',
    'v1.0.0',
    {
      commitSha: SHA_COMMIT_TARGET_5,
      refSha: SHA_TAG_ANNOTATED_4,
    },
    mockFetch,
  );

  assert.equal(result, true);
  assert.equal(deletedMethod, 'DELETE');
  const finalDeletedUrl = deletedUrl as unknown as string;
  assert.ok(typeof finalDeletedUrl === 'string' && finalDeletedUrl.includes('/git/refs/tags/v1.0.0'));
});

test('🏷️ Remoto [P1]: deleteRemoteTag detecta cuando un tag anotado muta de objeto tag aunque apunte al mismo commit', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    // La referencia ahora apunta a otro objeto tag
    if (url.includes('/git/ref/tags/v1.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: SHA_TAG_MUTATED_7,
            type: 'tag',
          },
        }),
        { status: 200 },
      );
    }

    // Pero el commit destino sigue siendo el mismo commit original
    if (url.includes(`/git/tags/${SHA_TAG_MUTATED_7}`)) {
      return new Response(
        JSON.stringify({
          sha: SHA_TAG_MUTATED_7,
          object: {
            sha: SHA_COMMIT_TARGET_5,
            type: 'commit',
          },
        }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  // Se intenta borrar con el refSha original
  await assert.rejects(
    async () => {
      await deleteRemoteTag(
        'mock-token',
        'rocapellino',
        'pokedex',
        'v1.0.0',
        {
          commitSha: SHA_COMMIT_TARGET_5,
          refSha: SHA_TAG_ANNOTATED_4,
        },
        mockFetch,
      );
    },
    {
      name: 'Error',
      message: /Conflicto concurrente en tag v1.0.0: el SHA de la referencia .* difiere del esperado/,
    },
  );
});

test('🏷️ Remoto [P1]: deleteRemoteTag aborta si para un tag anotado no se suministra el refSha esperado', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/git/ref/tags/v1.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: SHA_TAG_ANNOTATED_4,
            type: 'tag',
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes(`/git/tags/${SHA_TAG_ANNOTATED_4}`)) {
      return new Response(
        JSON.stringify({
          sha: SHA_TAG_ANNOTATED_4,
          object: {
            sha: SHA_COMMIT_TARGET_5,
            type: 'commit',
          },
        }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  // Solo se pasa commitSha sin refSha para un tag que en el remoto es anotado
  await assert.rejects(
    async () => {
      await deleteRemoteTag(
        'mock-token',
        'rocapellino',
        'pokedex',
        'v1.0.0',
        {
          commitSha: SHA_COMMIT_TARGET_5,
        },
        mockFetch,
      );
    },
    {
      name: 'Error',
      message: /Precondición no fiable para tag anotado v1.0.0: se requiere el SHA de referencia/,
    },
  );
});

test('🏷️ Remoto [P2]: fetchRemoteTagRef falla con error explícito si el endpoint del objeto tag devuelve error', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/git/ref/tags/v1.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: SHA_TAG_ANNOTATED_4,
            type: 'tag',
          },
        }),
        { status: 200 },
      );
    }

    // Falla la resolución del objeto tag con 500
    if (url.includes('/git/tags/')) {
      return new Response('Internal Server Error', { status: 500 });
    }

    return new Response('Not Found', { status: 404 });
  };

  await assert.rejects(
    async () => {
      await fetchRemoteTagRef('mock-token', 'rocapellino', 'pokedex', 'v1.0.0', mockFetch);
    },
    {
      name: 'Error',
      message: /Error 500 al resolver objeto tag anotado/,
    },
  );
});

test('🏷️ Remoto [P1]: deleteRemoteTag detecta mutaciones de SHA y aborta por seguridad (FAIL-CLOSED)', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/git/ref/tags/v1.0.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: SHA_COMMIT_MUTATED_9,
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
        {
          commitSha: SHA_COMMIT_TARGET_5,
        },
        mockFetch,
      );
    },
    {
      name: 'Error',
      message: /Conflicto concurrente en tag v1.0.0:/,
    },
  );
});

test('🏷️ Remoto [P1]: deleteRemoteTag rechaza prefijos y cadenas vacías o incompletas de SHA sin ejecutar DELETE', async () => {
  let deleteCalled = false;
  const mockFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({
        ref: 'refs/tags/v1.0.0',
        object: { sha: SHA_COMMIT_TARGET_5, type: 'commit' },
      }),
      { status: 200 },
    );
  };

  // 1. commitSha vacío
  await assert.rejects(
    async () => {
      await deleteRemoteTag('token', 'owner', 'repo', 'v1.0.0', { commitSha: '' }, mockFetch);
    },
    { name: 'Error', message: /commitSha \(''\) no es un hash de Git de 40 hex válido/ },
  );

  // 2. commitSha con prefijo corto (no 40 caracteres)
  await assert.rejects(
    async () => {
      await deleteRemoteTag('token', 'owner', 'repo', 'v1.0.0', { commitSha: '55555555' }, mockFetch);
    },
    { name: 'Error', message: /commitSha \('55555555'\) no es un hash de Git de 40 hex válido/ },
  );

  // 3. refSha con prefijo corto
  await assert.rejects(
    async () => {
      await deleteRemoteTag(
        'token',
        'owner',
        'repo',
        'v1.0.0',
        { commitSha: SHA_COMMIT_TARGET_5, refSha: '4444' },
        mockFetch,
      );
    },
    { name: 'Error', message: /refSha \('4444'\) no es un hash de Git de 40 hex válido/ },
  );

  assert.equal(deleteCalled, false, 'DELETE nunca debe ejecutarse ante SHAs incompletos o prefijos');
});

test('🏷️ Remoto [P2]: deleteRemoteTag exige precondición estructurada obligatoria y no ejecuta DELETE', async () => {
  let deleteCalled = false;
  const mockFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({
        ref: 'refs/tags/v1.0.0',
        object: { sha: SHA_COMMIT_TARGET_5, type: 'commit' },
      }),
      { status: 200 },
    );
  };

  await assert.rejects(
    async () => {
      // @ts-expect-error falta de parámetro intencional
      await deleteRemoteTag('token', 'owner', 'repo', 'v1.0.0', undefined, mockFetch);
    },
    {
      name: 'Error',
      message: /Precondición obligatoria ausente para tag v1.0.0/,
    },
  );

  assert.equal(deleteCalled, false, 'DELETE nunca debe ser llamado si falta la precondición');
});

test('🏷️ Remoto [P1]: fetchRemoteTagRef aborta si la API devuelve un SHA inválido o ausente', async () => {
  const mockFetchEmptySha: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        ref: 'refs/tags/v1.0.0',
        object: { sha: '', type: 'commit' },
      }),
      { status: 200 },
    );
  };

  await assert.rejects(
    async () => {
      await fetchRemoteTagRef('token', 'owner', 'repo', 'v1.0.0', mockFetchEmptySha);
    },
    {
      name: 'Error',
      message:
        /Estructura inválida o SHA malformado para refs\/tags\/v1.0.0: object.sha .* no es un hash de Git válido/,
    },
  );
});

test('🏷️ Remoto [P1]: applyTagRetention aborta si un tag a purgar muta su commit respecto al inventario evaluado', async () => {
  let deleteCalled = false;
  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    const url = input.toString();

    // 1. matching-refs para enriquecimiento del inventario inicial
    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v3.2.1', object: { sha: SHA_COMMIT_LIGHTWEIGHT_3, type: 'commit' } },
          { ref: 'refs/tags/v3.2.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
        ]),
        { status: 200 },
      );
    }

    // 2. Inventario: v3.2.1 (retiene), v3.2.0 (purga con commit TARGET_2)
    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_COMMIT_LIGHTWEIGHT_3 } },
          { name: 'v3.2.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        { status: 200 },
      );
    }

    // 2. Chequeo de integridad del retenido v3.2.1
    if (url.includes('/git/ref/tags/v3.2.1')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.1',
          object: { sha: SHA_COMMIT_LIGHTWEIGHT_3, type: 'commit' },
        }),
        { status: 200 },
      );
    }

    // 3. Captura previa de precondición para v3.2.0: ahora apunta a un commit DISTINTO (MUTATED_9)
    if (url.includes('/git/ref/tags/v3.2.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.0',
          object: { sha: SHA_COMMIT_MUTATED_9, type: 'commit' },
        }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  await assert.rejects(
    async () => {
      await applyTagRetention({
        token: 'token',
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
        /Conflicto concurrente en tag v3.2.0: el commit destino remoto .* difiere del SHA evaluado en el inventario/,
    },
  );

  assert.equal(deleteCalled, false, 'El método DELETE nunca debe llamarse ante mutación de commit');
});

test('🏷️ Remoto [P1]: fetchRemoteTags aborta de forma FAIL-CLOSED si se supera el límite de seguridad de páginas', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    const pageMatch = url.match(/page=(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;

    // Simular un lote de 2 items por página con link rel="next" y SHAs válidos
    return new Response(
      JSON.stringify([
        { name: `v1.${page}.0`, commit: { sha: SHA_VALID_FALLBACK_A } },
        { name: `v1.${page}.1`, commit: { sha: SHA_VALID_FALLBACK_B } },
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

  const result = await deleteRemoteTag(
    'mock-token',
    'rocapellino',
    'pokedex',
    'v9.9.9',
    {
      commitSha: SHA_COMMIT_TARGET_5,
    },
    mockFetch,
  );
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
        object: { sha: SHA_COMMIT_TARGET_5, type: 'commit' },
      }),
      { status: 200 },
    );
  };

  await assert.rejects(
    async () => {
      await deleteRemoteTag(
        'mock-token',
        'rocapellino',
        'pokedex',
        'v1.0.0',
        {
          commitSha: SHA_COMMIT_TARGET_5,
        },
        mockFetch,
      );
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
          { name: 'v3.2.0', commit: { sha: SHA_VALID_FALLBACK_A } },
          { name: 'v3.2.1', commit: { sha: SHA_VALID_FALLBACK_B } }, // se retiene
          { name: 'v1.0.0', commit: { sha: SHA_COMMIT_TARGET_5 } }, // candidato a purga por Major
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

    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v3.2.1', object: { sha: SHA_VALID_FALLBACK_A, type: 'commit' } },
          { ref: 'refs/tags/v3.2.0', object: { sha: SHA_VALID_FALLBACK_B, type: 'commit' } },
          { ref: 'refs/tags/v1.0.0', object: { sha: SHA_COMMIT_TARGET_5, type: 'commit' } },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_VALID_FALLBACK_A } }, // Retenido (último patch)
          { name: 'v3.2.0', commit: { sha: SHA_VALID_FALLBACK_B } }, // Candidato a purga (superado por v3.2.1)
          { name: 'v1.0.0', commit: { sha: SHA_COMMIT_TARGET_5 } }, // Retenido
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

test('🏷️ Remoto [P1]: applyTagRetention aborta si un tag anotado a purgar muta su refSha aunque preserve el commit', async () => {
  let deleteCalled = false;
  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    const url = input.toString();

    // 1. matching-refs enriquece el inventario inicial con refSha original
    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v3.2.1', object: { sha: SHA_COMMIT_LIGHTWEIGHT_3, type: 'commit' } },
          { ref: 'refs/tags/v3.2.0', object: { sha: SHA_TAG_ANNOTATED_1, type: 'tag' } },
        ]),
        { status: 200 },
      );
    }

    // 2. Inventario: v3.2.1 (retiene), v3.2.0 (purga)
    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_COMMIT_LIGHTWEIGHT_3 } },
          { name: 'v3.2.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        { status: 200 },
      );
    }

    // 3. Verificación de integridad de v3.2.1
    if (url.includes('/git/ref/tags/v3.2.1')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.1',
          object: { sha: SHA_COMMIT_LIGHTWEIGHT_3, type: 'commit' },
        }),
        { status: 200 },
      );
    }

    // 4. Verificación previa de v3.2.0: el commit sigue siendo SHA_COMMIT_TARGET_2,
    // pero el refSha mutó a SHA_TAG_MUTATED_7
    if (url.includes('/git/ref/tags/v3.2.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.0',
          object: { sha: SHA_TAG_MUTATED_7, type: 'tag' },
        }),
        { status: 200 },
      );
    }

    if (url.includes(`/git/tags/${SHA_TAG_MUTATED_7}`)) {
      return new Response(
        JSON.stringify({
          sha: SHA_TAG_MUTATED_7,
          object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' },
        }),
        { status: 200 },
      );
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
        /Conflicto concurrente en tag v3.2.0: el SHA de la referencia remota .* difiere del objeto evaluado en el inventario inicial/,
    },
  );

  assert.equal(deleteCalled, false, 'DELETE nunca debe ejecutarse ante mutación del objeto tag anotado');
});

test('🏷️ Remoto [P2]: applyTagRetention con dryRun=false aborta si un tag retenido muta de commit en el remoto', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v3.2.1', object: { sha: SHA_VALID_FALLBACK_A, type: 'commit' } },
          { ref: 'refs/tags/v3.2.0', object: { sha: SHA_VALID_FALLBACK_B, type: 'commit' } },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_VALID_FALLBACK_A } }, // Retenido
          { name: 'v3.2.0', commit: { sha: SHA_VALID_FALLBACK_B } }, // A purgar
        ]),
        { status: 200 },
      );
    }

    // El tag retenido v3.2.1 ahora apunta a un commit distinto
    if (url.includes('/git/ref/tags/v3.2.1')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.1',
          object: { sha: SHA_COMMIT_MUTATED_9, type: 'commit' },
        }),
        { status: 200 },
      );
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
      message: /Inconsistencia crítica: El tag retenido v3.2.1 mutó de commit en el remoto/,
    },
  );
});

test('🏷️ Remoto [P2]: applyTagRetention con dryRun=false aborta si un tag retenido muta de objeto de referencia', async () => {
  const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    // Inventario inicial: v3.2.1 tiene objeto SHA_TAG_ANNOTATED_1
    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v3.2.1', object: { sha: SHA_TAG_ANNOTATED_1, type: 'tag' } },
          { ref: 'refs/tags/v3.2.0', object: { sha: SHA_VALID_FALLBACK_B, type: 'commit' } },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_COMMIT_TARGET_2 } },
          { name: 'v3.2.0', commit: { sha: SHA_VALID_FALLBACK_B } },
        ]),
        { status: 200 },
      );
    }

    // Al verificar integridad: el tag retenido v3.2.1 ahora tiene refSha MUTATED_7
    if (url.includes('/git/ref/tags/v3.2.1')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.1',
          object: { sha: SHA_TAG_MUTATED_7, type: 'tag' },
        }),
        { status: 200 },
      );
    }

    if (url.includes(`/git/tags/${SHA_TAG_MUTATED_7}`)) {
      return new Response(
        JSON.stringify({
          sha: SHA_TAG_MUTATED_7,
          object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' },
        }),
        { status: 200 },
      );
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
      message: /Inconsistencia crítica: El tag retenido v3.2.1 mutó de objeto de referencia en el remoto/,
    },
  );
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs captura refSha de matching-refs y se degrada de forma segura', async () => {
  const mockFetchSuccess: typeof fetch = async () => {
    return new Response(
      JSON.stringify([
        { ref: 'refs/tags/v1.0.0', object: { sha: SHA_TAG_ANNOTATED_1, type: 'tag' } },
        { ref: 'refs/tags/v2.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
      ]),
      { status: 200 },
    );
  };

  const tags: GitTagRef[] = [
    { name: 'v1.0.0', sha: SHA_COMMIT_TARGET_2 },
    { name: 'v2.0.0', sha: SHA_COMMIT_TARGET_2 },
    { name: 'v3.0.0', sha: SHA_COMMIT_TARGET_2 },
  ];

  await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', tags, mockFetchSuccess);

  assert.equal(tags[0].refSha, SHA_TAG_ANNOTATED_1);
  assert.equal(tags[0].isAnnotated, true);
  assert.equal(tags[1].refSha, SHA_COMMIT_TARGET_2);
  assert.equal(tags[1].isAnnotated, false);
  assert.equal(tags[2].refSha, undefined);

  // Degradación segura ante error HTTP en modo no estricto
  const mockFetchError: typeof fetch = async () => {
    return new Response('Internal Server Error', { status: 500 });
  };
  await assert.doesNotReject(async () => {
    await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', tags, mockFetchError);
  });
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs con strict=true aborta ante error HTTP y nunca ejecuta DELETE', async () => {
  let deleteCalled = false;
  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    const url = input.toString();

    // 1. matching-refs falla con 500
    if (url.includes('/git/matching-refs/tags')) {
      return new Response('Internal Server Error', { status: 500 });
    }

    // 2. tags devuelve inventario
    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_COMMIT_LIGHTWEIGHT_3 } },
          { name: 'v3.2.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        { status: 200 },
      );
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
      message: /Fallo crítico en enriquecimiento de referencias remotas: Error 500 al consultar matching-refs/,
    },
  );

  assert.equal(deleteCalled, false, 'El método DELETE nunca debe ejecutarse ante fallo en matching-refs');
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs con strict=true aborta si un tag del inventario falta en matching-refs y nunca ejecuta DELETE', async () => {
  let deleteCalled = false;
  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    const url = input.toString();

    // 1. matching-refs devuelve SOLO v3.2.1 (falta v3.2.0)
    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([{ ref: 'refs/tags/v3.2.1', object: { sha: SHA_COMMIT_LIGHTWEIGHT_3, type: 'commit' } }]),
        { status: 200 },
      );
    }

    // 2. tags devuelve v3.2.1 y v3.2.0
    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_COMMIT_LIGHTWEIGHT_3 } },
          { name: 'v3.2.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        { status: 200 },
      );
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
      message: /Inventario incompleto: el tag v3.2.0 no se encontró en las referencias remotas de GitHub/,
    },
  );

  assert.equal(deleteCalled, false, 'El método DELETE nunca debe ejecutarse ante inventario incompleto');
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs soporta paginación múltiple y acumula referencias de varias páginas', async () => {
  const mockFetchPaged: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    const pageMatch = url.match(/[?&]page=(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;

    if (page === 1) {
      return new Response(
        JSON.stringify([{ ref: 'refs/tags/v1.0.0', object: { sha: SHA_TAG_ANNOTATED_1, type: 'tag' } }]),
        {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/rocapellino/pokedex/git/matching-refs/tags?page=2>; rel="next"',
          },
        },
      );
    }

    if (page === 2) {
      return new Response(
        JSON.stringify([{ ref: 'refs/tags/v2.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } }]),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify([]), { status: 200 });
  };

  const tags: GitTagRef[] = [
    { name: 'v1.0.0', sha: SHA_COMMIT_TARGET_2 },
    { name: 'v2.0.0', sha: SHA_COMMIT_TARGET_2 },
  ];

  await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', tags, {
    fetchFn: mockFetchPaged,
    strict: true,
  });

  assert.equal(tags[0].refSha, SHA_TAG_ANNOTATED_1);
  assert.equal(tags[0].isAnnotated, true);
  assert.equal(tags[1].refSha, SHA_COMMIT_TARGET_2);
  assert.equal(tags[1].isAnnotated, false);
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs aborta de forma FAIL-CLOSED si se supera maxPages', async () => {
  const mockFetchInfinite: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    const pageMatch = url.match(/[?&]page=(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;

    return new Response(
      JSON.stringify([{ ref: `refs/tags/v${page}.0.0`, object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } }]),
      {
        status: 200,
        headers: {
          Link: `<https://api.github.com/repos/rocapellino/pokedex/git/matching-refs/tags?page=${page + 1}>; rel="next"`,
        },
      },
    );
  };

  const tags: GitTagRef[] = [{ name: 'v1.0.0', sha: SHA_COMMIT_TARGET_2 }];

  await assert.rejects(
    async () => {
      await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', tags, {
        fetchFn: mockFetchInfinite,
        maxPages: 2,
        perPage: 1,
        strict: true,
      });
    },
    {
      name: 'Error',
      message: /Límite de seguridad superado en matching-refs: el repositorio contiene más de 2 referencias/,
    },
  );
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs aborta de forma FAIL-CLOSED si matching-refs contiene referencias no existentes en el inventario inicial (inconsistencia bidireccional)', async () => {
  const mockFetchExtraneous: typeof fetch = async () => {
    return new Response(
      JSON.stringify([
        { ref: 'refs/tags/v1.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
        { ref: 'refs/tags/v1.1.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } }, // Referencia extra no presente en tags
      ]),
      { status: 200 },
    );
  };

  const tags: GitTagRef[] = [{ name: 'v1.0.0', sha: SHA_COMMIT_TARGET_2 }];

  await assert.rejects(
    async () => {
      await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', tags, {
        fetchFn: mockFetchExtraneous,
        strict: true,
      });
    },
    {
      name: 'Error',
      message:
        /Inconsistencia bidireccional de inventario: se detectaron 1 referencias remotas en matching-refs que no existían en el inventario inicial/,
    },
  );
});

test('🏷️ Remoto [P1]: fetchRemoteTags y enrichTagsWithRemoteRefs completan con éxito cuando el inventario es exactamente igual al límite de páginas sin más resultados (prueba de frontera)', async () => {
  // Simular exactamente 2 páginas completas de 2 elementos = 4 tags en total, y la página 2 NO tiene rel="next"
  const mockBoundaryFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    const pageMatch = url.match(/[?&]page=(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;

    if (url.includes('/git/matching-refs/tags')) {
      if (page === 1) {
        return new Response(
          JSON.stringify([
            { ref: 'refs/tags/v1.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
            { ref: 'refs/tags/v1.1.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
          ]),
          {
            status: 200,
            headers: {
              Link: '<https://api.github.com/repos/rocapellino/pokedex/git/matching-refs/tags?page=2>; rel="next"',
            },
          },
        );
      }
      if (page === 2) {
        return new Response(
          JSON.stringify([
            { ref: 'refs/tags/v2.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
            { ref: 'refs/tags/v2.1.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
          ]),
          {
            status: 200,
            headers: {
              Link: '<https://api.github.com/repos/rocapellino/pokedex/git/matching-refs/tags?page=1>; rel="prev"',
            },
          },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }

    // fetchRemoteTags
    if (page === 1) {
      return new Response(
        JSON.stringify([
          { name: 'v1.0.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
          { name: 'v1.1.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/rocapellino/pokedex/tags?page=2>; rel="next"',
          },
        },
      );
    }
    if (page === 2) {
      return new Response(
        JSON.stringify([
          { name: 'v2.0.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
          { name: 'v2.1.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/rocapellino/pokedex/tags?page=1>; rel="prev"',
          },
        },
      );
    }

    return new Response(JSON.stringify([]), { status: 200 });
  };

  const remoteTags = await fetchRemoteTags('token', 'rocapellino', 'pokedex', {
    fetchFn: mockBoundaryFetch,
    maxPages: 2,
    perPage: 2,
  });

  assert.equal(remoteTags.length, 4, 'Debe procesar exactamente 4 tags en el límite de frontera sin fallar');

  await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', remoteTags, {
    fetchFn: mockBoundaryFetch,
    maxPages: 2,
    perPage: 2,
    strict: true,
  });

  assert.equal(
    remoteTags.every((t) => t.refSha === SHA_COMMIT_TARGET_2),
    true,
  );
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs con strict=true aborta ante referencia malformada con object.sha ausente o inválido (FAIL-CLOSED)', async () => {
  const mockFetchMalformedSha: typeof fetch = async () => {
    return new Response(
      JSON.stringify([
        { ref: 'refs/tags/v1.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
        { ref: 'refs/tags/v2.0.0', object: { sha: 'sha-invalido', type: 'commit' } },
      ]),
      { status: 200 },
    );
  };

  const tags: GitTagRef[] = [
    { name: 'v1.0.0', sha: SHA_COMMIT_TARGET_2 },
    { name: 'v2.0.0', sha: SHA_COMMIT_TARGET_2 },
  ];

  await assert.rejects(
    async () => {
      await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', tags, {
        fetchFn: mockFetchMalformedSha,
        strict: true,
      });
    },
    {
      name: 'Error',
      message:
        /Fallo crítico en enriquecimiento de referencias remotas: Referencia remota inválida o malformada .* object.sha .* ausente o no es un hash de Git válido/,
    },
  );
});

test('🏷️ Remoto [P1]: enrichTagsWithRemoteRefs con strict=true aborta ante referencia con ref inválido o nombre vacío (FAIL-CLOSED)', async () => {
  const mockFetchMalformedRef: typeof fetch = async () => {
    return new Response(
      JSON.stringify([
        { ref: 'refs/tags/v1.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
        { ref: 'refs/heads/feature', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
      ]),
      { status: 200 },
    );
  };

  const tags: GitTagRef[] = [{ name: 'v1.0.0', sha: SHA_COMMIT_TARGET_2 }];

  await assert.rejects(
    async () => {
      await enrichTagsWithRemoteRefs('token', 'rocapellino', 'pokedex', tags, {
        fetchFn: mockFetchMalformedRef,
        strict: true,
      });
    },
    {
      name: 'Error',
      message:
        /Fallo crítico en enriquecimiento de referencias remotas: Referencia remota malformada .* 'ref' .* no tiene el formato esperado/,
    },
  );
});

test('🏷️ Remoto [P1]: applyTagRetention con dryRun=false nunca ejecuta DELETE si matching-refs contiene una referencia malformada', async () => {
  let deleteCalled = false;
  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    const url = input.toString();

    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v3.2.1', object: { sha: SHA_VALID_FALLBACK_A, type: 'commit' } },
          { ref: 'refs/tags/v3.2.0', object: { sha: SHA_VALID_FALLBACK_B, type: 'commit' } },
          // Referencia adicional malformada sin SHA válido
          { ref: 'refs/tags/v9.9.9', object: { sha: 'corrupt-sha', type: 'commit' } },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_VALID_FALLBACK_A } },
          { name: 'v3.2.0', commit: { sha: SHA_VALID_FALLBACK_B } },
        ]),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  await assert.rejects(
    async () => {
      await applyTagRetention({
        token: 'token',
        owner: 'rocapellino',
        repo: 'pokedex',
        dryRun: false,
        fetchFn: mockFetch,
        protectedTags: new Map(),
      });
    },
    {
      name: 'Error',
      message: /Fallo crítico en enriquecimiento de referencias remotas: Referencia remota inválida o malformada/,
    },
  );

  assert.equal(deleteCalled, false, 'DELETE nunca debe ejecutarse ante respuestas malformadas en matching-refs');
});

test('🏷️ Remoto [P1]: revalidateGlobalRemoteInventory detecta alteraciones concurrentes del inventario global y aborta de forma FAIL-CLOSED', async () => {
  // Simular que en la revalidación el remoto devuelve un tag extra que no existía
  const mockFetchConcurrentChange: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes('/git/matching-refs/tags')) {
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v1.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
          { ref: 'refs/tags/v2.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
          // Tag nuevo publicado concurrentemente
          { ref: 'refs/tags/v3.0.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/tags?')) {
      return new Response(
        JSON.stringify([
          { name: 'v1.0.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
          { name: 'v2.0.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
          { name: 'v3.0.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  const expectedTags: GitTagRef[] = [
    { name: 'v1.0.0', sha: SHA_COMMIT_TARGET_2, refSha: SHA_COMMIT_TARGET_2 },
    { name: 'v2.0.0', sha: SHA_COMMIT_TARGET_2, refSha: SHA_COMMIT_TARGET_2 },
  ];

  await assert.rejects(
    async () => {
      await revalidateGlobalRemoteInventory('token', 'rocapellino', 'pokedex', expectedTags, {
        fetchFn: mockFetchConcurrentChange,
      });
    },
    {
      name: 'Error',
      message: /Inconsistencia concurrente en revalidación global: el número de tags remotos cambió de 2 a 3/,
    },
  );
});

test('🏷️ Remoto [P1]: applyTagRetention con dryRun=false ejecuta la revalidación global antes del primer borrado y aborta si el inventario mutó concurrentemente', async () => {
  let deleteCalled = false;
  let tagsCallsCount = 0;

  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleteCalled = true;
      return new Response(null, { status: 204 });
    }
    const url = input.toString();

    if (url.includes('/git/matching-refs/tags')) {
      if (tagsCallsCount === 1) {
        return new Response(
          JSON.stringify([
            { ref: 'refs/tags/v3.2.1', object: { sha: SHA_VALID_FALLBACK_A, type: 'commit' } },
            { ref: 'refs/tags/v3.2.0', object: { sha: SHA_VALID_FALLBACK_B, type: 'commit' } },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([
          { ref: 'refs/tags/v3.2.1', object: { sha: SHA_VALID_FALLBACK_A, type: 'commit' } },
          { ref: 'refs/tags/v3.2.0', object: { sha: SHA_VALID_FALLBACK_B, type: 'commit' } },
          { ref: 'refs/tags/v3.3.0', object: { sha: SHA_COMMIT_TARGET_2, type: 'commit' } },
        ]),
        { status: 200 },
      );
    }

    // Contador de llamadas a /tags? (inventario)
    if (url.includes('/tags?') && !url.includes('/git/')) {
      tagsCallsCount++;
      if (tagsCallsCount === 1) {
        // Primera consulta: inventario inicial (v3.2.1 retenido, v3.2.0 candidato a purga)
        return new Response(
          JSON.stringify([
            { name: 'v3.2.1', commit: { sha: SHA_VALID_FALLBACK_A } },
            { name: 'v3.2.0', commit: { sha: SHA_VALID_FALLBACK_B } },
          ]),
          { status: 200 },
        );
      }
      // Segunda consulta (revalidación global pre-borrado): apareció un nuevo tag v3.3.0 concurrentemente
      return new Response(
        JSON.stringify([
          { name: 'v3.2.1', commit: { sha: SHA_VALID_FALLBACK_A } },
          { name: 'v3.2.0', commit: { sha: SHA_VALID_FALLBACK_B } },
          { name: 'v3.3.0', commit: { sha: SHA_COMMIT_TARGET_2 } },
        ]),
        { status: 200 },
      );
    }

    // Precondiciones individuales para v3.2.1 y v3.2.0
    if (url.includes('/git/ref/tags/v3.2.1')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.1',
          object: { sha: SHA_VALID_FALLBACK_A, type: 'commit' },
        }),
        { status: 200 },
      );
    }

    if (url.includes('/git/ref/tags/v3.2.0')) {
      return new Response(
        JSON.stringify({
          ref: 'refs/tags/v3.2.0',
          object: { sha: SHA_VALID_FALLBACK_B, type: 'commit' },
        }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  await assert.rejects(
    async () => {
      await applyTagRetention({
        token: 'token',
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
        /Inconsistencia concurrente en revalidación global: el número de tags remotos cambió de 2 a 3 inmediatamente antes de iniciar la purga/,
    },
  );

  assert.equal(
    deleteCalled,
    false,
    'DELETE nunca debe ejecutarse si la revalidación global detecta cambio concurrente',
  );
});

test('🏷️ Validación [P1]: parseStrictPositiveInt valida enteros positivos estrictos y rechaza valores malformados', () => {
  // Valores válidos
  assert.equal(parseStrictPositiveInt('1', '--major'), 1);
  assert.equal(parseStrictPositiveInt('30', '--max-pages'), 30);
  assert.equal(parseStrictPositiveInt(42, 'customParam'), 42);

  // Valores malformados con sufijos alfanuméricos (caso del hallazgo: '3abc')
  assert.throws(
    () => parseStrictPositiveInt('3abc', '--max-pages'),
    /Valor malformado para '--max-pages': '3abc' no es un entero positivo válido/,
  );

  // Decimales, negativos, cero y caracteres extraños
  assert.throws(() => parseStrictPositiveInt('3.14', '--minor'), /Valor malformado para '--minor'/);
  assert.throws(() => parseStrictPositiveInt('0', '--patch'), /Valor malformado para '--patch'/);
  assert.throws(() => parseStrictPositiveInt('-5', '--major'), /Valor malformado para '--major'/);
  assert.throws(() => parseStrictPositiveInt('', '--max-pages'), /Valor malformado para '--max-pages'/);
  assert.throws(() => parseStrictPositiveInt('abc', '--max-pages'), /Valor malformado para '--max-pages'/);
  assert.throws(() => parseStrictPositiveInt(null, '--max-pages'), /Valor inválido para '--max-pages'/);
});

test('🏷️ Validación [P1]: applyTagRetention rechaza valores no numéricos o malformados en maxPages y configuración jerárquica', async () => {
  await assert.rejects(
    async () => {
      await applyTagRetention({
        maxPages: '3abc' as unknown as number,
      });
    },
    {
      name: 'Error',
      message: /Valor malformado para 'options.maxPages': '3abc' no es un entero positivo válido/,
    },
  );

  await assert.rejects(
    async () => {
      await applyTagRetention({
        config: {
          keepMajorCount: 'invalid' as unknown as number,
        },
      });
    },
    {
      name: 'Error',
      message: /Valor malformado para 'config.keepMajorCount': 'invalid' no es un entero positivo válido/,
    },
  );
});
