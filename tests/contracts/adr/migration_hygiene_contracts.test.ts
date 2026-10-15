import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { analyzeMigrationSql, checkAllMigrations } from '../../../scripts/check-migration-hygiene.js';
import { ROOT_DIR } from '../../helpers/repo.js';

test('🛡️ Migraciones: detecta creación de índice sin CONCURRENTLY (MIG-001)', () => {
  const sql = 'CREATE INDEX idx_test ON pokedex_entries (nombre);';
  const issues = analyzeMigrationSql(sql, '0001_add_index.sql');
  assert.equal(issues.length, 2);
  assert.equal(issues[0].rule, 'MIG-001-INDEX-CONCURRENTLY');
  assert.equal(issues[1].rule, 'MIG-002-INDEX-IF-NOT-EXISTS');
});

test('🛡️ Migraciones: detecta creación de índice sin IF NOT EXISTS (MIG-002)', () => {
  const sql = 'CREATE INDEX CONCURRENTLY idx_test ON pokedex_entries (nombre);';
  const issues = analyzeMigrationSql(sql, '0001_add_index.sql');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, 'MIG-002-INDEX-IF-NOT-EXISTS');
});

test('🛡️ Migraciones: aprueba índice con CONCURRENTLY IF NOT EXISTS', () => {
  const sql = 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test ON pokedex_entries (nombre);';
  const issues = analyzeMigrationSql(sql, '0001_add_index.sql');
  assert.equal(issues.length, 0);
});

test('🛡️ Migraciones: detecta DROP INDEX sin IF EXISTS (MIG-003)', () => {
  const sql = 'DROP INDEX idx_test;';
  const issues = analyzeMigrationSql(sql, '0002_drop_index.sql');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, 'MIG-003-DROP-INDEX-IF-EXISTS');
});

test('🛡️ Migraciones: aprueba DROP INDEX con IF EXISTS', () => {
  const sql = 'DROP INDEX CONCURRENTLY IF EXISTS idx_test;';
  const issues = analyzeMigrationSql(sql, '0002_drop_index.sql');
  assert.equal(issues.length, 0);
});

test('🛡️ Migraciones: prohíbe LOCK TABLE en caliente (MIG-004)', () => {
  const sql = 'LOCK TABLE pokedex_entries IN ACCESS EXCLUSIVE MODE;';
  const issues = analyzeMigrationSql(sql, '0003_lock_table.sql');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, 'MIG-004-DISALLOW-LOCK-TABLE');
});

test('🛡️ Migraciones: baseline 0000_greedy_luckman.sql está exento por ser inicial', () => {
  const sql = 'CREATE INDEX "idx_pokedex_tipo" ON "pokedex_entries" USING btree ("tipo");';
  const issues = analyzeMigrationSql(sql, '0000_greedy_luckman.sql');
  assert.equal(issues.length, 0);
});

test('🛡️ Migraciones: el árbol de migraciones activas de backend cumple el gate al 100%', () => {
  const migrationsDir = path.join(ROOT_DIR, 'apps/backend/src/db/migrations');
  const result = checkAllMigrations(migrationsDir);
  assert.equal(result.passed, true);
  assert.equal(result.issues.length, 0);
});
