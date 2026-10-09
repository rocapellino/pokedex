import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  BACKUP_MAC_LABEL,
  computeBackupHmac,
  deriveBackupMacKey,
  formatHmacSidecar,
  parseHmacSidecar,
  verifyBackupHmac,
} from '../../../scripts/lib/backup-integrity.ts';
import { encryptAes256Cbc } from '../../../scripts/dr-drill.ts';

const KEY = 'super_secure_dr_key_2026_super_secure_dr_key_2026';
const PAYLOAD = Buffer.from('CREATE TABLE t (id INT); INSERT INTO t VALUES (1);', 'utf-8');

/**
 * BACKUP-HMAC-001 — el `.enc` usa AES-256-CBC sin autenticación: una clave incorrecta puede descifrar "bien"
 * por azar y quien escriba en el almacenamiento puede alterar el backup. El HMAC-SHA256 aparte (Encrypt-then-MAC)
 * lo detecta de forma determinista, sin cambiar el formato del `.enc`.
 */
test('🔏 BACKUP-HMAC-001: el HMAC detecta clave incorrecta y manipulación de forma determinista', () => {
  const enc = encryptAes256Cbc(PAYLOAD, KEY);
  const hmac = computeBackupHmac(enc, KEY);

  assert.equal(verifyBackupHmac(enc, KEY, hmac), true, 'el backup íntegro con su clave debe verificar');
  assert.equal(verifyBackupHmac(enc, `${KEY}x`, hmac), false, 'una clave incorrecta nunca debe verificar');

  // Cualquier byte alterado, en el encabezado, la sal o el ciphertext, invalida el HMAC.
  for (const offset of [0, 9, 16, enc.length - 1]) {
    const tampered = Buffer.from(enc);
    tampered[offset] = (tampered[offset] ?? 0) ^ 0x01;
    assert.equal(verifyBackupHmac(tampered, KEY, hmac), false, `alterar el byte ${offset} debe invalidar el HMAC`);
  }
  assert.equal(
    verifyBackupHmac(enc.subarray(0, enc.length - 16), KEY, hmac),
    false,
    'truncar el backup debe invalidarlo',
  );
  assert.equal(verifyBackupHmac(enc, KEY, 'no-es-hex'), false, 'un HMAC mal formado no debe verificar');
});

test('🔏 BACKUP-HMAC-001: con una clave incorrecta el HMAC nunca verifica, frente a 2 000 payloads aleatorios', () => {
  // El descifrado con clave incorrecta devuelve basura sin error en ~0,4 % de los casos (dr_e2e_drill.test.ts);
  // el HMAC no tiene ese hueco: rechaza el 100 % y acepta el 100 % con la clave correcta.
  for (let i = 0; i < 2000; i++) {
    const enc = Buffer.concat([Buffer.from('Salted__', 'ascii'), crypto.randomBytes(8), crypto.randomBytes(48)]);
    const hmac = computeBackupHmac(enc, KEY);
    assert.equal(
      verifyBackupHmac(enc, 'wrong_key', hmac),
      false,
      `payload ${i}: la clave incorrecta no debe verificar`,
    );
    assert.equal(verifyBackupHmac(enc, KEY, hmac), true, `payload ${i}: la clave correcta debe verificar`);
  }
});

test('🔏 BACKUP-HMAC-001: la clave del MAC se deriva y no coincide con la de cifrado', () => {
  const macKey = deriveBackupMacKey(KEY);
  assert.equal(macKey.length, 32);
  assert.notEqual(macKey.toString('utf-8'), KEY);
  assert.equal(BACKUP_MAC_LABEL, 'pokedex-backup-mac-v1');
});

test('🔏 BACKUP-HMAC-001: el sidecar .hmac se escribe y se lee con el formato de sha256sum', () => {
  const hmac = computeBackupHmac(PAYLOAD, KEY);
  const sidecar = formatHmacSidecar(hmac, 'pokedex_20261007_020000.sql.gz.enc');
  assert.equal(sidecar, `${hmac}  pokedex_20261007_020000.sql.gz.enc\n`);
  assert.equal(parseHmacSidecar(sidecar), hmac);
  assert.equal(parseHmacSidecar('basura'), null);
  assert.equal(parseHmacSidecar(''), null);
});

/**
 * Los CronJobs y `dr_verify_restore.sh` calculan el HMAC con el CLI de openssl y Node con crypto: si divergen,
 * los backups que genera uno no los verifica el otro. Este test los ejecuta con la misma clave y compara.
 */
test('🔏 BACKUP-HMAC-001: el HMAC de Node coincide con el que calcula el CLI de openssl (interoperabilidad)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-hmac-'));
  try {
    const encFile = path.join(dir, 'pokedex_20261007_020000.sql.gz.enc');
    const enc = encryptAes256Cbc(PAYLOAD, KEY);
    fs.writeFileSync(encFile, enc);

    const macKey = execFileSync('openssl', ['dgst', '-sha256', '-hmac', KEY, '-r'], { input: BACKUP_MAC_LABEL })
      .toString()
      .split(' ')[0];
    const opensslHmac = execFileSync(
      'openssl',
      ['dgst', '-sha256', '-mac', 'HMAC', '-macopt', `hexkey:${macKey}`, '-r', encFile],
      { encoding: 'utf-8' },
    ).split(' ')[0];

    assert.equal(macKey, deriveBackupMacKey(KEY).toString('hex'), 'la clave derivada debe coincidir con la de openssl');
    assert.equal(opensslHmac, computeBackupHmac(enc, KEY), 'el HMAC de Node debe coincidir con el de openssl');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('🔏 BACKUP-HMAC-001: el .enc sigue siendo descifrable con `openssl enc -d` sin conocer el HMAC (compatibilidad)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-hmac-'));
  try {
    const encFile = path.join(dir, 'x.enc');
    fs.writeFileSync(encFile, encryptAes256Cbc(PAYLOAD, KEY));
    const plain = execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-in', encFile, '-k', KEY]);
    assert.equal(plain.toString('utf-8'), PAYLOAD.toString('utf-8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * BACKUP-HMAC-002 — el HMAC se genera y se verifica en cuatro sitios (CronJob de backup, CronJob de verificación,
 * `dr_verify_restore.sh` y los scripts de Node). Si uno pierde el paso, o la etiqueta de derivación o la fecha de
 * corte divergen, los backups que genera uno no los verifica el otro, o la verificación se degrada sin avisar.
 */
const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT_DIR, relative), 'utf-8');

test('🔏 BACKUP-HMAC-002: el CronJob de backup genera el .hmac y lo sube off-site', () => {
  const content = read('infra/helm/pokedex/templates/backup-cronjob.yaml');
  assert.ok(content.includes(BACKUP_MAC_LABEL), 'debe derivar la clave del MAC con la etiqueta del formato');
  assert.match(
    content,
    /openssl dgst -sha256 -mac HMAC -macopt "hexkey:\$\{MAC_KEY\}"/,
    'debe calcular el HMAC con openssl',
  );
  assert.ok(content.includes('.sql.gz.enc.hmac'), 'debe escribir el .hmac junto al .enc');
  assert.match(content, /aws s3 cp "\$\{HMAC_FILE\}"/, 'la réplica off-site debe incluir el .hmac');
});

test('🔏 BACKUP-HMAC-002: la verificación exige el HMAC antes de descifrar, con el corte configurable', () => {
  const verify = read('infra/helm/pokedex/templates/backup-restore-verify-cronjob.yaml');
  const script = read('scripts/dr_verify_restore.sh');
  for (const [name, content] of [
    ['backup-restore-verify-cronjob.yaml', verify],
    ['dr_verify_restore.sh', script],
  ] as const) {
    assert.ok(content.includes(BACKUP_MAC_LABEL), `${name}: debe usar la etiqueta de derivación del formato`);
    assert.match(
      content,
      /openssl dgst -sha256 -mac HMAC -macopt "hexkey:\$\{MAC_KEY\}"/,
      `${name}: debe verificar con openssl`,
    );
    // Anclado al código (`ACTUAL_HMAC=$(openssl dgst…`, que solo aparece en la verificación), no a un mensaje de log.
    const verifiedAt = content.search(/ACTUAL_HMAC="?\$\(openssl dgst/);
    const decryptedAt = content.indexOf('openssl enc -d');
    assert.ok(verifiedAt >= 0, `${name}: debe calcular el HMAC del backup para compararlo`);
    assert.ok(decryptedAt >= 0, `${name}: debe descifrar el backup`);
    assert.ok(verifiedAt < decryptedAt, `${name}: el HMAC debe verificarse ANTES de descifrar (Encrypt-then-MAC)`);
    assert.ok(content.includes('BACKUP_HMAC_REQUIRED_FROM'), `${name}: debe leer la fecha de corte`);
  }
  assert.ok(
    verify.includes('.Values.backup.hmac.requiredFrom'),
    'el CronJob de verificación debe tomar la fecha de corte de values.yaml',
  );
});

test('🔏 BACKUP-HMAC-002: la fecha de corte de values.yaml coincide con el valor por defecto de dr_verify_restore.sh', () => {
  const requiredFrom = /^\s+requiredFrom:\s*"(\d{8})"/m.exec(read('infra/helm/pokedex/values.yaml'))?.[1];
  assert.ok(requiredFrom, 'values.yaml debe definir backup.hmac.requiredFrom (YYYYMMDD)');
  assert.ok(
    read('scripts/dr_verify_restore.sh').includes(`BACKUP_HMAC_REQUIRED_FROM:-${requiredFrom}`),
    `dr_verify_restore.sh debe usar ${requiredFrom} como valor por defecto, igual que el chart`,
  );
});

test('🔏 BACKUP-HMAC-002: la réplica a Google Drive incluye el .hmac', () => {
  for (const file of ['infra/helm/pokedex/templates/backup-gdrive-cronjob.yaml', 'docker-compose.dev.yaml']) {
    assert.ok(
      read(file).includes('--include "pokedex_*.sql.gz.enc*"'),
      `${file}: el patrón pokedex_*.sql.gz.enc* debe cubrir también el .enc.hmac`,
    );
  }
});

test('🔏 BACKUP-HMAC-002: los scripts de Node escriben el .hmac con el módulo común', () => {
  for (const file of ['scripts/dr-drill.ts', 'scripts/dev-backup-gdrive.ts']) {
    const content = read(file);
    assert.ok(content.includes('./lib/backup-integrity.ts'), `${file}: debe usar scripts/lib/backup-integrity.ts`);
    assert.ok(content.includes('computeBackupHmac'), `${file}: debe calcular el HMAC del backup`);
  }
  assert.ok(
    read('scripts/dr-drill.ts').includes('verifyBackupHmac'),
    'el simulacro debe verificar el HMAC antes de descifrar',
  );
});
