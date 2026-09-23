import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve();

test('🛡️ Disaster Recovery: backup-cronjob.yaml implementa cifrado AES-256, checksum y hardening de pod', () => {
  const cronjobPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/backup-cronjob.yaml');
  assert.ok(fs.existsSync(cronjobPath), 'backup-cronjob.yaml debe existir en los templates de Helm');
  const content = fs.readFileSync(cronjobPath, 'utf-8');

  // Validar recurso CronJob
  assert.ok(content.includes('kind: CronJob'), 'Debe definir un recurso CronJob');
  assert.ok(content.includes('pokedex.fullname'), 'Debe usar helper de nombrado estándar');

  // Validar seguridad criptográfica
  assert.ok(content.includes('aes-256-cbc'), 'El volcado debe cifrarse con algoritmo AES-256-CBC');
  assert.ok(content.includes('pbkdf2'), 'Debe utilizar derivación de claves robusta PBKDF2');
  assert.ok(content.includes('sha256sum'), 'Debe calcular la suma de comprobación SHA-256 del volcado');
  assert.ok(content.includes('gzip -9'), 'El volcado debe comprimirse antes del cifrado');
  assert.ok(content.includes('optional: false'), 'La clave BACKUP_ENCRYPTION_KEY debe ser obligatoria (optional: false)');
  assert.ok(!content.includes('pokedex_dr_default_secure_key_2026'), 'No debe existir fallback hardcodeado público para BACKUP_ENCRYPTION_KEY');
  assert.ok(content.includes(': "${BACKUP_ENCRYPTION_KEY:?Error:'), 'Debe fallar cerrado con error explícito si falta BACKUP_ENCRYPTION_KEY');

  // Validar soporte de réplica remota off-site (S3 / MinIO / Object Storage)
  assert.ok(content.includes('OFFSITE_BACKUP_ENABLED'), 'Debe soportar sincronización remota off-site');
  assert.ok(content.includes('OFFSITE_BUCKET'), 'Debe parametrizar el bucket remoto');

  // Validar hardening del contenedor
  assert.ok(content.includes('runAsNonRoot: true'), 'El contenedor de backup debe correr como no root');
  assert.ok(content.includes('readOnlyRootFilesystem: true'), 'El sistema de archivos raíz debe ser de solo lectura');
  assert.ok(content.includes('- ALL'), 'Debe descartar todas las capacidades del kernel');

  // Validar aislamiento de red Zero-Trust del pod de backup
  assert.ok(content.includes('kind: NetworkPolicy'), 'Debe incluir NetworkPolicy para el pod de backup');
  assert.ok(content.includes('app.kubernetes.io/component: database'), 'Solo debe tener egress hacia la base de datos');
  assert.ok(content.includes('k8s-app: kube-dns'), 'Debe permitir resolución DNS hacia CoreDNS');
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
  assert.ok(!content.includes('pokedex_dr_default_secure_key_2026'), 'dr_verify_restore.sh no debe contener clave hardcodeada pública');
  assert.ok(!content.includes('synthetic_dr_key_ephemeral_test_2026'), 'dr_verify_restore.sh no debe contener clave fallback estática');
  assert.ok(content.includes('openssl rand -hex 32'), 'Debe generar clave efímera dinámica de alta entropía con openssl rand');
  assert.ok(content.includes(': "${BACKUP_ENCRYPTION_KEY:?Error:'), 'dr_verify_restore.sh debe validar fail-closed en ejecuciones reales');

  // Validar restauración real en PostgreSQL y aserciones de integridad
  assert.ok(content.includes('count(*)'), 'Debe validar conteo de registros en la restauración');
  assert.ok(content.includes('pg_indexes'), 'Debe validar la integridad de índices en PostgreSQL');
  assert.ok(content.includes('to_regclass'), 'Debe validar la creación formal del objeto tabla');
  assert.ok(content.includes('pg_constraint'), 'Debe validar Primary Keys');
  assert.ok(content.includes('relkind = \'S\''), 'Debe validar secuencias activas');

  // Validar pinning de imagen efímera y bandera --syntax-only
  assert.match(content, /postgres:16-alpine@sha256:[a-f0-9]{64}/, 'PostgreSQL efímero debe estar fijado por digest criptográfico SHA-256');
  assert.ok(content.includes('--syntax-only'), 'Debe soportar bandera explícita --syntax-only');
  assert.ok(content.includes('No hay motor PostgreSQL disponible'), 'Debe fallar (fail-closed) si no hay motor SQL y no se pasa --syntax-only');
});

test('🛡️ Disaster Recovery: values.yaml y Runbook oficial definen arquitectura 3-2-1 y SLAs RPO < 24h / RTO < 2h', () => {
  const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');
  assert.ok(fs.existsSync(valuesPath), 'values.yaml debe existir');
  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  assert.ok(valuesContent.includes('offsite:'), 'values.yaml debe declarar sección backup.offsite');
  assert.ok(valuesContent.includes('pokedex-backups-offsite'), 'values.yaml debe definir bucket offsite por defecto');

  const docPath = path.join(ROOT_DIR, 'docs/runbooks/DISASTER_RECOVERY_PLAN.md');
  assert.ok(fs.existsSync(docPath), 'DISASTER_RECOVERY_PLAN.md debe existir');
  const content = fs.readFileSync(docPath, 'utf-8');

  assert.ok(content.includes('< 24 horas'), 'Debe definir formalmente RPO < 24 horas');
  assert.ok(content.includes('< 2 horas'), 'Debe definir formalmente RTO < 2 horas');
  assert.ok(content.includes('AES-256-CBC'), 'Debe especificar el estándar criptográfico');
  assert.ok(content.includes('3-2-1'), 'Debe formalizar la estrategia 3-2-1 de copias de seguridad');
  assert.ok(content.includes('Off-site'), 'Debe contemplar réplica remota off-site en Object Storage');
});

test('🛡️ Disaster Recovery: backup-restore-verify-cronjob.yaml implementa verificación periódica de restauración en K8s', () => {
  const verifyCronJobPath = path.join(ROOT_DIR, 'infra/helm/pokedex/templates/backup-restore-verify-cronjob.yaml');
  assert.ok(fs.existsSync(verifyCronJobPath), 'backup-restore-verify-cronjob.yaml debe existir en templates de Helm');
  const content = fs.readFileSync(verifyCronJobPath, 'utf-8');

  assert.ok(content.includes('kind: CronJob'), 'Debe definir un CronJob de verificación');
  assert.ok(content.includes('dr-restore-verify'), 'Debe nombrarse dr-restore-verify');
  assert.ok(content.includes('restoreVerification'), 'Debe condicionarse a backup.restoreVerification');
  assert.ok(content.includes('sha256sum -c'), 'Debe auditar la integridad criptográfica SHA-256');
  assert.ok(content.includes('openssl enc -d -aes-256-cbc'), 'Debe probar el descifrado simétrico AES-256-CBC');
  assert.ok(content.includes('pokedex_entries'), 'Debe verificar la existencia de tablas de datos esenciales');
  assert.ok(content.includes('runAsNonRoot: true'), 'Debe ejecutar con runAsNonRoot');
  assert.ok(content.includes('readOnlyRootFilesystem: true'), 'Debe montar filesystem de solo lectura');
});

test('🛡️ Disaster Recovery Blueprints: Esqueletos Off-site (S3-compatible agnóstico y PBS Remote Sync) formalizados como inactivos', () => {
  const blueprintDocPath = path.join(ROOT_DIR, 'docs/operations/OFFSITE_BACKUP_BLUEPRINTS.md');
  assert.ok(fs.existsSync(blueprintDocPath), 'OFFSITE_BACKUP_BLUEPRINTS.md debe existir');
  const blueprintContent = fs.readFileSync(blueprintDocPath, 'utf-8');

  assert.ok(blueprintContent.includes('S3-Compatible'), 'Debe documentar esqueleto S3-compatible');
  assert.ok(blueprintContent.includes('Proxmox Backup Server'), 'Debe documentar esqueleto PBS');
  assert.ok(blueprintContent.includes('PREPARADO (INACTIVO)'), 'Debe formalizar que los esqueletos off-site están inactivos');
  assert.ok(blueprintContent.includes('Riesgo Residual Asumido'), 'Debe advertir sobre el riesgo residual de SPOF del host');

  const pbsPlaybookPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_pbs_backup_blueprint.yml');
  assert.ok(fs.existsSync(pbsPlaybookPath), 'setup_pbs_backup_blueprint.yml debe existir');
  const pbsContent = fs.readFileSync(pbsPlaybookPath, 'utf-8');
  assert.ok(pbsContent.includes('pbs_remote_offsite_enabled: false'), 'PBS playbook debe tener offsite inactivo por defecto');
  assert.ok(pbsContent.includes('proxmox-backup-manager sync-job'), 'PBS playbook debe definir el esqueleto de sync job');

  const esoTemplatePath = path.join(ROOT_DIR, 'infra/k8s/eso/backup-offsite-externalsecret.yaml.template');
  assert.ok(fs.existsSync(esoTemplatePath), 'backup-offsite-externalsecret.yaml.template debe existir');

  const proxmoxValuesPath = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const proxmoxValues = fs.readFileSync(proxmoxValuesPath, 'utf-8');
  assert.match(proxmoxValues, /offsite:\s*\r?\n\s*enabled:\s*false/, 'Proxmox GitOps values debe declarar offsite inactivo');

  const drpPlanPath = path.join(ROOT_DIR, 'docs/runbooks/DISASTER_RECOVERY_PLAN.md');
  const drpPlan = fs.readFileSync(drpPlanPath, 'utf-8');
  assert.ok(drpPlan.includes('2.2. Estado de Implementación'), 'DRP debe incluir sección 2.2 de estado de implementación');
  assert.ok(drpPlan.includes('ESQUELETO (INACTIVO)'), 'DRP debe formalizar off-site como esqueleto inactivo');
});

test('🛡️ Disaster Recovery: Backup y Restore Verification renderizan PersistentVolumeClaim real y evitan almacenamiento efímero (Anti-emptyDir)', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const valuesPath = path.join(chartPath, 'values.yaml');
  const valuesContent = fs.readFileSync(valuesPath, 'utf-8');
  assert.match(valuesContent, /persistence:\s*\r?\n\s*enabled:\s*true/, 'values.yaml base debe declarar backup.persistence.enabled: true');

  const proxmoxValuesPath = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  const proxmoxValues = fs.readFileSync(proxmoxValuesPath, 'utf-8');
  assert.match(proxmoxValues, /persistence:\s*\r?\n\s*enabled:\s*true/, 'Proxmox GitOps values debe declarar backup.persistence.enabled: true');

  const valuesProdPath = path.join(chartPath, 'values.prod.yaml');

  // 1. Validar renderizado de backup-cronjob.yaml
  const renderedBackup = execSync(
    `helm template pokedex "${chartPath}" -f "${valuesProdPath}" -s templates/backup-cronjob.yaml`,
    { encoding: 'utf-8' }
  );

  assert.match(renderedBackup, /kind:\s*PersistentVolumeClaim/, 'Debe generar el recurso PersistentVolumeClaim para backup');
  assert.match(renderedBackup, /name:\s*pokedex-backup-pvc/, 'El PVC de backup debe llamarse pokedex-backup-pvc');
  assert.match(renderedBackup, /claimName:\s*pokedex-backup-pvc/, 'El CronJob de backup debe montar claimName: pokedex-backup-pvc');
  assert.doesNotMatch(renderedBackup, /name:\s*backup-storage\s*\r?\n\s*emptyDir:/, 'backup-storage NUNCA debe ser emptyDir en el CronJob de backup');

  // 2. Validar renderizado de backup-restore-verify-cronjob.yaml
  const renderedVerify = execSync(
    `helm template pokedex "${chartPath}" -f "${valuesProdPath}" -s templates/backup-restore-verify-cronjob.yaml`,
    { encoding: 'utf-8' }
  );

  assert.match(renderedVerify, /claimName:\s*pokedex-backup-pvc/, 'El CronJob de verificación debe montar el mismo claimName: pokedex-backup-pvc');
  assert.doesNotMatch(renderedVerify, /name:\s*backup-storage\s*\r?\n\s*emptyDir:/, 'backup-storage NUNCA debe ser emptyDir en el CronJob de verificación');
});

test('🛡️ Disaster Recovery: Google Drive Off-site (Alternativa A Docker Compose & Alternativa B Proxmox VE)', () => {
  // 1. Alternativa A: Docker Compose Dev con servicio rclone y script dev
  const dockerComposeDevPath = path.join(ROOT_DIR, 'docker-compose.dev.yml');
  assert.ok(fs.existsSync(dockerComposeDevPath), 'docker-compose.dev.yml debe existir');
  const composeContent = fs.readFileSync(dockerComposeDevPath, 'utf-8');
  assert.ok(composeContent.includes('backup-gdrive:'), 'Debe definir servicio backup-gdrive');
  assert.ok(composeContent.includes('rclone/rclone'), 'Debe usar imagen oficial rclone');
  assert.ok(composeContent.includes('profiles:'), 'Debe aislarse mediante perfiles de compose');
  assert.ok(composeContent.includes('backup'), 'Debe pertenecer al perfil backup');

  const devScriptPath = path.join(ROOT_DIR, 'scripts/dev-backup-gdrive.ts');
  assert.ok(fs.existsSync(devScriptPath), 'scripts/dev-backup-gdrive.ts debe existir');
  const devScriptContent = fs.readFileSync(devScriptPath, 'utf-8');
  assert.ok(devScriptContent.includes('pg_dump'), 'Script dev debe realizar pg_dump');
  assert.ok(devScriptContent.includes('aes-256-cbc'), 'Script dev debe cifrar con AES-256-CBC');
  assert.ok(devScriptContent.includes('sha256'), 'Script dev debe calcular checksum SHA-256');

  // 2. Alternativa B: Playbook Ansible para Proxmox VE
  const playbookPath = path.join(ROOT_DIR, 'infra/ansible/playbooks/setup_gdrive_backup.yml');
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

  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yml');
  const taskfileContent = fs.readFileSync(taskfilePath, 'utf-8');
  assert.ok(taskfileContent.includes('dr:gdrive:backup:dev:'), 'Taskfile debe definir dr:gdrive:backup:dev');
  assert.ok(taskfileContent.includes('dr:gdrive:sync:dev:'), 'Taskfile debe definir dr:gdrive:sync:dev');
  assert.ok(taskfileContent.includes('dr:gdrive:setup:proxmox:'), 'Taskfile debe definir dr:gdrive:setup:proxmox');
});

test('🛡️ Disaster Recovery: backup-gdrive-cronjob.yaml implementa puente K8s-Native a Google Drive con Rclone y readOnly PVC', () => {
  const chartPath = path.join(ROOT_DIR, 'infra/helm/pokedex');
  const cronjobTemplatePath = path.join(chartPath, 'templates/backup-gdrive-cronjob.yaml');
  assert.ok(fs.existsSync(cronjobTemplatePath), 'backup-gdrive-cronjob.yaml debe existir en los templates de Helm');

  const proxmoxValuesPath = path.join(ROOT_DIR, 'gitops/environments/proxmox/values.yaml');
  assert.ok(fs.existsSync(proxmoxValuesPath), 'proxmox values.yaml debe existir');
  const proxmoxValues = fs.readFileSync(proxmoxValuesPath, 'utf-8');
  assert.match(proxmoxValues, /gdrive:\s*\r?\n\s*enabled:\s*true/, 'Proxmox GitOps values debe tener backup.gdrive.enabled: true');

  // Renderizar con Helm usando values.prod.yaml
  const valuesProdPath = path.join(chartPath, 'values.prod.yaml');
  const rendered = execSync(
    `helm template pokedex "${chartPath}" -f "${valuesProdPath}" -s templates/backup-gdrive-cronjob.yaml`,
    { encoding: 'utf-8' }
  );

  // 1. Validar CronJob y Componentes
  assert.match(rendered, /kind:\s*CronJob/, 'Debe generar el recurso CronJob');
  assert.match(rendered, /name:\s*pokedex-gdrive-sync/, 'El CronJob debe llamarse pokedex-gdrive-sync');
  assert.match(rendered, /rclone\/rclone/, 'Debe utilizar la imagen oficial de Rclone');

  // 2. Validar puente al PVC con readOnly: true (Inmutabilidad del almacenamiento local)
  assert.match(rendered, /claimName:\s*pokedex-backup-pvc/, 'Debe montar claimName: pokedex-backup-pvc para enlazar el puente de DR');
  assert.match(rendered, /mountPath:\s*\/backups\s*\r?\n\s*readOnly:\s*true/, 'El volumen /backups DEBE ser montado obligatoriamente como readOnly: true');

  // 3. Validar Hardening y Least Privilege
  assert.match(rendered, /automountServiceAccountToken:\s*false/, 'Debe declarar automountServiceAccountToken: false');
  assert.match(rendered, /runAsNonRoot:\s*true/, 'Debe ejecutar como runAsNonRoot');
  assert.match(rendered, /readOnlyRootFilesystem:\s*true/, 'El contenedor debe tener readOnlyRootFilesystem: true');
  assert.match(rendered, /-\s*ALL/, 'Debe descartar todas las capacidades del kernel');

  // 4. Validar Aislamiento de Red Zero-Trust en NetworkPolicy
  assert.match(rendered, /kind:\s*NetworkPolicy/, 'Debe generar recurso NetworkPolicy');
  assert.match(rendered, /name:\s*pokedex-allow-gdrive-sync-egress/, 'NetworkPolicy debe llamarse pokedex-allow-gdrive-sync-egress');
  assert.match(rendered, /port:\s*53/, 'Debe permitir resolución DNS en puerto 53');
  assert.match(rendered, /port:\s*443/, 'Debe permitir salida HTTPS a la API de Google Drive en puerto 443');
});



