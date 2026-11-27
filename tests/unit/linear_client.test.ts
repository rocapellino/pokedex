import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLinear, LINEAR_API_URL } from '../../scripts/lib/linear.js';
import { categorizeIssues, chunkArray } from '../../scripts/cleanup-linear-tickets.js';
import { buildIssuesSummaryMarkdown, sanitizeMarkdownCell } from '../../scripts/list-linear-issues.js';

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

test('🧹 AUD-SCR-TESTS-001: cleanup-linear-tickets chunkArray y categorizeIssues clasifican correctamente', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkArray([], 3), []);

  const categorized = categorizeIssues([
    {
      id: '1',
      identifier: 'PEX-1',
      title: '[SonarCloud] Unused var',
      state: { id: 's1', name: 'Todo', type: 'unstarted' },
    },
    {
      id: '2',
      identifier: 'PEX-2',
      title: '[GitHub CodeQL] Prototype',
      state: { id: 's1', name: 'Todo', type: 'unstarted' },
    },
    { id: '3', identifier: 'PEX-3', title: 'Manual task', state: { id: 's2', name: 'Duplicate', type: 'duplicate' } },
    { id: '4', identifier: 'PEX-4', title: 'Feature work', state: { id: 's1', name: 'In Progress', type: 'started' } },
  ]);

  assert.deepEqual(
    categorized.sonarBugsToClose.map((i) => i.identifier),
    ['PEX-1'],
  );
  assert.deepEqual(
    categorized.codeqlDuplicatesToCancel.map((i) => i.identifier),
    ['PEX-2', 'PEX-3'],
  );
  assert.deepEqual(
    categorized.otherTickets.map((i) => i.identifier),
    ['PEX-4'],
  );
});

test('📋 AUD-SCR-TESTS-001: list-linear-issues sanitizeMarkdownCell y buildIssuesSummaryMarkdown escapan tablas y vacíos', () => {
  assert.equal(sanitizeMarkdownCell('a\\b | c'), 'a\\\\b \\| c');

  const emptySummary = buildIssuesSummaryMarkdown({ name: 'Pokédex', key: 'PEX' }, []);
  assert.match(emptySummary, /\*\*Total de tickets abiertos:\*\* 0/);
  assert.match(emptySummary, /No hay tickets abiertos pendientes/);

  const populated = buildIssuesSummaryMarkdown({ name: 'Pokédex', key: 'PEX' }, [
    {
      id: '1',
      identifier: 'PEX-10',
      title: 'Fix | pipe \\ slash',
      priority: 1,
      priorityLabel: 'Urgent',
      url: 'https://linear.app/pex/PEX-10',
      createdAt: '2026-11-24T00:00:00Z',
      updatedAt: '2026-11-24T00:00:00Z',
      state: { name: 'Todo', type: 'unstarted' },
      assignee: { name: 'Rodrigo' },
      labels: { nodes: [{ name: 'Security' }] },
    },
  ]);
  assert.match(populated, /\[PEX-10\]\(https:\/\/linear\.app\/pex\/PEX-10\)/);
  assert.match(populated, /Fix \\\| pipe \\\\ slash/);
  assert.match(populated, /Urgent \| Rodrigo \| Security/);
});
