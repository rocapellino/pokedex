#!/usr/bin/env node
/**
 * =============================================================================
 * Gate de Paridad Declarativo <-> GitHub Live [RULESET-001]
 * =============================================================================
 *
 * PROBLEMA (causa raiz): `.github/rulesets/main-protection.json` es un contrato
 * declarativo, pero NADA en el repositorio lo aplicaba a GitHub. Los tests
 * preexistentes solo validaban que el JSON fuera parseable, UTF-8 y que los
 * contexts no estuvieran corruptos; ninguno lo contrastaba contra el ruleset
 * realmente aplicado. Eso permitio que el archivo declarara
 * `required_approving_review_count: 1` mas un bypass actor, mientras GitHub
 * aplicaba `0` y lista de bypass vacia.
 *
 * Este gate cierra el circuito: normaliza ambas fuentes a una forma canonica y
 * falla si divergen en cualquier campo de control.
 *
 * NORMALIZACION: la API de GitHub devuelve campos de solo lectura e inmutables
 * (`id`, `node_id`, `created_at`, `integration_id`, `current_user_can_bypass`)
 * que el archivo declarativo jamas contendra. Comparar el JSON crudo produciria
 * drift falso permanente, por lo que se proyecta un subconjunto que es
 * exactamente el contrato de control.
 *
 * INVARIANTES DEL CONTRACTO:
 *   - Politica de aprobaciones: `required_approving_review_count: 0` y
 *     `bypass_actors: []`. El repositorio mantiene un unico colaborador con
 *     escritura y GitHub nunca cuenta la auto-aprobacion del autor, por lo que
 *     exigir una aprobacion seria insatisfacible y solo forzaria un bypass
 *     permanente. Reevaluar al sumar un segundo colaborador.
 *   - Mapeo de `actor_id` para `actor_type: RepositoryRole`: `5` = admin,
 *     `2` = maintain, `4` = write. El `1` corresponde a `OrganizationAdmin` y
 *     NO aplica en repositorios personales; fue la causa del drift original.
 *   - `bypass_mode` canonico: `always` | `pull_request` | `exempt`. El valor
 *     legacy `pull_requests_only` fue retirado de la API.
 *
 * Los tests que blindan estos invariantes viven en `tests/ruleset_parity.test.ts`.
 *
 * Contrato CLI:
 *   --json      Emite el reporte estructurado en stdout.
 *   --repo X    Repositorio a consultar (default: $GITHUB_REPOSITORY).
 *   --required  Convierte la indisponibilidad de credenciales o red en un fallo
 *               duro en lugar de un skip (lo usa el workflow programado).
 *
 * Modo skip: sin token y sin sesion `gh` autenticada, el gate informa SKIPPED y
 * sale con 0 para no volver flaky a `npm test` en maquinas sin acceso a la API.
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const RULESET_FILE = path.join('.github', 'rulesets', 'main-protection.json');
export const RULESET_NAME = 'main-protection';

/** Valores de bypass_mode aceptados por la REST API de repository rulesets. */
export const CANONICAL_BYPASS_MODES: readonly string[] = Object.freeze([
  'always',
  'pull_request',
  'exempt',
]);

/** Valor legacy retirado de la API. Su presencia es un defecto del contrato. */
export const LEGACY_BYPASS_MODE = 'pull_requests_only';

/**
 * Mapeo oficial actor_id -> rol base para `actor_type: RepositoryRole`.
 * `1` NO pertenece a este conjunto: corresponde a `OrganizationAdmin`.
 */
export const REPOSITORY_ROLE_ACTOR_IDS: Readonly<Record<string, number>> = Object.freeze({
  2: 2, // maintain
  4: 4, // write
  5: 5, // admin
});

export interface BypassActor {
  actor_type: string;
  actor_id: number | null;
  bypass_mode: string;
}

export interface NormalizedRuleset {
  name: string;
  target: string;
  enforcement: string;
  conditions: { include: string[]; exclude: string[] };
  ruleTypes: string[];
  pullRequest: Record<string, unknown>;
  requiredStatusChecks: string[];
  bypassActors: BypassActor[];
}

export interface DriftEntry {
  field: string;
  declared: string;
  live: string;
}

/** Ordena de forma determinista sin mutar la entrada. */
function sorted<T>(values: T[]): T[] {
  return [...values].sort();
}

/** Canonicaliza un valor a JSON con claves ordenadas, para comparar valores. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(sorted(value));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}


/**
 * Proyecta un ruleset (declarativo o live) al subconjunto que constituye el
 * contrato de control, descartando metadatos de solo lectura.
 */
export function normalizeRuleset(raw: Record<string, any>): NormalizedRuleset {
  const rules = (raw.rules ?? []) as Record<string, any>[];
  const pullRule = rules.find((r) => r.type === 'pull_request') ?? null;
  const statusRule = rules.find((r) => r.type === 'required_status_checks') ?? null;
  const refName = raw.conditions?.ref_name ?? {};

  return {
    name: raw.name ?? '',
    target: raw.target ?? '',
    enforcement: raw.enforcement ?? '',
    conditions: {
      include: sorted(refName.include ?? []),
      exclude: sorted(refName.exclude ?? []),
    },
    ruleTypes: sorted(rules.map((r) => r.type)),
    pullRequest: (pullRule?.parameters ?? {}) as Record<string, unknown>,
    requiredStatusChecks: sorted(
      (statusRule?.parameters?.required_status_checks ?? []).map((c: { context: string }) => c.context)
    ),
    // Se ordena por clave canonica (y no por el orden del array) porque el
    // orden de `bypass_actors` no esta garantizado entre la API y el archivo.
    bypassActors: sorted(
      ((raw.bypass_actors ?? []) as Record<string, any>[]).map((a) => ({
        actor_type: a.actor_type,
        actor_id: a.actor_id ?? null,
        bypass_mode: a.bypass_mode ?? 'always',
      }))
    ).sort((a, b) =>
      `${a.actor_type}:${a.actor_id}:${a.bypass_mode}` <
      `${b.actor_type}:${b.actor_id}:${b.bypass_mode}`
        ? -1
        : 1
    ) as BypassActor[],
  };
}

/**
 * Compara contrato vs realidad campo a campo. Devuelve las divergencias; un
 * array vacio significa paridad total.
 */
export function diffRulesets(declared: NormalizedRuleset, live: NormalizedRuleset): DriftEntry[] {
  const drift: DriftEntry[] = [];
  const add = (field: string, d: unknown, l: unknown) => {
    if (canonical(d) !== canonical(l)) drift.push({ field, declared: String(d), live: String(l) });
  };

  add('name', declared.name, live.name);
  add('target', declared.target, live.target);
  add('enforcement', declared.enforcement, live.enforcement);
  add('conditions.ref_name.include', declared.conditions.include, live.conditions.include);
  add('conditions.ref_name.exclude', declared.conditions.exclude, live.conditions.exclude);
  add('rules[].type', declared.ruleTypes, live.ruleTypes);
  add('required_status_checks[].context', declared.requiredStatusChecks, live.requiredStatusChecks);
  add('bypass_actors', declared.bypassActors, live.bypassActors);

  // Cada parametro de pull_request se compara por separado para que el reporte
  // diga QUE campo diverge y no solo que "los rules difieren".
  const prKeys = new Set([...Object.keys(declared.pullRequest), ...Object.keys(live.pullRequest)]);
  for (const key of [...prKeys].sort()) {
    add(`pull_request.parameters.${key}`, declared.pullRequest[key], live.pullRequest[key]);
  }

  return drift;
}


export function loadDeclarativeRuleset(rootDir: string = process.cwd()): NormalizedRuleset {
  const full = path.join(rootDir, RULESET_FILE);
  return normalizeRuleset(JSON.parse(fs.readFileSync(full, 'utf-8')));
}

/** Ejecuta `gh api` devolviendo el JSON parseado. Lanza si la API falla. */
function ghApiJson<T>(endpoint: string): T {
  const out = execFileSync('gh', ['api', endpoint], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(out) as T;
}

/** Localiza el ruleset por NOMBRE (no por id fijo) para sobrevivir a recreaciones. */
export function fetchLiveRuleset(repo: string): NormalizedRuleset {
  const all = ghApiJson<Record<string, any>[]>(`repos/${repo}/rulesets?per_page=100`);
  const found = all.find((r) => r.name === RULESET_NAME);
  if (!found) throw new Error(`No existe un ruleset llamado "${RULESET_NAME}" en ${repo}`);
  return normalizeRuleset(ghApiJson<Record<string, any>>(`repos/${repo}/rulesets/${found.id}`));
}

/** True si hay credenciales utilizables para consultar la API. */
export function hasApiCredentials(): boolean {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return true;
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main(): number {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const required = args.includes('--required');
  const repoIdx = args.indexOf('--repo');
  const repo =
    (repoIdx > -1 ? args[repoIdx + 1] : undefined) ??
    process.env.GITHUB_REPOSITORY ??
    'rocapellino/pokedex';

  let declared: NormalizedRuleset;
  try {
    declared = loadDeclarativeRuleset();
  } catch (error) {
    console.error(`No se pudo leer ${RULESET_FILE}: ${(error as Error).message}`);
    return 1;
  }

  if (!hasApiCredentials()) {
    if (required) {
      console.error('RULESET-001: sin credenciales para consultar el ruleset remoto.');
      return 1;
    }
    const payload = { status: 'skipped', reason: 'sin credenciales de GitHub', repo };
    console.log(asJson ? JSON.stringify(payload, null, 2) : payload.reason);
    return 0;
  }

  let live: NormalizedRuleset;
  try {
    live = fetchLiveRuleset(repo);
  } catch (error) {
    if (required) {
      console.error(`RULESET-001: fallo consultando ${repo}: ${(error as Error).message}`);
      return 1;
    }
    const payload = { status: 'skipped', reason: (error as Error).message, repo };
    console.log(asJson ? JSON.stringify(payload, null, 2) : `skipped: ${payload.reason}`);
    return 0;
  }

  const drift = diffRulesets(declared, live);

  if (asJson) {
    console.log(JSON.stringify({ status: drift.length ? 'drift' : 'parity', repo, drift }, null, 2));
    return drift.length ? 1 : 0;
  }

  if (drift.length === 0) {
    console.log(`RULESET-001: paridad total entre ${RULESET_FILE} y el ruleset live de ${repo}.`);
    return 0;
  }

  console.error(`RULESET-001: ${drift.length} divergencia(s) entre el contrato y GitHub live:\n`);
  for (const d of drift) {
    console.error(`  - ${d.field}`);
    console.error(`      declarativo: ${d.declared}`);
    console.error(`      live      : ${d.live}`);
  }
  console.error('\nSincroniza el ruleset remoto con el contrato declarativo antes de mergear.');
  return 1;
}

// Solo se ejecuta cuando el archivo se invoca como CLI, no al importarse.
if (process.argv[1] && import.meta.url === `file:///${path.resolve(process.argv[1]).replace(/\\/g, '/')}`) {
  process.exit(main());
}
