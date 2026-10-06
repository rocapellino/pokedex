import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

interface PackageRule {
  matchManagers?: string[];
  matchPackageNames?: string[];
  matchUpdateTypes?: string[];
  enabled?: boolean;
}

/**
 * RENOVATE-001 — PostgreSQL 16 y Redis 7 son contrato documentado y un major de PostgreSQL exige
 * migrar el volumen de datos, por lo que Renovate no debe proponerlos.
 *
 * Estas imágenes se declaran en DOS gestores: `docker-compose` (compose local y de desarrollo) y
 * `helm-values` (`infra/helm/pokedex/values.yaml`). La regla nació cubriendo solo `docker-compose`,
 * de modo que el chart seguía recibiendo propuestas de 16 a 18 y de 7 a 8. Este test fija que el
 * bloqueo cubre ambos gestores para ambos paquetes, para que no se vuelva a estrechar.
 */
test('🛡️ RENOVATE-001: los major de postgres y redis están bloqueados en docker-compose y en helm-values', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as {
    packageRules: PackageRule[];
  };
  const blockers = config.packageRules.filter(
    (rule) => rule.enabled === false && rule.matchUpdateTypes?.includes('major'),
  );

  for (const manager of ['docker-compose', 'helm-values']) {
    for (const pkg of ['postgres', 'redis']) {
      assert.ok(
        blockers.some((rule) => rule.matchManagers?.includes(manager) && rule.matchPackageNames?.includes(pkg)),
        `RENOVATE-001: falta una regla que bloquee los major de '${pkg}' para el gestor '${manager}' ` +
          '(enabled: false con matchUpdateTypes: major)',
      );
    }
  }
});

/**
 * RENOVATE-002 — una opción inválida en `renovate.json` detiene a Renovate hospedado (no abre PRs de
 * dependencias y publica un issue de configuración). Una clave de comentario como `//gitsign` lo
 * provocaba, porque Renovate no admite claves arbitrarias. El validador oficial corre en Config
 * Linters; este test fija su presencia y la ausencia de claves de comentario, que es la causa
 * conocida, para que falle en local antes de llegar a CI.
 */
test('🛡️ RENOVATE-002: renovate.json no contiene claves de comentario inválidas', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as Record<string, unknown>;
  const commentKeys = Object.keys(config).filter((key) => key.startsWith('//'));

  assert.deepEqual(
    commentKeys,
    [],
    `RENOVATE-002: Renovate rechaza las claves de comentario (${commentKeys.join(', ')}) y deja de abrir PRs. ` +
      'Documenta la excepción en docs/devops/GITHUB_WORKFLOWS_GUIDE.md o usa "description" en una packageRule.',
  );
});

test('🛡️ RENOVATE-002: Config Linters valida renovate.json con el validador oficial, fijado por digest y en modo strict', () => {
  const linters = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/config-linters.yaml'), 'utf-8');

  assert.match(
    linters,
    /renovate-config-validator/,
    'RENOVATE-002: Config Linters debe ejecutar renovate-config-validator',
  );
  assert.match(
    linters,
    /renovate\/renovate:[\w.-]+@sha256:[0-9a-f]{64}/,
    'RENOVATE-002: la imagen de Renovate debe fijarse por tag y digest (supply chain, ADR-008)',
  );
  assert.match(
    linters,
    /renovate-config-validator[\s\S]*?--strict/,
    'RENOVATE-002: el validador debe correr con --strict',
  );
});
