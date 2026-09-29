import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_BYPASS_MODES,
  LEGACY_BYPASS_MODE,
  REPOSITORY_ROLE_ACTOR_IDS,
  diffRulesets,
  fetchLiveRuleset,
  loadDeclarativeRuleset,
  normalizeRuleset,
} from '../scripts/check-ruleset-parity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RULESET_PATH = path.join(ROOT_DIR, '.github', 'rulesets', 'main-protection.json');

/**
 * RULESET-001 — segunda parte: paridad Declarativo <-> GitHub Live.
 *
 * `ci_impact.test.ts` ya cubre la integridad del JSON (parseo, UTF-8, contexts no
 * corruptos). Eso NO alcanza: un archivo puede estar perfecto y aun asi no
 * describir lo que GitHub aplica. Estos tests cierran ese hueco en tres capas:
 *
 *   1. Invariantes del contrato (offline, siempre corren). Blindan los dos bugs
 *      que hacia inaplicable el archivo declarativo.
 *   2. Motor de drift con fixtures. Demuestra que el gate DETECTA las
 *      divergencias reales, para que el test no sea un no-op.
 *   3. Paridad live (opt-in via RULESET_LIVE_CHECK=1), ejecutada por el
 *      workflow programado: es la unica capa que necesita red.
 */

const raw = JSON.parse(fs.readFileSync(RULESET_PATH, 'utf-8'));
const pullRequestRule = raw.rules.find((r: { type: string }) => r.type === 'pull_request');

/** Copia profunda para mutar fixtures sin arrastrar efectos entre tests. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ==============================================================================
// 1. INVARIANTES DEL CONTRATO DECLARATIVO (offline)
// ==============================================================================

test('🔒 RULESET-001: el mapeo de actor_id de RepositoryRole esta blindado', () => {
  // Se conserva aunque hoy NO haya bypass actors (politica de maintainer unico).
  // Cuando se reevalue la politica al sumar un segundo colaborador, el valor
  // correcto ya queda documentado y protegido contra regresiones.
  assert.equal(REPOSITORY_ROLE_ACTOR_IDS[5], 5, 'admin debe identificarse con 5');
  assert.ok(
    Object.hasOwn(REPOSITORY_ROLE_ACTOR_IDS, '2'),
    'maintain debe identificarse con 2'
  );
  // 1 NO pertenece a RepositoryRole: corresponde a OrganizationAdmin, que no
  // aplica en repositorios personales. Fue la causa del drift original.
  assert.equal(
    Object.hasOwn(REPOSITORY_ROLE_ACTOR_IDS, '1'),
    false,
    'actor_id 1 es OrganizationAdmin y no debe usarse como RepositoryRole'
  );
});

test('🔒 RULESET-001: los bypass_mode conocidos excluyen el valor legacy', () => {
  assert.ok(CANONICAL_BYPASS_MODES.includes('pull_request'));
  assert.ok(CANONICAL_BYPASS_MODES.includes('always'));
  assert.ok(CANONICAL_BYPASS_MODES.includes('exempt'));
  assert.equal(
    CANONICAL_BYPASS_MODES.includes(LEGACY_BYPASS_MODE),
    false,
    'pull_requests_only fue retirado de la API y no debe usarse'
  );
});

/**
 * Politica de aprobaciones para el estado de maintainer unico.
 *
 * `required_approving_review_count: 1` es MATEMATICAMENTE insatisfacible con un
 * solo colaborador: GitHub nunca cuenta la auto-aprobacion del autor. El unico
 * merge posible seria via bypass, es decir, un control que se salta siempre y
 * por lo tanto no aporta garantia alguna (peor que no tenerlo, porque simula
 * Assurance que no existe).
 *
 * Decidir `0` de forma explicita es superior al drift original: antes nadie lo
 * habia decidido; ahora es una politica documentada y congelada por el gate de
 * paridad. Los controles que SI aportan valor se conservan intactos y este test
 * lo blinda para que "modo maintainer unico" nunca se convierta en "relajar
 * proteccion" por accidente.
 */
test('🔒 RULESET-001: la politica de aprobaciones refleja el estado de maintainer unico', () => {
  assert.ok(pullRequestRule, 'El contrato debe declarar la regla pull_request');
  assert.equal(
    pullRequestRule.parameters.required_approving_review_count,
    0,
    'Sin un segundo revisor, exigir aprobaciones solo genera bypass'
  );
  assert.deepEqual(
    raw.bypass_actors,
    [],
    'Sin aprobaciones que saltear, un bypass actor solo abre superficie de ataque'
  );
});

test('🔒 RULESET-001: el modo maintainer unico NO relaja el resto de las protecciones', () => {
  const pr = pullRequestRule.parameters;
  // Estos si aportan valor con un solo colaborador y deben permanecer.
  assert.equal(
    pr.required_review_thread_resolution,
    true,
    'Debe exigirse resolver las conversaciones de revision'
  );
  assert.equal(pr.dismiss_stale_reviews_on_push, true);
  assert.deepEqual(pr.allowed_merge_methods.sort(), ['merge', 'rebase', 'squash']);

  const types = raw.rules.map((r: { type: string }) => r.type);
  assert.ok(types.includes('non_fast_forward'), 'No debe permitirse force-push a main');
  assert.ok(types.includes('deletion'), 'No debe permitirse eliminar main');
  assert.ok(types.includes('required_status_checks'), 'Los required checks son el gate real');
  assert.equal(raw.enforcement, 'active');
});


// ==============================================================================
// 2. MOTOR DE DRIFT (fixtures, offline)
// ==============================================================================

// El drift original (contrato 1+bypass vs live 0+[]) ya no es reproducible: la
// politica de maintainer unico hace que 0+[] sea el contrato valido. Lo que el
// gate debe cazar ahora es cualquier DEBILITAMIENTO silencioso del contrato.

test('🚨 RULESET-001: detecta un bypass actor anadido en live sin declarar', () => {
  const declared = normalizeRuleset(raw);
  const escalated = clone(raw);
  // Escenario de escalada de privilegio: alguien concede bypass a un rol con
  // escritura directamente en la API, sin tocar el archivo declarativo.
  escalated.bypass_actors = [
    { actor_id: 4, actor_type: 'RepositoryRole', bypass_mode: 'always' },
  ];

  const drift = diffRulesets(declared, normalizeRuleset(escalated));
  assert.ok(
    drift.some((d) => d.field === 'bypass_actors'),
    'Un bypass actor en live que no existe en el contrato debe considerarse drift'
  );
});

test('🚨 RULESET-001: detecta la relajacion de thread resolution y de aprobaciones', () => {
  const declared = normalizeRuleset(raw);
  const relaxed = clone(raw);
  const liveRule = relaxed.rules.find((r: { type: string }) => r.type === 'pull_request');
  // Debilitar lo que si aporta valor: dejar de exigir resolver conversaciones.
  liveRule.parameters.required_review_thread_resolution = false;
  // Y reintroducir la exigencia de aprobaciones que se decidio no aplicar.
  liveRule.parameters.required_approving_review_count = 1;

  const drift = diffRulesets(declared, normalizeRuleset(relaxed));
  const fields = drift.map((d) => d.field);
  assert.ok(fields.includes('pull_request.parameters.required_review_thread_resolution'));
  assert.ok(fields.includes('pull_request.parameters.required_approving_review_count'));

  const approvals = drift.find(
    (d) => d.field === 'pull_request.parameters.required_approving_review_count'
  )!;
  assert.equal(approvals.declared, '0');
  assert.equal(approvals.live, '1');
});

test('🧪 RULESET-001: el motor de drift detecta drift de contexts y de enforcement', () => {
  const declared = normalizeRuleset(raw);
  const drifted = clone(raw);
  drifted.rules
    .find((r: { type: string }) => r.type === 'required_status_checks')
    .parameters.required_status_checks.pop();
  drifted.enforcement = 'disabled';

  const fields = diffRulesets(declared, normalizeRuleset(drifted)).map((d) => d.field);
  assert.ok(fields.includes('required_status_checks[].context'));
  assert.ok(fields.includes('enforcement'));
});

test('🧪 RULESET-001: no hay drift cuando el live solo agrega metadatos de solo lectura', () => {
  const declared = normalizeRuleset(raw);
  const live = clone(raw);
  // La API agrega campos que el archivo declarativo jamas contendra.
  live.id = 22018747;
  live.node_id = 'RRS_lACqUmVwb3NpdG9y';
  live.created_at = '2026-09-01T11:03:36.716-03:00';
  live.current_user_can_bypass = 'never';
  live.rules
    .find((r: { type: string }) => r.type === 'required_status_checks')
    .parameters.required_status_checks.forEach((c: Record<string, unknown>) => {
      c.integration_id = 15368;
    });

  assert.deepEqual(
    diffRulesets(declared, normalizeRuleset(live)),
    [],
    'Los metadatos de solo lectura no deben producir drift falso permanente'
  );
});

test('🧪 RULESET-001: el orden de claves y de listas no genera drift', () => {
  const declared = normalizeRuleset(raw);
  const live = clone(raw);
  live.bypass_actors.reverse();
  live.rules.reverse();
  // Mismo set de contexts, distinto orden.
  live.rules
    .find((r: { type: string }) => r.type === 'required_status_checks')
    .parameters.required_status_checks.reverse();

  assert.deepEqual(diffRulesets(declared, normalizeRuleset(live)), []);
});

// ==============================================================================
// 3. PARIDAD LIVE (opt-in: RULESET_LIVE_CHECK=1)
// ==============================================================================

const liveCheckEnabled = process.env.RULESET_LIVE_CHECK === '1';

test(
  '🔗 RULESET-001: el contrato declarativo coincide con el ruleset aplicado en GitHub',
  { skip: liveCheckEnabled ? false : 'requiere RULESET_LIVE_CHECK=1 (lo ejecuta el workflow programado)' },
  () => {
    const repo = process.env.GITHUB_REPOSITORY ?? 'rocapellino/pokedex';
    const drift = diffRulesets(loadDeclarativeRuleset(ROOT_DIR), fetchLiveRuleset(repo));
    assert.deepEqual(
      drift,
      [],
      `Drift entre el contrato y ${repo}:\n${drift
        .map((d) => `  - ${d.field}: declarativo=${d.declared} live=${d.live}`)
        .join('\n')}`
    );
  }
);

// ==============================================================================
// 4. CABLEADO DEL GATE
// ==============================================================================

test('🔌 RULESET-001: el gate esta cableado en package.json y en un workflow programado', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert.match(pkg.scripts['lint:ruleset'], /check-ruleset-parity/);

  const workflow = fs.readFileSync(
    path.join(ROOT_DIR, '.github', 'workflows', 'governance-ruleset-parity.yaml'),
    'utf-8'
  );
  assert.match(workflow, /schedule:/, 'El gate debe correr de forma programada');
  assert.match(workflow, /lint:ruleset/, 'El workflow debe invocar el gate');
  assert.match(workflow, /--required/, 'El workflow debe fallar si no puede verificar');
});
