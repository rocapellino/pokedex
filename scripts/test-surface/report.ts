/**
 * Vista humana (Markdown) del inventario de la superficie de testing.
 *
 * Se genera solo con datos estables (ver `PublishedCatalog`): sin conteos de casos, líneas ni tamaños, que cambian
 * con cada edición de un test y harían chocar entre sí a los PRs concurrentes. Esas métricas se consultan con
 * `npm run test:surface`.
 */

import type { PublishedCatalog, PublishedFileRecord } from './types.js';

export function generateMarkdownReport(catalog: PublishedCatalog): string {
  const lines: string[] = [];

  lines.push('# Inventario y Gobernanza de Superficie de Testing');
  lines.push('');
  lines.push('> Documento generado automáticamente por `scripts/test-surface.ts`.');
  lines.push('> Fuente Única de Verdad machine-readable: [`test-surface.json`](test-surface.json).');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Alcance del Inventario');
  lines.push('');
  lines.push(
    'Este catálogo inventaría los archivos de la superficie de pruebas en `rocapellino/pokedex`: qué verifica cada uno, contra qué artefactos, con qué runner y por qué canal de CI/CD se ejecuta.',
  );
  lines.push('');
  lines.push(
    'Solo contiene datos estables: cambia al **añadir, mover o borrar** un archivo, o al editar su descripción en `scripts/test-surface/metadata*.ts`. Editar el contenido de un test existente no lo modifica. Los conteos de casos, líneas y tamaño no se versionan; se consultan con `npm run test:surface`.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. Matriz Canónica de Suites de Testing');
  lines.push('');
  lines.push('| Suite | Nombre | Runner | Comando Principal | Propósito |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');

  for (const s of catalog.suites) {
    lines.push(`| **\`${s.id}\`** | ${s.name} | \`${s.runner}\` | \`${s.command}\` | ${s.description} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. Catálogo de Archivos de Prueba');
  lines.push('');
  lines.push(
    'A continuación se inventarían todos los archivos que componen la superficie de pruebas, indicando su suite, tipo, runner y comandos de ejecución.',
  );
  lines.push('');
  lines.push('| Archivo | Suite | Tipo | Runner | Dominio / Qué Verifica | Comandos |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const f of catalog.files) {
    const cmdList = f.npmCommands.length > 0 ? f.npmCommands.map((c) => `\`${c}\``).join(', ') : '*(Helper)*';
    lines.push(
      `| [\`${f.path}\`](../../${f.path}) | \`${f.suite}\` | ${f.type} | \`${f.runner}\` | ${f.description} | ${cmdList} |`,
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 4. Desglose Estructurado por Suite de Pruebas');
  lines.push('');
  lines.push(
    'Para facilitar la inspección humana de la cobertura, las pruebas se agrupan por suite especializada. El detalle estructurado se preserva en [`test-surface.json`](test-surface.json).',
  );
  lines.push('');

  // Agrupar archivos por suite
  const suiteGrouped = new Map<string, PublishedFileRecord[]>();
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
    lines.push(`- **Runner:** \`${s.runner}\` | **Comando:** \`${s.command}\``);
    lines.push(`- **Propósito:** ${s.description}`);
    lines.push('');
    lines.push('| Archivo de Prueba | Dominio / Qué Verifica | Artefactos Bajo Prueba |');
    lines.push('| :--- | :--- | :--- |');

    for (const f of files) {
      const artifacts =
        f.targetArtifacts.length > 0 ? f.targetArtifacts.map((a) => `\`${a}\``).join(', ') : '*(General)*';
      lines.push(`| [\`${f.path}\`](../../${f.path}) | ${f.description} | ${artifacts} |`);
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
    '1. **Código como Fuente de Verdad:** Si se agrega, renombra o elimina un archivo de test, el inventario debe reconciliarse mediante `npm run test:surface:update`.',
  );
  lines.push(
    '2. **Quality Gate en CI:** El comando `npm run test:surface:check` valida que `test-surface.json` y `test-surface.md` coincidan exactamente con lo que se generaría hoy a partir de los archivos en disco y de `scripts/test-surface/metadata*.ts`.',
  );
  lines.push('3. **Taxonomía de Cambios:**');
  lines.push('   - `NEW_TEST_FILE`: Archivo de test no registrado.');
  lines.push('   - `REMOVED_TEST_FILE`: Archivo eliminado del repositorio que aún figura en el catálogo.');
  lines.push(
    '   - `CHANGED`: Metadatos publicados de un archivo (tipo, dominio, descripción, artefactos, comandos o CI) distintos de los del catálogo.',
  );
  lines.push(
    '   - `STALE_DOCUMENT`: `test-surface.json` o `test-surface.md` no coinciden con lo que se generaría hoy.',
  );
  lines.push('   - `BROKEN_TARGET`: Artefacto bajo prueba inexistente.');
  lines.push('   - `ORPHAN`: Test en disco no cubierto por ningún script ni workflow.');
  lines.push('');
  lines.push('```bash');
  lines.push('# Comandos de gestión de la superficie');
  lines.push('npm run test:surface         # Inspeccionar superficie, métricas y drift');
  lines.push('npm run test:surface:check   # Validar paridad estricta (CI)');
  lines.push('npm run test:surface:update  # Reconciliar catálogo automáticamente');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
