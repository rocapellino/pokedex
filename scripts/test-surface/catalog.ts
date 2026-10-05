/**
 * Construcción del catálogo, detección de drift y escritura de docs/testing/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SUITES_DEFINITION } from './metadata.js';
import { JSON_FILE, MD_FILE, OUTPUT_DIR, ROOT_DIR, TESTS_DIR } from './paths.js';
import { getFilesRecursively, parseTestFile } from './parser.js';
import { generateMarkdownReport } from './report.js';
import type { DriftReport, SuiteSummary, TestFileRecord, TestSurfaceCatalog } from './types.js';

export function buildCatalog(): TestSurfaceCatalog {
  const allFiles = getFilesRecursively(TESTS_DIR).sort((a, b) => a.localeCompare(b));
  const fileRecords = allFiles.map(parseTestFile);

  const suiteMap = new Map<string, { files: number; testCases: number }>();
  for (const f of fileRecords) {
    const cur = suiteMap.get(f.suite) || { files: 0, testCases: 0 };
    cur.files++;
    cur.testCases += f.testCount;
    suiteMap.set(f.suite, cur);
  }

  const suites: SuiteSummary[] = Object.entries(SUITES_DEFINITION).map(([id, def]) => {
    const stats = suiteMap.get(id) || { files: 0, testCases: 0 };
    return {
      id,
      name: def.name,
      path: def.path,
      runner: def.runner,
      command: def.command,
      files: stats.files,
      testCases: stats.testCases,
      description: def.description,
    };
  });

  const totalTestCases = fileRecords.reduce((acc, f) => acc + f.testCount, 0);
  const totalLines = fileRecords.reduce((acc, f) => acc + f.lineCount, 0);
  const totalSizeBytes = fileRecords.reduce((acc, f) => acc + f.sizeBytes, 0);
  const testFiles = fileRecords.filter((f) => f.role === 'TEST_FILE').length;
  const helperFiles = fileRecords.filter((f) => f.role === 'HELPER_OR_FIXTURE').length;
  const performanceScripts = fileRecords.filter((f) => f.role === 'PERFORMANCE_SCRIPT').length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: fileRecords.length,
      testFiles,
      helperFiles,
      performanceScripts,
      totalTestCases,
      totalLines,
      totalSizeBytes,
      suitesCount: suites.length,
    },
    suites,
    files: fileRecords,
  };
}

export function checkDrift(currentCatalog: TestSurfaceCatalog): DriftReport {
  if (!fs.existsSync(JSON_FILE)) {
    return {
      hasDrift: true,
      newFiles: currentCatalog.files.map((f) => f.path),
      removedFiles: [],
      modifiedFiles: [],
      countChangedFiles: [],
      orphanFiles: [],
      brokenTargetArtifacts: [],
    };
  }

  const existingRaw = fs.readFileSync(JSON_FILE, 'utf8');
  let existingCatalog: TestSurfaceCatalog;
  try {
    existingCatalog = JSON.parse(existingRaw);
  } catch {
    return {
      hasDrift: true,
      newFiles: currentCatalog.files.map((f) => f.path),
      removedFiles: [],
      modifiedFiles: [],
      countChangedFiles: [],
      orphanFiles: [],
      brokenTargetArtifacts: [],
    };
  }

  const existingMap = new Map<string, TestFileRecord>();
  for (const f of existingCatalog.files) {
    existingMap.set(f.path, f);
  }

  const currentMap = new Map<string, TestFileRecord>();
  for (const f of currentCatalog.files) {
    currentMap.set(f.path, f);
  }

  const newFiles: string[] = [];
  const removedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const countChangedFiles: { path: string; old: number; current: number }[] = [];
  const orphanFiles: string[] = [];
  const brokenTargetArtifacts: { testFile: string; artifact: string }[] = [];

  for (const [p, cur] of currentMap.entries()) {
    const old = existingMap.get(p);
    if (!old) {
      newFiles.push(p);
    } else {
      if (old.sha256 !== cur.sha256) {
        modifiedFiles.push(p);
      }
      if (old.testCount !== cur.testCount) {
        countChangedFiles.push({ path: p, old: old.testCount, current: cur.testCount });
      }
    }
    if (cur.role === 'TEST_FILE' && cur.npmCommands.length === 0) {
      orphanFiles.push(p);
    }

    // Validación preventiva de artefactos destino rotos
    for (const art of cur.targetArtifacts) {
      if (art.includes('*')) continue;
      const fullPath = path.resolve(ROOT_DIR, art);
      if (!fs.existsSync(fullPath)) {
        brokenTargetArtifacts.push({ testFile: p, artifact: art });
      }
    }
  }

  for (const p of existingMap.keys()) {
    if (!currentMap.has(p)) {
      removedFiles.push(p);
    }
  }

  const hasDrift =
    newFiles.length > 0 ||
    removedFiles.length > 0 ||
    countChangedFiles.length > 0 ||
    modifiedFiles.length > 0 ||
    brokenTargetArtifacts.length > 0 ||
    !fs.existsSync(MD_FILE);

  return {
    hasDrift,
    newFiles,
    removedFiles,
    modifiedFiles,
    countChangedFiles,
    orphanFiles,
    brokenTargetArtifacts,
  };
}

export function writeCatalog(catalog: TestSurfaceCatalog): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(JSON_FILE, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  const mdContent = generateMarkdownReport(catalog);
  fs.writeFileSync(MD_FILE, mdContent, 'utf8');
}
