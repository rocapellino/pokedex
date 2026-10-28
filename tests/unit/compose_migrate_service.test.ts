/**
 * Contrato Docker Compose ↔ migraciones (ADR-011, AUD-ARCH-DB-001).
 *
 * El API de Compose corre con NODE_ENV=production: verifica el esquema y no lo migra.
 * Un servicio `migrate` de una sola ejecución aplica las migraciones antes, igual que
 * el Job de Kubernetes, y el API espera a que termine con éxito.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { ROOT_DIR } from '../helpers/repo.js';

type Service = {
  build?: { context: string; dockerfile: string };
  command?: string[];
  environment?: Record<string, string>;
  depends_on?: Record<string, { condition: string }>;
  networks?: string[];
  restart?: string;
};

const compose = yaml.load(fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.yaml'), 'utf8')) as {
  services: Record<string, Service>;
};

test('🐘 Compose: un servicio migrate aplica el esquema con la imagen del API y conexión directa', () => {
  const { migrate, api } = compose.services;
  assert.ok(migrate, 'docker-compose.yaml debe declarar el servicio migrate');
  assert.deepEqual(migrate.build, api.build, 'migrate debe construirse con la misma imagen que el API');
  assert.deepEqual(migrate.command, ['node', 'dist/migrate.js']);
  assert.equal(migrate.restart, 'no', 'es una ejecución única: no debe reiniciarse');
  assert.match(migrate.environment?.DIRECT_DATABASE_URL ?? '', /@postgres:5432\//, 'DDL directo a PostgreSQL');
  assert.equal(migrate.depends_on?.postgres?.condition, 'service_healthy');
  assert.deepEqual(migrate.networks, ['backend-net'], 'solo necesita la red de datos');
});

test('🐘 Compose: el API arranca solo después de que migrate termine con éxito', () => {
  assert.equal(compose.services.api.environment?.NODE_ENV, 'production', 'precondición: el API verifica, no migra');
  assert.equal(compose.services.api.depends_on?.migrate?.condition, 'service_completed_successfully');
});
