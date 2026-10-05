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
  sha256: string;
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

export interface TestSurfaceCatalog {
  schemaVersion: number;
  generatedAt: string;
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

export interface DriftReport {
  hasDrift: boolean;
  newFiles: string[];
  removedFiles: string[];
  modifiedFiles: string[];
  countChangedFiles: { path: string; old: number; current: number }[];
  orphanFiles: string[];
  brokenTargetArtifacts: { testFile: string; artifact: string }[];
}
