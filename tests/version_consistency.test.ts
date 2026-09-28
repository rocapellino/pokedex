import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../');

/**
 * VER-001 / REL-001 — Contrato de sincronización de versión (gate automático).
 *
 * La cadena de trazabilidad de release exige igualdad estricta entre:
 *   package.json.version
 *     == package-lock.json.packages[""].version
 *     == Chart.yaml.version
 *     == Chart.yaml.appVersion
 *     == GitOps targetRevision (con prefijo "v")
 *
 * Este test es el gate bloqueante; la inspección manual queda eliminada.
 */
test('VER-001 🔒 Contrato de versión: package.json == package-lock.json == Chart.yaml == GitOps', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package-lock.json'), 'utf-8'));
  const chart = fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/Chart.yaml'), 'utf-8');
  const rootApp = fs.readFileSync(path.join(ROOT_DIR, 'gitops/apps/root-application.yaml'), 'utf-8');

  const pkgVersion = pkg.version as string;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, `package.json.version debe ser SemVer, recibido: ${pkgVersion}`);

  // package-lock.json: versión top-level y paquete raíz packages[""]
  assert.equal(
    (lock as { version: string }).version,
    pkgVersion,
    `package-lock.json.version (${(lock as { version: string }).version}) debe igualar package.json (${pkgVersion})`
  );
  const lockRootVersion = (lock as { packages: Record<string, { version?: string }> }).packages[''].version;
  assert.equal(
    lockRootVersion,
    pkgVersion,
    `package-lock.json packages[""].version (${lockRootVersion}) debe igualar package.json (${pkgVersion})`
  );

  // Chart.yaml: version y appVersion
  const chartVersion = chart.match(/^version:\s*(\S+)/m)?.[1]?.replace(/['"]/g, '');
  const chartAppVersion = chart.match(/^appVersion:\s*["']?([^"'\s#]+)/m)?.[1];
  assert.equal(chartVersion, pkgVersion, `Chart.yaml.version (${chartVersion}) debe igualar package.json (${pkgVersion})`);
  assert.equal(chartAppVersion, pkgVersion, `Chart.yaml.appVersion (${chartAppVersion}) debe igualar package.json (${pkgVersion})`);

  // GitOps targetRevision (los 4 manifiestos, paridad estricta ya validada por argocd_pinning)
  const gitopsTag = rootApp.match(/targetRevision:\s*(\S+)/)?.[1];
  assert.equal(gitopsTag, `v${pkgVersion}`, `GitOps targetRevision (${gitopsTag}) debe ser v${pkgVersion}`);
});

test('VER-001 🔒 Fase promote del workflow sincroniza package-lock.json junto a package.json', () => {
  const wf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/release-tag.yml'), 'utf-8');

  assert.ok(
    wf.includes('npm version "$VERSION" --no-git-tag-version'),
    'El workflow debe usar npm version para actualizar package.json y package-lock.json atómicamente'
  );
  assert.ok(
    !wf.includes('npm pkg set version='),
    'npm pkg set version= no actualiza package-lock.json y está prohibido en el flujo de release (VER-001)'
  );
  assert.ok(
    wf.includes('git add package.json package-lock.json infra/helm/pokedex/Chart.yaml gitops/apps/'),
    'El commit de promoción debe incluir package-lock.json'
  );
  assert.ok(
    wf.includes('LOCK_VERSION='),
    'La fase tag debe verificar la coherencia de package-lock.json antes de taggear'
  );
  assert.ok(
    wf.includes('l.packages[""].version'),
    'La fase tag debe leer packages[""].version de package-lock.json'
  );
});
