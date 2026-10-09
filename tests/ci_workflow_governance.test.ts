import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import yaml from 'js-yaml';
const yamlSafeLoad = (yaml as unknown as { load: typeof yaml.load }).load ?? yaml.load;
import { ROOT_DIR } from './helpers/repo.js';

// ==============================================================================
// Topología de CI / Orquestación Reutilizable
// ==============================================================================

test('🎯 CI topology: workflows condicionales delegan la decisión a change-impact.yaml', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  for (const workflow of ['web.yaml', 'config-linters.yaml', 'security-code-scanning.yaml']) {
    const content = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows', workflow), 'utf8');
    assert.match(content, /workflow_call:/, `${workflow} debe ser reutilizable`);
    assert.doesNotMatch(content, /pull_request:/, `${workflow} no debe decidir por paths en PR`);
    assert.match(orchestrator, new RegExp(`uses: \\.\\/.github/workflows/${workflow.replace('.', '\\.')}\\b`));
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

  for (const workflow of reusables) {
    const content = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows', workflow), 'utf8');
    assert.doesNotMatch(
      content,
      /^concurrency:/m,
      `${workflow} no debe declarar concurrency: colisiona con los demás reusables y cancela jobs`,
    );
  }
});

test('⚙️ CI topology: el orquestador conserva la serialización por PR', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  assert.match(orchestrator, /^concurrency:/m, 'change-impact.yaml debe mantener su concurrency');
  assert.match(orchestrator, /cancel-in-progress:\s*true/, 'debe cancelar corridas previas del mismo PR');
});

test('🤖 CI topology: agent_governance se propaga hasta un job AAS dedicado', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  const ci = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf8');

  assert.match(orchestrator, /agent_governance:\s*\$\{\{ steps\.impact\.outputs\.agent_governance \}\}/);
  assert.match(
    orchestrator,
    /agent_governance:\s*\$\{\{ needs\.detect-impact\.outputs\.agent_governance == 'true' \}\}/,
  );
  assert.match(ci, /agent_governance:[\s\S]*?type:\s*boolean/);
  assert.match(ci, /aas-governance:[\s\S]*?npm run aas:verify[\s\S]*?tests\/aas_governance\.test\.ts/);
});

test('⚡ CI-002: los Config Linters no son un Quality Gate propio y su fallo sí bloquea', () => {
  const linters = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/config-linters.yaml'), 'utf-8');

  // La decision debe estar documentada en el propio workflow, no solo implicita.
  assert.match(linters, /CI-002/, 'config-linters.yaml debe referenciar la decisión CI-002');
  assert.match(
    linters,
    /no es un Quality Gate por si mismo/,
    'config-linters.yaml debe declarar que no es un Quality Gate por si mismo',
  );
  assert.match(linters, /Quality Gate/, 'config-linters.yaml debe remitir al Quality Gate único y bloqueante');

  // Sin continue-on-error: el fallo debe ser una señal real, no silenciada (MegaLinter
  // corría con continue-on-error y DISABLE_ERRORS y por eso no aportaba señal).
  assert.doesNotMatch(linters, /continue-on-error:\s*true/, 'El job de Config Linters no debe usar continue-on-error');

  // La imagen de actionlint se fija por digest (supply chain).
  assert.match(
    linters,
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
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');

  // El gate existe para que el ruleset pueda declarar UN solo required check.
  assert.match(orchestrator, /quality-gate:/, 'change-impact.yaml debe definir el job quality-gate');

  // `needs` debe cubrir TODOS los pipelines del orquestador: si falta alguno,
  // un fallo en ese pipeline no bloquearia el merge.
  const needsMatch = orchestrator.match(/quality-gate:[\s\S]*?needs:\s*\[([^\]]*)\]/);
  assert.ok(needsMatch, 'quality-gate debe declarar needs');
  const needs = needsMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const pipeline of [
    'detect-impact',
    'ci-core',
    'infra',
    'frontend-web',
    'config-linters',
    'security-code-scanning',
  ]) {
    assert.ok(needs.includes(pipeline), `quality-gate debe depender de ${pipeline}`);
  }

  // Sin `if: always()` el gate no se ejecuta cuando un job previo falla u se omite,
  // que es justamente el escenario que debe bloquear.
  const gateBlock = orchestrator.slice(orchestrator.indexOf('quality-gate:'));
  assert.match(
    gateBlock.slice(0, 400),
    /if:\s*always\(\)/,
    'quality-gate debe usar if: always() para ejecutarse aunque sus dependencias no corran',
  );

  // La semántica: `skipped` no bloquea (el radio de impacto no lo requería),
  // cualquier otro resultado distinto de success sí bloquea.
  assert.match(
    gateBlock,
    /success\|skipped\)/,
    'El gate debe tratar `skipped` como no bloqueante (evita deadlocks por jobs condicionales)',
  );
  assert.match(gateBlock, /exit 1/, 'El gate debe salir con error cuando un pipeline no cumple');
});

test('🚦 Quality Gate: el check del gate tiene el nombre que espera el ruleset', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  // El ruleset referencia los checks por su nombre mostrado. Este job no es
  // reusable, por lo que el context es exactamente el `name:` del job.
  assert.match(
    orchestrator,
    /name:\s*"🚦 Quality Gate"/,
    'El nombre visible del gate debe ser "🚦 Quality Gate" para referenciarlo en branch protection',
  );
});

test('⚙️ CI topology: change-impact.yaml es el único propietario de Trivy para imágenes de aplicación', () => {
  const ci = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf8');
  const scheduledTrivy = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-trivy.yaml'), 'utf8');
  assert.match(ci, /^ {2}trivy-scan:/m);
  assert.doesNotMatch(scheduledTrivy, /pull_request:|\n {2}push:/);
  assert.doesNotMatch(scheduledTrivy, /docker build|pokedex-server:test|pokedex-web:test/);
  assert.match(scheduledTrivy, /schedule:/);
  assert.match(scheduledTrivy, /infra-images-scan:/);
});

test('📊 CI topology: SonarQube Cloud tiene un único propietario de análisis real', () => {
  const ci = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf-8');
  const sonarProperties = fs.readFileSync(path.join(ROOT_DIR, 'sonar-project.properties'), 'utf-8');
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf-8');
  const sync = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/sonar-linear-sync.yaml'), 'utf-8');

  assert.equal(
    ci.match(/SonarSource\/sonarqube-scan-action@/g)?.length,
    1,
    'ci.yaml debe contener exactamente un scanner SonarQube Cloud',
  );
  assert.match(
    ci,
    /SonarSource\/sonarqube-scan-action@[a-f0-9]{40} # v\d+\.\d+\.\d+/,
    'La acción Sonar debe estar fijada por SHA completo con versión documentada',
  );
  assert.ok(ci.includes('run: npm run test:coverage'), 'Sonar debe recibir cobertura LCOV actualizada');
  assert.ok(
    ci.includes('test -n "$SONAR_TOKEN"'),
    'El análisis debe fallar cerrado cuando SONAR_TOKEN no está disponible',
  );
  assert.ok(
    orchestrator.includes('SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}'),
    'change-impact.yaml debe propagar SONAR_TOKEN al reusable workflow',
  );
  assert.ok(
    ci.includes("readFileSync('package.json', 'utf8')).version"),
    'La versión de Sonar debe derivarse del package.json canónico',
  );
  assert.ok(
    ci.includes('id: project-version') &&
      ci.includes('-Dsonar.projectVersion=${{ steps.project-version.outputs.version }}'),
    'Sonar debe recibir la versión SemVer validada mediante un output del job',
  );
  assert.ok(
    ci.includes('node -e "if (!/^(0|[1-9]\\\\d*)') &&
      ci.includes('.test(process.argv[1])) process.exit(1)" "$VERSION"') &&
      ci.indexOf('.test(process.argv[1])) process.exit(1)') < ci.indexOf('echo "version=$VERSION" >> "$GITHUB_OUTPUT"'),
    'El workflow debe rechazar versiones que no cumplan SemVer antes de publicar el output',
  );
  assert.ok(
    ci.includes('-Dsonar.qualitygate.wait=true'),
    'El scanner debe esperar y propagar el resultado del Quality Gate',
  );
  assert.equal(
    sync.match(/SonarSource\/sonarqube-scan-action@/g)?.length ?? 0,
    0,
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
    `${ci}\n${sonarProperties}`,
    /data[ ._-]?dictionary|sonar\.plsql/i,
    'El repositorio no debe configurar un Data Dictionary de Oracle para migraciones PostgreSQL',
  );
});

test('🔒 CI topology: Gitleaks conserva el Required Check independiente y sin filtros', () => {
  const gitleaks = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-gitleaks.yaml'), 'utf8');
  assert.match(gitleaks, /pull_request:/);
  assert.doesNotMatch(gitleaks, /paths(?:-ignore)?:/);
  assert.doesNotMatch(gitleaks, /workflow_call:/);
});

// ==============================================================================
// GH-006: Gobernanza Integral de Workflows (Zero-Trust, Permissions & Secrets)
// ==============================================================================

test('🛡️ Workflow Governance: los 18 workflows declaran permisos explícitos y ninguno utiliza write-all', () => {
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  assert.equal(
    files.length,
    18,
    `Se esperan exactamente 18 workflows en .github/workflows/, encontrados ${files.length}`,
  );

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Ningún workflow debe usar permisos globales inseguros como write-all
    assert.doesNotMatch(
      content,
      /permissions:\s*write-all/i,
      `El workflow ${file} no debe definir 'permissions: write-all'`,
    );

    // Debe existir declaración de permisos a nivel workflow o de jobs
    assert.match(content, /permissions:/, `El workflow ${file} debe declarar un bloque de 'permissions:' explícito`);
  }
});

test('🛡️ Workflow Governance: Zero-Trust Job-Level Permissions (el 100% de los jobs declara permisos explícitos)', () => {
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const parsed = yamlSafeLoad(fs.readFileSync(filePath, 'utf-8')) as any;

    // 1. Debe declarar permisos a nivel de workflow (top-level)
    assert.ok(
      parsed.permissions && typeof parsed.permissions === 'object',
      `El workflow ${file} debe declarar permissions a nivel de workflow`,
    );

    // 2. Cada job que no delegue en otro workflow (uses:) debe declarar su propio bloque permissions
    if (parsed.jobs && typeof parsed.jobs === 'object') {
      for (const [jobId, jobDef] of Object.entries(parsed.jobs)) {
        const job = jobDef as any;
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
  const zapPath = path.join(ROOT_DIR, '.github', 'workflows', 'security-dast-zap.yaml');
  const parsed = yamlSafeLoad(fs.readFileSync(zapPath, 'utf-8')) as any;

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
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  const ALLOWED_SECRETS = new Set(['GITHUB_TOKEN', 'SONAR_TOKEN', 'LINEAR_API_KEY', 'RULESET_ADMIN_TOKEN']);

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const secretMatches = [...content.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);

    for (const secret of secretMatches) {
      assert.ok(
        ALLOWED_SECRETS.has(secret),
        `El workflow ${file} referencia el secreto '${secret}', que no pertenece a la SSOT de secretos gobernados [${Array.from(ALLOWED_SECRETS).join(', ')}]`,
      );
    }
  }
});

test('🛡️ Workflow Governance: workflows reusables no declaran trigger pull_request independiente', () => {
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  const reusableWorkflows = ['ci.yaml', 'infra.yaml', 'web.yaml', 'config-linters.yaml', 'security-code-scanning.yaml'];

  for (const file of reusableWorkflows) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.match(content, /workflow_call:/, `${file} debe declarar trigger workflow_call`);
    assert.doesNotMatch(
      content,
      /^\s*pull_request:\s*$/m,
      `El workflow reusable ${file} no debe declarar trigger 'pull_request:' propio; debe ser orquestado por change-impact.yaml`,
    );
  }
});

// AUD-WF-GOV-001: `pr-governance` figuraba como control `always` en ci-impact.yaml y el
// orquestador lo emitía como output, pero ningún job lo consumía: `pr:validate` nunca
// corría en CI. Cada control `always` declara aquí su ejecutor; agregar uno nuevo sin
// ejecutor hace fallar el test.
test('🛡️ AUD-WF-GOV-001: cada control always del contrato de impacto tiene un ejecutor real', () => {
  const contract = yamlSafeLoad(fs.readFileSync(path.join(ROOT_DIR, '.github/ci-impact.yaml'), 'utf8')) as {
    always: Array<{ id: string }>;
  };
  const orchestrator = yamlSafeLoad(
    fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8'),
  ) as { jobs: Record<string, { if?: string; needs?: string[]; steps?: Array<{ run?: string }> }> };

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
      const content = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows', executor.workflow), 'utf8');
      assert.match(content, /pull_request:/, `${executor.workflow} debe ejecutarse en todo PR`);
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
  const dir = path.join(ROOT_DIR, '.github/workflows');
  const missingTimeout: string[] = [];
  const missingConcurrency: string[] = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const doc = yamlSafeLoad(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
      on?: unknown;
      concurrency?: unknown;
      jobs?: Record<string, { uses?: string; 'timeout-minutes'?: number }>;
    };
    const triggers = (doc.on ?? (doc as Record<string, unknown>).true ?? {}) as Record<string, unknown>;
    const isReusable = typeof triggers === 'object' && 'workflow_call' in triggers;

    // Un job que invoca un reusable (`uses:`) no admite timeout-minutes: lo declaran los jobs del reusable.
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
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
  const dir = path.join(ROOT_DIR, '.github/workflows');
  const allowCredentials = new Set(['release-tag.yaml']);
  const offenders: string[] = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') && !allowCredentials.has(f))) {
    const doc = yamlSafeLoad(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
      jobs?: Record<string, { steps?: Array<{ uses?: string; with?: Record<string, unknown> }> }>;
    };
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith('actions/checkout@') && step.with?.['persist-credentials'] !== false) {
          offenders.push(`${file}:${id}`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], 'Checkouts sin persist-credentials: false');
});

test('📌 CI-005: cada action se usa con un único SHA pineado en todos los workflows', () => {
  const dir = path.join(ROOT_DIR, '.github/workflows');
  const pins = new Map<string, Set<string>>();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    for (const match of content.matchAll(/uses:\s*([\w.-]+\/[\w./-]+)@([0-9a-f]{40})/g)) {
      pins.set(match[1], (pins.get(match[1]) ?? new Set()).add(match[2]));
    }
  }

  const drift = [...pins].filter(([, shas]) => shas.size > 1).map(([action]) => action);
  assert.deepEqual(drift, [], 'Actions con más de un SHA pineado (versiones divergentes)');
});

test('🔎 CI-006: Zizmor corre en Config Linters con imagen fijada por digest y sin continue-on-error', () => {
  const linters = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/config-linters.yaml'), 'utf8');
  assert.match(
    linters,
    /ghcr\.io\/zizmorcore\/zizmor:[\w.-]+@sha256:[0-9a-f]{64}/,
    'Zizmor debe fijarse por tag y digest',
  );
  assert.match(linters, /--min-severity=medium/, 'Zizmor debe bloquear desde severidad medium');
  assert.doesNotMatch(linters, /continue-on-error:\s*true/, 'Zizmor no debe ignorar sus fallos');
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, '.github/zizmor.yaml')),
    'Debe existir .github/zizmor.yaml con las excepciones justificadas',
  );
});

test('📚 CI-008: docs-gate lintea AGENTS.md y .agents/ y ejecuta docs:validate', () => {
  // `docs:validate` y el lint de `.agents/` solo se ejercían a través de `npm test`
  // y de rutas fijas, así que un PR puramente documental (que omite `npm test`)
  // podía pasar CI sin que nadie los ejecutara.
  const ci = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/ci.yaml'), 'utf8');
  const doc = yamlSafeLoad(ci) as { jobs?: Record<string, { steps?: { run?: string }[] }> };
  const runs = (doc.jobs?.['docs-gate']?.steps ?? []).map((step) => step.run ?? '');

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
  const dir = path.join(ROOT_DIR, '.github/workflows');
  const offenders: string[] = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const doc = yamlSafeLoad(content) as { on?: unknown; true?: unknown };
    const triggers = (doc.on ?? doc.true ?? {}) as Record<string, unknown>;
    if (typeof triggers === 'object' && 'pull_request_target' in triggers && /RULESET_ADMIN_TOKEN/.test(content)) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, [], 'pull_request_target con RULESET_ADMIN_TOKEN expone un token de admin');
});
