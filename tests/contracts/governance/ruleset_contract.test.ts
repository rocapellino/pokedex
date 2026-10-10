import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ROOT_DIR } from '../../helpers/repo.js';
import { readYaml } from '../../helpers/yaml.js';

const RULESET_PATH = path.join(ROOT_DIR, '.github/rulesets/main-protection.json');

/**
 * RULESET-001 — Integridad TEXTUAL del contrato del ruleset.
 *
 * Un required status check se compara por cadena EXACTA. Si el context guardado
 * no coincide byte a byte con el nombre que reporta GitHub Actions, el ruleset
 * queda esperando eternamente un check que nunca se emitió, y el Pull Request
 * muestra "Expected - Waiting for status to be reported" aunque todos los jobs
 * hayan terminado en verde.
 *
 * El fallo original fue doble encoding (mojibake) de los emoji al generar el
 * payload desde una shell no-UTF-8: los emojis se guardaron como secuencias
 * Windows-1252 en lugar de sus code points reales.
 *
 * Estos tests validan los code points exactos, no la apariencia en consola.
 *
 * ---------------------------------------------------------------------------
 * ALCANCE (TST-003)
 *
 * Este bloque vivía dentro de `ci_impact.test.ts` (1.118 líneas), donde no
 * sugería ninguna relación con el resto del archivo: ni con el motor de
 * change-impact, ni con la topología de CI, ni con los contratos de seguridad.
 *
 * Se extrajo por dos razones:
 *   1. Es autocontenido. Sus dos helpers (`EXPECTED_REQUIRED_CONTEXTS` y
 *      `assertNoMojibake`) solo los usan estos tres tests, de modo que la
 *      extracción no obliga a crear un módulo compartido de utilidades.
 *   2. La frontera de responsabilidad queda explícita. Este archivo valida que
 *      el TEXTO del contrato está intacto; `ruleset_parity.test.ts` valida que
 *      la POLÍTICA declarada coincide con lo que GitHub aplica realmente.
 *      Son capas distintas y ahora viven en archivos que lo dicen.
 */
const EXPECTED_REQUIRED_CONTEXTS = [
  '🚀 Core CI / 🔍 Auditoría de Calidad y Complejidad',
  '🛡️ Gitleaks Secret Detection',
  '🚦 Quality Gate',
];

/** Detecta mojibake: un required check nunca debe empezar con U+00AD ni ser ASCII puro. */
function assertNoMojibake(context: string): void {
  const first = context.codePointAt(0)!;
  assert.notEqual(first, 0x00ad, `Context corrupto (soft hyphen U+00AD): "${context}". El emoji fue mal decodificado.`);
  assert.ok(
    first > 0x2000,
    `Context sin el emoji esperado (U+${first.toString(16).toUpperCase().padStart(4, '0')}): ` +
      `"${context}". GitHub compara el context de forma exacta.`,
  );
}

function readRuleset(): { rules: { type: string; parameters?: any }[] } {
  return JSON.parse(fs.readFileSync(RULESET_PATH, 'utf-8'));
}

test('🔤 RULESET-001: los required checks del ruleset no deben estar corruptos', () => {
  const { rules } = readRuleset();
  const rsc = rules.find((r) => r.type === 'required_status_checks');
  assert.ok(rsc, 'El ruleset debe declarar required_status_checks');

  for (const c of rsc!.parameters.required_status_checks) {
    assertNoMojibake(c.context);
  }
});

test('🔤 RULESET-001: los contexts del ruleset coinciden con los checks reales', () => {
  const { rules } = readRuleset();
  const rsc = rules.find((r) => r.type === 'required_status_checks');
  assert.ok(rsc, 'El ruleset debe declarar required_status_checks');
  const contexts: string[] = rsc!.parameters.required_status_checks.map((c: { context: string }) => c.context);

  assert.deepEqual(
    [...contexts].sort(),
    [...EXPECTED_REQUIRED_CONTEXTS].sort(),
    'Los required checks deben coincidir exactamente con los nombres que reporta GitHub Actions',
  );
});

test('🔤 RULESET-001: el archivo de reglas se serializa en UTF-8 real', () => {
  const raw = fs.readFileSync(RULESET_PATH);

  // 0xEF 0xBB 0xBF = BOM UTF-8, que rompe el parseo en algunos consumidores.
  assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'main-protection.json no debe llevar BOM UTF-8');

  // Debe ser decodificable como UTF-8 estricto sin replacement chars.
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  assert.doesNotMatch(text, /\uFFFD/, 'main-protection.json debe ser UTF-8 valido');
});

/**
 * Nombres de check que GitHub Actions reporta de verdad, calculados desde los workflows:
 *  - un job propio de un workflow con trigger directo se reporta con su `name`;
 *  - un job que invoca un reusable (`uses:`) se reporta como `<name del invocador> / <name del job reusado>`.
 */
function reportedCheckNames(): Set<string> {
  const names = new Set<string>();
  const dir = path.join(ROOT_DIR, '.github/workflows');
  type Job = { name?: string; uses?: string };
  const load = (file: string) => readYaml<{ jobs: Record<string, Job> }>(`.github/workflows/${file}`);

  for (const file of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    for (const job of Object.values(load(file).jobs)) {
      if (!job.uses) {
        if (job.name) names.add(job.name);
        continue;
      }
      const reused = load(path.basename(job.uses));
      for (const inner of Object.values(reused.jobs)) {
        if (job.name && inner.name) names.add(`${job.name} / ${inner.name}`);
      }
    }
  }
  return names;
}

test('🔤 RULESET-002: cada required check del ruleset existe como job real en los workflows', () => {
  const { rules } = readRuleset();
  const rsc = rules.find((r) => r.type === 'required_status_checks');
  const contexts: string[] = rsc!.parameters.required_status_checks.map((c: { context: string }) => c.context);
  const reported = reportedCheckNames();

  const huérfanos = contexts.filter((context) => !reported.has(context));
  assert.deepEqual(
    huérfanos,
    [],
    `Required checks sin job que los emita: ${huérfanos.join(' | ')}. Si se renombró un job o un workflow, ` +
      'el ruleset quedaría esperando eternamente un check que nunca se reporta (PR bloqueado).',
  );
});
