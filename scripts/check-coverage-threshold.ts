/**
 * Gate de cobertura de líneas por directorio (AUD-TST-INT-001).
 *
 * Lee `coverage/lcov.info` (generado por `npm run test:coverage`) y falla si la cobertura agregada de líneas de un
 * directorio baja de su umbral. Un directorio sin archivos en el informe también falla: protege contra que un
 * cambio de ruta deje el gate vigilando nada.
 *
 * Uso: `npm run coverage:gate [-- ruta/al/lcov.info]`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CoverageGate {
  /** Prefijo de ruta relativa a la raíz del repositorio, con separadores `/` y barra final. */
  readonly prefix: string;
  /** Porcentaje mínimo de líneas cubiertas del conjunto de archivos bajo el prefijo. */
  readonly minLines: number;
}

export const COVERAGE_GATES: readonly CoverageGate[] = [{ prefix: 'apps/backend/src/routes/', minLines: 80 }];

export interface FileCoverage {
  file: string;
  linesFound: number;
  linesHit: number;
}

export interface GateResult {
  gate: CoverageGate;
  files: FileCoverage[];
  linesFound: number;
  linesHit: number;
  percent: number;
  ok: boolean;
}

/** Extrae `LF` y `LH` de cada registro `SF:` de un informe LCOV, con rutas normalizadas a `/`. */
export function parseLcov(content: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  let current: FileCoverage | undefined;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      current = { file: line.slice(3).replace(/\\/g, '/'), linesFound: 0, linesHit: 0 };
    } else if (current && line.startsWith('LF:')) {
      current.linesFound = Number(line.slice(3));
    } else if (current && line.startsWith('LH:')) {
      current.linesHit = Number(line.slice(3));
    } else if (line === 'end_of_record' && current) {
      files.push(current);
      current = undefined;
    }
  }
  return files;
}

export function evaluateGate(files: readonly FileCoverage[], gate: CoverageGate): GateResult {
  const scoped = files.filter((file) => file.file.startsWith(gate.prefix));
  const linesFound = scoped.reduce((sum, file) => sum + file.linesFound, 0);
  const linesHit = scoped.reduce((sum, file) => sum + file.linesHit, 0);
  const percent = linesFound === 0 ? 0 : (linesHit / linesFound) * 100;
  return { gate, files: scoped, linesFound, linesHit, percent, ok: linesFound > 0 && percent >= gate.minLines };
}

export function evaluateGates(content: string, gates: readonly CoverageGate[] = COVERAGE_GATES): GateResult[] {
  const files = parseLcov(content);
  return gates.map((gate) => evaluateGate(files, gate));
}

export function formatResult(result: GateResult): string {
  const { gate, files, linesHit, linesFound, percent, ok } = result;
  const header = `${ok ? '✅' : '❌'} ${gate.prefix}: ${percent.toFixed(1)} % (${linesHit}/${linesFound} líneas), mínimo ${gate.minLines} %`;
  if (files.length === 0) return `${header}\n   No hay archivos bajo ese prefijo en el informe de cobertura.`;
  const detail = files.map((file) => {
    const pct = file.linesFound === 0 ? 0 : (file.linesHit / file.linesFound) * 100;
    return `   ${file.file}: ${pct.toFixed(1)} %`;
  });
  return [header, ...detail].join('\n');
}

// Punto de entrada CLI: sale con código 1 si algún gate falla.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const lcovPath = process.argv[2] ?? 'coverage/lcov.info';
  if (!fs.existsSync(lcovPath)) {
    console.error(`❌ No existe ${lcovPath}: ejecutar antes npm run test:coverage`);
    process.exit(1);
  }
  const results = evaluateGates(fs.readFileSync(lcovPath, 'utf8'));
  for (const result of results) console.log(formatResult(result));
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}
