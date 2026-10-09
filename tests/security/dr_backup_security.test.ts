import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';
import { type K8sDoc, PROFILES, podSpecOf, renderChart } from '../helpers/helm-render.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml } from '../helpers/yaml.js';

// ------------------------------------------------------------------------------
// Los CronJob de backup, verificación y Drive se comprueban sobre el chart renderizado (default, prod y pre-prod):
// lo que cuenta es el manifiesto que recibe el clúster, no el texto de la plantilla.
// ------------------------------------------------------------------------------

const BACKUP_CRONJOB = 'pokedex-db-backup';
const VERIFY_CRONJOB = 'pokedex-dr-restore-verify';
const GDRIVE_CRONJOB = 'pokedex-gdrive-sync';
const BACKUP_PVC = 'pokedex-backup-pvc';
const IMDS = '169.254.169.254/32';

const cronJob = (docs: K8sDoc[], name: string) => docs.find((d) => d.kind === 'CronJob' && d.metadata.name === name);
const named = (docs: K8sDoc[], kind: string, name: string) =>
  docs.find((d) => d.kind === kind && d.metadata.name === name);
const mainContainer = (doc: K8sDoc) => podSpecOf(doc).containers[0];
const scriptOf = (doc: K8sDoc): string => mainContainer(doc).command.at(-1);
const volumeOf = (doc: K8sDoc, name: string) => podSpecOf(doc).volumes.find((v: any) => v.name === name);
const envOf = (doc: K8sDoc, name: string) => mainContainer(doc).env.find((e: any) => e.name === name);

/** Pod de backup endurecido: sin token de ServiceAccount, no root, raíz de solo lectura y sin capacidades. */
function assertHardenedBackupPod(doc: K8sDoc, label: string): void {
  const spec = podSpecOf(doc);
  const container = spec.containers[0];
  assert.equal(spec.automountServiceAccountToken, false, `${label}: sin token de ServiceAccount`);
  assert.equal(spec.securityContext?.runAsNonRoot, true, `${label}: debe correr como no root`);
  assert.equal(container.securityContext?.allowPrivilegeEscalation, false, `${label}: sin escalada de privilegios`);
  assert.equal(container.securityContext?.readOnlyRootFilesystem, true, `${label}: raíz de solo lectura`);
  assert.deepEqual(
    container.securityContext?.capabilities?.drop,
    ['ALL'],
    `${label}: debe descartar todas las capacidades`,
  );
}

test('🛡️ Disaster Recovery: el CronJob de backup cifra con AES-256 + PBKDF2, falla cerrado sin clave y corre endurecido', () => {
  for (const [profile, files] of Object.entries(PROFILES)) {
    const docs = renderChart(files);
    const job = cronJob(docs, BACKUP_CRONJOB);
    assert.ok(job, `[${profile}] debe renderizarse ${BACKUP_CRONJOB}`);
    assertHardenedBackupPod(job, `[${profile}] backup`);

    const key = envOf(job, 'BACKUP_ENCRYPTION_KEY')?.valueFrom?.secretKeyRef;
    assert.ok(key, `[${profile}] BACKUP_ENCRYPTION_KEY debe venir de un Secret`);
    assert.equal(key.optional, false, `[${profile}] la clave de cifrado debe ser obligatoria (optional: false)`);

    const script = scriptOf(job);
    for (const expected of ['aes-256-cbc', 'pbkdf2', 'sha256sum', 'OFFSITE_BACKUP_ENABLED', 'OFFSITE_BUCKET']) {
      assert.ok(script.includes(expected), `[${profile}] el script de backup debe usar ${expected}`);
    }
    assert.ok(
      script.includes(': "${BACKUP_ENCRYPTION_KEY:?Error:'),
      `[${profile}] debe fallar cerrado con error explícito si falta BACKUP_ENCRYPTION_KEY`,
    );
    assert.ok(!script.includes('pokedex_dr_default_secure_key_2026'), `[${profile}] sin clave de respaldo hardcodeada`);
    assert.ok(
      script.indexOf('gzip -9') !== -1 && script.indexOf('gzip -9') < script.indexOf('openssl enc'),
      `[${profile}] el volcado debe comprimirse antes de cifrarse`,
    );

    // Zero-Trust: el pod de backup solo sale hacia CoreDNS y la base de datos.
    const policy = named(docs, 'NetworkPolicy', 'pokedex-allow-backup-egress');
    assert.ok(policy, `[${profile}] debe renderizarse la NetworkPolicy del pod de backup`);
    assert.deepEqual(policy.spec.policyTypes, ['Egress']);
    const peers = policy.spec.egress.flatMap((rule: any) => rule.to ?? []);
    assert.ok(
      peers.some((p: any) => p.podSelector?.matchLabels?.['k8s-app'] === 'kube-dns'),
      `[${profile}] debe permitir DNS hacia CoreDNS`,
    );
    assert.ok(
      peers.some((p: any) => p.podSelector?.matchLabels?.['app.kubernetes.io/component'] === 'database'),
      `[${profile}] debe permitir salida hacia la base de datos`,
    );
    assert.ok(!peers.some((p: any) => p.ipBlock), `[${profile}] el pod de backup no puede salir por ipBlock`);
  }
});

test('🛡️ Disaster Recovery: el CronJob de verificación audita checksum, descifrado y tablas, endurecido y sobre el mismo PVC', () => {
  for (const [profile, files] of Object.entries(PROFILES)) {
    const job = cronJob(renderChart(files), VERIFY_CRONJOB);
    assert.ok(job, `[${profile}] debe renderizarse ${VERIFY_CRONJOB}`);
    assertHardenedBackupPod(job, `[${profile}] verificación`);

    const script = scriptOf(job);
    for (const expected of ['sha256sum -c', 'openssl enc -d -aes-256-cbc', 'pokedex_entries']) {
      assert.ok(script.includes(expected), `[${profile}] el script de verificación debe incluir ${expected}`);
    }
    assert.ok(
      mainContainer(job).volumeMounts.some((m: any) => m.name === 'backup-storage' && m.mountPath === '/backups'),
      `[${profile}] debe montar los backups en /backups`,
    );
  }
});

test('🛡️ Disaster Recovery: backup, verificación y Drive montan un PersistentVolumeClaim real (Anti-emptyDir)', () => {
  for (const [file, label] of [
    ['infra/helm/pokedex/values.yaml', 'values base'],
    ['gitops/environments/proxmox-preprod/values.yaml', 'values pre-prod'],
  ]) {
    assert.equal(readYaml(file).backup.persistence.enabled, true, `${label}: backup.persistence.enabled debe ser true`);
  }

  for (const [profile, files] of Object.entries(PROFILES)) {
    const docs = renderChart(files);
    assert.ok(named(docs, 'PersistentVolumeClaim', BACKUP_PVC), `[${profile}] debe renderizarse el PVC ${BACKUP_PVC}`);

    const jobs = [BACKUP_CRONJOB, VERIFY_CRONJOB, GDRIVE_CRONJOB].flatMap((name) => {
      const job = cronJob(docs, name);
      return job ? [{ name, job }] : [];
    });
    assert.ok(jobs.length >= 2, `[${profile}] deben renderizarse al menos el backup y la verificación`);

    for (const { name, job } of jobs) {
      const volume = volumeOf(job, 'backup-storage');
      assert.equal(
        volume?.persistentVolumeClaim?.claimName,
        BACKUP_PVC,
        `[${profile}] ${name}: debe montar ${BACKUP_PVC}`,
      );
      assert.equal(volume.emptyDir, undefined, `[${profile}] ${name}: backup-storage NUNCA puede ser emptyDir`);
    }
  }
});

test('🛡️ Disaster Recovery: el CronJob de Drive usa rclone por digest, monta el PVC en solo lectura y sale solo a Google', () => {
  const prod = renderChart(PROFILES.prod);
  const job = cronJob(prod, GDRIVE_CRONJOB);
  assert.ok(job, 'prod debe renderizar el CronJob de Drive');
  assertHardenedBackupPod(job, 'gdrive');

  assert.match(mainContainer(job).image, /^rclone\/rclone@sha256:[a-f0-9]{64}$/, 'rclone debe fijarse por digest');
  const mount = mainContainer(job).volumeMounts.find((m: any) => m.mountPath === '/backups');
  assert.equal(mount?.readOnly, true, 'el volumen /backups debe montarse de solo lectura (inmutabilidad del origen)');

  // GDRIVE_TOKEN es obligatorio: tanto en el manifiesto (optional: false) como en el script (fail-closed).
  const token = envOf(job, 'RCLONE_CONFIG_GDRIVE_TOKEN')?.valueFrom?.secretKeyRef;
  assert.equal(token?.key, 'GDRIVE_TOKEN');
  assert.equal(token?.optional, false, 'RCLONE_CONFIG_GDRIVE_TOKEN debe ser obligatorio (optional: false)');
  assert.ok(
    scriptOf(job).includes(
      ': "${RCLONE_CONFIG_GDRIVE_TOKEN:?GDRIVE_TOKEN is mandatory when gdrive backup is enabled}"',
    ),
    'el script debe fallar cerrado si falta el token',
  );

  // Con Cilium (prod): NetworkPolicy solo con DNS y filtrado L7 por FQDN hacia Google.
  const policy = named(prod, 'NetworkPolicy', 'pokedex-allow-gdrive-sync-egress');
  assert.ok(policy, 'debe renderizarse la NetworkPolicy de Drive');
  assert.deepEqual(policy.spec.policyTypes, ['Egress']);
  assert.ok(
    policy.spec.egress.some((rule: any) => rule.ports?.some((p: any) => p.port === 53)),
    'debe permitir DNS en el puerto 53',
  );
  const cnp = named(prod, 'CiliumNetworkPolicy', 'pokedex-gdrive-sync-cilium-l7-policy');
  assert.ok(cnp, 'con Cilium activo debe renderizarse la política L7');
  const fqdnRule = cnp.spec.egress.find((rule: any) => rule.toFQDNs);
  assert.deepEqual(
    fqdnRule.toFQDNs,
    [{ matchPattern: '*.googleapis.com' }, { matchName: 'accounts.google.com' }],
    'la allowlist FQDN debe ser exactamente Google APIs y la autenticación de Google',
  );
  assert.deepEqual(fqdnRule.toPorts, [{ ports: [{ port: '443', protocol: 'TCP' }] }]);

  // Sin Cilium (pre-prod): el respaldo es una NetworkPolicy por ipBlock con Anti-SSRF, y no hay política L7.
  assert.equal(readYaml('gitops/environments/proxmox-preprod/values.yaml').backup.gdrive.enabled, true);
  const preprod = renderChart(PROFILES.preprod);
  assert.ok(cronJob(preprod, GDRIVE_CRONJOB), 'pre-prod debe renderizar el CronJob de Drive');
  assert.ok(!preprod.some((d) => d.kind === 'CiliumNetworkPolicy'), 'pre-prod no renderiza políticas de Cilium');
  const fallback = named(preprod, 'NetworkPolicy', 'pokedex-allow-gdrive-sync-egress');
  assert.ok(fallback);
  const open = fallback.spec.egress
    .flatMap((rule: any) => (rule.to ?? []).map((peer: any) => ({ peer, ports: rule.ports })))
    .find(({ peer }: any) => peer.ipBlock?.cidr === '0.0.0.0/0');
  assert.ok(open, 'sin Cilium debe renderizarse el egress HTTPS por ipBlock');
  assert.ok(open.peer.ipBlock.except.includes(IMDS), 'el fallback debe bloquear el endpoint IMDS (Anti-SSRF)');
  assert.deepEqual(open.ports, [{ protocol: 'TCP', port: 443 }]);

  // Deshabilitado por defecto: el chart base no debe crear el CronJob de Drive.
  assert.equal(cronJob(renderChart(PROFILES.default), GDRIVE_CRONJOB), undefined, 'por defecto no hay sync a Drive');
});

test('🛡️ Disaster Recovery: el CronJob de Drive falla de forma estricta (fail-closed) si GDRIVE_TOKEN está ausente o vacío', () => {
  // Se ejecuta la guarda que realmente trae el manifiesto renderizado, no una copia escrita en el test.
  const job = cronJob(renderChart(PROFILES.prod), GDRIVE_CRONJOB);
  assert.ok(job);
  const guard = scriptOf(job)
    .split('\n')
    .filter((line) => line.startsWith('set -eu') || line.includes('RCLONE_CONFIG_GDRIVE_TOKEN:?'));
  assert.equal(guard.length, 2, 'el script debe abrir con `set -eu` y la guarda del token');
  const failScript = `${guard.join('; ')}; echo "SUCCEEDED"`;

  const runShellScript = (script: string, env: NodeJS.ProcessEnv) => {
    let shBinary = 'sh';
    if (process.platform === 'win32') {
      const gitSh = 'C:\\Program Files\\Git\\bin\\sh.exe';
      shBinary = fs.existsSync(gitSh) ? gitSh : 'bash';
    }
    return execFileSync(shBinary, ['-c', script], {
      env,
      stdio: 'pipe',
    });
  };

  assert.throws(
    () => {
      runShellScript(failScript, { ...process.env, RCLONE_CONFIG_GDRIVE_TOKEN: '' });
    },
    (err: any) => {
      const stderr = err.stderr ? err.stderr.toString() : '';
      return stderr.includes('GDRIVE_TOKEN is mandatory when gdrive backup is enabled');
    },
    'El job DEBE fallar inmediatamente con código de error y mensaje explícito si GDRIVE_TOKEN está vacío',
  );

  assert.throws(
    () => {
      const cleanEnv = { ...process.env };
      delete cleanEnv.RCLONE_CONFIG_GDRIVE_TOKEN;
      runShellScript(failScript, cleanEnv);
    },
    (err: any) => {
      const stderr = err.stderr ? err.stderr.toString() : '';
      return stderr.includes('GDRIVE_TOKEN is mandatory when gdrive backup is enabled');
    },
    'El job DEBE fallar inmediatamente si RCLONE_CONFIG_GDRIVE_TOKEN no está definido',
  );
});

test('🛡️ Disaster Recovery: el CronJob de Drive guarda la config de rclone en un volumen escribible', () => {
  // Con readOnlyRootFilesystem rclone no puede persistir el access token renovado en /.rclone.conf:
  // cada ejecución pierde ~10 s en reintentos y registra un ERROR espurio.
  const job = cronJob(renderChart(PROFILES.prod), GDRIVE_CRONJOB);
  assert.ok(job);
  assert.equal(
    envOf(job, 'RCLONE_CONFIG')?.value,
    '/tmp/rclone.conf',
    'RCLONE_CONFIG debe apuntar al volumen escribible',
  );
  assert.ok(
    mainContainer(job).volumeMounts.some((m: any) => m.mountPath === '/tmp' && m.name === 'tmp'),
    'el volumen escribible debe montarse en /tmp',
  );
  assert.deepEqual(volumeOf(job, 'tmp')?.emptyDir, {}, '/tmp debe ser un emptyDir');
  assert.equal(mainContainer(job).securityContext.readOnlyRootFilesystem, true, 'la raíz debe seguir en solo lectura');
});

test('🛡️ Disaster Recovery: dr_verify_restore.sh implementa protocolo automatizado, clave efímera dinámica y restauración real', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/dr_verify_restore.sh');
  assert.ok(fs.existsSync(scriptPath), 'scripts/dr_verify_restore.sh debe existir');
  const content = fs.readFileSync(scriptPath, 'utf-8');

  assert.ok(content.includes('openssl enc -d -aes-256-cbc'), 'Debe descifrar volcados AES-256-CBC');
  assert.ok(content.includes('gzip -t'), 'Debe verificar la integridad del stream comprimido gzip');
  assert.ok(content.includes('sha256sum'), 'Debe validar checksum de integridad antes del descifrado');
  assert.ok(content.includes('pokedex_entries'), 'Debe verificar la integridad de la estructura de tablas');
  assert.ok(content.includes('--dry-run'), 'Debe soportar modo de prueba sintética dry-run para CI');
  assert.ok(
    !content.includes('pokedex_dr_default_secure_key_2026'),
    'dr_verify_restore.sh no debe contener clave hardcodeada pública',
  );
  assert.ok(
    !content.includes('synthetic_dr_key_ephemeral_test_2026'),
    'dr_verify_restore.sh no debe contener clave fallback estática',
  );
  assert.ok(
    content.includes('openssl rand -hex 32'),
    'Debe generar clave efímera dinámica de alta entropía con openssl rand',
  );
  assert.ok(
    content.includes(': "${BACKUP_ENCRYPTION_KEY:?Error:'),
    'dr_verify_restore.sh debe validar fail-closed en ejecuciones reales',
  );

  // Validar restauración real en PostgreSQL y aserciones de integridad
  assert.ok(content.includes('count(*)'), 'Debe validar conteo de registros en la restauración');
  assert.ok(content.includes('pg_indexes'), 'Debe validar la integridad de índices en PostgreSQL');
  assert.ok(content.includes('to_regclass'), 'Debe validar la creación formal del objeto tabla');
  assert.ok(content.includes('pg_constraint'), 'Debe validar Primary Keys');
  assert.ok(content.includes("relkind = 'S'"), 'Debe validar secuencias activas');

  // Validar pinning de imagen efímera y bandera --syntax-only
  assert.match(
    content,
    /postgres:16-alpine@sha256:[a-f0-9]{64}/,
    'PostgreSQL efímero debe estar fijado por digest criptográfico SHA-256',
  );
  assert.ok(content.includes('--syntax-only'), 'Debe soportar bandera explícita --syntax-only');
  assert.ok(
    content.includes('No hay motor PostgreSQL disponible'),
    'Debe fallar (fail-closed) si no hay motor SQL y no se pasa --syntax-only',
  );
});

test('🛡️ Disaster Recovery: values.yaml y Runbook oficial definen arquitectura 3-2-1 y SLAs RPO < 24h / RTO < 2h', () => {
  const offsite = readYaml('infra/helm/pokedex/values.yaml').backup.offsite;
  assert.ok(offsite, 'values.yaml debe declarar la sección backup.offsite');
  assert.equal(offsite.bucket, 'pokedex-backups-offsite', 'values.yaml debe definir el bucket offsite por defecto');

  const docPath = path.join(ROOT_DIR, 'docs/runbooks/DISASTER_RECOVERY_PLAN.md');
  assert.ok(fs.existsSync(docPath), 'DISASTER_RECOVERY_PLAN.md debe existir');
  const content = fs.readFileSync(docPath, 'utf-8');

  assert.ok(content.includes('< 24 horas'), 'Debe definir formalmente RPO < 24 horas');
  assert.ok(content.includes('< 2 horas'), 'Debe definir formalmente RTO < 2 horas');
  assert.ok(content.includes('AES-256-CBC'), 'Debe especificar el estándar criptográfico');
  assert.ok(content.includes('3-2-1'), 'Debe formalizar la estrategia 3-2-1 de copias de seguridad');
  assert.ok(content.includes('Off-site'), 'Debe contemplar réplica remota off-site en Object Storage');
});

test('🛡️ Disaster Recovery Blueprints: Esqueletos Off-site (S3-compatible agnóstico y PBS Remote Sync) formalizados como inactivos', () => {
  const blueprintDocPath = path.join(ROOT_DIR, 'docs/operations/OFFSITE_BACKUP_BLUEPRINTS.md');
  assert.ok(fs.existsSync(blueprintDocPath), 'OFFSITE_BACKUP_BLUEPRINTS.md debe existir');
  const blueprintContent = fs.readFileSync(blueprintDocPath, 'utf-8');

  assert.ok(blueprintContent.includes('S3-Compatible'), 'Debe documentar esqueleto S3-compatible');
  assert.ok(blueprintContent.includes('Proxmox Backup Server'), 'Debe documentar esqueleto PBS');
  assert.ok(
    blueprintContent.includes('PREPARADO (INACTIVO)'),
    'Debe formalizar que los esqueletos off-site están inactivos',
  );
  assert.ok(
    blueprintContent.includes('Riesgo Residual Asumido'),
    'Debe advertir sobre el riesgo residual de SPOF del host',
  );

  const pbsPlaybookPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_pbs_backup_blueprint.yaml');
  assert.ok(fs.existsSync(pbsPlaybookPath), 'setup_pbs_backup_blueprint.yml debe existir');
  const pbsContent = fs.readFileSync(pbsPlaybookPath, 'utf-8');
  assert.ok(
    pbsContent.includes('pbs_remote_offsite_enabled: false'),
    'PBS playbook debe tener offsite inactivo por defecto',
  );
  assert.ok(
    pbsContent.includes('proxmox-backup-manager sync-job'),
    'PBS playbook debe definir el esqueleto de sync job',
  );

  const esoTemplatePath = path.join(ROOT_DIR, 'infra/k8s/eso/backup-offsite-externalsecret.yaml.template');
  assert.ok(fs.existsSync(esoTemplatePath), 'backup-offsite-externalsecret.yaml.template debe existir');

  assert.equal(
    readYaml('gitops/environments/proxmox-preprod/values.yaml').backup.offsite.enabled,
    false,
    'Proxmox GitOps values debe declarar offsite inactivo',
  );

  const drpPlanPath = path.join(ROOT_DIR, 'docs/runbooks/DISASTER_RECOVERY_PLAN.md');
  const drpPlan = fs.readFileSync(drpPlanPath, 'utf-8');
  assert.ok(
    drpPlan.includes('2.2. Estado de Implementación'),
    'DRP debe incluir sección 2.2 de estado de implementación',
  );
  assert.ok(drpPlan.includes('ESQUELETO (INACTIVO)'), 'DRP debe formalizar off-site como esqueleto inactivo');
});

test('🛡️ Disaster Recovery: Google Drive Off-site (Alternativa A Docker Compose & Alternativa B Proxmox VE)', () => {
  // 1. Alternativa A: Docker Compose Dev con servicio rclone y script dev
  const dockerComposeDevPath = path.join(ROOT_DIR, 'docker-compose.dev.yaml');
  assert.ok(fs.existsSync(dockerComposeDevPath), 'docker-compose.dev.yaml debe existir');
  const composeContent = fs.readFileSync(dockerComposeDevPath, 'utf-8');
  assert.ok(composeContent.includes('backup-gdrive:'), 'Debe definir servicio backup-gdrive');
  assert.ok(composeContent.includes('rclone/rclone'), 'Debe usar imagen oficial rclone');
  assert.match(
    composeContent,
    /rclone\/rclone(?::[\w.-]+)?@sha256:[a-f0-9]{64}/,
    'docker-compose.dev.yaml debe fijar rclone por digest SHA-256 inmutable',
  );
  assert.ok(composeContent.includes('profiles:'), 'Debe aislarse mediante perfiles de compose');
  assert.ok(composeContent.includes('backup'), 'Debe pertenecer al perfil backup');

  const devScriptPath = path.join(ROOT_DIR, 'scripts/dev-backup-gdrive.ts');
  assert.ok(fs.existsSync(devScriptPath), 'scripts/dev-backup-gdrive.ts debe existir');
  const devScriptContent = fs.readFileSync(devScriptPath, 'utf-8');
  assert.ok(devScriptContent.includes('pg_dump'), 'Script dev debe realizar pg_dump');
  assert.ok(devScriptContent.includes('aes-256-cbc'), 'Script dev debe cifrar con AES-256-CBC');
  assert.ok(devScriptContent.includes('sha256'), 'Script dev debe calcular checksum SHA-256');

  // 2. Alternativa B: Playbook Ansible para Proxmox VE
  const playbookPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_gdrive_backup.yaml');
  assert.ok(fs.existsSync(playbookPath), 'setup_gdrive_backup.yml debe existir');
  const playbookContent = fs.readFileSync(playbookPath, 'utf-8');
  assert.ok(playbookContent.includes('rclone'), 'Playbook debe instalar o configurar rclone');
  assert.ok(playbookContent.includes('pokedex-gdrive-sync.service'), 'Playbook debe desplegar servicio systemd');
  assert.ok(playbookContent.includes('pokedex-gdrive-sync.timer'), 'Playbook debe desplegar temporizador systemd');
  assert.ok(playbookContent.includes("mode: '0600'"), 'rclone.conf debe protegerse con permisos estrictos 0600');

  // 3. Documentación oficial y Taskfile
  const guidePath = path.join(ROOT_DIR, 'docs/operations/GDRIVE_BACKUP_GUIDE.md');
  assert.ok(fs.existsSync(guidePath), 'GDRIVE_BACKUP_GUIDE.md debe existir');
  const guideContent = fs.readFileSync(guidePath, 'utf-8');
  assert.ok(guideContent.includes('Google Drive'), 'Guía debe documentar Google Drive');
  assert.ok(guideContent.includes('rclone authorize'), 'Guía debe documentar rclone authorize drive');

  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfileContent.includes('dr:gdrive:backup:dev:'), 'Taskfile debe definir dr:gdrive:backup:dev');
  assert.ok(taskfileContent.includes('dr:gdrive:sync:dev:'), 'Taskfile debe definir dr:gdrive:sync:dev');
  assert.ok(taskfileContent.includes('dr:gdrive:setup:proxmox:'), 'Taskfile debe definir dr:gdrive:setup:proxmox');
});

test('🛡️ Disaster Recovery Tooling: Taskfile.yaml define tareas dr:drill (simulación/mecanismo) y dr:verify (certificación real)', () => {
  const content = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(content.includes('dr:drill:'), 'Taskfile.yaml debe definir tarea dr:drill');
  assert.ok(content.includes('dr:verify:'), 'Taskfile.yaml debe definir tarea dr:verify');
  assert.ok(content.includes('dr_verify_restore.sh --dry-run'), 'dr:drill debe invocar dr_verify_restore.sh --dry-run');
  assert.ok(
    content.includes('dr_verify_restore.sh\n') || content.includes('dr_verify_restore.sh\r\n'),
    'dr:verify debe invocar dr_verify_restore.sh sin dry-run para certificación real',
  );
});

/**
 * La imagen de rclone se declara en dos lugares que no pueden compartir archivo: el compose de
 * desarrollo y el chart de Helm. Renovate los agrupa en un solo PR, pero este contrato es lo que
 * impide que diverjan si alguien edita solo uno.
 *
 * El chart declara `tag` y `digest` en campos separados (INFRA-005 prohíbe `tag@digest`) y Renovate
 * solo reconoce el `tag` de `values.yaml`: una actualización sube la versión pero deja el `digest`
 * anterior, que la plantilla del CronJob prioriza, de modo que la etiqueta diría una versión y la
 * imagen real sería otra. Este test convierte esa divergencia silenciosa en un fallo explícito.
 */
test('🛡️ Disaster Recovery: la imagen de rclone es la misma (versión y digest) en docker-compose y en el chart de Helm', () => {
  const compose = fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.dev.yaml'), 'utf-8');
  const composeMatch = compose.match(/image:\s*rclone\/rclone:([\w.-]+)@(sha256:[a-f0-9]{64})/);
  assert.ok(
    composeMatch,
    'docker-compose.dev.yaml debe declarar rclone como rclone/rclone:<tag>@sha256:<digest> (tag y digest)',
  );
  const [, composeTag, composeDigest] = composeMatch;

  const values = yaml.load(fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml'), 'utf-8')) as {
    backup: { gdrive: { image: { repository?: string; tag?: string; digest?: string } } };
  };
  const image = values.backup.gdrive.image;

  assert.equal(image.repository, 'rclone/rclone', 'El chart debe usar la imagen oficial rclone/rclone');
  assert.equal(
    image.tag,
    composeTag,
    `backup.gdrive.image.tag del chart (${image.tag}) debe coincidir con la versión de docker-compose.dev.yaml (${composeTag})`,
  );
  assert.equal(
    image.digest,
    composeDigest,
    `backup.gdrive.image.digest del chart no coincide con el de docker-compose.dev.yaml para rclone ${composeTag}: ` +
      `actualícelo a ${composeDigest} (Renovate cambia solo el tag; el digest se copia del compose en el mismo PR)`,
  );

  // Lo que se despliega es la imagen del CronJob renderizado: debe llevar el digest del compose.
  const job = cronJob(renderChart(PROFILES.prod), GDRIVE_CRONJOB);
  assert.ok(job);
  assert.ok(
    mainContainer(job).image.endsWith(`@${composeDigest}`),
    `el CronJob renderizado debe desplegar rclone con el digest ${composeDigest}`,
  );
});

test('🔔 Disaster Recovery: las alertas cubren el sync a Drive y los Jobs atascados', () => {
  // PokedexDbBackupFailed/Stale filtran por ".*backup.*" y el job de Drive se llama "...-gdrive-sync":
  // un fallo de la copia off-site pasó días sin ninguna alerta.
  const doc = yaml.load(fs.readFileSync(path.join(ROOT_DIR, 'infra/monitoring/alerts.yaml'), 'utf-8')) as {
    groups: { rules: { alert: string; expr: string; labels?: Record<string, string> }[] }[];
  };
  const rules = new Map(doc.groups.flatMap((g) => g.rules).map((r) => [r.alert, r]));

  const failed = rules.get('PokedexGdriveSyncFailed');
  assert.ok(failed, 'Debe existir la alerta PokedexGdriveSyncFailed');
  assert.match(failed.expr, /kube_job_status_failed\{[^}]*gdrive-sync[^}]*\}\s*>\s*0/);

  const stale = rules.get('PokedexGdriveSyncStale');
  assert.ok(stale, 'Debe existir la alerta PokedexGdriveSyncStale');
  assert.match(stale.expr, /kube_cronjob_status_last_successful_time\{[^}]*gdrive-sync[^}]*\}/);
  assert.match(
    stale.expr,
    />\s*93600/,
    'La copia off-site se considera vencida tras 26 horas, igual que la de base de datos',
  );

  const stuck = rules.get('PokedexJobStuck');
  assert.ok(stuck, 'Debe existir la alerta genérica PokedexJobStuck');
  assert.match(stuck.expr, /kube_job_status_active/);
  assert.match(stuck.expr, /kube_job_status_start_time/);
  assert.match(stuck.expr, /pokemon-app/, 'Debe acotarse al namespace de la aplicación');
});
