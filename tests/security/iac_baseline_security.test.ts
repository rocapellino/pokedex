/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: Dev DX, Tooling & Gobernanza de Scripts
 * ==============================================================================
 */

import { test } from 'node:test';
import yaml from 'js-yaml';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readTaskfiles, taskCommands } from '../helpers/taskfile.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml, workflowScripts } from '../helpers/yaml.js';

/** Tareas efectivas de Task (raíz y submódulos `flatten`), ya parseadas: los comentarios no cuentan. */
const { tasks, documents } = readTaskfiles(ROOT_DIR);

test('🛡️ Deploy Security: scripts/proxmox_deploy.sh está retirado en favor de IaC declarativa', () => {
  const legacyScript = path.join(ROOT_DIR, 'scripts/proxmox_deploy.sh');
  assert.equal(
    fs.existsSync(legacyScript),
    false,
    'scripts/proxmox_deploy.sh debe estar eliminado; el aprovisionamiento se gestiona vía OpenTofu + Ansible + Helm',
  );
});

test('🛡️ Local K8s: infra/k8s/kind-cluster.yaml existe y expone puertos Ingress correctamente', () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'infra/k8s/kind-cluster.yaml')), 'kind-cluster.yaml debe existir');
  const cluster = readYaml<{
    kind: string;
    name: string;
    nodes: Array<{ kubeadmConfigPatches?: string[]; extraPortMappings?: Array<{ containerPort: number }> }>;
  }>('infra/k8s/kind-cluster.yaml');

  assert.equal(cluster.kind, 'Cluster', 'Debe definir kind: Cluster');
  assert.equal(cluster.name, 'pokedex-local', 'Debe definir el clúster pokedex-local');
  const node = cluster.nodes[0];
  // Cada parche de kubeadm es a su vez un documento YAML dentro de un escalar de bloque: un `#` ahí es texto, no
  // comentario, así que se parsea el parche y se lee la etiqueta efectiva.
  const nodeLabels = (node.kubeadmConfigPatches ?? []).map(
    (patch) =>
      (yaml.load(patch) as { nodeRegistration?: { kubeletExtraArgs?: Record<string, string> } }).nodeRegistration
        ?.kubeletExtraArgs?.['node-labels'] ?? '',
  );
  assert.ok(
    nodeLabels.some((labels) => labels.split(',').includes('ingress-ready=true')),
    'Debe etiquetar el nodo con ingress-ready=true',
  );
  const containerPorts = (node.extraPortMappings ?? []).map((mapping) => mapping.containerPort);
  assert.ok(containerPorts.includes(80), 'Debe mapear el puerto Ingress HTTP 80');
  assert.ok(containerPorts.includes(443), 'Debe mapear el puerto Ingress HTTPS 443');
});

test('🛡️ Dev DX: Taskfile.yaml define perfil rápido (dev:compose) y perfil Kubernetes (dev:k8s:*)', () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'Taskfile.yaml')), 'Taskfile.yaml debe existir');

  for (const name of ['dev:compose', 'dev:k8s:up', 'dev:k8s:down', 'dev:k8s:status']) {
    assert.ok(tasks[name], `Taskfile debe definir tarea ${name}`);
  }
});

test('🛡️ DevSecOps Tooling: .tool-versions define versiones inmutables del stack de desarrollo e IaC', () => {
  const toolVersionsPath = path.join(ROOT_DIR, '.tool-versions');
  assert.ok(fs.existsSync(toolVersionsPath), '.tool-versions debe existir en la raíz');
  // Formato `herramienta versión` por línea; las líneas de comentario no cuentan y cada herramienta lleva versión.
  const pinned = new Map(
    fs
      .readFileSync(toolVersionsPath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [tool, version] = line.split(/\s+/);
        return [tool, version] as const;
      }),
  );

  for (const tool of ['nodejs', 'opentofu', 'helm', 'kubectl', 'ansible-core']) {
    assert.match(pinned.get(tool) ?? '', /^\d+\.\d+/, `.tool-versions debe fijar ${tool} a una versión`);
  }

  // Los comandos del workflow, sin los comentados: un `pip install` solo mencionado en un comentario no se ejecuta.
  const pipInstalls = workflowScripts('.github/workflows/infra.yaml')
    .flatMap((script) => script.replace(/\\\r?\n/g, ' ').split('\n'))
    .filter((line) => /\bpip3? install\b/.test(line) && line.includes('ansible-core'));
  assert.ok(pipInstalls.length > 0, 'infra.yaml debe instalar ansible-core con pip');
  for (const line of pipInstalls) {
    assert.ok(
      line.includes('--only-binary :all:'),
      'infra.yaml debe ejecutar pip install con --only-binary :all: para mitigar scripts de setup no confiables',
    );
    assert.match(line, /ansible-core==\d+\.\d+\.\d+/, 'infra.yaml debe fijar la versión exacta de ansible-core');
  }
});

test('🛡️ Dev DX & Resiliencia: Taskfile.yaml define observabilidad unificada (Grafana Cloud / Dev Alloy) sin deuda legacy', () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'Taskfile.yaml')), 'Taskfile.yaml debe existir');

  // Sobre el contenido parseado: ni como variable, ni como referencia en un comando o una ruta.
  const parsed = JSON.stringify(documents);
  assert.ok(!parsed.includes('MONITORING_DIR'), 'Taskfile.yaml no debe incluir la variable obsoleta MONITORING_DIR');
  assert.ok(
    !parsed.includes('docker_monitoreo'),
    'Taskfile.yaml no debe incluir referencias al stack legacy docker_monitoreo',
  );
  assert.ok(
    tasks['monitoring:grafana-cloud:install'],
    'Taskfile.yaml debe incluir la tarea de instalación de Grafana Cloud',
  );
  assert.ok(tasks['monitoring:dev:status'], 'Taskfile.yaml debe incluir la tarea de diagnóstico dev:status');
  assert.ok(tasks['monitoring:dev:logs'], 'Taskfile.yaml debe incluir la tarea de logs de dev');
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
  assert.ok(
    taskCommands(tasks.default ?? {}).includes('task --list'),
    'Taskfile.yaml debe ejecutar task --list en tarea default',
  );
  assert.ok(tasks.start, 'Taskfile.yaml debe incluir la tarea start canónica');

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

  const allCommands = Object.values(tasks).flatMap(taskCommands);
  for (const alias of retiredAliases) {
    assert.strictEqual(alias in tasks, false, `Taskfile.yaml no debe contener el alias retirado ${alias}`);
    // `task <alias>` como comando completo o seguido de argumentos, no como prefijo de otra tarea.
    // Los alias solo contienen letras, `:` y `-`, así que se pueden interpolar en la expresión sin escapar.
    const reference = new RegExp(`(^|\\s)task ${alias}(\\s|$)`);
    assert.strictEqual(
      allCommands.some((command) => reference.test(command)),
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
  const excludedDirs = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', '.gemini', '.agents', '.claude']);

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
