#!/usr/bin/env node
/**
 * ==============================================================================
 * Script: Respaldo Local de PostgreSQL y Sincronización a Google Drive
 * Ejecución Local en Docker / Docker Compose (TypeScript)
 * ==============================================================================
 * Cumple con ADR-020 (Scripts fuertemente tipados en TypeScript).
 *
 * Uso:
 *   npx tsx scripts/dev-backup-gdrive.ts [--dry-run] [--skip-upload]
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Cargar variables de entorno desde .env si existe
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isSkipUpload = args.includes('--skip-upload');

const POSTGRES_CONTAINER = process.env.POSTGRES_CONTAINER || 'pokemon-postgres';
const POSTGRES_USER = process.env.POSTGRES_USER || 'pokedex_app';
const POSTGRES_DB = process.env.POSTGRES_DB || 'pokedex_db';
const BACKUP_DIR = path.join(ROOT_DIR, 'backups');

console.log('================================================================');
console.log('🛡️ [DR Dev] Respaldo Local de PostgreSQL y Sincronización a Google Drive');
console.log('================================================================\n');

// 1. Validar que el contenedor de PostgreSQL esté corriendo
try {
  const runningContainers = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8' });
  if (!runningContainers.split(/\r?\n/).includes(POSTGRES_CONTAINER)) {
    console.error(`❌ Error: El contenedor '${POSTGRES_CONTAINER}' no está corriendo.`);
    console.info(`ℹ️ Inicie el entorno con: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres`);
    process.exit(1);
  }
} catch (error: any) {
  console.error(`❌ Error al consultar Docker Engine: ${error.message}`);
  process.exit(1);
}

// 2. Resolver clave de cifrado AES-256
let encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
if (!encryptionKey) {
  if (isDryRun) {
    encryptionKey = `dev_dryrun_key_${crypto.randomBytes(16).toString('hex')}`;
    console.log(`⚠️ Modo dry-run: usando clave efímera ${encryptionKey}`);
  } else {
    console.error('❌ Error: BACKUP_ENCRYPTION_KEY es obligatoria para cifrar el respaldo con AES-256-CBC PBKDF2.');
    console.info('ℹ️ Defínala en su archivo .env o en la terminal: export BACKUP_ENCRYPTION_KEY="..."');
    process.exit(1);
  }
}

// 3. Crear directorio ./backups
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').slice(0, 15);
const encFileName = `pokedex_${timestamp}.sql.gz.enc`;
const encFilePath = path.join(BACKUP_DIR, encFileName);
const checksumFilePath = `${encFilePath}.sha256`;

// 4. Volcado pg_dump
console.log(`📦 [DR Dev] Extrayendo volcado de base de datos '${POSTGRES_DB}' desde '${POSTGRES_CONTAINER}'...`);
let sqlDump: Buffer;
try {
  sqlDump = execSync(
    `docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists`,
    { maxBuffer: 100 * 1024 * 1024 }
  );
} catch (error: any) {
  console.error(`❌ Error al ejecutar pg_dump en el contenedor: ${error.message}`);
  process.exit(1);
}

// 5. Compresión gzip -9
console.log('🗜️ [DR Dev] Comprimiendo volcado con GZIP (nivel 9)...');
const compressed = zlib.gzipSync(sqlDump, { level: 9 });

// 6. Cifrado simétrico AES-256-CBC con formato estándar OpenSSL PBKDF2 (Salted__ + 8B salt)
console.log('🔒 [DR Dev] Cifrando volcado con AES-256-CBC PBKDF2...');
const salt = crypto.randomBytes(8);
const derived = crypto.pbkdf2Sync(encryptionKey, salt, 10000, 48, 'sha256');
const key = derived.subarray(0, 32);
const iv = derived.subarray(32, 48);

const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
const encryptedBody = Buffer.concat([cipher.update(compressed), cipher.final()]);
const openSslHeader = Buffer.from('Salted__', 'ascii');
const fullEncryptedPayload = Buffer.concat([openSslHeader, salt, encryptedBody]);

fs.writeFileSync(encFilePath, fullEncryptedPayload);

// 7. Checksum SHA-256
console.log('🔍 [DR Dev] Calculando firma criptográfica SHA-256...');
const sha256 = crypto.createHash('sha256').update(fullEncryptedPayload).digest('hex');
fs.writeFileSync(checksumFilePath, `${sha256}  ${encFileName}\n`);

const fileSizeMB = (fullEncryptedPayload.length / (1024 * 1024)).toFixed(2);
console.log(`✅ [DR Dev] Volcado cifrado generado exitosamente:`);
console.log(`   - Archivo: ${encFilePath} (${fileSizeMB} MB)`);
console.log(`   - SHA-256: ${sha256}\n`);

// 8. Sincronización a Google Drive con Rclone (Docker Compose)
if (isSkipUpload) {
  console.log('ℹ️ [DR Dev] --skip-upload especificado. Omitiendo réplica a Google Drive.');
  process.exit(0);
}

if (isDryRun) {
  console.log('🛡️ [DR Dev] Simulación dry-run completada con éxito (sin carga externa).');
  process.exit(0);
}

console.log('☁️ [DR Dev] Iniciando sincronización hacia Google Drive con Rclone en Docker...');
try {
  execSync(
    'docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile backup run --rm backup-gdrive',
    { stdio: 'inherit', cwd: ROOT_DIR }
  );
  console.log('\n🎉 [DR Dev] Respaldo y réplica off-site a Google Drive finalizados con éxito.');
} catch (error: any) {
  console.error(`\n❌ Error al sincronizar con Google Drive: ${error.message}`);
  process.exit(1);
}
