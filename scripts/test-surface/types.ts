/**
 * Tipos del inventario de la superficie de testing.
 */

export interface TestCaseRecord {
  name: string;
  line: number;
}

export interface TestFileRecord {
  path: string;
  suite: string;
  type: string;
  role: 'TEST_FILE' | 'HELPER_OR_FIXTURE' | 'PERFORMANCE_SCRIPT';
  runner: string;
  testCount: number;
  describeCount: number;
  assertionCountEst: number;
  sizeBytes: number;
  lineCount: number;
  targetDomain: string;
  targetArtifacts: string[];
  npmCommands: string[];
  ciWorkflows: string[];
  description: string;
  status: 'ACTIVE' | 'SPECIALIZED' | 'HELPER';
  testCases: TestCaseRecord[];
}

export interface SuiteSummary {
  id: string;
  name: string;
  path: string;
  runner: string;
  command: string;
  files: number;
  testCases: number;
  description: string;
}

/**
 * Catálogo calculado en cada ejecución. Contiene métricas volátiles (conteos, líneas, tamaños) que se muestran por
 * consola pero NO se versionan: ver `PublishedCatalog`.
 */
export interface TestSurfaceCatalog {
  summary: {
    totalFiles: number;
    testFiles: number;
    helperFiles: number;
    performanceScripts: number;
    totalTestCases: number;
    totalLines: number;
    totalSizeBytes: number;
    suitesCount: number;
  };
  suites: SuiteSummary[];
  files: TestFileRecord[];
}

/** Suite tal como se versiona en `docs/testing/`: sin conteos, que cambian con cada test añadido. */
export interface PublishedSuite {
  id: string;
  name: string;
  path: string;
  runner: string;
  command: string;
  description: string;
}

/** Archivo tal como se versiona: solo lo que decide una persona o cambia al añadir, mover o borrar un archivo. */
export interface PublishedFileRecord {
  path: string;
  suite: string;
  type: string;
  role: TestFileRecord['role'];
  runner: string;
  status: TestFileRecord['status'];
  targetDomain: string;
  targetArtifacts: string[];
  npmCommands: string[];
  ciWorkflows: string[];
  description: string;
}

/**
 * Catálogo versionado (`docs/testing/test-surface.json`). Editar el contenido de un test existente no lo modifica:
 * no incluye hashes, líneas, tamaños, conteos de casos ni fecha de generación.
 */
export interface PublishedCatalog {
  schemaVersion: number;
  suites: PublishedSuite[];
  files: PublishedFileRecord[];
}

export interface DriftReport {
  hasDrift: boolean;
  newFiles: string[];
  removedFiles: string[];
  /** Archivos cuyos metadatos publicados (tipo, dominio, descripción, artefactos, comandos, CI) difieren del catálogo. */
  changedFiles: string[];
  /** `test-surface.json` o `test-surface.md` ausentes, ilegibles o distintos de lo que se generaría hoy. */
  staleDocuments: string[];
  orphanFiles: string[];
  brokenTargetArtifacts: { testFile: string; artifact: string }[];
}
