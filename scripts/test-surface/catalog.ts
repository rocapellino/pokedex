/**
 * Construcción del catálogo, detección de drift y escritura de docs/testing/.
 *
 * Lo que se versiona (`PublishedCatalog`) es solo lo estable: qué archivos existen y qué metadatos tienen. Los
 * conteos, líneas y tamaños se calculan en cada ejecución y se muestran por consola, pero no se escriben en
 * `docs/testing/`: así, editar un test existente no modifica ningún artefacto versionado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SUITES_DEFINITION } from './metadata.js';
import { JSON_FILE, MD_FILE, OUTPUT_DIR, ROOT_DIR, TESTS_DIR } from './paths.js';
import { getFilesRecursively, parseTestFile } from './parser.js';
import { generateMarkdownReport } from './report.js';
import type { DriftReport, PublishedCatalog, PublishedFileRecord, SuiteSummary, TestSurfaceCatalog } from './types.js';

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

/** Proyección estable del catálogo: lo único que se escribe en `docs/testing/`. */
export function toPublishedCatalog(catalog: TestSurfaceCatalog): PublishedCatalog {
  return {
    schemaVersion: 2,
    suites: catalog.suites.map(({ id, name, path: suitePath, runner, command, description }) => ({
      id,
      name,
      path: suitePath,
      runner,
      command,
      description,
    })),
    files: catalog.files.map((f) => ({
      path: f.path,
      suite: f.suite,
      type: f.type,
      role: f.role,
      runner: f.runner,
      status: f.status,
      targetDomain: f.targetDomain,
      targetArtifacts: f.targetArtifacts,
      npmCommands: f.npmCommands,
      ciWorkflows: f.ciWorkflows,
      description: f.description,
    })),
  };
}

/** Contenido exacto que `writeCatalog` escribiría: permite comparar con lo que hay en disco. */
export function renderPublishedDocuments(catalog: TestSurfaceCatalog): { json: string; markdown: string } {
  const published = toPublishedCatalog(catalog);
  return {
    json: `${JSON.stringify(published, null, 2)}\n`,
    markdown: generateMarkdownReport(published),
  };
}

const readIfExists = (file: string): string | undefined =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
/** Normaliza finales de línea: el checkout en Windows puede convertir LF en CRLF. */
const normalizeEol = (text: string | undefined) => text?.replace(/\r\n/g, '\n');

export function checkDrift(currentCatalog: TestSurfaceCatalog): DriftReport {
  const rendered = renderPublishedDocuments(currentCatalog);
  const storedJson = normalizeEol(readIfExists(JSON_FILE));
  const storedMarkdown = normalizeEol(readIfExists(MD_FILE));

  let stored: PublishedCatalog | undefined;
  try {
    stored = storedJson ? (JSON.parse(storedJson) as PublishedCatalog) : undefined;
  } catch {
    stored = undefined;
  }

  const storedFiles = new Map<string, PublishedFileRecord>((stored?.files ?? []).map((f) => [f.path, f]));
  const currentFiles = new Map<string, PublishedFileRecord>(
    toPublishedCatalog(currentCatalog).files.map((f) => [f.path, f]),
  );

  const newFiles: string[] = [];
  const changedFiles: string[] = [];
  const removedFiles: string[] = [];
  const orphanFiles: string[] = [];
  const brokenTargetArtifacts: { testFile: string; artifact: string }[] = [];

  for (const [filePath, current] of currentFiles) {
    const previous = storedFiles.get(filePath);
    if (!previous) newFiles.push(filePath);
    else if (JSON.stringify(previous) !== JSON.stringify(current)) changedFiles.push(filePath);

    if (current.role === 'TEST_FILE' && current.npmCommands.length === 0) orphanFiles.push(filePath);

    // Validación preventiva de artefactos destino rotos
    for (const artifact of current.targetArtifacts) {
      if (artifact.includes('*')) continue;
      if (!fs.existsSync(path.resolve(ROOT_DIR, artifact)))
        brokenTargetArtifacts.push({ testFile: filePath, artifact });
    }
  }
  for (const filePath of storedFiles.keys()) {
    if (!currentFiles.has(filePath)) removedFiles.push(filePath);
  }

  const staleDocuments: string[] = [];
  if (storedJson !== rendered.json) staleDocuments.push('docs/testing/test-surface.json');
  if (storedMarkdown !== rendered.markdown) staleDocuments.push('docs/testing/test-surface.md');

  const hasDrift =
    newFiles.length > 0 ||
    removedFiles.length > 0 ||
    changedFiles.length > 0 ||
    staleDocuments.length > 0 ||
    brokenTargetArtifacts.length > 0;

  return { hasDrift, newFiles, removedFiles, changedFiles, staleDocuments, orphanFiles, brokenTargetArtifacts };
}

export function writeCatalog(catalog: TestSurfaceCatalog): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const { json, markdown } = renderPublishedDocuments(catalog);
  fs.writeFileSync(JSON_FILE, json, 'utf8');
  fs.writeFileSync(MD_FILE, markdown, 'utf8');
}
