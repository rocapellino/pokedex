/**
 * Descubrimiento de archivos en tests/ y extracción de casos de prueba.
 */

import fs from 'node:fs';
import path from 'node:path';
import { FILE_METADATA_CATALOG } from './metadata.js';
import { ROOT_DIR } from './paths.js';
import type { TestCaseRecord, TestFileRecord } from './types.js';

export function getFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function parseTestFile(fullPath: string): TestFileRecord {
  const relativePath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
  const content = fs.readFileSync(fullPath, 'utf8');
  // Normalizar CRLF -> LF para que líneas y tamaño sean idénticos en Windows y Linux (CI)
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');
  const sizeBytes = Buffer.byteLength(normalizedContent, 'utf8');
  const lineCount = lines.length;

  let suite = 'governance';
  const parts = relativePath.split('/');
  if (parts.length > 2) {
    suite = parts[1];
  } else if (relativePath.includes('fuzzing')) {
    suite = 'fuzz';
  }

  let role: 'TEST_FILE' | 'HELPER_OR_FIXTURE' | 'PERFORMANCE_SCRIPT' = 'TEST_FILE';
  let runner = 'node:test (tsx)';
  let status: 'ACTIVE' | 'SPECIALIZED' | 'HELPER' = 'ACTIVE';

  if (relativePath.endsWith('.js') && relativePath.includes('performance')) {
    role = 'PERFORMANCE_SCRIPT';
    runner = 'k6';
    status = 'SPECIALIZED';
  } else if (!relativePath.endsWith('.test.ts') && !relativePath.endsWith('.spec.ts')) {
    role = 'HELPER_OR_FIXTURE';
    runner = 'none';
    status = 'HELPER';
  } else if (relativePath.endsWith('.spec.ts') || content.includes('@playwright/test')) {
    runner = 'playwright';
    status = 'SPECIALIZED';
  } else if (relativePath.includes('fuzzing')) {
    status = 'SPECIALIZED';
  }

  const testCases: TestCaseRecord[] = [];
  let describeCount = 0;
  let assertionCountEst = 0;

  if (role === 'TEST_FILE') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(?:describe|test\.describe)\s*\(\s*(['"`])(.*?)\1/.test(line)) {
        describeCount++;
      }
      const testMatch = line.match(/^\s*(?:test|it)\s*\(\s*(['"`])(.*?)\1/);
      if (testMatch) {
        testCases.push({
          name: testMatch[2].trim(),
          line: i + 1,
        });
      }
      // Contar aserciones estimadas
      if (line.includes('assert.') || line.includes('expect(')) {
        assertionCountEst++;
      }
    }
  } else if (role === 'PERFORMANCE_SCRIPT') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const groupMatch = line.match(/group\s*\(\s*(['"`])(.*?)\1/);
      if (groupMatch) {
        testCases.push({
          name: `group: ${groupMatch[2].trim()}`,
          line: i + 1,
        });
      }
      if (line.includes('check(') || line.includes('Trend(') || line.includes('Rate(')) {
        assertionCountEst++;
      }
    }
  }

  // Comandos npm asociados
  const npmCommands: string[] = [];
  if (role === 'TEST_FILE') {
    if (relativePath === 'tests/fuzz/fuzzing.test.ts') {
      npmCommands.push('npm run test:fuzz', 'npm run test:all');
    } else if (runner === 'playwright') {
      npmCommands.push('npm run test:e2e');
      if (content.includes('@a11y')) {
        npmCommands.push('npm run test:a11y');
      }
    } else {
      npmCommands.push('npm test', 'npm run test:all', 'npm run test:coverage');
      if (relativePath.startsWith('tests/unit/')) {
        npmCommands.push('npm run test:unit');
      }
      if (relativePath.startsWith('tests/integration/')) {
        npmCommands.push('npm run test:integration');
      }
      if (relativePath.startsWith('tests/security/')) {
        npmCommands.push('npm run test:security');
        if (relativePath === 'tests/security/egress_anti_ssrf.test.ts') {
          npmCommands.push('npm run test:security:egress');
        }
      }
      if (relativePath.startsWith('tests/contracts/')) {
        npmCommands.push('npm run test:contracts');
      }
      if (relativePath.startsWith('tests/gitops/')) {
        npmCommands.push('npm run test:gitops');
      }
    }
  } else if (role === 'PERFORMANCE_SCRIPT') {
    npmCommands.push('k6 run tests/performance/k6_stress_test.js');
  }

  // Workflows de CI asociados
  const ciWorkflows: string[] = [];
  if (npmCommands.some((c) => c.includes('npm test') || c.includes('test:all'))) {
    ciWorkflows.push('.github/workflows/ci.yaml (code-quality, sonarcloud)');
  }
  if (npmCommands.some((c) => c.includes('test:fuzz'))) {
    ciWorkflows.push('.github/workflows/ci.yaml (code-quality)');
  }
  if (runner === 'playwright') {
    ciWorkflows.push('.github/workflows/web.yaml (e2e)');
  }
  if (relativePath.includes('k6_stress_test')) {
    ciWorkflows.push('.github/workflows/performance-k6.yaml (k6-load-test)');
  }
  if (relativePath === 'tests/contracts/governance/aas_governance.test.ts') {
    ciWorkflows.push('.github/workflows/ci.yaml (aas-governance)');
  }
  if (relativePath === 'tests/contracts/governance/ruleset_parity.test.ts') {
    ciWorkflows.push('.github/workflows/governance-ruleset-parity.yaml');
  }

  const snapshotMeta = relativePath.endsWith('.snapshot')
    ? {
        type: 'Snapshot',
        targetDomain: 'Instantánea de Prueba',
        targetArtifacts: [],
        description: `Instantánea nativa de node:test que ${path.basename(relativePath, '.snapshot')} compara con la salida actual. Se regenera con npm run test:snapshots:update.`,
      }
    : undefined;

  const meta = FILE_METADATA_CATALOG[relativePath] ||
    snapshotMeta || {
      type: role === 'TEST_FILE' ? 'Automated Test' : 'Helper',
      targetDomain: `Suite ${suite}`,
      targetArtifacts: [],
      description: `Suite de pruebas ${suite}: ${path.basename(relativePath)}.`,
    };

  return {
    path: relativePath,
    suite,
    type: meta.type,
    role,
    runner,
    testCount: testCases.length,
    describeCount,
    assertionCountEst,
    sizeBytes,
    lineCount,
    targetDomain: meta.targetDomain,
    targetArtifacts: meta.targetArtifacts,
    npmCommands,
    ciWorkflows,
    description: meta.description,
    status,
    testCases,
  };
}
