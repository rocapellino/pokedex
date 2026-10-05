/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Dev DX, Tooling & Gobernanza de Scripts
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🛡️ Deploy Security: scripts/proxmox_deploy.sh está retirado en favor de IaC declarativa', () => {
  const legacyScript = path.join(ROOT_DIR, 'scripts/proxmox_deploy.sh');
  assert.equal(
    fs.existsSync(legacyScript),
    false,
    'scripts/proxmox_deploy.sh debe estar eliminado; el aprovisionamiento se gestiona vía OpenTofu + Ansible + Helm',
  );
});

test('🛡️ Local K8s: infra/k8s/kind-cluster.yaml existe y expone puertos Ingress correctamente', () => {
  const kindPath = path.join(ROOT_DIR, 'infra/k8s/kind-cluster.yaml');
  assert.ok(fs.existsSync(kindPath), 'kind-cluster.yaml debe existir');
  const content = fs.readFileSync(kindPath, 'utf-8');

  assert.ok(content.includes('kind: Cluster'), 'Debe definir kind: Cluster');
  assert.ok(content.includes('name: pokedex-local'), 'Debe definir el clúster pokedex-local');
  assert.ok(content.includes('ingress-ready=true'), 'Debe etiquetar el nodo con ingress-ready=true');
  assert.ok(content.includes('containerPort: 80'), 'Debe mapear el puerto Ingress HTTP 80');
  assert.ok(content.includes('containerPort: 443'), 'Debe mapear el puerto Ingress HTTPS 443');
});

test('🛡️ Dev DX: Taskfile.yaml define perfil rápido (dev:compose) y perfil Kubernetes (dev:k8s:*)', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yaml debe existir');
  const content = getCompleteTaskfileContent(ROOT_DIR);

  assert.ok(content.includes('dev:compose:'), 'Taskfile debe definir tarea dev:compose');
  assert.ok(content.includes('dev:k8s:up:'), 'Taskfile debe definir tarea dev:k8s:up');
  assert.ok(content.includes('dev:k8s:down:'), 'Taskfile debe definir tarea dev:k8s:down');
  assert.ok(content.includes('dev:k8s:status:'), 'Taskfile debe definir tarea dev:k8s:status');
});

/**
 * VSCODE-001 — `.vscode/tasks.json` es una CAPA DE PRESENTACION, no una fuente
 * de verdad operativa. `Taskfile.yaml` es el SSOT unico de comandos.
 *
 * Antes de este contrato, tasks.json reproducia comandos `helm`/`kubectl` que
 * ya existian en el Taskfile. Eso generaba dos fuentes de verdad con
 * divergencia silenciosa: la tarea "Test Endpoints" consultaba
 * `deploy/pokemon-api`, mientras `task k8s:test` consulta `deploy/pokemon-api`
 * Y `deploy/pokedex-web`. GitHub Actions no valida VS Code, asi que la
 * divergencia no la detectaba ningun gate.
 *
 * El contrato falla closed ante cualquier logica operativa reintroducida.
 */
test('🛡️ Dev DX: .vscode/tasks.json delega en Taskfile.yaml y no implementa logica operativa', () => {
  const tasksPath = path.join(ROOT_DIR, '.vscode/tasks.json');
  assert.ok(fs.existsSync(tasksPath), '.vscode/tasks.json debe existir');

  // VS Code admite JSONC: los comentarios del encabezado deben ignorarse.
  const raw = fs.readFileSync(tasksPath, 'utf-8');
  const content = raw.replace(/^\s*\/\/.*$/gm, '');
  const parsed = JSON.parse(content) as { tasks: { label: string; command: string }[] };
  const taskfile = getCompleteTaskfileContent(ROOT_DIR);

  // 1. Ninguna tarea reimplementa un comando de orquestacion o cluster.
  const OPERATIONAL = /\b(helm|kubectl|kind|Get-Command)\b/;
  const offenders = parsed.tasks.filter((t) => OPERATIONAL.test(t.command));
  assert.deepEqual(
    offenders.map((t) => `${t.label} => ${t.command}`),
    [],
    'Las tareas de VS Code no deben implementar logica de orquestacion o cluster. ' +
      'Delegar en `task <nombre>` para que Taskfile.yaml siga siendo el SSOT unico.',
  );

  // 2. Toda delegacion `task X` debe apuntar a una tarea que EXISTA en el Taskfile.
  const delegations = parsed.tasks
    .map((t) => t.command)
    .filter((c): c is string => c.startsWith('task '))
    .map((c) => c.slice('task '.length).trim());
  assert.ok(delegations.length > 0, 'El archivo debe delegar al menos una tarea en Taskfile');

  const declaredTasks = new Set(
    taskfile
      .split('\n')
      .map((line) => /^ {2}([A-Za-z0-9_:.-]+):\s*$/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined),
  );
  const missing = delegations.filter((name) => !declaredTasks.has(name));
  assert.deepEqual(
    missing,
    [],
    `Wrappers que apuntan a tareas inexistentes en Taskfile.yaml: ${missing.join(' | ')}. ` +
      'Un nombre inexistente no produce error de validacion: la tarea falla al ejecutarse.',
  );

  // 3. Las tareas de Kubernetes deben delegar (no invocar kubectl/helm directo).
  for (const label of ['Up', 'Down', 'Status', 'Port Forward', 'Test Endpoints']) {
    const k8s = parsed.tasks.find((t) => t.label.includes('Kubernetes:') && t.label.includes(label));
    assert.ok(k8s, `Debe existir la tarea de Kubernetes: ${label}`);
    assert.ok(
      k8s!.command.startsWith('task '),
      `La tarea "${k8s!.label}" debe delegar en Taskfile.yaml, no invocar helm/kubectl directamente`,
    );
  }
});

test('🛡️ DevSecOps Tooling: .tool-versions define versiones inmutables del stack de desarrollo e IaC', () => {
  const toolVersionsPath = path.join(ROOT_DIR, '.tool-versions');
  assert.ok(fs.existsSync(toolVersionsPath), '.tool-versions debe existir en la raíz');
  const content = fs.readFileSync(toolVersionsPath, 'utf-8');

  assert.ok(content.includes('nodejs'), '.tool-versions debe fijar nodejs');
  assert.ok(content.includes('opentofu'), '.tool-versions debe fijar opentofu');
  assert.ok(content.includes('helm'), '.tool-versions debe fijar helm');
  assert.ok(content.includes('kubectl'), '.tool-versions debe fijar kubectl');
  assert.ok(content.includes('ansible-core'), '.tool-versions debe fijar ansible-core');

  const infraWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/infra.yaml'), 'utf-8');
  assert.ok(
    infraWorkflow.includes('--only-binary :all:'),
    'infra.yaml debe ejecutar pip install con --only-binary :all: para mitigar scripts de setup no confiables',
  );
  assert.match(infraWorkflow, /ansible-core==\d+\.\d+\.\d+/, 'infra.yaml debe fijar la versión exacta de ansible-core');
});

test('🛡️ Dev DX & Resiliencia: Taskfile.yaml define observabilidad unificada (Grafana Cloud / Dev Alloy) sin deuda legacy', () => {
  const taskfilePath = path.join(ROOT_DIR, 'Taskfile.yaml');
  assert.ok(fs.existsSync(taskfilePath), 'Taskfile.yaml debe existir');
  const content = getCompleteTaskfileContent(ROOT_DIR);

  assert.ok(!content.includes('MONITORING_DIR:'), 'Taskfile.yaml no debe incluir la variable obsoleta MONITORING_DIR');
  assert.ok(
    !content.includes('docker_monitoreo'),
    'Taskfile.yaml no debe incluir referencias al stack legacy docker_monitoreo',
  );
  assert.ok(
    content.includes('monitoring:grafana-cloud:install:'),
    'Taskfile.yaml debe incluir la tarea de instalación de Grafana Cloud',
  );
  assert.ok(
    content.includes('monitoring:dev:status:'),
    'Taskfile.yaml debe incluir la tarea de diagnóstico dev:status',
  );
  assert.ok(content.includes('monitoring:dev:logs:'), 'Taskfile.yaml debe incluir la tarea de logs de dev');
});

test('🛡️ Taskfile CLI: ADR-020 formaliza ciclo de vida en 4 fases para aliases y task --list como interfaz soportada (consolida ADR-026)', () => {
  const adr20Path = path.join(
    ROOT_DIR,
    'docs/decisions/ADR-020-unified-deployment-governance-and-script-retirement.md',
  );
  const cliRefPath = path.join(ROOT_DIR, 'docs/operations/TASKFILE_CLI_REFERENCE.md');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const infraReadmePath = path.join(ROOT_DIR, 'infra/README.md');
  const tofuReadmePath = path.join(ROOT_DIR, 'infra/opentofu/README.md');
  const proxmoxGuidePath = path.join(ROOT_DIR, 'docs/runbooks/PROXMOX_DEPLOYMENT_GUIDE.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const decisionsReadmePath = path.join(ROOT_DIR, 'docs/decisions/README.md');

  // 1. ADR-020 existe físicamente en docs/decisions/, consolida ADR-026 y está en estado Aceptado/Activo
  assert.ok(fs.existsSync(adr20Path), 'ADR-020 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adr20Path, 'utf-8');
  assert.ok(
    adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'),
    'ADR-020 debe estar en estado Aceptado',
  );
  assert.ok(
    adrContent.includes('task --list'),
    'ADR-020 debe formalizar task --list como interfaz oficialmente soportada',
  );
  assert.ok(
    adrContent.includes('Fase 1 (Documentación)') || adrContent.includes('Fase 1: Documentar Aliases'),
    'ADR-020 debe documentar Fase 1',
  );
  assert.ok(
    adrContent.includes('Fase 2 (Telemetría') || adrContent.includes('Fase 2: Medir Uso'),
    'ADR-020 debe documentar Fase 2',
  );
  assert.ok(
    adrContent.includes('Fase 3 (Deprecación Formal)') || adrContent.includes('Fase 3: Deprecación Formal'),
    'ADR-020 debe documentar Fase 3',
  );
  assert.ok(
    adrContent.includes('Fase 4 (Eliminación Definitiva') || adrContent.includes('Fase 4: Eliminación Definitiva'),
    'ADR-020 debe documentar Fase 4',
  );
  assert.ok(adrContent.includes('ADR-026'), 'ADR-020 debe referenciar la consolidación de ADR-026');

  // 2. TASKFILE_CLI_REFERENCE.md existe físicamente y documenta catálogo canónico y fases
  assert.ok(fs.existsSync(cliRefPath), 'TASKFILE_CLI_REFERENCE.md debe existir en docs/operations/');
  const cliRefContent = fs.readFileSync(cliRefPath, 'utf-8');
  assert.ok(cliRefContent.includes('task --list'), 'TASKFILE_CLI_REFERENCE.md debe consagrar task --list');
  assert.ok(cliRefContent.includes('Fase 1: Documentar'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 1');
  assert.ok(cliRefContent.includes('Fase 2: Medir Uso'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 2');
  assert.ok(cliRefContent.includes('Fase 3: Deprecate'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 3');
  assert.ok(cliRefContent.includes('Fase 4: Eliminar'), 'TASKFILE_CLI_REFERENCE.md debe detallar Fase 4');

  // 3. Taskfile.yaml define default con task --list y start como tarea canónica
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(taskfileContent.includes('task --list'), 'Taskfile.yaml debe ejecutar task --list en tarea default');
  assert.ok(taskfileContent.includes('start:'), 'Taskfile.yaml debe incluir la tarea start canónica');

  // 4. Fase 4 de ADR-026/ADR-020: Los 18 aliases legados fueron retirados definitivamente de Taskfile.yaml
  const retiredAliases = [
    'tofu:init:proxmox',
    'tofu:plan:proxmox',
    'tofu:apply:proxmox',
    'tofu:init:aws',
    'tofu:plan:aws',
    'tofu:apply:aws',
    'tofu:init:cloud',
    'tofu:plan:cloud',
    'tofu:apply:cloud',
    'tofu:validate',
    'ts:install',
    'ts:dev',
    'ts:build',
    'ts:start',
    'ts:lint',
    'docker:up',
    'docker:down',
    'deploy:proxmox',
  ];

  for (const alias of retiredAliases) {
    const hasAlias = taskfileContent.split('\n').some((line: string) => line.startsWith(`  ${alias}:`));
    assert.strictEqual(hasAlias, false, `Taskfile.yaml no debe contener el alias retirado ${alias}`);
    assert.strictEqual(
      taskfileContent.includes(`task ${alias}`),
      false,
      `Taskfile.yaml no debe referenciar el alias retirado ${alias}`,
    );
  }

  // 5. La documentación activa utiliza comandos canónicos y no aliases deprecados
  const infraReadmeContent = fs.readFileSync(infraReadmePath, 'utf-8');
  assert.ok(
    infraReadmeContent.includes('task infra:plan:proxmox'),
    'infra/README.md debe usar comando canónico task infra:plan:proxmox',
  );
  assert.ok(
    !infraReadmeContent.includes('task infra:plan:aws'),
    'infra/README.md no debe citar task infra:plan:aws, retirada con ADR-030',
  );
  assert.ok(
    !infraReadmeContent.includes('task tofu:plan:proxmox'),
    'infra/README.md no debe contener task tofu:plan:proxmox',
  );
  assert.ok(
    !infraReadmeContent.includes('task tofu:plan:cloud'),
    'infra/README.md no debe contener task tofu:plan:cloud',
  );

  const tofuReadmeContent = fs.readFileSync(tofuReadmePath, 'utf-8');
  assert.ok(
    tofuReadmeContent.includes('task infra:plan:proxmox'),
    'infra/opentofu/README.md debe usar task infra:plan:proxmox',
  );
  assert.ok(
    tofuReadmeContent.includes('task infra:validate'),
    'infra/opentofu/README.md debe usar task infra:validate',
  );
  assert.ok(
    !tofuReadmeContent.includes('task infra:plan:aws'),
    'infra/opentofu/README.md no debe citar task infra:plan:aws, retirada con ADR-030',
  );
  assert.ok(
    !tofuReadmeContent.includes('task tofu:plan:aws'),
    'infra/opentofu/README.md no debe contener task tofu:plan:aws',
  );

  const proxmoxGuideContent = fs.readFileSync(proxmoxGuidePath, 'utf-8');
  assert.ok(
    proxmoxGuideContent.includes('task infra:plan:proxmox'),
    'PROXMOX_DEPLOYMENT_GUIDE.md debe usar task infra:plan:proxmox',
  );
  assert.ok(
    proxmoxGuideContent.includes('task ansible:prepare'),
    'PROXMOX_DEPLOYMENT_GUIDE.md debe usar task ansible:prepare',
  );
  assert.ok(
    !proxmoxGuideContent.includes('task tofu:plan:proxmox'),
    'PROXMOX_DEPLOYMENT_GUIDE.md no debe contener task tofu:plan:proxmox',
  );
  assert.ok(
    !proxmoxGuideContent.includes('task deploy:proxmox'),
    'PROXMOX_DEPLOYMENT_GUIDE.md no debe contener task deploy:proxmox',
  );

  // 6. deployment.md referencia TASKFILE_CLI_REFERENCE.md y ADR-020
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(
    deploymentContent.includes('TASKFILE_CLI_REFERENCE.md'),
    'deployment.md debe enlazar TASKFILE_CLI_REFERENCE.md',
  );
  assert.ok(deploymentContent.includes('ADR-020'), 'deployment.md debe enlazar ADR-020');

  // 7. README.md y docs/README.md enlazan ADR-020, catálogo canónico y TASKFILE_CLI_REFERENCE.md
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'),
    'README.md debe enlazar ADR-020',
  );
  assert.ok(readmeContent.includes('TASKFILE_CLI_REFERENCE.md'), 'README.md debe enlazar TASKFILE_CLI_REFERENCE.md');
  assert.ok(
    docsReadmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'),
    'docs/README.md debe enlazar ADR-020',
  );
  assert.ok(
    docsReadmeContent.includes('TASKFILE_CLI_REFERENCE.md'),
    'docs/README.md debe enlazar TASKFILE_CLI_REFERENCE.md',
  );

  // 8. Gobernanza de ADRs: docs/decisions/README.md es el catálogo oficial de decisiones
  assert.ok(fs.existsSync(decisionsReadmePath), 'docs/decisions/README.md debe existir como índice oficial de ADRs');
  const decisionsReadmeContent = fs.readFileSync(decisionsReadmePath, 'utf-8');
  assert.ok(
    decisionsReadmeContent.includes('ADR-026'),
    'docs/decisions/README.md debe registrar el histórico de ADR-026',
  );

  // 9. Los ADRs activos en docs/decisions/ coinciden exactamente con el catálogo oficial
  const decisionFiles = fs
    .readdirSync(path.join(ROOT_DIR, 'docs/decisions'))
    .filter((f: string) => f.startsWith('ADR-'));
  assert.ok(decisionFiles.length >= 20, 'Debe existir un conjunto sustancial de ADRs activos');
  for (const adrFile of decisionFiles) {
    const adrNumMatch = adrFile.match(/^ADR-(\d{3})/);
    assert.ok(adrNumMatch, `${adrFile} debe tener formato canónico ADR-XXX`);
    assert.ok(
      decisionsReadmeContent.includes(adrFile),
      `docs/decisions/README.md debe indexar el ADR activo ${adrFile}`,
    );
  }
});

test('🛡️ Tooling Governance: repositorio restringe scripts shell a dr_verify_restore.sh y rechaza imperativos (ADR-020)', () => {
  const allowedShScripts = ['scripts/dr_verify_restore.sh'];
  const forbiddenDeployPatterns = [
    'deploy.sh',
    'proxmox_deploy.sh',
    'deploy_aws.sh',
    'deploy_proxmox.sh',
    'deploy_app.sh',
  ];
  const excludedDirs = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', '.gemini', '.agents']);

  function findShellScripts(dir: string, baseDir: string = dir): string[] {
    let results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !excludedDirs.has(entry.name)) {
        results = results.concat(findShellScripts(fullPath, baseDir));
      } else if (entry.isFile() && entry.name.endsWith('.sh')) {
        results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
      }
    }
    return results;
  }

  const foundSh = findShellScripts(ROOT_DIR);
  assert.deepEqual(
    foundSh,
    allowedShScripts,
    'La única secuencia shell autorizada en el repositorio debe ser scripts/dr_verify_restore.sh',
  );

  for (const pattern of forbiddenDeployPatterns) {
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, pattern)), `No debe existir script imperativo en raíz: ${pattern}`);
    assert.ok(
      !fs.existsSync(path.join(ROOT_DIR, 'scripts', pattern)),
      `No debe existir script imperativo en scripts/: ${pattern}`,
    );
  }
});
