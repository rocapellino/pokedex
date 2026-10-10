/**
 * Las suites de `tests/integration/db/` se omiten si faltan las variables POKEDEX_TEST_*. Eso es deliberado en local,
 * pero en CI una omisión silenciosa dejaría sin ejecutar justo el código que habla con PostgreSQL y Redis. Este
 * contrato garantiza que los jobs que ejecutan la suite definan las variables y levanten los servicios, con las
 * mismas imágenes (por digest) que `docker-compose.yaml`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';
import { REDIS_SLOTS } from '../helpers/services.js';
import { readYaml } from '../helpers/yaml.js';

interface ServiceDefinition {
  image: string;
  ports?: string[];
  options?: string;
}

interface JobDefinition {
  env?: Record<string, string>;
  services?: Record<string, ServiceDefinition>;
}

const workflow = readYaml<{ jobs: Record<string, JobDefinition> }>('.github/workflows/ci.yaml');
const compose = readYaml<{ services: Record<string, { image: string }> }>('docker-compose.yaml');

/** Job que ejecuta la suite completa (`npm run test:coverage`); es el único que necesita los servicios. */
const JOBS_WITH_SERVICES = ['sonarcloud'];

for (const jobName of JOBS_WITH_SERVICES) {
  test(`🧪 CI-DB-001: el job ${jobName} define las variables y los servicios de las pruebas de base de datos`, () => {
    const job = workflow.jobs[jobName];
    assert.ok(job, `ci.yaml debe tener el job ${jobName}`);

    const databaseUrl = new URL(job.env?.POKEDEX_TEST_DATABASE_URL ?? '');
    const redisUrl = new URL(job.env?.POKEDEX_TEST_REDIS_URL ?? '');
    assert.equal(databaseUrl.protocol, 'postgresql:');
    assert.equal(redisUrl.protocol, 'redis:');

    const postgres = job.services?.postgres;
    const redis = job.services?.redis;
    assert.ok(postgres, `${jobName} debe levantar el servicio postgres`);
    assert.ok(redis, `${jobName} debe levantar el servicio redis`);

    // La URL debe apuntar al puerto que el servicio publica en el runner.
    assert.ok(
      postgres.ports?.includes(`${databaseUrl.port}:5432`),
      'el puerto de la URL de PostgreSQL debe publicarse',
    );
    assert.ok(redis.ports?.includes(`${redisUrl.port}:6379`), 'el puerto de la URL de Redis debe publicarse');

    // Sin healthcheck la suite podría arrancar antes de que el servidor acepte conexiones.
    assert.match(postgres.options ?? '', /--health-cmd/);
    assert.match(redis.options ?? '', /--health-cmd/);
  });

  test(`🧪 CI-DB-001: las imágenes de ${jobName} son las mismas, por digest, que las de docker-compose.yaml`, () => {
    const job = workflow.jobs[jobName];
    assert.equal(job.services?.postgres?.image, compose.services.postgres.image);
    assert.equal(job.services?.redis?.image, compose.services.redis.image);
    assert.match(compose.services.postgres.image, /@sha256:[a-f0-9]{64}$/, 'el compose debe fijar por digest');
    assert.match(compose.services.redis.image, /@sha256:[a-f0-9]{64}$/, 'el compose debe fijar por digest');
  });
}

test('🧪 CI-DB-002: cada suite de integración con base de datos declara su omisión y su base de Redis es única', () => {
  const directory = path.join(ROOT_DIR, 'tests/integration/db');
  const suites = fs.readdirSync(directory).filter((file) => file.endsWith('.test.ts'));
  assert.ok(suites.length > 0, 'debe existir al menos una suite en tests/integration/db/');

  for (const file of suites) {
    const source = fs.readFileSync(path.join(directory, file), 'utf-8');
    assert.match(
      source,
      /skip:\s*(postgresSkip|redisSkip|servicesSkip)/,
      `${file} debe omitirse cuando no hay servicios (sin esto rompería npm test sin Docker)`,
    );
  }

  const slots = Object.values(REDIS_SLOTS);
  assert.equal(new Set(slots).size, slots.length, 'dos suites no pueden compartir base lógica de Redis');
});
