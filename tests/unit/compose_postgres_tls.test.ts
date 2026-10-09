/**
 * Contrato Docker Compose ↔ pool PostgreSQL: decisión de TLS coherente.
 *
 * Regresión: docker-compose.yaml fija NODE_ENV=production en el API pero no pasaba
 * DB_SSL. shouldUsePgSsl() activaba TLS contra un PostgreSQL local sin SSL, la
 * conexión fallaba y el backend caía en silencio al almacén en memoria.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { shouldUsePgSsl } from '../../apps/backend/src/services/postgres.js';
import { ROOT_DIR } from '../helpers/repo.js';

type Service = { environment?: Record<string, string>; command?: string };

/** Resuelve `${VAR:-default}` y `${VAR:?msg}` como lo haría Compose sin .env. */
function resolveDefaults(value: string): string {
  return value.replace(/\$\{[A-Z_]+:-([^}]*)\}/g, '$1').replace(/\$\{[A-Z_]+(?::\?[^}]*)?\}/g, 'x');
}

test('🐘 Compose: el API no exige TLS a un PostgreSQL local que no lo ofrece', () => {
  const compose = yaml.load(fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.yaml'), 'utf8')) as {
    services: Record<string, Service>;
  };
  const api = compose.services.api.environment ?? {};
  const postgresOffersTls = /\bssl=on\b/.test(compose.services.postgres.command ?? '');

  const env = Object.fromEntries(Object.entries(api).map(([key, value]) => [key, resolveDefaults(String(value))]));
  const usesTls = shouldUsePgSsl(env.DATABASE_URL, env);

  assert.equal(
    usesTls,
    postgresOffersTls,
    `El API ${usesTls ? 'exige' : 'no usa'} TLS pero el PostgreSQL de Compose ${postgresOffersTls ? 'lo ofrece' : 'no lo ofrece'}`,
  );
});
