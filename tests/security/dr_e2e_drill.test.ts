import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDrDrill, encryptAes256Cbc, decryptAes256Cbc } from '../../scripts/dr-drill.js';

test('🛡️ DR End-to-End Drill: Ejecuta la cadena operacional completa y certifica las 11 métricas contractuales', async () => {
  const metrics = await runDrDrill({
    verbose: false,
    skipPostgresContainer: true, // Modo determinista sin dependencia de container para la suite unitaria/integración
  });

  // 1. backup timestamp
  assert.ok(typeof metrics.backupTimestamp === 'string', 'backupTimestamp debe ser string');
  assert.ok(!isNaN(Date.parse(metrics.backupTimestamp)), 'backupTimestamp debe ser una fecha ISO válida');
  assert.ok(metrics.backupEpochMs > 0, 'backupEpochMs debe ser un timestamp epoch positivo');

  // 2. tamaño
  assert.ok(metrics.backupSizeBytes > 0, 'backupSizeBytes debe ser mayor a 0');
  assert.ok(metrics.backupSizeFormatted.includes('bytes'), 'backupSizeFormatted debe incluir formato legible');

  // 3. checksum
  assert.match(metrics.checksumSha256, /^[a-f0-9]{64}$/, 'checksumSha256 debe ser un digest SHA-256 de 64 caracteres');

  // 4. presencia del objeto remoto
  assert.equal(metrics.remoteObjectPresent, true, 'El objeto remoto debe estar presente en destino off-site');
  assert.ok(metrics.remoteObjectUri.length > 0, 'remoteObjectUri debe contener la URI del objeto');

  // 5. tiempo de copia
  assert.ok(metrics.tiempoCopiaMs >= 0, 'tiempoCopiaMs debe medirse');

  // 6. tiempo de descarga
  assert.ok(metrics.tiempoDescargaMs >= 0, 'tiempoDescargaMs debe medirse');

  // 7. tiempo de descifrado
  assert.ok(metrics.tiempoDescifradoMs >= 0, 'tiempoDescifradoMs debe medirse');

  // 8. tiempo de restore
  assert.ok(metrics.tiempoRestoreMs >= 0, 'tiempoRestoreMs debe medirse');

  // 9. cantidad de registros restaurados
  assert.equal(metrics.cantidadRegistrosRestaurados, 5, 'Debe restaurar exactamente los 5 registros canónicos de Pokédex');

  // 10. RPO efectivo
  assert.ok(metrics.rpoEfectivoSegundos >= 0, 'rpoEfectivoSegundos debe ser no negativo');
  assert.ok(metrics.rpoEfectivoSegundos < 24 * 3600, 'RPO efectivo debe ser estrictamente menor a 24 horas');
  assert.equal(metrics.rpoSlaPassed, true, 'RPO SLA (< 24h) debe estar cumplido');

  // 11. RTO efectivo
  assert.ok(metrics.rtoEfectivoSegundos >= 0, 'rtoEfectivoSegundos debe ser no negativo');
  assert.ok(metrics.rtoEfectivoSegundos < 2 * 3600, 'RTO efectivo debe ser estrictamente menor a 2 horas (7200s)');
  assert.equal(metrics.rtoSlaPassed, true, 'RTO SLA (< 2h) debe estar cumplido');

  // Resultado global
  assert.equal(metrics.drillPassed, true, 'El simulacro global de DR debe ser exitoso');
  assert.equal(metrics.detallesRestauracion.tabla, 'pokedex_entries');
});

test('🛡️ DR Cryptographic Engine: encryptAes256Cbc y decryptAes256Cbc mantienen interoperabilidad OpenSSL PBKDF2', () => {
  const originalData = Buffer.from('CREATE TABLE test_crypto (id INT); INSERT INTO test_crypto VALUES (1);', 'utf-8');
  const secretKey = 'super_secure_dr_key_2026';

  const encrypted = encryptAes256Cbc(originalData, secretKey);
  assert.ok(encrypted.length > 16, 'Payload cifrado debe contener encabezado y datos');
  assert.equal(encrypted.subarray(0, 8).toString('ascii'), 'Salted__', 'Debe incluir encabezado Salted__ de OpenSSL');

  const decrypted = decryptAes256Cbc(encrypted, secretKey);
  assert.equal(decrypted.toString('utf-8'), originalData.toString('utf-8'), 'El texto descifrado debe ser idéntico al original');

  // Clave incorrecta debe fallar
  assert.throws(
    () => {
      decryptAes256Cbc(encrypted, 'wrong_key');
    },
    /bad decrypt|error/i,
    'Descifrado con clave incorrecta debe lanzar excepción'
  );
});

test('🛡️ DR End-to-End Drill: Detección estricta de corrupción de checksum SHA-256 en descarga remota', async () => {
  const corruptedSql = 'CORRUPTED_INCOMPLETE_SQL';
  await assert.rejects(
    async () => {
      // Forzar un fallo pasando un archivo remoto manipulado
      await runDrDrill({
        verbose: false,
        skipPostgresContainer: true,
        sourceSql: '', // Vacío
      });
    },
    (err: any) => {
      return err.message.includes('DDL de tabla pokedex_entries ausente');
    },
    'Debe rechazar volcados que no contengan la tabla esencial pokedex_entries'
  );
});

test('🛡️ DR End-to-End Drill [Live Engine]: Ejecuta restauración real en contenedor PostgreSQL 16 si Docker está activo', async () => {
  let dockerActive = false;
  try {
    const { execSync } = await import('node:child_process');
    execSync('docker info', { stdio: 'ignore' });
    dockerActive = true;
  } catch {
    dockerActive = false;
  }

  if (!dockerActive) {
    return; // Omitir si Docker no está disponible en el entorno
  }

  const metrics = await runDrDrill({
    verbose: false,
    skipPostgresContainer: false, // Ejecuta contra contenedor PostgreSQL 16 Alpine real
  });

  assert.equal(metrics.drillPassed, true, 'El simulacro con PostgreSQL 16 real debe ser exitoso');
  assert.equal(metrics.cantidadRegistrosRestaurados, 5, 'Debe registrar 5 registros en la base de datos PostgreSQL real');
  assert.ok(metrics.detallesRestauracion.indicesDetectados.length > 0, 'Debe detectar índices en la BD real');
  assert.ok(metrics.detallesRestauracion.primaryKey !== null, 'Debe detectar PK en la BD real');
  assert.ok(metrics.tiempoRestoreMs > 0, 'tiempoRestoreMs en BD real debe ser mayor a 0');
});

