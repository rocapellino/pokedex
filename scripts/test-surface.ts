/**
 * ==============================================================================
 * scripts/test-surface.ts
 * ==============================================================================
 * Motor de descubrimiento, inventario y gobernanza de la superficie de testing.
 *
 * Funcionalidades:
 *   - Descubre recursivamente todos los artefactos en `tests/`.
 *   - Clasifica suites, tipos de runner (node:test, playwright, k6), roles y dominios.
 *   - Extrae granularmente casos de prueba individuales (`test`, `it`, `group`).
 *   - Asocia comandos npm (`package.json`) y workflows de GitHub Actions.
 *   - Calcula hashes SHA-256 para control estricto de drift e inmutabilidad.
 *   - Genera la SSOT machine-readable `docs/testing/test-surface.json`.
 *   - Genera la vista humana y navegable `docs/testing/test-surface.md`.
 *   - Valida paridad exacta sin drift con `--check`.
 *
 * Modos de ejecución:
 *   npx tsx scripts/test-surface.ts           # Diagnóstico y estado de drift
 *   npx tsx scripts/test-surface.ts --check   # Falla (exit 1) si hay drift
 *   npx tsx scripts/test-surface.ts --update  # Reconcilia y actualiza docs/testing/
 *   npx tsx scripts/test-surface.ts --json    # Salida en JSON estándar
 * ==============================================================================
 */

import fs from 'node:fs';
import { buildCatalog, checkDrift, writeCatalog } from './test-surface/catalog.js';
import { JSON_FILE, MD_FILE } from './test-surface/paths.js';

// API pública conservada: los consumidores importan desde este módulo.
export { buildCatalog, checkDrift, writeCatalog } from './test-surface/catalog.js';
export { parseTestFile } from './test-surface/parser.js';
export { generateMarkdownReport } from './test-surface/report.js';
export type {
  DriftReport,
  SuiteSummary,
  TestCaseRecord,
  TestFileRecord,
  TestSurfaceCatalog,
} from './test-surface/types.js';

// ==============================================================================
// CLI Execution
// ==============================================================================
function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isUpdate = args.includes('--update');
  const isJson = args.includes('--json');

  const catalog = buildCatalog();
  const drift = checkDrift(catalog);

  if (isJson) {
    console.log(JSON.stringify({ catalog, drift }, null, 2));
    if (isCheck && drift.hasDrift) {
      process.exit(1);
    }
    return;
  }

  console.log('🧪 Pokedex Test Surface Governance');
  console.log('===================================');
  console.log(`Archivos totales en tests/: ${catalog.summary.totalFiles}`);
  console.log(`Archivos de test activos:  ${catalog.summary.testFiles}`);
  console.log(`Scripts de carga (k6):      ${catalog.summary.performanceScripts}`);
  console.log(`Fixtures / Entorno:        ${catalog.summary.helperFiles}`);
  console.log(`Total casos de prueba:     ${catalog.summary.totalTestCases}`);
  console.log(`Total líneas de testing:   ${catalog.summary.totalLines.toLocaleString('es-ES')}`);
  console.log(`Tamaño total suite:        ${(catalog.summary.totalSizeBytes / 1024).toFixed(1)} KB`);
  console.log('-----------------------------------');

  if (isUpdate) {
    writeCatalog(catalog);
    console.log('✅ Catálogos generados con éxito:');
    console.log(`   - Machine-readable: docs/testing/test-surface.json`);
    console.log(`   - Vista humana:     docs/testing/test-surface.md`);
    return;
  }

  if (drift.hasDrift) {
    console.log('⚠️ DRIFT DETECTADO EN LA SUPERFICIE DE TESTING:');
    if (drift.newFiles.length > 0) {
      console.log(`  ➕ Archivos nuevos (${drift.newFiles.length}):`);
      for (const f of drift.newFiles) console.log(`     - ${f}`);
    }
    if (drift.removedFiles.length > 0) {
      console.log(`  ➖ Archivos eliminados (${drift.removedFiles.length}):`);
      for (const f of drift.removedFiles) console.log(`     - ${f}`);
    }
    if (drift.countChangedFiles.length > 0) {
      console.log(`  🔢 Cambio en cantidad de tests (${drift.countChangedFiles.length}):`);
      for (const c of drift.countChangedFiles) console.log(`     - ${c.path}: ${c.old} -> ${c.current} tests`);
    }
    if (drift.modifiedFiles.length > 0) {
      console.log(`  📝 Archivos con contenido modificado (${drift.modifiedFiles.length}):`);
      for (const f of drift.modifiedFiles) console.log(`     - ${f}`);
    }
    if (drift.brokenTargetArtifacts.length > 0) {
      console.log(`  🔗 Referencias a artefactos inexistentes/rotos (${drift.brokenTargetArtifacts.length}):`);
      for (const b of drift.brokenTargetArtifacts) console.log(`     - [${b.testFile}] -> ${b.artifact}`);
    }
    if (!fs.existsSync(JSON_FILE) || !fs.existsSync(MD_FILE)) {
      console.log('  📄 Catálogos en docs/testing/ ausentes o incompletos.');
    }
    console.log('\n💡 Para reconciliar la documentación ejecute:');
    console.log('   npm run test:surface:update');

    if (isCheck) {
      console.error('\n❌ Falla de Quality Gate: la superficie de pruebas no está sincronizada.');
      process.exit(1);
    }
  } else {
    console.log('✅ Superficie de testing perfectamente sincronizada sin drift.');
    console.log('   docs/testing/test-surface.json y test-surface.md están al día.');
  }

  if (drift.orphanFiles.length > 0) {
    console.log('\n⚠️ ALERTA: Tests potencialmente huérfanos sin comandos registrados:');
    for (const f of drift.orphanFiles) {
      console.log(`   - ${f}`);
    }
  }
}

if (process.argv[1] && (process.argv[1].endsWith('test-surface.ts') || process.argv[1].endsWith('test-surface.js'))) {
  main();
}
