/**
 * ==============================================================================
 * Hardening de CronJobs y Admisión Pod Security (AUD-INF-CRONSEC-001)
 * ==============================================================================
 * Todos los CronJobs (db-backup, gdrive-sync, dr-verification) deben cumplir el estándar
 * Pod Security Standards (Restricted) y las políticas Kyverno de admisión, configurando
 * seccompProfile: { type: RuntimeDefault } tanto en el pod como en los contenedores.
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';
import { isHelmAvailable } from '../../scripts/lib/helm.js';
import { renderChart } from '../helpers/helm-render.js';

const TEMPLATES_DIR = path.join(ROOT_DIR, 'infra/helm/pokedex/templates');
const CRONJOB_TEMPLATES = ['backup-cronjob.yaml', 'backup-gdrive-cronjob.yaml', 'backup-restore-verify-cronjob.yaml'];

test('🛡️ AUD-INF-CRONSEC-001: Templates de CronJobs configuran seccompProfile RuntimeDefault en Pod y contenedor', () => {
  for (const file of CRONJOB_TEMPLATES) {
    const content = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8');
    const matches = [...content.matchAll(/seccompProfile:\s*\r?\n\s*type:\s*RuntimeDefault/g)];
    assert.equal(
      matches.length,
      2,
      `${file} debe declarar exactamente 2 seccompProfile RuntimeDefault (uno en el Pod spec y otro en el contenedor spec); encontradas: ${matches.length}`,
    );
  }
});

test('🛡️ AUD-INF-CRONSEC-001: backup-restore-verify-cronjob usa el helper canónico pokedex.secretName', () => {
  const content = fs.readFileSync(path.join(TEMPLATES_DIR, 'backup-restore-verify-cronjob.yaml'), 'utf-8');
  assert.match(
    content,
    /name:\s*\{\{\s*include\s+"pokedex\.secretName"\s+\.\s*\}\}/,
    'backup-restore-verify-cronjob debe usar {{ include "pokedex.secretName" . }}',
  );
  assert.ok(
    !content.includes('.Values.secrets.existingSecret | default'),
    'backup-restore-verify-cronjob no debe usar construcción manual para el nombre del secret',
  );
});

const TARGET_ENVIRONMENTS = [
  { name: 'default', values: [] as string[] },
  { name: 'proxmox-preprod', values: ['gitops/environments/proxmox-preprod/values.yaml'] },
];

for (const env of TARGET_ENVIRONMENTS) {
  test(`🛡️ AUD-INF-CRONSEC-001: CronJobs renderizados en ${env.name} configuran seccompProfile RuntimeDefault`, (t) => {
    if (!isHelmAvailable()) {
      t.skip('helm no disponible en el host local; verificación estática de templates aprobada');
      return;
    }

    const docs = renderChart(env.values) as unknown as Array<{
      kind: string;
      metadata: { name: string };
      spec?: any;
    }>;
    const cronjobs = docs.filter((d) => d.kind === 'CronJob');

    assert.ok(cronjobs.length > 0, `Debe haber CronJobs renderizados en ${env.name}`);

    for (const cj of cronjobs) {
      const podSec = cj.spec.jobTemplate.spec.template.spec.securityContext;
      assert.equal(
        podSec?.seccompProfile?.type,
        'RuntimeDefault',
        `${cj.metadata.name} debe declarar seccompProfile.type=RuntimeDefault a nivel de Pod`,
      );

      for (const container of cj.spec.jobTemplate.spec.template.spec.containers) {
        assert.equal(
          container.securityContext?.seccompProfile?.type,
          'RuntimeDefault',
          `${cj.metadata.name}/${container.name} debe declarar seccompProfile.type=RuntimeDefault a nivel de contenedor`,
        );
      }
    }
  });
}
