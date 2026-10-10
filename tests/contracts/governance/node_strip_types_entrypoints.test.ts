/**
 * Los scripts que CI y `package.json` ejecutan con `node --experimental-strip-types` (ADR-023) no pasan por `tsx`:
 * Node resuelve los imports relativos tal cual están escritos, así que `./lib/helm.js` no encuentra `helm.ts`.
 * `tsx` sí lo resuelve, por eso estos fallos no aparecen en `npm test` y solo se ven en el job que ejecuta el script.
 *
 * Incidente que motiva el contrato: tras #682 el paso «Validar consistencia criptográfica de Digest» del job de
 * publicación falló en `main` con ERR_MODULE_NOT_FOUND y dejó sin publicar, firmar ni empaquetar nada durante
 * varias ejecuciones.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../../helpers/repo.js';
import { workflowScripts } from '../../helpers/yaml.js';

const STRIP_TYPES_ENTRYPOINT = /node\s+--experimental-strip-types\s+(?:--test\s+)?((?:scripts|tests)\/[\w./-]+\.ts)/g;
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

/** Archivos que algún script de `package.json` o paso de workflow ejecuta con `node --experimental-strip-types`. */
function entrypoints(): string[] {
  const packageScripts = Object.values(
    JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8')).scripts as Record<string, string>,
  );
  const workflowsDir = path.join(ROOT_DIR, '.github/workflows');
  const workflowRuns = fs
    .readdirSync(workflowsDir)
    .filter((file) => file.endsWith('.yaml'))
    .flatMap((file) => workflowScripts(`.github/workflows/${file}`));

  const found = new Set<string>();
  for (const script of [...packageScripts, ...workflowRuns]) {
    for (const [, file] of script.matchAll(STRIP_TYPES_ENTRYPOINT)) found.add(file);
  }
  return [...found].sort();
}

/** Recorre los imports relativos de un archivo y devuelve los que Node no podría resolver sin transformación. */
function unresolvableImports(entry: string): string[] {
  const problems: string[] = [];
  const visited = new Set<string>();
  const pending = [path.join(ROOT_DIR, entry)];

  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = fs.readFileSync(file, 'utf-8');
    for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
      const target = path.resolve(path.dirname(file), specifier);
      const label = `${path.relative(ROOT_DIR, file).replace(/\\/g, '/')}: '${specifier}'`;
      if (specifier.endsWith('.json')) continue;
      if (!specifier.endsWith('.ts') || !fs.existsSync(target)) {
        problems.push(label);
        continue;
      }
      pending.push(target);
    }
  }
  return problems;
}

test('🧩 Node strip-types: los scripts ejecutados con node --experimental-strip-types importan sus dependencias con extensión .ts', () => {
  const files = entrypoints();
  assert.ok(
    files.length >= 5,
    `deben detectarse los scripts ejecutados con strip-types, encontrados: ${files.join(', ')}`,
  );
  assert.ok(files.includes('scripts/verify-image-digest-parity.ts'), 'el paso de paridad de digests del job publish');

  const problems = files.flatMap((entry) => unresolvableImports(entry).map((p) => `[${entry}] ${p}`));
  assert.deepEqual(
    problems,
    [],
    'Con node --experimental-strip-types los imports relativos deben terminar en .ts y apuntar a un archivo existente (tsx tolera .js, Node no)',
  );
});

test('🧩 Node strip-types: los módulos compartidos se cargan realmente con Node sin tsx', () => {
  // Importación real en un proceso aparte: demuestra la resolución, no solo la forma de los imports.
  for (const module of ['scripts/lib/helm.ts', 'scripts/lib/repo-root.ts', 'tests/helpers/repo.ts']) {
    const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', '-e', `import('./${module}').then(() => console.log('ok'))`],
      { cwd: ROOT_DIR, encoding: 'utf-8' },
    );
    assert.equal(output.trim(), 'ok', `${module} debe poder importarse con node --experimental-strip-types`);
  }
});
