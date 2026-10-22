import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
  applyGhcrRetention,
  collectReleasePinnedDigests,
  PINNED_VALUES_FILES,
  type PackageVersion,
} from '../../../scripts/ghcr-retention.ts';
import { ROOT_DIR } from '../../helpers/repo.js';

/**
 * AUD-REL-GHCR-003: la política de GHCR garantiza rollback inmediato a las versiones N, N-1 y N-2.
 * La retención debe proteger los digests fijados por los últimos releases (tags SemVer), no solo
 * los del `main` actual; de lo contrario, las imágenes de los releases anteriores se purgan.
 */

const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args],
    { cwd, encoding: 'utf-8' },
  );
}

/** Crea un repositorio temporal; cada release escribe los 3 values de GitOps/Helm y crea su tag. */
function makeRepo(releases: { tag: string; seed: string | null }[], extraTags: string[] = []): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ghcr-rel-'));
  git(root, 'init', '-q');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'base');
  for (const { tag, seed } of releases) {
    if (seed !== null) {
      for (const file of PINNED_VALUES_FILES) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), `image:\n  digest: "${digest(seed)}"\n`);
      }
      git(root, 'add', '-A');
    }
    git(root, 'commit', '-q', '--allow-empty', '-m', `release ${tag}`);
    git(root, 'tag', tag);
  }
  for (const t of extraTags) git(root, 'tag', t);
  return root;
}

function version(id: number, name: string): PackageVersion {
  const date = new Date(Date.UTC(2026, 0, 1) + id * 60_000).toISOString();
  return {
    id,
    name,
    url: `https://api.github.com/versions/${id}`,
    created_at: date,
    updated_at: date,
    metadata: { package_type: 'container', container: { tags: [`build-${id}`] } },
  };
}

async function run(
  versions: PackageVersion[],
  options: Parameters<typeof applyGhcrRetention>[0],
): Promise<{ results: Awaited<ReturnType<typeof applyGhcrRetention>>; deletes: number; warn: string }> {
  let deletes = 0;
  const fetchStub = mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deletes += 1;
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(versions), { status: 200 });
  });
  const log = mock.method(console, 'log', () => undefined);
  const warnStub = mock.method(console, 'warn', () => undefined);
  const err = mock.method(console, 'error', () => undefined);
  try {
    const results = await applyGhcrRetention({ token: 'tok', owner: 'o', packages: ['p'], ...options });
    return { results, deletes, warn: warnStub.mock.calls.map((c) => String(c.arguments[0])).join('\n') };
  } finally {
    fetchStub.mock.restore();
    log.mock.restore();
    warnStub.mock.restore();
    err.mock.restore();
  }
}

test('🔒 GHCR Rollback: collectReleasePinnedDigests toma los N últimos releases SemVer y ordena numéricamente', () => {
  const repo = makeRepo(
    [
      { tag: 'v1.8.0', seed: 'a' },
      { tag: 'v1.9.0', seed: 'b' },
      { tag: 'v1.10.0', seed: 'c' },
      { tag: 'v1.11.0', seed: 'd' },
    ],
    ['v1.12.0-rc.1', 'latest'],
  );
  try {
    const { tags, digests, unreadable } = collectReleasePinnedDigests(repo, 3);

    assert.deepEqual(tags, ['v1.11.0', 'v1.10.0', 'v1.9.0'], 'v1.10.0 > v1.9.0 y se ignoran prereleases y no SemVer');
    assert.deepEqual([...digests].sort(), [digest('b'), digest('c'), digest('d')].sort());
    assert.ok(!digests.has(digest('a')), 'el release N-3 no se protege');
    assert.deepEqual(unreadable, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('🔒 GHCR Rollback: la retención conserva las imágenes de N, N-1 y N-2 aunque queden fuera del top de builds', async () => {
  const repo = makeRepo([
    { tag: 'v1.1.0', seed: 'a' },
    { tag: 'v1.2.0', seed: 'b' },
    { tag: 'v1.3.0', seed: 'c' },
    { tag: 'v1.4.0', seed: 'd' },
  ]);
  try {
    // 8 builds (id mayor = más reciente). Los releases fijaron los digests de los builds 1 a 4.
    const versions = [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
      version(
        id,
        id === 1
          ? digest('a')
          : id === 2
            ? digest('b')
            : id === 3
              ? digest('c')
              : id === 4
                ? digest('d')
                : digest(String(id)),
      ),
    );
    const { results, deletes } = await run(versions, { repoRoot: repo, keepCount: 3, dryRun: false });

    const [r] = results;
    assert.deepEqual(
      r.pruned.map((v) => v.id).sort((a, b) => a - b),
      [1, 5],
      'solo se purga lo que no es top 3 ni release N, N-1 o N-2 (v1.4.0, v1.3.0, v1.2.0)',
    );
    for (const protectedId of [2, 3, 4]) {
      assert.ok(
        r.kept.some((v) => v.id === protectedId),
        `la imagen del build ${protectedId} (release fijado) debe conservarse`,
      );
    }
    assert.equal(deletes, 2, 'solo se llama a DELETE para las 2 versiones purgables');
    assert.equal(r.errors.length, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('🔒 GHCR Rollback: sin tags de release, una purga real se rechaza (fail-closed) y no borra nada', async () => {
  const repo = makeRepo([]);
  try {
    let deletes = 0;
    const stub = mock.method(globalThis, 'fetch', async (_u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'DELETE') deletes += 1;
      return new Response('[]', { status: 200 });
    });
    const log = mock.method(console, 'log', () => undefined);
    try {
      await assert.rejects(
        () => applyGhcrRetention({ token: 'tok', owner: 'o', packages: ['p'], repoRoot: repo, dryRun: false }),
        /tags de release/i,
      );
    } finally {
      stub.mock.restore();
      log.mock.restore();
    }
    assert.equal(deletes, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('🔒 GHCR Rollback: un release cuyos values no se pueden leer también rechaza la purga real', async () => {
  const repo = makeRepo([{ tag: 'v1.1.0', seed: 'a' }]);
  try {
    // v1.2.0 apunta a un commit sin los values de GitOps/Helm (p. ej. un clon que no los trae)
    for (const file of PINNED_VALUES_FILES) fs.rmSync(path.join(repo, file), { force: true });
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'sin values');
    git(repo, 'tag', 'v1.2.0');

    const info = collectReleasePinnedDigests(repo, 3);
    assert.deepEqual(info.unreadable, ['v1.2.0'], 'el tag sin digests legibles debe quedar señalado');

    const stub = mock.method(globalThis, 'fetch', async () => new Response('[]', { status: 200 }));
    const log = mock.method(console, 'log', () => undefined);
    try {
      await assert.rejects(
        () => applyGhcrRetention({ token: 'tok', owner: 'o', packages: ['p'], repoRoot: repo, dryRun: false }),
        /v1\.2\.0/,
        'debe nombrar el tag cuyos values no se pudieron leer',
      );
    } finally {
      stub.mock.restore();
      log.mock.restore();
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('📦 GHCR Rollback: en dry-run sin tags no falla, pero advierte de que no hay protección de releases', async () => {
  const repo = makeRepo([]);
  try {
    const { results, warn } = await run([version(1, digest('a'))], { repoRoot: repo, dryRun: true });

    assert.equal(results[0].errors.length, 0);
    assert.match(warn, /protección de releases/i);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('🔒 GHCR Rollback: ghcr-retention.yaml trae los tags en el checkout (necesarios para proteger los releases)', () => {
  const wf = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ghcr-retention.yaml'), 'utf-8')) as {
    jobs: Record<string, { steps: { uses?: string; with?: Record<string, unknown> }[] }>;
  };
  const checkouts = Object.values(wf.jobs)
    .flatMap((job) => job.steps)
    .filter((step) => step.uses?.startsWith('actions/checkout@'));

  assert.ok(checkouts.length > 0, 'el workflow debe hacer checkout del repositorio');
  for (const step of checkouts) {
    assert.equal(
      step.with?.['fetch-tags'],
      true,
      'sin fetch-tags un checkout superficial no trae los tags y la purga real se rechaza',
    );
  }
});
