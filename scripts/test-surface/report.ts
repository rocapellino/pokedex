/**
 * Vista humana (Markdown) del inventario de la superficie de testing.
 */

import type { TestFileRecord, TestSurfaceCatalog } from './types.js';

export function generateMarkdownReport(catalog: TestSurfaceCatalog): string {
  const lines: string[] = [];

  lines.push('# Inventario y Gobernanza de Superficie de Testing');
  lines.push('');
  lines.push('> Documento generado automáticamente por `scripts/test-surface.ts`.');
  lines.push('> Fuente Única de Verdad machine-readable: [`test-surface.json`](test-surface.json).');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Resumen Ejecutivo de la Superficie');
  lines.push('');
  lines.push(
    'Este catálogo proporciona el inventario exhaustivo, auditable y granular de toda la superficie de pruebas en `rocapellino/pokedex`. Cada archivo y caso de prueba está tipificado, vinculado a sus artefactos bajo prueba, runner de ejecución y canal de CI/CD.',
  );
  lines.push('');
  lines.push('| Métrica | Valor Registrado |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Total de Archivos en \`tests/\`** | **${catalog.summary.totalFiles}** |`);
  lines.push(`| **Archivos de Test Automatizados** | ${catalog.summary.testFiles} |`);
  lines.push(`| **Scripts de Carga / Rendimiento (k6)** | ${catalog.summary.performanceScripts} |`);
  lines.push(`| **Archivos de Soporte / Entorno (Fixtures)** | ${catalog.summary.helperFiles} |`);
  lines.push(`| **Total de Casos de Prueba Identificados** | **${catalog.summary.totalTestCases}** |`);
  lines.push(`| **Líneas de Código de Pruebas** | ${catalog.summary.totalLines.toLocaleString('es-ES')} |`);
  lines.push(`| **Tamaño Total de la Suite** | ${(catalog.summary.totalSizeBytes / 1024).toFixed(1)} KB |`);
  lines.push(`| **Suites Especializadas Gobernadas** | ${catalog.summary.suitesCount} |`);
  lines.push(`| **Última Sincronización** | ${catalog.generatedAt} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. Matriz Canónica de Suites de Testing');
  lines.push('');
  lines.push('| Suite | Nombre | Runner | Comando Principal | Archivos | Casos | Propósito |');
  lines.push('| :--- | :--- | :--- | :--- | :---: | :---: | :--- |');

  for (const s of catalog.suites) {
    lines.push(
      `| **\`${s.id}\`** | ${s.name} | \`${s.runner}\` | \`${s.command}\` | ${s.files} | ${s.testCases} | ${s.description} |`,
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. Catálogo de Archivos de Prueba');
  lines.push('');
  lines.push(
    'A continuación se inventarían todos los archivos que componen la superficie de pruebas, indicando su suite, tipo, runner, casos que contiene y artefactos objetivo.',
  );
  lines.push('');
  lines.push('| Archivo | Suite | Tipo | Runner | Casos | Líneas | Dominio / Qué Verifica | Comandos |');
  lines.push('| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |');

  for (const f of catalog.files) {
    const cmdList = f.npmCommands.length > 0 ? f.npmCommands.map((c) => `\`${c}\``).join(', ') : '*(Helper)*';
    lines.push(
      `| [\`${f.path}\`](../../${f.path}) | \`${f.suite}\` | ${f.type} | \`${f.runner}\` | **${f.testCount}** | ${f.lineCount} | ${f.description} | ${cmdList} |`,
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 4. Desglose Estructurado por Suite de Pruebas');
  lines.push('');
  lines.push(
    'Para facilitar la inspección humana de la cobertura, las pruebas se agrupan por suite especializada. El catálogo completo y granular con el detalle de cada aserción individual se preserva en [`test-surface.json`](test-surface.json).',
  );
  lines.push('');

  // Agrupar archivos por suite
  const suiteGrouped = new Map<string, TestFileRecord[]>();
  for (const f of catalog.files) {
    const list = suiteGrouped.get(f.suite) || [];
    list.push(f);
    suiteGrouped.set(f.suite, list);
  }

  for (const s of catalog.suites) {
    const files = suiteGrouped.get(s.id) || [];
    if (files.length === 0) continue;

    lines.push(`### Suite: ${s.name} (\`${s.id}\`)`);
    lines.push('');
    lines.push(`- **Runner:** \`${s.runner}\` | **Comando:** \`${s.command}\` | **Total Casos:** ${s.testCases}`);
    lines.push(`- **Propósito:** ${s.description}`);
    lines.push('');
    lines.push('| Archivo de Prueba | Casos | Líneas | Dominio / Qué Verifica | Artefactos Bajo Prueba |');
    lines.push('| :--- | :---: | :---: | :--- | :--- |');

    for (const f of files) {
      const artifacts =
        f.targetArtifacts.length > 0 ? f.targetArtifacts.map((a) => `\`${a}\``).join(', ') : '*(General)*';
      lines.push(
        `| [\`${f.path}\`](../../${f.path}) | **${f.testCount}** | ${f.lineCount} | ${f.description} | ${artifacts} |`,
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## 5. Gobernanza y Detección de Drift');
  lines.push('');
  lines.push(
    'Este inventario no es estático ni manual. Se rige por el protocolo de gobernanza automatizado de `repo-testing`:',
  );
  lines.push('');
  lines.push(
    '1. **Código como Fuente de Verdad:** Si se agrega, renombra o elimina un test, el inventario debe reconciliarse mediante `npm run test:surface:update`.',
  );
  lines.push(
    '2. **Quality Gate en CI:** El comando `npm run test:surface:check` valida que no exista drift entre los archivos de prueba en disco y los catálogos `test-surface.json` y `test-surface.md`.',
  );
  lines.push('3. **Taxonomía de Cambios:**');
  lines.push('   - `NEW_TEST_FILE`: Archivo de test no registrado.');
  lines.push('   - `REMOVED_TEST_FILE`: Archivo eliminado del repositorio que aún figura en el catálogo.');
  lines.push('   - `COUNT_CHANGED`: Variación en la cantidad de pruebas de un archivo existente.');
  lines.push('   - `MODIFIED`: Cambio en el hash SHA-256 del archivo que requiere reconciliación de metadatos.');
  lines.push('   - `ORPHAN`: Test en disco no cubierto por ningún script ni workflow.');
  lines.push('');
  lines.push('```bash');
  lines.push('# Comandos de gestión de la superficie');
  lines.push('npm run test:surface         # Inspeccionar superficie y drift');
  lines.push('npm run test:surface:check   # Validar paridad estricta (CI)');
  lines.push('npm run test:surface:update  # Reconciliar catálogo automáticamente');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
