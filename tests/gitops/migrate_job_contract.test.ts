/**
 * ==============================================================================
 * Contrato del Job de Migración de Esquema (ADR-011, AUD-ARCH-DB-001)
 * ==============================================================================
 * Las migraciones Drizzle las aplica un Job dedicado entre PostgreSQL (wave 0) y la
 * API (wave 2), con conexión directa a PostgreSQL. La API productiva ya no migra al
 * arrancar: solo verifica el esquema (tests/unit/postgres_fail_closed.test.ts).
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type K8sDoc, PROFILES, renderChart } from '../helpers/helm-render.js';

const DEPLOYABLE = {
  ...PROFILES,
  cloud: [...PROFILES.prod, 'gitops/environments/cloud/values.yaml'],
};

const migrateJobOf = (docs: K8sDoc[]) => docs.find((d) => d.kind === 'Job' && d.metadata.name.endsWith('-db-migrate'));
const wave = (doc: K8sDoc | undefined) => Number(doc?.metadata.annotations?.['argocd.argoproj.io/sync-wave'] ?? 0);

test('🗄️ Migrate Job: todo perfil desplegable aplica las migraciones con la imagen de la API', () => {
  for (const [profile, files] of Object.entries(DEPLOYABLE)) {
    const docs = renderChart(files);
    const job = migrateJobOf(docs);
    assert.ok(job, `[${profile}] debe renderizarse el Job de migración`);

    const migrator = job.spec.template.spec.containers[0];
    const api = docs.find((d) => d.kind === 'Deployment' && d.metadata.name === 'pokemon-api')!.spec.template.spec
      .containers[0];
    assert.equal(migrator.image, api.image, `[${profile}] mismo digest firmado que la API`);
    assert.deepEqual(migrator.command, ['node', 'dist/migrate.js'], `[${profile}] debe ejecutar el CLI de migración`);
    assert.deepEqual(migrator.envFrom, api.envFrom, `[${profile}] mismo ConfigMap y Secret que la API`);

    // DDL directo a PostgreSQL, nunca por PgBouncer en modo transacción (ADR-011).
    const env = Object.fromEntries(
      (migrator.env as Array<{ name: string; value: string }>).map((e) => [e.name, e.value]),
    );
    assert.equal(env.POSTGRES_HOST, 'postgres-service', `[${profile}] el Job debe conectar directo a PostgreSQL`);
    assert.equal(env.POSTGRES_PORT, '5432', `[${profile}] puerto directo de PostgreSQL`);

    assert.equal(
      job.spec.template.spec.restartPolicy,
      'Never',
      `[${profile}] los reintentos los gobierna backoffLimit`,
    );
    assert.equal(
      job.spec.template.metadata.labels['app.kubernetes.io/component'],
      'db-migrator',
      `[${profile}] componente propio para su NetworkPolicy`,
    );
  }
});

test('🗄️ Migrate Job: corre como hook Sync entre PostgreSQL y la API', () => {
  for (const [profile, files] of Object.entries(DEPLOYABLE)) {
    const docs = renderChart(files);
    const job = migrateJobOf(docs)!;
    const annotations = job.metadata.annotations ?? {};
    // PreSync corre antes del StatefulSet de PostgreSQL: fallaría en la primera instalación.
    assert.equal(annotations['argocd.argoproj.io/hook'], 'Sync', `[${profile}] hook Sync, no PreSync`);
    assert.match(annotations['argocd.argoproj.io/hook-delete-policy'] ?? '', /BeforeHookCreation/);
    assert.equal(annotations['helm.sh/hook'], 'post-install,pre-upgrade', `[${profile}] orden equivalente sin ArgoCD`);

    const postgres = docs.find((d) => d.kind === 'StatefulSet' && d.metadata.name === 'postgres');
    const api = docs.find((d) => d.kind === 'Deployment' && d.metadata.name === 'pokemon-api');
    assert.ok(wave(postgres) < wave(job), `[${profile}] el Job debe correr después de PostgreSQL`);
    assert.ok(wave(job) < wave(api), `[${profile}] el Job debe terminar antes de desplegar la API`);
  }
});

test('🗄️ Migrate Job: la red solo le permite DNS y PostgreSQL', () => {
  for (const [profile, files] of Object.entries(DEPLOYABLE)) {
    const docs = renderChart(files);
    const policies = docs.filter((d) => d.kind === 'NetworkPolicy');

    const postgresIngress = policies.find((p) => p.metadata.name.endsWith('-allow-postgres-ingress'))!;
    const sources = postgresIngress.spec.ingress.flatMap((r: any) => r.from ?? []);
    assert.ok(
      sources.some((p: any) => p.podSelector?.matchLabels?.['app.kubernetes.io/component'] === 'db-migrator'),
      `[${profile}] PostgreSQL debe admitir al Job de migración`,
    );

    const egress = policies.find((p) => p.metadata.name.endsWith('-allow-db-migrator-egress'));
    assert.ok(egress, `[${profile}] el Job debe tener una política de salida propia`);
    assert.equal(egress.spec.podSelector.matchLabels['app.kubernetes.io/component'], 'db-migrator');
    assert.deepEqual(egress.spec.policyTypes, ['Egress']);
    const peers = egress.spec.egress.flatMap((r: any) => r.to ?? []);
    assert.deepEqual(
      peers.filter((p: any) => p.ipBlock),
      [],
      `[${profile}] el Job no necesita salida por CIDR`,
    );
    const ports = egress.spec.egress.flatMap((r: any) => (r.ports ?? []).map((p: any) => p.port)).sort();
    assert.deepEqual(ports, [53, 53, 5432], `[${profile}] solo DNS (UDP/TCP 53) y PostgreSQL`);
  }
});
