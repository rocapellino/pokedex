import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

  // Validar hardening del contenedor
  assert.ok(content.includes('runAsNonRoot: true'), 'El contenedor de backup debe correr como no root');
  assert.ok(content.includes('readOnlyRootFilesystem: true'), 'El sistema de archivos raíz debe ser de solo lectura');
  assert.ok(content.includes('- ALL'), 'Debe descartar todas las capacidades del kernel');

  // Validar aislamiento de red Zero-Trust del pod de backup
  assert.ok(content.includes('kind: NetworkPolicy'), 'Debe incluir NetworkPolicy para el pod de backup');
  assert.ok(content.includes('app.kubernetes.io/component: database'), 'Solo debe tener egress hacia la base de datos');
  assert.ok(content.includes('k8s-app: kube-dns'), 'Debe permitir resolución DNS hacia CoreDNS');
});

test('🛡️ Disaster Recovery: dr_verify_restore.sh implementa protocolo automatizado de verificación y descifrado', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/dr_verify_restore.sh');
  assert.ok(fs.existsSync(scriptPath), 'scripts/dr_verify_restore.sh debe existir');
  const content = fs.readFileSync(scriptPath, 'utf-8');

  assert.ok(content.includes('openssl enc -d -aes-256-cbc'), 'Debe descifrar volcados AES-256-CBC');
  assert.ok(content.includes('gzip -t'), 'Debe verificar la integridad del stream comprimido gzip');
  assert.ok(content.includes('sha256sum'), 'Debe validar checksum de integridad antes del descifrado');
  assert.ok(content.includes('pokedex_entries'), 'Debe verificar la integridad de la estructura de tablas');
  assert.ok(content.includes('--dry-run'), 'Debe soportar modo de prueba sintética dry-run para CI');
  assert.ok(!content.includes('pokedex_dr_default_secure_key_2026'), 'dr_verify_restore.sh no debe contener clave hardcodeada pública');
  assert.ok(content.includes(': "${BACKUP_ENCRYPTION_KEY:?Error:'), 'dr_verify_restore.sh debe validar fail-closed en ejecuciones reales');
});

test('🛡️ Disaster Recovery: Runbook oficial define formalmente RPO < 24h y RTO < 2h', () => {
  const docPath = path.join(ROOT_DIR, 'docs/runbooks/DISASTER_RECOVERY_PLAN.md');
  assert.ok(fs.existsSync(docPath), 'DISASTER_RECOVERY_PLAN.md debe existir');
  const content = fs.readFileSync(docPath, 'utf-8');

  assert.ok(content.includes('< 24 horas'), 'Debe definir formalmente RPO < 24 horas');
  assert.ok(content.includes('< 2 horas'), 'Debe definir formalmente RTO < 2 horas');
  assert.ok(content.includes('AES-256-CBC'), 'Debe especificar el estándar criptográfico');
});
