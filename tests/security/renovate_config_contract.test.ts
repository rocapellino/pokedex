import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
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

/**
 * RENOVATE-003 — el chart de Helm fija el digest de cada imagen en un campo aparte del `tag`
 * (INFRA-005) y el gestor `helm-values` solo ve el `tag`: un PR de Renovate cambiaría la etiqueta y
 * dejaría el digest anterior, de modo que el despliegue seguiría usando la imagen vieja con una
 * etiqueta que no la refleja. Por eso toda imagen del chart con digest debe excluirse del gestor,
 * salvo `rclone/rclone`, que se mantiene sincronizada con el compose (agrupamiento + test de paridad
 * en dr_backup_security). Las imágenes propias (`pokedex-api`, `pokedex-web`) tampoco existen en un
 * registro público y Renovate las reporta como fallo de búsqueda.
 */
const PAIRED_WITH_COMPOSE = new Set(['rclone/rclone']);
const OWN_IMAGES = ['pokedex-api', 'pokedex-web'];

function collectChartImages(node: unknown, out: Array<{ repository: string; digest: string }> = []) {
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.repository === 'string' && record.repository !== '' && 'digest' in record) {
      out.push({ repository: record.repository, digest: String(record.digest ?? '') });
    }
    for (const value of Object.values(record)) collectChartImages(value, out);
  }
  return out;
}

test('🛡️ RENOVATE-003: las imágenes del chart con digest aparte o sin registro público se excluyen de helm-values', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as {
    packageRules: PackageRule[];
  };
  const values = yaml.load(fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml'), 'utf-8'));
  const images = collectChartImages(values);
  const disabled = new Set(
    config.packageRules
      .filter(
        (rule) =>
          rule.enabled === false && rule.matchManagers?.includes('helm-values') && !rule.matchUpdateTypes?.length,
      )
      .flatMap((rule) => rule.matchPackageNames ?? []),
  );

  const pinned = images.filter((image) => /^sha256:[a-f0-9]{64}$/.test(image.digest)).map((i) => i.repository);
  assert.ok(pinned.length > 0, 'RENOVATE-003: se esperaba al menos una imagen del chart con digest');

  const missing = [...new Set([...pinned, ...OWN_IMAGES])].filter(
    (repo) => !PAIRED_WITH_COMPOSE.has(repo) && !disabled.has(repo),
  );
  assert.deepEqual(
    missing,
    [],
    `RENOVATE-003: Renovate cambiaría solo el tag de ${missing.join(', ')} en values.yaml y dejaría el digest ` +
      'anterior. Añádelas a una regla helm-values con enabled: false (se actualizan a mano, tag y digest juntos) ' +
      'o, si existen en el compose, agrúpalas y cubre su paridad con un test.',
  );

  for (const repo of PAIRED_WITH_COMPOSE) {
    assert.ok(
      !disabled.has(repo),
      `RENOVATE-003: '${repo}' se mantiene sincronizada con el compose y no debe excluirse`,
    );
  }
});

/**
 * RENOVATE-004 — `pgbouncer` se actualiza con un gestor `custom.regex` que lee `tag` y `digest` del chart
 * en un solo bloque, porque `helm-values` solo ve el `tag` (RENOVATE-003). Ese gestor depende de un regex
 * sobre el texto de `values.yaml`: si alguien reformatea el bloque (comillas, orden, nuevas claves), deja de
 * coincidir y Renovate deja de proponer la imagen sin ningún error. Este test fija que el regex sigue
 * encontrando el bloque, que lo que captura coincide con el YAML y que el gestor está habilitado
 * (`enabledManagers` es una lista cerrada: sin `custom.regex` el gestor se ignora en silencio).
 */
test('🛡️ RENOVATE-004: el gestor custom.regex del chart encuentra tag y digest de pgbouncer y está habilitado', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as {
    enabledManagers: string[];
    customManagers?: Array<{
      customType: string;
      managerFilePatterns: string[];
      matchStrings: string[];
      datasourceTemplate?: string;
    }>;
  };
  assert.ok(
    config.enabledManagers.includes('custom.regex'),
    "RENOVATE-004: 'custom.regex' debe estar en enabledManagers; sin él Renovate ignora el gestor sin avisar",
  );

  const valuesPath = 'infra/helm/pokedex/values.yaml';
  const content = fs.readFileSync(path.join(ROOT_DIR, valuesPath), 'utf-8');
  const values = yaml.load(content) as { pgbouncer: { image: { repository: string; tag: string; digest: string } } };
  const image = values.pgbouncer.image;

  const manager = config.customManagers?.find((candidate) =>
    candidate.matchStrings.some((pattern) => pattern.includes('pgbouncer/pgbouncer')),
  );
  assert.ok(manager, 'RENOVATE-004: falta el gestor custom.regex de pgbouncer en renovate.json');
  assert.equal(manager.customType, 'regex');
  assert.equal(manager.datasourceTemplate, 'docker');
  assert.ok(
    manager.managerFilePatterns.some((pattern) => new RegExp(pattern.replace(/^\/|\/$/g, '')).test(valuesPath)),
    `RENOVATE-004: managerFilePatterns no incluye ${valuesPath}`,
  );

  const match = new RegExp(manager.matchStrings[0]).exec(content);
  assert.ok(
    match?.groups,
    'RENOVATE-004: el regex ya no encuentra el bloque de pgbouncer en values.yaml (¿se reformateó?). ' +
      'Renovate dejaría de proponer la imagen sin ningún error; ajusta el regex o el bloque.',
  );
  assert.equal(match.groups.depName, image.repository);
  assert.equal(match.groups.currentValue, image.tag, 'RENOVATE-004: el tag capturado no coincide con values.yaml');
  assert.equal(
    match.groups.currentDigest,
    image.digest,
    'RENOVATE-004: el digest capturado no coincide con values.yaml',
  );
});
