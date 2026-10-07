/**
 * ==============================================================================
 * scripts/lighthouse-summary.ts
 *
 * Resume en Markdown los informes que deja `lhci autorun` en `.lighthouseci/`
 * (mediana por URL). El workflow lo anexa a `$GITHUB_STEP_SUMMARY`, de modo que la
 * puntuación y las métricas queden registradas en cada ejecución y no solo el
 * veredicto de las aserciones.
 *
 * Uso:
 *   npx tsx scripts/lighthouse-summary.ts [directorio]   (por defecto `.lighthouseci`)
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Lhr {
  finalDisplayedUrl: string;
  categories: Record<string, { score: number | null }>;
  audits: Record<string, { numericValue?: number }>;
}

const CATEGORIES: Array<[string, string]> = [
  ['performance', 'Perf'],
  ['accessibility', 'A11y'],
  ['best-practices', 'BP'],
  ['seo', 'SEO'],
];

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const score = (value: number): string => String(Math.round(value * 100));

export function summarize(lhrs: Lhr[]): string {
  if (lhrs.length === 0) return '### Lighthouse\n\nNo se encontraron informes.\n';

  const byUrl = new Map<string, Lhr[]>();
  for (const lhr of lhrs) byUrl.set(lhr.finalDisplayedUrl, [...(byUrl.get(lhr.finalDisplayedUrl) ?? []), lhr]);

  const metric = (runs: Lhr[], id: string): number => median(runs.map((r) => r.audits[id]?.numericValue ?? Number.NaN));
  const header = ['URL', 'Ejec.', ...CATEGORIES.map(([, label]) => label), 'FCP', 'LCP', 'CLS', 'TBT', 'Peso'];
  const rows = [...byUrl.entries()].map(([url, runs]) => [
    `\`${new URL(url).pathname}\``,
    String(runs.length),
    ...CATEGORIES.map(([id]) => score(median(runs.map((r) => r.categories[id]?.score ?? Number.NaN)))),
    seconds(metric(runs, 'first-contentful-paint')),
    seconds(metric(runs, 'largest-contentful-paint')),
    metric(runs, 'cumulative-layout-shift').toFixed(3),
    `${Math.round(metric(runs, 'total-blocking-time'))} ms`,
    `${Math.round(metric(runs, 'total-byte-weight') / 1024)} KiB`,
  ]);

  const line = (cells: string[]): string => `| ${cells.join(' | ')} |`;
  return [
    '### Lighthouse (mediana por URL, móvil con throttling simulado)',
    '',
    line(header),
    line(header.map(() => '---')),
    ...rows.map(line),
    '',
    'Escenario: nginx de producción (digest del Dockerfile) con el catálogo nacional completo servido por una API simulada; imágenes locales.',
    '',
  ].join('\n');
}

export function readReports(dir: string): Lhr[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => /^lhr-.*\.json$/.test(file))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as Lhr);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(summarize(readReports(process.argv[2] ?? '.lighthouseci')));
}
