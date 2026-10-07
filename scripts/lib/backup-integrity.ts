/**
 * Autenticación de los backups cifrados (Encrypt-then-MAC).
 *
 * Los volcados se cifran con AES-256-CBC en formato `openssl enc -pbkdf2`. CBC no autentica: con una
 * clave incorrecta el descifrado puede terminar "bien" por azar (~0,4 %) y quien pueda escribir en el
 * almacenamiento del backup puede alterarlo sin conocer la clave. El `.sha256` que acompaña al `.enc`
 * solo protege de la corrupción, porque quien modifica el backup también puede recalcularlo.
 *
 * Por eso cada `.enc` lleva un `.enc.hmac` con un HMAC-SHA256 calculado sobre el archivo completo con
 * una clave derivada de `BACKUP_ENCRYPTION_KEY`. El `.enc` no cambia, así que sigue siendo legible con
 * `openssl enc -d` a mano y los backups anteriores se descifran igual.
 *
 * El mismo cálculo existe en shell para los CronJobs y `dr_verify_restore.sh`:
 *   MAC_KEY=$(printf '%s' "pokedex-backup-mac-v1" | openssl dgst -sha256 -hmac "$KEY" -r | cut -d' ' -f1)
 *   openssl dgst -sha256 -mac HMAC -macopt "hexkey:$MAC_KEY" -r "$ENC_FILE" | cut -d' ' -f1
 * `tests/security/backup_hmac.test.ts` comprueba que ambos producen el mismo valor.
 */
import crypto from 'node:crypto';

/** Etiqueta de versión del formato: cambiarla invalida todos los HMAC anteriores. */
export const BACKUP_MAC_LABEL = 'pokedex-backup-mac-v1';

/** Sufijo del archivo que acompaña a cada `.enc`. */
export const BACKUP_HMAC_SUFFIX = '.hmac';

const HEX_SHA256 = /^[a-f0-9]{64}$/;

/** Deriva la clave del MAC a partir de la clave de cifrado, para no usar la misma clave en dos funciones. */
export function deriveBackupMacKey(encryptionKey: string): Buffer {
  return crypto.createHmac('sha256', encryptionKey).update(BACKUP_MAC_LABEL).digest();
}

/** HMAC-SHA256 (hex) del payload cifrado completo: encabezado `Salted__`, sal y ciphertext. */
export function computeBackupHmac(encryptedPayload: Buffer, encryptionKey: string): string {
  return crypto.createHmac('sha256', deriveBackupMacKey(encryptionKey)).update(encryptedPayload).digest('hex');
}

/** Contenido del `.hmac`: `<hex>  <nombre>`, como `sha256sum`. */
export function formatHmacSidecar(hmacHex: string, backupFileName: string): string {
  return `${hmacHex}  ${backupFileName}\n`;
}

/** Extrae el HMAC (hex) del `.hmac`. Devuelve null si el contenido no tiene el formato esperado. */
export function parseHmacSidecar(sidecarContent: string): string | null {
  const first = sidecarContent.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return HEX_SHA256.test(first) ? first : null;
}

/** Comparación en tiempo constante. False ante clave incorrecta, payload alterado o HMAC mal formado. */
export function verifyBackupHmac(encryptedPayload: Buffer, encryptionKey: string, expectedHmacHex: string): boolean {
  if (!HEX_SHA256.test(expectedHmacHex)) return false;
  const actual = Buffer.from(computeBackupHmac(encryptedPayload, encryptionKey), 'hex');
  const expected = Buffer.from(expectedHmacHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
