import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import yaml from 'js-yaml';
const yamlSafeLoad = (yaml as unknown as { load: typeof yaml.load }).load ?? yaml.load;
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ==============================================================================
// Topología de CI / Orquestación Reutilizable
// ==============================================================================

test('🎯 CI topology: workflows condicionales delegan la decisión a change-impact.yaml', () => {
  const orchestrator = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8');
  for (const workflow of ['web.yaml', 'mega-linter.yaml', 'security-code-scanning.yaml']) {
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
  const reusables = [
    'ci.yaml',
    'infra.yaml',
    'web.yaml',
    'mega-linter.yaml',
    'security-code-scanning.yaml',
  ];

  for (const workflow of reusables) {
    const content = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows', workflow), 'utf8');
    assert.doesNotMatch(
      content,
      /^concurrency:/m,
      `${workflow} no debe declarar concurrency: colisiona con los demás reusables y cancela jobs`
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
  assert.match(orchestrator, /agent_governance:\s*\$\{\{ needs\.detect-impact\.outputs\.agent_governance == 'true' \}\}/);
  assert.match(ci, /agent_governance:[\s\S]*?type:\s*boolean/);
  assert.match(ci, /aas-governance:[\s\S]*?npm run aas:verify[\s\S]*?tests\/aas_governance\.test\.ts/);
});

test('⚡ CI-002: MegaLinter no es un Quality Gate propio; el unico es el agregador', () => {
  const mega = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/mega-linter.yaml'), 'utf-8');

  // La decision debe estar documentada en el propio workflow, no solo implicita.
  assert.match(
    mega,
    /CI-002/,
    'mega-linter.yaml debe referenciar la decisión CI-002'
  );
  assert.match(
    mega,
    /no es un Quality Gate por si mismo/,
    'mega-linter.yaml debe declarar que no es un Quality Gate por si mismo'
  );

  // El flag local se mantiene: evita la senal duplicada de un linter que ya
  // tiene un control equivalente mas especifico en otro pipeline.
  assert.match(
    mega,
    /continue-on-error:\s*true/,
    'El job de MegaLinter debe conservar continue-on-error (evita senal duplicada)'
  );

  // Y debe advertirse que el gate agregador lo hace bloqueante de todos modos.
  assert.match(
    mega,
    /Quality Gate[\s\S]*?ATENCION/,
    'mega-linter.yaml debe advertir que el Quality Gate lo incluye en su needs'
  );
  assert.match(
    mega,
    /bloquea el merge a traves del gate/,
    'mega-linter.yaml debe documentar que un fallo bloquea via el gate agregador'
  );
  assert.match(
    mega,
    /Quality Gate/,
    'mega-linter.yaml debe remitir al Quality Gate único y bloqueante'
  );
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
    'main-protection.json debe registrar `🚦 Quality Gate` como required check'
  );

  // Gitleaks corre standalone: el gate NO lo espera en su `needs`, asi que
  // eliminarlo del ruleset dejaria la deteccion de secretos sin bloquear merge.
  assert.ok(
    contexts.includes('🛡️ Gitleaks Secret Detection'),
    'main-protection.json debe conservar `🛡️ Gitleaks Secret Detection` (workflow standalone)'
  );
  assert.ok(
    contexts.includes('🚀 Core CI / 🔍 Auditoría de Calidad y Complejidad'),
    'main-protection.json debe conservar el check nativo de Core CI'
  );

  // La documentacion de arquitectura no debe seguir marcando el gate como pendiente.
  const lifecycle = fs.readFileSync(
    path.join(ROOT_DIR, 'docs/architecture/APPLICATION_LIFECYCLE.md'),
    'utf-8'
  );
  assert.doesNotMatch(
    lifecycle,
    /Pendiente de aplicacion en el ruleset/,
    'APPLICATION_LIFECYCLE.md no debe afirmar que el gate sigue pendiente de aplicar'
  );
  assert.match(
    lifecycle,
    /Registrado en el ruleset/,
    'APPLICATION_LIFECYCLE.md debe declarar el gate como registrado en el ruleset'
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
    'megalinter',
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
    'quality-gate debe usar if: always() para ejecutarse aunque sus dependencias no corran'
  );

  // La semántica: `skipped` no bloquea (el radio de impacto no lo requería),
  // cualquier otro resultado distinto de success sí bloquea.
  assert.match(
    gateBlock,
    /success\|skipped\)/,
    'El gate debe tratar `skipped` como no bloqueante (evita deadlocks por jobs condicionales)'
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
    'El nombre visible del gate debe ser "🚦 Quality Gate" para referenciarlo en branch protection'
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
  const sonarProperties = fs.readFileSync(
    path.join(ROOT_DIR, 'sonar-project.properties'),
    'utf-8'
  );
  const orchestrator = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'),
    'utf-8'
  );
  const sync = fs.readFileSync(
    path.join(ROOT_DIR, '.github/workflows/sonar-linear-sync.yaml'),
    'utf-8'
  );

  assert.equal(
    ci.match(/SonarSource\/sonarqube-scan-action@/g)?.length,
    1,
    'ci.yaml debe contener exactamente un scanner SonarQube Cloud'
  );
  assert.match(
    ci,
    /SonarSource\/sonarqube-scan-action@[a-f0-9]{40} # v\d+\.\d+\.\d+/,
    'La acción Sonar debe estar fijada por SHA completo con versión documentada'
  );
  assert.ok(ci.includes('run: npm run test:coverage'), 'Sonar debe recibir cobertura LCOV actualizada');
  assert.ok(
    ci.includes('test -n "$SONAR_TOKEN"'),
    'El análisis debe fallar cerrado cuando SONAR_TOKEN no está disponible'
  );
  assert.ok(
    orchestrator.includes('SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}'),
    'change-impact.yaml debe propagar SONAR_TOKEN al reusable workflow'
  );
  assert.ok(
    ci.includes("readFileSync('package.json', 'utf8')).version"),
    'La versión de Sonar debe derivarse del package.json canónico'
  );
  assert.ok(
    ci.includes('id: project-version') &&
      ci.includes('-Dsonar.projectVersion=${{ steps.project-version.outputs.version }}'),
    'Sonar debe recibir la versión SemVer validada mediante un output del job'
  );
  assert.ok(
    ci.includes("node -e \"if (!/^(0|[1-9]\\\\d*)") &&
      ci.includes('.test(process.argv[1])) process.exit(1)" "$VERSION"') &&
      ci.indexOf('.test(process.argv[1])) process.exit(1)') <
        ci.indexOf('echo "version=$VERSION" >> "$GITHUB_OUTPUT"'),
    'El workflow debe rechazar versiones que no cumplan SemVer antes de publicar el output'
  );
  assert.ok(
    ci.includes('-Dsonar.qualitygate.wait=true'),
    'El scanner debe esperar y propagar el resultado del Quality Gate'
  );
  assert.equal(
    sync.match(/SonarSource\/sonarqube-scan-action@/g)?.length ?? 0,
    0,
    'sonar-linear-sync.yaml solo debe consumir resultados, no ejecutar otro scanner'
  );
  assert.doesNotMatch(
    sonarProperties,
    /^sonar\.region=/m,
    'La instancia europea de SonarQube Cloud debe usar la región predeterminada sin sonar.region'
  );
  assert.match(
    sonarProperties,
    /^sonar\.exclusions=.*apps\/backend\/src\/db\/migrations\/\*\*/m,
    'Las migraciones PostgreSQL generadas no deben activar el analizador PLSQL'
  );
  assert.doesNotMatch(
    sonarProperties,
    /^sonar\.projectVersion=/m,
    'La versión de Sonar no debe fijarse estáticamente en sonar-project.properties'
  );
  assert.doesNotMatch(
    `${ci}\n${sonarProperties}`,
    /data[ ._-]?dictionary|sonar\.plsql/i,
    'El repositorio no debe configurar un Data Dictionary de Oracle para migraciones PostgreSQL'
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

  assert.equal(files.length, 18, `Se esperan exactamente 18 workflows en .github/workflows/, encontrados ${files.length}`);

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Ningún workflow debe usar permisos globales inseguros como write-all
    assert.doesNotMatch(
      content,
      /permissions:\s*write-all/i,
      `El workflow ${file} no debe definir 'permissions: write-all'`
    );

    // Debe existir declaración de permisos a nivel workflow o de jobs
    assert.match(
      content,
      /permissions:/,
      `El workflow ${file} debe declarar un bloque de 'permissions:' explícito`
    );
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
      `El workflow ${file} debe declarar permissions a nivel de workflow`
    );

    // 2. Cada job que no delegue en otro workflow (uses:) debe declarar su propio bloque permissions
    if (parsed.jobs && typeof parsed.jobs === 'object') {
      for (const [jobId, jobDef] of Object.entries(parsed.jobs)) {
        const job = jobDef as any;
        if (job.uses) continue; // reusable invocations manejan sus permisos en el caller/callee
        assert.ok(
          job.permissions && typeof job.permissions === 'object',
          `El job '${jobId}' en ${file} debe declarar su propio bloque permissions: explícito (Least Privilege)`
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
    'security-dast-zap.yaml no debe solicitar permiso issues: write cuando allow_issue_writing es false'
  );
  assert.equal(
    parsed.jobs?.zap_scan?.permissions?.issues,
    undefined,
    'El job zap_scan no debe solicitar permiso issues: write'
  );
});

test('🛡️ Workflow Governance: Auditoría de Secretos conocidos y tipados en los 18 workflows', () => {
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  const ALLOWED_SECRETS = new Set([
    'GITHUB_TOKEN',
    'SONAR_TOKEN',
    'LINEAR_API_KEY',
    'RULESET_ADMIN_TOKEN',
  ]);

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const secretMatches = [...content.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);

    for (const secret of secretMatches) {
      assert.ok(
        ALLOWED_SECRETS.has(secret),
        `El workflow ${file} referencia el secreto '${secret}', que no pertenece a la SSOT de secretos gobernados [${Array.from(ALLOWED_SECRETS).join(', ')}]`
      );
    }
  }
});

test('🛡️ Workflow Governance: workflows reusables no declaran trigger pull_request independiente', () => {
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  const reusableWorkflows = [
    'ci.yaml',
    'infra.yaml',
    'web.yaml',
    'mega-linter.yaml',
    'security-code-scanning.yaml',
  ];

  for (const file of reusableWorkflows) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.match(content, /workflow_call:/, `${file} debe declarar trigger workflow_call`);
    assert.doesNotMatch(
      content,
      /^\s*pull_request:\s*$/m,
      `El workflow reusable ${file} no debe declarar trigger 'pull_request:' propio; debe ser orquestado por change-impact.yaml`
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
    fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/change-impact.yaml'), 'utf8')
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
        `${executor.job} debe condicionarse a outputs.${executor.output}`
      );
      assert.ok(
        orchestrator.jobs['quality-gate'].needs?.includes(executor.job),
        `quality-gate debe depender de ${executor.job}`
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
    'pr-governance debe excluir PRs de bots (promote y Renovate generan cuerpos propios)'
  );
});
