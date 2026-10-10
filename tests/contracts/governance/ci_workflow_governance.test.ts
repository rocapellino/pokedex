import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ROOT_DIR } from '../../helpers/repo.js';
import { readYaml } from '../../helpers/yaml.js';

// Los workflows se verifican parseados (triggers, jobs, pasos, permisos): una clave comentada o una mención en un
// comentario siguen "apareciendo" en el texto sin que GitHub Actions las evalúe. Solo se leen como texto los
// comentarios de gobernanza (que son lo que se verifica) y los archivos que no son YAML.

const WORKFLOWS = '.github/workflows';
const workflow = (file: string): any => readYaml(`${WORKFLOWS}/${file}`);
const workflowText = (file: string) => fs.readFileSync(path.join(ROOT_DIR, WORKFLOWS, file), 'utf8');
const workflowFiles = () =>
  fs.readdirSync(path.join(ROOT_DIR, WORKFLOWS)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
/** Triggers de un workflow (`on`; YAML 1.1 puede interpretar la clave como el booleano `true`). */
const triggersOf = (doc: any): Record<string, unknown> => (doc.on ?? doc.true ?? {}) as Record<string, unknown>;
const jobsOf = (doc: any): Array<[string, any]> => Object.entries(doc.jobs ?? {});
const stepsOf = (doc: any): any[] => jobsOf(doc).flatMap(([, job]) => job.steps ?? []);
const usesAction = (step: any, action: string) => String(step.uses ?? '').startsWith(`${action}@`);
/** Scripts `run:` de un conjunto de pasos, sin las líneas de shell comentadas. */
const scriptsOf = (steps: any[]): string[] =>
  steps
    .filter((s) => typeof s.run === 'string')
    .map((s) =>
      s.run
        .split('\n')
        .filter((line: string) => !line.trimStart().startsWith('#'))
        .join('\n'),
    );

// ==============================================================================
// Topología de CI / Orquestación Reutilizable
// ==============================================================================

test('🎯 CI topology: workflows condicionales delegan la decisión a change-impact.yaml', () => {
  const orchestrator = workflow('change-impact.yaml');
  const invoked = jobsOf(orchestrator).map(([, job]) => job.uses);
  for (const file of ['web.yaml', 'config-linters.yaml', 'security-code-scanning.yaml']) {
    const triggers = triggersOf(workflow(file));
    assert.ok('workflow_call' in triggers, `${file} debe ser reutilizable`);
    assert.ok(!('pull_request' in triggers), `${file} no debe decidir por paths en PR`);
    assert.ok(invoked.includes(`./.github/workflows/${file}`), `change-impact.yaml debe invocar ${file}`);
  }
});

test('⚙️ CI topology (REGRESIÓN): los reusable workflows no deben declarar concurrency', () => {
  // En un reusable workflow, `github.workflow` conserva el nombre del workflow
  // INVOCADOR. Todos los reusables calculaban por tanto el mismo grupo de
  // concurrencia y, con `cancel-in-progress: true`, cada uno cancelaba al
  // siguiente. Los jobs `infra`, `frontend-web` y `security-code-scanning`
  // nunca se ejecutaban pese a que sus triggers fueran `true`, dejando la
  // validación de IaC, Ansible, OpenTofu, Kyverno y K8s completamente muda.
  // La serialización por PR ya la aplica `change-impact.yaml` a nivel superior.
  const reusables = ['ci.yaml', 'infra.yaml', 'web.yaml', 'config-linters.yaml', 'security-code-scanning.yaml'];

  for (const file of reusables) {
    assert.equal(
      workflow(file).concurrency,
      undefined,
      `${file} no debe declarar concurrency: colisiona con los demás reusables y cancela jobs`,
    );
  }
});

test('⚙️ CI topology: el orquestador conserva la serialización por PR', () => {
  const { concurrency } = workflow('change-impact.yaml');
  assert.ok(concurrency?.group, 'change-impact.yaml debe mantener su concurrency');
  assert.equal(concurrency['cancel-in-progress'], true, 'debe cancelar corridas previas del mismo PR');
});

test('🤖 CI topology: agent_governance se propaga hasta un job AAS dedicado', () => {
  const orchestrator = workflow('change-impact.yaml');
  const ci = workflow('ci.yaml');

  assert.equal(
    orchestrator.jobs['detect-impact'].outputs.agent_governance,
    '${{ steps.impact.outputs.agent_governance }}',
    'detect-impact debe exponer la salida agent_governance',
  );
  assert.equal(
    orchestrator.jobs['ci-core'].with.agent_governance,
    "${{ needs.detect-impact.outputs.agent_governance == 'true' }}",
    'ci-core debe recibir agent_governance como entrada',
  );
  assert.equal(
    triggersOf(ci).workflow_call && (triggersOf(ci).workflow_call as any).inputs.agent_governance.type,
    'boolean',
  );

  const aas = scriptsOf(ci.jobs['aas-governance'].steps).join('\n');
  assert.match(aas, /npm run aas:verify/);
  assert.match(aas, /tests\/contracts\/governance\/aas_governance\.test\.ts/);
});

test('⚡ CI-002: los Config Linters no son un Quality Gate propio y su fallo sí bloquea', () => {
  // La decisión está documentada en el propio workflow (comentarios), por eso se lee como texto.
  const linters = workflowText('config-linters.yaml');
  assert.match(linters, /CI-002/, 'config-linters.yaml debe referenciar la decisión CI-002');
  assert.match(
    linters,
    /no es un Quality Gate por si mismo/,
    'config-linters.yaml debe declarar que no es un Quality Gate por si mismo',
  );
  assert.match(linters, /Quality Gate/, 'config-linters.yaml debe remitir al Quality Gate único y bloqueante');

  // Sin continue-on-error: el fallo debe ser una señal real, no silenciada (MegaLinter
  // corría con continue-on-error y DISABLE_ERRORS y por eso no aportaba señal).
  const doc = workflow('config-linters.yaml');
  const silenced = [...jobsOf(doc).map(([, job]) => job), ...stepsOf(doc)].filter(
    (node) => node['continue-on-error'] === true || node['continue-on-error'] === 'true',
  );
  assert.deepEqual(silenced, [], 'El job de Config Linters no debe usar continue-on-error');

  // La imagen de actionlint se fija por digest (supply chain).
  assert.match(
    scriptsOf(stepsOf(doc)).join('\n'),
    /rhysd\/actionlint:[\d.]+@sha256:[a-f0-9]{64}/,
    'actionlint debe ejecutarse desde una imagen fijada por digest',
  );

  // MegaLinter ya no existe en el repositorio.
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, '.github/workflows/mega-linter.yaml')),
    'mega-linter.yaml debe estar retirado',
  );
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, '.mega-linter.yml')), '.mega-linter.yml debe estar retirado');
});

test('🛡️ El ruleset declarativo debe registrar los tres required checks', () => {
  const rulesetPath = path.join(ROOT_DIR, '.github/rulesets/main-protection.json');
  const ruleset = JSON.parse(fs.readFileSync(rulesetPath, 'utf-8'));

  const rsc = ruleset.rules.find((r: { type: string }) => r.type === 'required_status_checks');
  assert.ok(rsc, 'El ruleset debe declarar la regla required_status_checks');

  const contexts: string[] = rsc.parameters.required_status_checks.map((c: { context: string }) => c.context);

  // El gate agregador debe estar registrado: es lo que convierte a bloqueantes
  // los pipelines que el orquestador decide no ejecutar por radio de impacto.
  assert.ok(
    contexts.includes('🚦 Quality Gate'),
    'main-protection.json debe registrar `🚦 Quality Gate` como required check',
  );

  // Gitleaks corre standalone: el gate NO lo espera en su `needs`, asi que
  // eliminarlo del ruleset dejaria la deteccion de secretos sin bloquear merge.
  assert.ok(
    contexts.includes('🛡️ Gitleaks Secret Detection'),
    'main-protection.json debe conservar `🛡️ Gitleaks Secret Detection` (workflow standalone)',
  );
  assert.ok(
    contexts.includes('🚀 Core CI / 🔍 Auditoría de Calidad y Complejidad'),
    'main-protection.json debe conservar el check nativo de Core CI',
  );

  // La documentacion de arquitectura no debe seguir marcando el gate como pendiente.
  const lifecycle = fs.readFileSync(path.join(ROOT_DIR, 'docs/architecture/APPLICATION_LIFECYCLE.md'), 'utf-8');
  assert.doesNotMatch(
    lifecycle,
    /Pendiente de aplicacion en el ruleset/,
    'APPLICATION_LIFECYCLE.md no debe afirmar que el gate sigue pendiente de aplicar',
  );
  assert.match(
    lifecycle,
    /Registrado en el ruleset/,
    'APPLICATION_LIFECYCLE.md debe declarar el gate como registrado en el ruleset',
  );
});

test('🚦 Quality Gate: el agregador existe y es fail-closed con if: always()', () => {
  const orchestrator = workflow('change-impact.yaml');
  const gate = orchestrator.jobs['quality-gate'];

  // El gate existe para que el ruleset pueda declarar UN solo required check.
  assert.ok(gate, 'change-impact.yaml debe definir el job quality-gate');

  // `needs` debe cubrir TODOS los demás jobs del orquestador: si falta alguno,
  // un fallo en ese pipeline no bloquearia el merge.
  const needs: string[] = gate.needs;
  assert.ok(Array.isArray(needs), 'quality-gate debe declarar needs');
  const others = jobsOf(orchestrator)
    .map(([id]) => id)
    .filter((id) => id !== 'quality-gate');
  assert.deepEqual(
    others.filter((id) => !needs.includes(id)),
    [],
    'quality-gate debe depender de todos los demás jobs del orquestador',
  );

  // Sin `if: always()` el gate no se ejecuta cuando un job previo falla u se omite,
  // que es justamente el escenario que debe bloquear.
  assert.equal(String(gate.if).trim(), 'always()', 'quality-gate debe ejecutarse aunque sus dependencias no corran');

  // La semántica: `skipped` no bloquea (el radio de impacto no lo requería),
  // cualquier otro resultado distinto de success sí bloquea.
  const script = scriptsOf(gate.steps).join('\n');
  assert.match(
    script,
    /success\|skipped\)/,
    'El gate debe tratar `skipped` como no bloqueante (evita deadlocks por jobs condicionales)',
  );
  assert.match(script, /exit 1/, 'El gate debe salir con error cuando un pipeline no cumple');
});

test('🚦 Quality Gate: el check del gate tiene el nombre que espera el ruleset', () => {
  // El ruleset referencia los checks por su nombre mostrado. Este job no es
  // reusable, por lo que el context es exactamente el `name:` del job.
  const ruleset = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, '.github/rulesets/main-protection.json'), 'utf-8'));
  const contexts: string[] = ruleset.rules
    .filter((r: { type: string }) => r.type === 'required_status_checks')
    .flatMap((r: any) => r.parameters.required_status_checks.map((c: { context: string }) => c.context));

  const name = workflow('change-impact.yaml').jobs['quality-gate'].name;
  assert.equal(name, '🚦 Quality Gate', 'El nombre visible del gate debe ser "🚦 Quality Gate" para branch protection');
  assert.ok(contexts.includes(name), 'el nombre del job quality-gate debe coincidir con un required check del ruleset');
});

test('⚙️ CI topology: change-impact.yaml es el único propietario de Trivy para imágenes de aplicación', () => {
  const ci = workflow('ci.yaml');
  const scheduled = workflow('security-trivy.yaml');
  assert.ok(ci.jobs['trivy-scan'], 'ci.yaml debe definir el job trivy-scan');

  const triggers = triggersOf(scheduled);
  assert.ok(!('pull_request' in triggers) && !('push' in triggers), 'el Trivy programado no debe correr en PR ni push');
  assert.ok('schedule' in triggers, 'el Trivy programado debe correr por schedule');
  assert.ok(scheduled.jobs['infra-images-scan'], 'el Trivy programado debe escanear las imágenes de infraestructura');
  assert.doesNotMatch(
    scriptsOf(stepsOf(scheduled)).join('\n'),
    /docker build|pokedex-server:test|pokedex-web:test/,
    'el Trivy programado no debe construir imágenes de aplicación',
  );
});

test('📊 CI topology: SonarQube Cloud tiene un único propietario de análisis real', () => {
  const ci = workflow('ci.yaml');
  const orchestrator = workflow('change-impact.yaml');
  const sync = workflow('sonar-linear-sync.yaml');
  const sonarProperties = fs.readFileSync(path.join(ROOT_DIR, 'sonar-project.properties'), 'utf-8');

  const scanners = stepsOf(ci).filter((s) => usesAction(s, 'SonarSource/sonarqube-scan-action'));
  assert.equal(scanners.length, 1, 'ci.yaml debe contener exactamente un scanner SonarQube Cloud');
  assert.match(
    scanners[0].uses,
    /^SonarSource\/sonarqube-scan-action@[a-f0-9]{40}$/,
    'La acción Sonar debe estar fijada por SHA completo',
  );
  // La versión documentada es un comentario al lado del SHA: se lee como texto.
  assert.match(
    workflowText('ci.yaml'),
    /SonarSource\/sonarqube-scan-action@[a-f0-9]{40} # v\d+\.\d+\.\d+/,
    'La acción Sonar debe llevar su versión documentada junto al SHA',
  );

  const steps: any[] = ci.jobs.sonarcloud.steps;
  const indexOfStep = (predicate: (step: any) => boolean) => steps.findIndex(predicate);
  const scan = indexOfStep((s) => usesAction(s, 'SonarSource/sonarqube-scan-action'));
  const coverage = indexOfStep((s) => s.run === 'npm run test:coverage');
  assert.ok(coverage >= 0 && coverage < scan, 'Sonar debe recibir cobertura LCOV actualizada');
  const credential = indexOfStep((s) => (s.run ?? '').includes('test -n "$SONAR_TOKEN"'));
  assert.ok(
    credential >= 0 && credential < scan,
    'El análisis debe fallar cerrado cuando SONAR_TOKEN no está disponible',
  );
  assert.equal(
    orchestrator.jobs['ci-core'].secrets.SONAR_TOKEN,
    '${{ secrets.SONAR_TOKEN }}',
    'change-impact.yaml debe propagar SONAR_TOKEN al reusable workflow',
  );

  const version = steps.find((s) => s.id === 'project-version');
  assert.ok(version?.run, 'Sonar debe resolver la versión en un paso project-version');
  const script = scriptsOf([version])[0];
  assert.ok(
    script.includes("readFileSync('package.json', 'utf8')).version"),
    'La versión de Sonar debe derivarse del package.json canónico',
  );
  const validation = script.indexOf('.test(process.argv[1])) process.exit(1)');
  assert.ok(
    script.includes('node -e "if (!/^(0|[1-9]\\\\d*)') &&
      script.includes('.test(process.argv[1])) process.exit(1)" "$VERSION"') &&
      validation !== -1 &&
      validation < script.indexOf('echo "version=$VERSION" >> "$GITHUB_OUTPUT"'),
    'El workflow debe rechazar versiones que no cumplan SemVer antes de publicar el output',
  );
  const args = String(steps[scan].with?.args);
  assert.ok(
    args.includes('-Dsonar.projectVersion=${{ steps.project-version.outputs.version }}'),
    'Sonar debe recibir la versión SemVer validada mediante un output del job',
  );
  assert.ok(
    args.includes('-Dsonar.qualitygate.wait=true'),
    'El scanner debe esperar y propagar el resultado del Quality Gate',
  );

  assert.deepEqual(
    stepsOf(sync).filter((s) => usesAction(s, 'SonarSource/sonarqube-scan-action')),
    [],
    'sonar-linear-sync.yaml solo debe consumir resultados, no ejecutar otro scanner',
  );
  assert.doesNotMatch(
    sonarProperties,
    /^sonar\.region=/m,
    'La instancia europea de SonarQube Cloud debe usar la región predeterminada sin sonar.region',
  );
  assert.match(
    sonarProperties,
    /^sonar\.exclusions=.*apps\/backend\/src\/db\/migrations\/\*\*/m,
    'Las migraciones PostgreSQL generadas no deben activar el analizador PLSQL',
  );
  assert.doesNotMatch(
    sonarProperties,
    /^sonar\.projectVersion=/m,
    'La versión de Sonar no debe fijarse estáticamente en sonar-project.properties',
  );
  assert.doesNotMatch(
    `${JSON.stringify(ci)}\n${sonarProperties}`,
    /data[ ._-]?dictionary|sonar\.plsql/i,
    'El repositorio no debe configurar un Data Dictionary de Oracle para migraciones PostgreSQL',
  );
});

test('🔒 CI topology: Gitleaks conserva el Required Check independiente y sin filtros', () => {
  const triggers = triggersOf(workflow('security-gitleaks.yaml')) as Record<string, any>;
  assert.ok('pull_request' in triggers, 'Gitleaks debe correr en todo PR');
  assert.equal(triggers.pull_request?.paths, undefined, 'Gitleaks no debe filtrar por paths');
  assert.equal(triggers.pull_request?.['paths-ignore'], undefined, 'Gitleaks no debe filtrar por paths-ignore');
  assert.ok(!('workflow_call' in triggers), 'Gitleaks no debe ser reusable: su check debe ser independiente');
});

// ==============================================================================
// GH-006: Gobernanza Integral de Workflows (Zero-Trust, Permissions & Secrets)
// ==============================================================================

test('🛡️ Workflow Governance: los 18 workflows declaran permisos explícitos y ninguno utiliza write-all', () => {
  const files = workflowFiles();

  assert.equal(
    files.length,
    18,
    `Se esperan exactamente 18 workflows en .github/workflows/, encontrados ${files.length}`,
  );

  for (const file of files) {
    const doc = workflow(file);
    const blocks = [doc.permissions, ...jobsOf(doc).map(([, job]) => job.permissions)].filter((p) => p !== undefined);

    // Debe existir declaración de permisos a nivel workflow o de jobs
    assert.ok(blocks.length > 0, `El workflow ${file} debe declarar un bloque de 'permissions:' explícito`);
    // Ningún workflow debe usar permisos globales inseguros como write-all
    assert.ok(
      blocks.every((permissions) => String(permissions).toLowerCase() !== 'write-all'),
      `El workflow ${file} no debe definir 'permissions: write-all'`,
    );
  }
});

test('🛡️ Workflow Governance: Zero-Trust Job-Level Permissions (el 100% de los jobs declara permisos explícitos)', () => {
  for (const file of workflowFiles()) {
    const parsed = workflow(file);

    // 1. Debe declarar permisos a nivel de workflow (top-level)
    assert.ok(
      parsed.permissions && typeof parsed.permissions === 'object',
      `El workflow ${file} debe declarar permissions a nivel de workflow`,
    );

    // 2. Cada job que no delegue en otro workflow (uses:) debe declarar su propio bloque permissions
    if (parsed.jobs && typeof parsed.jobs === 'object') {
      for (const [jobId, job] of jobsOf(parsed)) {
        if (job.uses) continue; // reusable invocations manejan sus permisos en el caller/callee
        assert.ok(
          job.permissions && typeof job.permissions === 'object',
          `El job '${jobId}' en ${file} debe declarar su propio bloque permissions: explícito (Least Privilege)`,
        );
      }
    }
  }
});

test('🛡️ Workflow Governance: Least Privilege en ZAP DAST (no solicita issues: write innecesario)', () => {
  const parsed = workflow('security-dast-zap.yaml');

  assert.equal(
    parsed.permissions?.issues,
    undefined,
    'security-dast-zap.yaml no debe solicitar permiso issues: write cuando allow_issue_writing es false',
  );
  assert.equal(
    parsed.jobs?.zap_scan?.permissions?.issues,
    undefined,
    'El job zap_scan no debe solicitar permiso issues: write',
  );
});

test('🛡️ Workflow Governance: Auditoría de Secretos conocidos y tipados en los 18 workflows', () => {
  const ALLOWED_SECRETS = new Set(['GITHUB_TOKEN', 'SONAR_TOKEN', 'LINEAR_API_KEY', 'RULESET_ADMIN_TOKEN']);

  for (const file of workflowFiles()) {
    // Se audita el workflow parseado: lo que se evalúa, no lo que se menciona en un comentario.
    const secretMatches = [...JSON.stringify(workflow(file)).matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);

    for (const secret of secretMatches) {
      assert.ok(
        ALLOWED_SECRETS.has(secret),
        `El workflow ${file} referencia el secreto '${secret}', que no pertenece a la SSOT de secretos gobernados [${Array.from(ALLOWED_SECRETS).join(', ')}]`,
      );
    }
  }
});

test('🛡️ Workflow Governance: workflows reusables no declaran trigger pull_request independiente', () => {
  const reusableWorkflows = ['ci.yaml', 'infra.yaml', 'web.yaml', 'config-linters.yaml', 'security-code-scanning.yaml'];

  for (const file of reusableWorkflows) {
    const triggers = triggersOf(workflow(file));

    assert.ok('workflow_call' in triggers, `${file} debe declarar trigger workflow_call`);
    assert.ok(
      !('pull_request' in triggers),
      `El workflow reusable ${file} no debe declarar trigger 'pull_request:' propio; debe ser orquestado por change-impact.yaml`,
    );
  }
});

// AUD-WF-GOV-001: `pr-governance` figuraba como control `always` en ci-impact.yaml y el
// orquestador lo emitía como output, pero ningún job lo consumía: `pr:validate` nunca
// corría en CI. Cada control `always` declara aquí su ejecutor; agregar uno nuevo sin
// ejecutor hace fallar el test.
test('🛡️ AUD-WF-GOV-001: cada control always del contrato de impacto tiene un ejecutor real', () => {
  const contract = readYaml<{ always: Array<{ id: string }> }>('.github/ci-impact.yaml');
  const orchestrator = workflow('change-impact.yaml') as {
    jobs: Record<string, { if?: string; needs?: string[]; steps?: Array<{ run?: string }> }>;
  };

  const executors: Record<string, { job?: string; output?: string; workflow?: string }> = {
    // Job del orquestador que consume el output y bloquea vía quality-gate.
    'pr-governance': { job: 'pr-governance', output: 'pr_governance' },
    // Workflow independiente con Required Check propio (ver test de Gitleaks).
    secrets: { workflow: 'security-gitleaks.yaml' },
  };

  for (const { id } of contract.always) {
    const executor = executors[id];
    assert.ok(executor, `El control always "${id}" no tiene ejecutor declarado`);

    if (executor.job) {
      const job = orchestrator.jobs[executor.job];
      assert.ok(job, `change-impact.yaml debe definir el job ${executor.job}`);
      assert.ok(
        String(job.if).includes(`outputs.${executor.output} == 'true'`),
        `${executor.job} debe condicionarse a outputs.${executor.output}`,
      );
      assert.ok(
        orchestrator.jobs['quality-gate'].needs?.includes(executor.job),
        `quality-gate debe depender de ${executor.job}`,
      );
    }
    if (executor.workflow) {
      assert.ok(
        'pull_request' in triggersOf(workflow(executor.workflow)),
        `${executor.workflow} debe ejecutarse en todo PR`,
      );
    }
  }

  const prGovernance = orchestrator.jobs['pr-governance'];
  const run = (prGovernance.steps ?? []).map((step) => step.run ?? '').join('\n');
  assert.match(run, /pr:validate -- --remote/, 'pr-governance debe validar el cuerpo remoto del PR');
  assert.match(
    String(prGovernance.if),
    /user\.type != 'Bot'/,
    'pr-governance debe excluir PRs de bots (promote y Renovate generan cuerpos propios)',
  );
});

test('⏱️ CI-003: todo job declara timeout-minutes y los workflows no reusables declaran concurrency', () => {
  const missingTimeout: string[] = [];
  const missingConcurrency: string[] = [];

  for (const file of workflowFiles().filter((f) => f.endsWith('.yaml'))) {
    const doc = workflow(file);
    const isReusable = 'workflow_call' in triggersOf(doc);

    // Un job que invoca un reusable (`uses:`) no admite timeout-minutes: lo declaran los jobs del reusable.
    for (const [id, job] of jobsOf(doc)) {
      if (!job.uses && typeof job['timeout-minutes'] !== 'number') {
        missingTimeout.push(`${file}:${id}`);
      }
    }
    // Los reusables no deben declarar concurrency (ver test de regresión de topología).
    if (!isReusable && !doc.concurrency) {
      missingConcurrency.push(file);
    }
  }

  assert.deepEqual(missingTimeout, [], 'Jobs sin timeout-minutes: un job colgado consumiría 6 horas de runner');
  assert.deepEqual(missingConcurrency, [], 'Workflows no reusables sin concurrency: los runs se solaparían');
});

test('🔐 CI-004: todo actions/checkout declara persist-credentials: false salvo los jobs que empujan a git', () => {
  // Con persist-credentials activo el GITHUB_TOKEN queda en .git/config y lo puede leer
  // cualquier step posterior. Solo release-tag.yaml necesita credenciales (git push de tags y ramas).
  const allowCredentials = new Set(['release-tag.yaml']);
  const offenders: string[] = [];

  for (const file of workflowFiles().filter((f) => f.endsWith('.yaml') && !allowCredentials.has(f))) {
    for (const [id, job] of jobsOf(workflow(file))) {
      for (const step of job.steps ?? []) {
        if (usesAction(step, 'actions/checkout') && step.with?.['persist-credentials'] !== false) {
          offenders.push(`${file}:${id}`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], 'Checkouts sin persist-credentials: false');
});

test('📌 CI-005: cada action se usa con un único SHA pineado en todos los workflows', () => {
  const pins = new Map<string, Set<string>>();
  const unpinned: string[] = [];

  for (const file of workflowFiles().filter((f) => f.endsWith('.yaml'))) {
    const doc = workflow(file);
    // `uses:` de pasos y de jobs que invocan otro workflow; las llamadas locales (./) no llevan SHA.
    const uses = [...stepsOf(doc).map((s) => s.uses), ...jobsOf(doc).map(([, job]) => job.uses)].filter(
      (value): value is string =>
        typeof value === 'string' && !value.startsWith('./') && !value.startsWith('docker://'),
    );
    for (const ref of uses) {
      const match = ref.match(/^([\w.-]+\/[\w./-]+)@([0-9a-f]{40})$/);
      if (!match) {
        unpinned.push(`${file}: ${ref}`);
        continue;
      }
      pins.set(match[1], (pins.get(match[1]) ?? new Set()).add(match[2]));
    }
  }

  const drift = [...pins].filter(([, shas]) => shas.size > 1).map(([action]) => action);
  assert.deepEqual(drift, [], 'Actions con más de un SHA pineado (versiones divergentes)');
  assert.deepEqual(unpinned, [], 'Actions externas sin SHA completo pineado');
});

test('🔎 CI-006: Zizmor corre en Config Linters con imagen fijada por digest y sin continue-on-error', () => {
  const doc = workflow('config-linters.yaml');
  const scripts = scriptsOf(stepsOf(doc)).join('\n');
  assert.match(
    scripts,
    /ghcr\.io\/zizmorcore\/zizmor:[\w.-]+@sha256:[0-9a-f]{64}/,
    'Zizmor debe fijarse por tag y digest',
  );
  assert.match(scripts, /--min-severity=medium/, 'Zizmor debe bloquear desde severidad medium');
  const silenced = [...jobsOf(doc).map(([, job]) => job), ...stepsOf(doc)].filter(
    (node) => node['continue-on-error'] === true || node['continue-on-error'] === 'true',
  );
  assert.deepEqual(silenced, [], 'Zizmor no debe ignorar sus fallos');
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, '.github/zizmor.yaml')),
    'Debe existir .github/zizmor.yaml con las excepciones justificadas',
  );
});

test('📚 CI-008: docs-gate lintea AGENTS.md y .agents/ y ejecuta docs:validate', () => {
  // `docs:validate` y el lint de `.agents/` solo se ejercían a través de `npm test`
  // y de rutas fijas, así que un PR puramente documental (que omite `npm test`)
  // podía pasar CI sin que nadie los ejecutara.
  const runs = scriptsOf(workflow('ci.yaml').jobs['docs-gate']?.steps ?? []);

  const lint = runs.find((run) => run.includes('lint:md'));
  assert.ok(lint, 'docs-gate debe ejecutar el Markdown Quality Gate');
  for (const target of ['README.md', 'SECURITY.md', 'AGENTS.md', 'docs/', '.agents/']) {
    assert.ok(lint.includes(target), `docs-gate debe lintear ${target}`);
  }
  assert.ok(
    runs.some((run) => run.includes('npm run docs:validate')),
    'docs-gate debe ejecutar npm run docs:validate',
  );
});

test('🔑 CI-007: los workflows pull_request_target no reciben RULESET_ADMIN_TOKEN', () => {
  // pull_request_target corre con secretos en el contexto del repo base. El token de
  // administracion solo se admite en workflows disparados por push/schedule/dispatch.
  const offenders: string[] = [];

  for (const file of workflowFiles().filter((f) => f.endsWith('.yaml'))) {
    const doc = workflow(file);
    if ('pull_request_target' in triggersOf(doc) && /RULESET_ADMIN_TOKEN/.test(JSON.stringify(doc))) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, [], 'pull_request_target con RULESET_ADMIN_TOKEN expone un token de admin');
});

test('🔐 Checkov: el job de IaC sigue bloqueando y además sube su SARIF a Code Scanning', () => {
  const job = workflow('infra.yaml').jobs['validate-checkov'];
  const checkov = job.steps.find((step: any) => String(step.uses ?? '').startsWith('bridgecrewio/checkov-action@'));
  assert.ok(checkov, 'validate-checkov debe ejecutar checkov-action');
  assert.equal(checkov.with.soft_fail, false, 'el SARIF no debe volver no bloqueante al gate');
  assert.match(String(checkov.with.output_format), /\bsarif\b/);
  assert.match(String(checkov.with.output_file_path), /checkov\.sarif/);

  const upload = job.steps.find((step: any) =>
    String(step.uses ?? '').startsWith('github/codeql-action/upload-sarif@'),
  );
  assert.ok(upload, 'debe subir el SARIF con upload-sarif');
  assert.match(String(upload.uses), /@[a-f0-9]{40}$/, 'la acción se fija por SHA completo');
  assert.equal(upload.if, 'always()', 'el SARIF se sube aunque Checkov falle');
  assert.equal(upload.with.sarif_file, 'checkov.sarif');
  assert.equal(upload.with.category, 'checkov');
  assert.equal(job.permissions['security-events'], 'write');

  // Un reusable workflow no puede exceder los permisos que le concede el job invocador.
  const caller = workflow('change-impact.yaml').jobs.infra;
  assert.equal(
    caller.permissions['security-events'],
    'write',
    'el orquestador debe conceder security-events: write a infra',
  );
});
