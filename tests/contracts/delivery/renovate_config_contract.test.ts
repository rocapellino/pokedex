import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { ROOT_DIR } from '../../helpers/repo.js';

interface PackageRule {
  matchManagers?: string[];
  matchPackageNames?: string[];
  matchUpdateTypes?: string[];
  enabled?: boolean;
  groupName?: string;
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
test('🛡️ RENOVATE-001: los major de postgres y redis están bloqueados en docker-compose, helm-values y custom.regex', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as {
    packageRules: PackageRule[];
  };
  const blockers = config.packageRules.filter(
    (rule) => rule.enabled === false && rule.matchUpdateTypes?.includes('major'),
  );

  for (const manager of ['docker-compose', 'helm-values', 'custom.regex']) {
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
 * etiqueta que no la refleja. Por eso toda imagen del chart con digest se excluye de `helm-values` y
 * la actualiza el gestor `custom.regex` (RENOVATE-004), que lee `tag` y `digest` juntos. Las imágenes
 * propias (`pokedex-api`, `pokedex-web`) tampoco existen en un registro público y Renovate las reporta
 * como fallo de búsqueda.
 */
const OWN_IMAGES = ['pokedex-api', 'pokedex-web'];

interface ChartImage {
  repository: string;
  tag: string;
  digest: string;
}

function collectChartImages(node: unknown, out: ChartImage[] = []) {
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.repository === 'string' && record.repository !== '' && 'digest' in record) {
      out.push({ repository: record.repository, tag: String(record.tag ?? ''), digest: String(record.digest ?? '') });
    }
    for (const value of Object.values(record)) collectChartImages(value, out);
  }
  return out;
}

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const VALUES_PATH = 'infra/helm/pokedex/values.yaml';

function loadPinnedChartImages(): ChartImage[] {
  const values = yaml.load(fs.readFileSync(path.join(ROOT_DIR, VALUES_PATH), 'utf-8'));
  return collectChartImages(values).filter((image) => SHA256.test(image.digest));
}

test('🛡️ RENOVATE-003: las imágenes del chart con digest aparte o sin registro público se excluyen de helm-values', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as {
    packageRules: PackageRule[];
  };
  const disabled = new Set(
    config.packageRules
      .filter(
        (rule) =>
          rule.enabled === false && rule.matchManagers?.includes('helm-values') && !rule.matchUpdateTypes?.length,
      )
      .flatMap((rule) => rule.matchPackageNames ?? []),
  );

  const pinned = loadPinnedChartImages().map((image) => image.repository);
  assert.ok(pinned.length > 0, 'RENOVATE-003: se esperaba al menos una imagen del chart con digest');

  const missing = [...new Set([...pinned, ...OWN_IMAGES])].filter((repo) => !disabled.has(repo));
  assert.deepEqual(
    missing,
    [],
    `RENOVATE-003: Renovate cambiaría solo el tag de ${missing.join(', ')} en values.yaml y dejaría el digest ` +
      'anterior. Añádelas a una regla helm-values con enabled: false y cúbrelas con el gestor custom.regex ' +
      '(RENOVATE-004), que cambia tag y digest en el mismo PR.',
  );
});

/**
 * RENOVATE-004 — las imágenes del chart con digest aparte (`postgres`, `pgbouncer`, `redis`, `rclone`) las
 * actualiza un gestor `custom.regex` que lee `tag` y `digest` de cada bloque de `values.yaml`, porque
 * `helm-values` solo ve el `tag` (RENOVATE-003). Depende de un regex sobre el texto del archivo: si alguien
 * reformatea un bloque (comillas, orden, claves nuevas) deja de coincidir y Renovate deja de proponer esa
 * imagen sin ningún error. Este test fija que el regex encuentra exactamente las imágenes con digest del
 * chart y captura lo mismo que dice el YAML, y que el gestor está habilitado (`enabledManagers` es una lista
 * cerrada: sin `custom.regex` se ignora en silencio) y entra en las reglas que acotan esas imágenes.
 */
test('🛡️ RENOVATE-004: el gestor custom.regex encuentra tag y digest de cada imagen con digest del chart', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'renovate.json'), 'utf-8')) as {
    enabledManagers: string[];
    customManagers?: Array<{
      customType: string;
      managerFilePatterns: string[];
      matchStrings: string[];
      datasourceTemplate?: string;
    }>;
    packageRules: PackageRule[];
  };
  assert.ok(
    config.enabledManagers.includes('custom.regex'),
    "RENOVATE-004: 'custom.regex' debe estar en enabledManagers; sin él Renovate ignora el gestor sin avisar",
  );

  const content = fs.readFileSync(path.join(ROOT_DIR, VALUES_PATH), 'utf-8');
  const manager = config.customManagers?.find((candidate) => candidate.customType === 'regex');
  assert.ok(manager, 'RENOVATE-004: falta el gestor custom.regex del chart en renovate.json');
  assert.equal(manager.datasourceTemplate, 'docker');
  // Comparación literal: Renovate interpreta el patrón como regex, pero compilar aquí un patrón leído
  // del JSON sería un RegExp no literal (ReDoS, regla de Semgrep) y basta con fijar el valor esperado.
  assert.ok(
    manager.managerFilePatterns.includes('/^infra/helm/pokedex/values\\.yaml$/'),
    `RENOVATE-004: managerFilePatterns debe apuntar solo a ${VALUES_PATH}`,
  );

  const found = [...content.matchAll(new RegExp(manager.matchStrings[0], 'g'))].map((match) => ({
    repository: match.groups?.depName ?? '',
    tag: match.groups?.currentValue ?? '',
    digest: match.groups?.currentDigest ?? '',
  }));
  const key = (image: ChartImage) => `${image.repository}:${image.tag}@${image.digest}`;
  const expected = loadPinnedChartImages().map(key).sort();
  assert.deepEqual(
    found.map(key).sort(),
    expected,
    'RENOVATE-004: el regex no encuentra exactamente las imágenes con digest de values.yaml (¿se reformateó un ' +
      'bloque o se añadió una imagen sin listarla en el regex?). Renovate dejaría de proponer esa imagen sin ' +
      'ningún error; ajusta el regex o el bloque.',
  );

  // rclone se agrupa con el compose: el gestor del chart debe entrar en esa regla o el PR quedaría partido.
  const rcloneGroup = config.packageRules.find((rule) => rule.groupName === 'rclone');
  assert.ok(rcloneGroup, 'RENOVATE-004: falta la regla que agrupa rclone');
  for (const managerName of ['docker-compose', 'custom.regex']) {
    assert.ok(
      rcloneGroup.matchManagers?.includes(managerName),
      `RENOVATE-004: la regla de rclone debe incluir '${managerName}' para que compose y chart vayan en un solo PR`,
    );
  }
});
