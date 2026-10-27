/**
 * ==============================================================================
 * scripts/tag-retention/remote-api.ts
 *
 * Capa de interacción remota con GitHub REST API (Tags, Git Data & Matching-Refs).
 * Implementa controles estrictos FAIL-CLOSED y verificación en dos fases para precondiciones.
 * ==============================================================================
 */

import { areShasEqual, isValidGitSha } from './semver.ts';
import type { EnrichTagsOptions, GitRemoteRefDetail, GitTagRef, TagDeletePrecondition } from './types.ts';

function hasMorePages(linkHeader: string | null | undefined, dataLength: number, perPage: number): boolean {
  if (typeof linkHeader === 'string') {
    return linkHeader.includes('rel="next"');
  }
  return dataLength === perPage;
}

/**
 * Consulta los tags remotos de GitHub vía REST API paginada.
 * Implementa control estricto FAIL-CLOSED: si se alcanza el límite máximo de páginas
 * y todavía hay datos pendientes en el remoto, aborta inmediatamente para evitar
 * cálculos de retención o planes de purga sobre un inventario incompleto.
 */
export async function fetchRemoteTags(
  token: string,
  owner: string,
  repo: string,
  options: { maxPages?: number; perPage?: number; fetchFn?: typeof fetch } = {},
): Promise<GitTagRef[]> {
  const tags: GitTagRef[] = [];
  let page = 1;
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 30; // 3.000 tags máximo por defecto
  const fetchFn = options.fetchFn ?? fetch;

  while (true) {
    if (page > maxPages) {
      throw new Error(
        `Límite de seguridad alcanzado: el inventario excede el tope de ${maxPages * perPage} tags (${maxPages} páginas). Detención de seguridad FAIL-CLOSED para evitar purgas destructivas sobre un inventario incompleto.`,
      );
    }

    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=${perPage}&page=${page}`;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pokedex-tag-retention-script',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status} al consultar tags de ${owner}/${repo}: ${errorText}`);
    }

    const data = (await response.json()) as Array<{
      name: string;
      commit: { sha: string };
      node_id?: string;
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const item of data) {
      tags.push({
        name: item.name,
        sha: item.commit.sha,
      });
    }

    const nextAvailable = hasMorePages(response.headers?.get?.('link'), data.length, perPage);

    if (!nextAvailable) {
      break;
    }

    if (page === maxPages && nextAvailable) {
      throw new Error(
        `Límite de seguridad superado: el repositorio contiene más de ${maxPages * perPage} tags (${maxPages} páginas). Detención de seguridad FAIL-CLOSED para evitar purgas destructivas sobre un inventario incompleto.`,
      );
    }

    page++;
  }

  return tags;
}

/**
 * Consulta un tag específico en el remoto para verificar existencia y precondición de SHA.
 * Desreferencia automáticamente tags anotados ("type": "tag") para resolver el SHA
 * del commit destino y permitir comparaciones correctas contra el inventario.
 */
export async function fetchRemoteTagRef(
  token: string,
  owner: string,
  repo: string,
  tagName: string,
  fetchFn: typeof fetch = fetch,
): Promise<GitRemoteRefDetail | null> {
  const refUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/tags/${encodeURIComponent(tagName)}`;

  const response = await fetchFn(refUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pokedex-tag-retention-script',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status} al consultar ref/tags/${tagName}: ${errorText}`);
  }

  const data = (await response.json()) as {
    ref: string;
    node_id?: string;
    url?: string;
    object: {
      sha: string;
      type: string;
      url: string;
    };
  };

  const refSha = data.object?.sha;
  const objType = data.object?.type;

  if (!refSha || !isValidGitSha(refSha)) {
    throw new Error(
      `Estructura inválida o SHA malformado para refs/tags/${tagName}: object.sha ('${refSha}') no es un hash de Git válido.`,
    );
  }

  // Si es un tag anotado, desreferenciar el commit destino mediante el endpoint de tags
  if (objType === 'tag') {
    const tagObjUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/tags/${refSha}`;
    const tagObjResponse = await fetchFn(tagObjUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pokedex-tag-retention-script',
      },
    });

    if (!tagObjResponse.ok) {
      const errorText = await tagObjResponse.text();
      throw new Error(
        `Error ${tagObjResponse.status} al resolver objeto tag anotado ${tagName} (${refSha}): ${errorText}`,
      );
    }

    const tagData = (await tagObjResponse.json()) as {
      sha: string;
      object: {
        sha: string;
        type: string;
      };
    };

    const targetCommitSha = tagData.object?.sha;
    if (!targetCommitSha || !isValidGitSha(targetCommitSha)) {
      throw new Error(
        `Estructura inválida o SHA malformado al resolver objeto tag anotado ${tagName}: object.sha destino ('${targetCommitSha}') no es un hash de Git válido.`,
      );
    }

    return {
      tagName,
      refSha,
      targetCommitSha,
      type: 'tag',
      isAnnotated: true,
    };
  }

  // Tag ligero (apunta directamente a un commit)
  return {
    tagName,
    refSha,
    targetCommitSha: refSha,
    type: objType === 'tag' ? 'tag' : 'commit',
    isAnnotated: false,
  };
}

function parseStrictMatchingRefItem(
  rawItem: { ref?: unknown; object?: { sha?: unknown; type?: unknown } },
  owner: string,
  repo: string,
): { tagName: string; refSha: string; type: 'tag' | 'commit' } {
  const rawRef = rawItem.ref;
  const rawSha = rawItem.object?.sha;

  if (typeof rawRef !== 'string' || !rawRef.startsWith('refs/tags/')) {
    throw new Error(
      `Referencia remota malformada en matching-refs de ${owner}/${repo}: 'ref' ('${String(rawRef)}') no tiene el formato esperado 'refs/tags/*'. Abortando en modo estricto por seguridad (FAIL-CLOSED).`,
    );
  }

  const tagName = rawRef.slice('refs/tags/'.length);
  if (!tagName || tagName.trim() === '') {
    throw new Error(
      `Referencia remota malformada en matching-refs de ${owner}/${repo}: nombre de tag vacío en ref '${rawRef}'. Abortando en modo estricto por seguridad (FAIL-CLOSED).`,
    );
  }

  if (typeof rawSha !== 'string' || !isValidGitSha(rawSha)) {
    throw new Error(
      `Referencia remota inválida o malformada en matching-refs de ${owner}/${repo} para '${rawRef}': object.sha ('${String(rawSha)}') ausente o no es un hash de Git válido. Abortando en modo estricto por seguridad (FAIL-CLOSED).`,
    );
  }

  return {
    tagName,
    refSha: rawSha,
    type: rawItem.object?.type === 'tag' ? 'tag' : 'commit',
  };
}

function parseNonStrictMatchingRefItem(rawItem: {
  ref?: unknown;
  object?: { sha?: unknown; type?: unknown };
}): { tagName: string; refSha: string; type: 'tag' | 'commit' } | null {
  const rawRef = rawItem.ref;
  const rawSha = rawItem.object?.sha;

  if (
    typeof rawRef === 'string' &&
    rawRef.startsWith('refs/tags/') &&
    typeof rawSha === 'string' &&
    isValidGitSha(rawSha)
  ) {
    const tagName = rawRef.slice('refs/tags/'.length);
    if (tagName && tagName.trim() !== '') {
      return {
        tagName,
        refSha: rawSha,
        type: rawItem.object?.type === 'tag' ? 'tag' : 'commit',
      };
    }
  }

  return null;
}

function parseMatchingRefItem(
  item: unknown,
  strict: boolean,
  owner: string,
  repo: string,
  refsMap: Map<string, { refSha: string; type: 'tag' | 'commit' }>,
): void {
  if (!item || typeof item !== 'object') {
    if (strict) {
      throw new Error(
        `Respuesta remota malformada en matching-refs de ${owner}/${repo}: elemento inválido recibido de la API.`,
      );
    }
    return;
  }

  const rawItem = item as { ref?: unknown; object?: { sha?: unknown; type?: unknown } };
  const parsed = strict ? parseStrictMatchingRefItem(rawItem, owner, repo) : parseNonStrictMatchingRefItem(rawItem);

  if (parsed) {
    refsMap.set(parsed.tagName, {
      refSha: parsed.refSha,
      type: parsed.type,
    });
  }
}

async function fetchMatchingRefsPage(
  token: string,
  owner: string,
  repo: string,
  page: number,
  perPage: number,
  fetchFn: typeof fetch,
): Promise<{ data: Array<{ ref: string; object?: { sha?: string; type?: string } }>; hasNextPage: boolean }> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/matching-refs/tags?per_page=${perPage}&page=${page}`;
  const response = await fetchFn(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pokedex-tag-retention-script',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Error ${response.status} al consultar matching-refs de ${owner}/${repo} (página ${page}): ${errorText}`,
    );
  }

  const data = (await response.json()) as Array<{
    ref: string;
    object?: { sha?: string; type?: string };
  }>;

  const validData = Array.isArray(data) ? data : [];
  const hasNextPage =
    validData.length > 0 ? hasMorePages(response.headers?.get?.('link'), validData.length, perPage) : false;

  return { data: validData, hasNextPage };
}

async function fetchMatchingRefsMap(
  token: string,
  owner: string,
  repo: string,
  options: EnrichTagsOptions,
): Promise<Map<string, { refSha: string; type: 'tag' | 'commit' }> | null> {
  const fetchFn = options.fetchFn ?? fetch;
  const strict = options.strict ?? false;
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 30;

  const refsMap = new Map<string, { refSha: string; type: 'tag' | 'commit' }>();
  let page = 1;

  try {
    while (true) {
      if (page > maxPages) {
        throw new Error(
          `Límite de seguridad alcanzado en matching-refs: excede el tope de ${maxPages * perPage} referencias (${maxPages} páginas). Detención de seguridad FAIL-CLOSED.`,
        );
      }

      const { data, hasNextPage } = await fetchMatchingRefsPage(token, owner, repo, page, perPage, fetchFn);

      if (data.length === 0) {
        break;
      }

      for (const item of data) {
        parseMatchingRefItem(item, strict, owner, repo, refsMap);
      }

      if (!hasNextPage) {
        break;
      }

      if (page === maxPages && hasNextPage) {
        throw new Error(
          `Límite de seguridad superado en matching-refs: el repositorio contiene más de ${maxPages * perPage} referencias (${maxPages} páginas). Detención de seguridad FAIL-CLOSED.`,
        );
      }

      page++;
    }
  } catch (err: unknown) {
    if (strict) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Fallo crítico en enriquecimiento de referencias remotas: ${msg}. En modo destructivo se requiere inventario completo y validado. Purga cancelada por seguridad.`,
      );
    }
    console.warn(
      `⚠️  Advertencia: No se pudieron enriquecer las referencias remotas: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  return refsMap;
}

function applyRefsToTags(
  tags: GitTagRef[],
  refsMap: Map<string, { refSha: string; type: 'tag' | 'commit' }>,
  strict: boolean,
): void {
  for (const tag of tags) {
    const refDetail = refsMap.get(tag.name);
    if (refDetail) {
      tag.refSha = refDetail.refSha;
      tag.isAnnotated = refDetail.type === 'tag';

      if (strict && !tag.isAnnotated && !areShasEqual(tag.refSha, tag.sha)) {
        throw new Error(
          `Inconsistencia de inventario en tag ligero ${tag.name}: el SHA de la referencia (${tag.refSha}) difiere del commit devuelto por la API de tags (${tag.sha}). Abortando operación destructiva por seguridad.`,
        );
      }
    } else if (strict) {
      throw new Error(
        `Inventario incompleto: el tag ${tag.name} no se encontró en las referencias remotas de GitHub (git/matching-refs/tags). Abortando operación destructiva por seguridad (FAIL-CLOSED).`,
      );
    }
  }
}

function validateBidirectionalConsistency(
  tags: GitTagRef[],
  refsMap: Map<string, { refSha: string; type: 'tag' | 'commit' }>,
): void {
  const initialTagNames = new Set(tags.map((t) => t.name));
  const extraneousRefs: string[] = [];
  for (const remoteTagName of refsMap.keys()) {
    if (!initialTagNames.has(remoteTagName)) {
      extraneousRefs.push(remoteTagName);
    }
  }

  if (extraneousRefs.length > 0) {
    throw new Error(
      `Inconsistencia bidireccional de inventario: se detectaron ${extraneousRefs.length} referencias remotas en matching-refs que no existían en el inventario inicial (${extraneousRefs.slice(0, 5).join(', ')}${extraneousRefs.length > 5 ? '...' : ''}). Posible publicación concurrente de tags durante la ejecución. Cancelando operación destructiva por seguridad (FAIL-CLOSED).`,
    );
  }
}

/**
 * Enriquece el inventario de tags con el SHA exacto del objeto de referencia (refSha)
 * consultando git/matching-refs/tags con paginación completa y control FAIL-CLOSED.
 */
export async function enrichTagsWithRemoteRefs(
  token: string,
  owner: string,
  repo: string,
  tags: GitTagRef[],
  optionsOrFetchFn: EnrichTagsOptions | typeof fetch = {},
): Promise<void> {
  const options: EnrichTagsOptions =
    typeof optionsOrFetchFn === 'function' ? { fetchFn: optionsOrFetchFn } : optionsOrFetchFn;

  if (tags.length === 0) return;

  const strict = options.strict ?? false;

  if (!token) {
    if (strict) {
      throw new Error(
        'Token de GitHub no configurado para enriquecer referencias en modo destructivo. Operación cancelada por seguridad.',
      );
    }
    return;
  }

  const refsMap = await fetchMatchingRefsMap(token, owner, repo, options);
  if (!refsMap) return;

  applyRefsToTags(tags, refsMap, strict);

  if (strict) {
    validateBidirectionalConsistency(tags, refsMap);
  }
}

/**
 * Elimina una referencia de tag de Git en GitHub vía API REST con verificación de precondición estricta en dos fases.
 */
export async function deleteRemoteTag(
  token: string,
  owner: string,
  repo: string,
  tagName: string,
  precondition: TagDeletePrecondition,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (!precondition || typeof precondition !== 'object') {
    throw new Error(
      `Precondición obligatoria ausente para tag ${tagName}: se requiere un objeto TagDeletePrecondition con hashes válidos para autorizar el borrado seguro.`,
    );
  }

  if (!isValidGitSha(precondition.commitSha)) {
    throw new Error(
      `Precondición inválida para tag ${tagName}: commitSha ('${precondition.commitSha}') no es un hash de Git de 40 hex válido.`,
    );
  }

  if (precondition.refSha !== undefined && !isValidGitSha(precondition.refSha)) {
    throw new Error(
      `Precondición inválida para tag ${tagName}: refSha ('${precondition.refSha}') no es un hash de Git de 40 hex válido.`,
    );
  }

  const current = await fetchRemoteTagRef(token, owner, repo, tagName, fetchFn);
  if (!current) {
    console.warn(`   ⚠️ Tag refs/tags/${tagName} ya no existe en el remoto. Nada que eliminar.`);
    return false;
  }

  // 1. Verificación obligatoria de refSha para tags anotados o cuando se especifique refSha
  if (current.isAnnotated) {
    if (!precondition.refSha) {
      throw new Error(
        `Precondición no fiable para tag anotado ${tagName}: se requiere el SHA de referencia (refSha) además del commitSha para autorizar el borrado seguro.`,
      );
    }
    if (!areShasEqual(current.refSha, precondition.refSha)) {
      throw new Error(
        `Conflicto concurrente en tag ${tagName}: el SHA de la referencia (${current.refSha}) difiere del esperado (${precondition.refSha}). La referencia mutó a otro objeto tag/commit. Operación cancelada por seguridad.`,
      );
    }
  } else if (precondition.refSha && !areShasEqual(current.refSha, precondition.refSha)) {
    throw new Error(
      `Conflicto concurrente en tag ${tagName}: el SHA de la referencia (${current.refSha}) difiere del esperado (${precondition.refSha}). Operación cancelada por seguridad.`,
    );
  }

  // 2. Verificación obligatoria exacta de commitSha
  if (!areShasEqual(current.targetCommitSha, precondition.commitSha)) {
    throw new Error(
      `Conflicto concurrente en tag ${tagName}: el commit destino (${current.targetCommitSha}) difiere del esperado (${precondition.commitSha}). Operación cancelada por seguridad.`,
    );
  }

  const deleteUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/tags/${encodeURIComponent(tagName)}`;

  const response = await fetchFn(deleteUrl, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pokedex-tag-retention-script',
    },
  });

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status} al eliminar refs/tags/${tagName}: ${errorText}`);
  }

  return true;
}

/**
 * Revalida exhaustivamente el inventario global de tags remotos inmediatamente antes de iniciar
 * las eliminaciones destructivas, reduciendo la ventana de carrera concurrente (TOCTOU) al mínimo.
 */
export async function revalidateGlobalRemoteInventory(
  token: string,
  owner: string,
  repo: string,
  expectedTags: GitTagRef[],
  options: {
    fetchFn?: typeof fetch;
    maxPages?: number;
    perPage?: number;
  } = {},
): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const freshTags = await fetchRemoteTags(token, owner, repo, {
    fetchFn,
    maxPages: options.maxPages,
    perPage: options.perPage,
  });

  await enrichTagsWithRemoteRefs(token, owner, repo, freshTags, {
    fetchFn,
    maxPages: options.maxPages,
    perPage: options.perPage,
    strict: true,
  });

  if (freshTags.length !== expectedTags.length) {
    throw new Error(
      `Inconsistencia concurrente en revalidación global: el número de tags remotos cambió de ${expectedTags.length} a ${freshTags.length} inmediatamente antes de iniciar la purga. Posible publicación o mutación de tags concurrente. Operación cancelada por seguridad (FAIL-CLOSED).`,
    );
  }

  const freshMap = new Map<string, GitTagRef>(freshTags.map((t) => [t.name, t]));

  for (const expected of expectedTags) {
    const fresh = freshMap.get(expected.name);
    if (!fresh) {
      throw new Error(
        `Inconsistencia concurrente en revalidación global: el tag ${expected.name} ya no existe en el remoto inmediatamente antes de iniciar la purga. Operación cancelada por seguridad (FAIL-CLOSED).`,
      );
    }
    if (!areShasEqual(fresh.sha, expected.sha)) {
      throw new Error(
        `Inconsistencia concurrente en revalidación global: el commit de ${expected.name} mutó en el remoto (esperado ${expected.sha}, obtenido ${fresh.sha}). Operación cancelada por seguridad (FAIL-CLOSED).`,
      );
    }
    if (expected.refSha && fresh.refSha && !areShasEqual(fresh.refSha, expected.refSha)) {
      throw new Error(
        `Inconsistencia concurrente en revalidación global: la referencia ${expected.name} mutó en el remoto (esperado ${expected.refSha}, obtenido ${fresh.refSha}). Operación cancelada por seguridad (FAIL-CLOSED).`,
      );
    }
  }

  const expectedSet = new Set(expectedTags.map((t) => t.name));
  const newTags: string[] = [];
  for (const fresh of freshTags) {
    if (!expectedSet.has(fresh.name)) {
      newTags.push(fresh.name);
    }
  }

  if (newTags.length > 0) {
    throw new Error(
      `Inconsistencia concurrente en revalidación global: se detectaron nuevos tags publicados en el remoto inmediatamente antes de iniciar la purga (${newTags.join(', ')}). Operación cancelada por seguridad (FAIL-CLOSED).`,
    );
  }
}
