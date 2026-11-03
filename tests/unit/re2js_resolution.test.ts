/**
 * ==============================================================================
 * Resolución y parche de seguridad de re2js (AUD-DEP-RE2-001)
 * ==============================================================================
 * markdownlint arrastra re2js@2.8.6 con vulnerabilidad de severidad alta
 * (GHSA-gg6h-894w-4m9c, DoS de tiempo cuadrático en lookbehind).
 * package.json debe declarar un override a re2js >=2.8.7 y package-lock.json
 * debe resolver una versión segura.
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';

test('📦 AUD-DEP-RE2-001: package.json define override para re2js >=2.8.7 mitigando GHSA-gg6h-894w-4m9c', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const override = pkg.overrides?.re2js;
  assert.ok(override, 'package.json debe definir override para re2js');
  const match = /\d+\.\d+\.\d+/.exec(override);
  assert.ok(match, 'override de re2js debe especificar una versión semántica');
  const [major, minor, patch] = match[0].split('.').map(Number);
  const isSafe = major > 2 || (major === 2 && minor > 8) || (major === 2 && minor === 8 && patch >= 7);
  assert.ok(isSafe, `override de re2js debe ser >= 2.8.7 para mitigar GHSA-gg6h-894w-4m9c, recibido: ${override}`);
});

test('📦 AUD-DEP-RE2-001: package-lock.json resuelve re2js >=2.8.7 sin vulnerabilidades', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package-lock.json'), 'utf-8'));
  const re2Entry = lock.packages?.['node_modules/re2js'];
  assert.ok(re2Entry, 'package-lock.json debe registrar node_modules/re2js');
  const [major, minor, patch] = re2Entry.version.split('.').map(Number);
  const isSafe = major > 2 || (major === 2 && minor > 8) || (major === 2 && minor === 8 && patch >= 7);
  assert.ok(isSafe, `re2js en package-lock.json debe ser >= 2.8.7, actual: ${re2Entry.version}`);
});
