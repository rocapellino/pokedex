import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getCompleteTaskfileContent } from '../helpers/taskfile.js';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';
import { ROOT_DIR } from '../helpers/repo.js';

test('🛡️ Gobernanza & Documentación: README.md y docs/README.md documentan Matriz de Estado y enlazan Runbooks y ADRs', () => {
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(readmePath), 'README.md debe existir');
  assert.ok(fs.existsSync(docsReadmePath), 'docs/README.md debe existir');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');

  // Matriz de estado en README.md
  assert.ok(
    readmeContent.includes('Matriz de Estado y Nivel de Soporte de Componentes'),
    'README.md debe contener la Matriz de Estado y Nivel de Soporte de Componentes',
  );
  assert.ok(readmeContent.includes('Kubernetes (K3s on-premise / cloud gestionado)'), 'Matriz debe listar Kubernetes');
  assert.ok(readmeContent.includes('Helm 3 (OCI Artifacts)'), 'Matriz debe listar Helm 3');
  assert.ok(readmeContent.includes('ArgoCD (GitOps)'), 'Matriz debe listar ArgoCD');
  assert.ok(readmeContent.includes('OpenTofu 1.8+'), 'Matriz debe listar OpenTofu');

  // Enlaces a Observabilidad y ADR-007
  assert.ok(
    readmeContent.includes('docs/operations/observability-alerts.md'),
    'README.md debe enlazar observability-alerts.md',
  );
  assert.ok(
    readmeContent.includes('docs/decisions/ADR-007-observability-and-metrics.md'),
    'README.md debe enlazar ADR-007',
  );

  assert.ok(
    docsReadmeContent.includes('observability-alerts.md'),
    'docs/README.md debe enlazar observability-alerts.md',
  );
  assert.ok(docsReadmeContent.includes('ADR-007-observability-and-metrics.md'), 'docs/README.md debe enlazar ADR-007');
});

test('🛡️ Supply Chain Security: ADR-008 formaliza inmutabilidad, Cosign Keyless, SLSA L3 y Kyverno', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-008-supply-chain-security.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-008 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-008 debe estar aceptado');
  assert.ok(adrContent.includes('Digest Pinning'), 'ADR-008 debe definir Digest Pinning');
  assert.ok(adrContent.includes('CycloneDX'), 'ADR-008 debe definir CycloneDX SBOM');
  assert.ok(adrContent.includes('Cosign'), 'ADR-008 debe definir Cosign Keyless');
  assert.ok(adrContent.includes('SLSA'), 'ADR-008 debe definir SLSA Provenance');
  assert.ok(adrContent.includes('Kyverno'), 'ADR-008 debe definir control de admisión Kyverno');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-008-supply-chain-security.md'), 'README.md debe enlazar ADR-008');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-008-supply-chain-security.md'), 'docs/README.md debe enlazar ADR-008');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});

test('🛡️ Excelencia Operacional & Gobernanza: docs/operations/ contiene 7 SOPs estandarizados e indexados en docs/README.md', () => {
  const operationsDir = path.join(ROOT_DIR, 'docs/operations');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(operationsDir), 'docs/operations/ debe existir');
  assert.ok(fs.existsSync(docsReadmePath), 'docs/README.md debe existir');

  const expectedRunbooks = [
    'observability-alerts.md',
    'backup-restore.md',
    'deployment.md',
    'incident-response.md',
    'kubernetes-troubleshooting.md',
    'rollback.md',
    'secret-rotation.md',
  ];

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');

  for (const file of expectedRunbooks) {
    const filePath = path.join(operationsDir, file);
    assert.ok(fs.existsSync(filePath), `Runbook ${file} debe existir en docs/operations/`);

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.startsWith('# '), `Runbook ${file} debe comenzar con título H1`);
    assert.ok(
      !/\n## [^\n]+\n[^\n\r#\s]/.test(content),
      `Runbook ${file} debe respetar espaciado MD022 tras encabezados H2`,
    );

    assert.ok(docsReadmeContent.includes(file), `docs/README.md debe indexar y enlazar ${file}`);
  }

  // Validar que el diagrama Mermaid contiene los 7 nodos de operaciones y R5 en runbooks
  assert.ok(
    docsReadmeContent.includes('RUN --> R5["📋 DISASTER_RECOVERY_PLAN.md"]'),
    'Mermaid debe enlazar R5 DISASTER_RECOVERY_PLAN',
  );
  for (let i = 1; i <= 7; i++) {
    assert.ok(docsReadmeContent.includes(`OP${i}`), `Mermaid en docs/README.md debe contener nodo OP${i}`);
  }
});

test('🛡️ Orquestación de Monorepo: ADR-019 (Turborepo) está retirado y no quedan restos de la herramienta', async () => {
  const decisionsDir = path.join(ROOT_DIR, 'docs/decisions');
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  const decisionsIndex = fs.readFileSync(path.join(decisionsDir, 'README.md'), 'utf-8');

  // 1. El ADR retirado no conserva archivo (convención de ADR retirados) y consta en el índice
  assert.ok(
    !fs.readdirSync(decisionsDir).some((f: string) => f.startsWith('ADR-019')),
    'ADR-019 retirado no debe tener archivo en docs/decisions/',
  );
  assert.match(
    decisionsIndex,
    /\*\*ADR-019\*\*[^\n]*\*\*Retirado\*\*/,
    'ADR-019 debe constar como Retirado en el índice',
  );

  // 2. Sin restos de Turborepo en configuración ni scripts
  assert.ok(!fs.existsSync(path.join(ROOT_DIR, 'turbo.json')), 'turbo.json no debe existir');
  assert.ok(!packageJson.devDependencies?.turbo, 'package.json no debe declarar turbo');
  assert.ok(
    !Object.keys(packageJson.scripts ?? {}).some((name) => name.endsWith(':turbo')),
    'package.json no debe exponer scripts :turbo',
  );
  assert.ok(!taskfileContent.includes('turbo:'), 'Taskfile.yaml no debe exponer tareas turbo');

  // 3. npm workspaces sigue siendo el orquestador canónico
  assert.ok(packageJson.packageManager?.startsWith('npm@'), 'package.json debe declarar packageManager npm');
  assert.ok(
    Array.isArray(packageJson.workspaces) && packageJson.workspaces.length > 0,
    'package.json debe declarar workspaces',
  );
});

test('🛡️ Gobernanza de Despliegue: ADR-020 formaliza CLI canónico con Taskfile, retiro de scripts legados y lista blanca', async () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-020-unified-deployment-governance-and-script-retirement.md');
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const deploymentRunbookPath = path.join(ROOT_DIR, 'docs/operations/deployment.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  // 1. ADR-020 existe y está aceptado
  assert.ok(fs.existsSync(adrPath), 'ADR-020 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(
    adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'),
    'ADR-020 debe estar en estado Aceptado',
  );
  assert.ok(adrContent.includes('Taskfile.yaml'), 'ADR-020 debe documentar Taskfile.yaml como interfaz canónica');
  assert.ok(adrContent.includes('dr_verify_restore.sh'), 'ADR-020 debe inventariar dr_verify_restore.sh');
  assert.ok(adrContent.includes('governance:audit-scripts'), 'ADR-020 debe documentar governance:audit-scripts');

  // 2. Lista blanca estricta de scripts .sh en todo el monorepo
  const allowedShScripts = ['scripts/dr_verify_restore.sh'];
  const findSh = (dir: string): string[] => {
    let results: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (['node_modules', '.git', 'dist', 'coverage', '.turbo', 'tmp', '.claude'].includes(file)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        results = results.concat(findSh(fullPath));
      } else if (file.endsWith('.sh')) {
        results.push(path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/'));
      }
    }
    return results;
  };
  const actualShScripts = findSh(ROOT_DIR);
  const unauthorizedSh = actualShScripts.filter((s) => !allowedShScripts.includes(s));
  assert.equal(
    unauthorizedSh.length,
    0,
    `No se permiten scripts shell fuera de la lista blanca autorizada. No autorizados: ${unauthorizedSh.join(', ')}`,
  );

  // 3. Prohibición expresa de scripts imperativos de despliegue ad-hoc
  const forbiddenPatterns = ['deploy.sh', 'proxmox_deploy.sh', 'deploy_aws.sh', 'deploy_proxmox.sh', 'deploy_app.sh'];
  for (const forbidden of forbiddenPatterns) {
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, forbidden)),
      false,
      `Script prohibido no debe existir en la raíz: ${forbidden}`,
    );
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, 'scripts', forbidden)),
      false,
      `Script prohibido no debe existir en scripts/: ${forbidden}`,
    );
  }

  // 4. Taskfile.yaml expone tareas canónicas de ciclo de vida y gobernanza
  const taskfileContent = getCompleteTaskfileContent(ROOT_DIR);
  assert.ok(
    taskfileContent.includes('governance:audit-scripts:'),
    'Taskfile.yaml debe definir governance:audit-scripts',
  );
  assert.ok(taskfileContent.includes('k8s:up:'), 'Taskfile.yaml debe definir k8s:up');
  assert.ok(taskfileContent.includes('gitops:sync:cloud:'), 'Taskfile.yaml debe definir gitops:sync:cloud');
  assert.ok(taskfileContent.includes('gitops:sync:preprod:'), 'Taskfile.yaml debe definir gitops:sync:preprod');
  assert.equal(
    taskfileContent.includes('gitops:sync:proxmox:'),
    false,
    'Taskfile.yaml no debe definir el alias legado gitops:sync:proxmox (retirado según ADR-020)',
  );

  // 5. package.json incluye script de auditoría
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  assert.ok(packageJson.scripts?.['governance:audit-scripts'], 'package.json debe definir governance:audit-scripts');

  // 6. deployment.md referencia ADR-020 y Taskfile
  const deploymentContent = fs.readFileSync(deploymentRunbookPath, 'utf-8');
  assert.ok(deploymentContent.includes('ADR-020'), 'deployment.md debe enlazar ADR-020');
  assert.ok(
    deploymentContent.includes('task governance:audit-scripts'),
    'deployment.md debe documentar task governance:audit-scripts',
  );

  // 7. README.md y docs/README.md enlazan ADR-020
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'),
    'README.md debe enlazar ADR-020',
  );
  assert.ok(
    docsReadmeContent.includes('ADR-020-unified-deployment-governance-and-script-retirement.md'),
    'docs/README.md debe enlazar ADR-020',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});

test('🛡️ Resiliencia & Deuda de Código: ADR-027 formaliza convergencia en frontend y contratos Fail-Open vs Fail-Closed', () => {
  const adr27Path = path.join(ROOT_DIR, 'docs/decisions/ADR-027-resilience-fail-open-vs-fail-closed-contracts.md');
  const specPath = path.join(ROOT_DIR, 'docs/architecture/FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  // 1. Documentos arquitectónicos existen y están en estado Aceptado
  assert.ok(fs.existsSync(adr27Path), 'ADR-027 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adr27Path, 'utf-8');
  assert.ok(
    adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'),
    'ADR-027 debe estar en estado Aceptado',
  );
  assert.ok(
    adrContent.includes('Fail-Closed (Seguridad & Integridad)'),
    'ADR-027 debe documentar políticas Fail-Closed',
  );
  assert.ok(adrContent.includes('Fail-Open (Disponibilidad)'), 'ADR-027 debe documentar políticas Fail-Open');

  assert.ok(fs.existsSync(specPath), 'FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md debe existir');
  const specContent = fs.readFileSync(specPath, 'utf-8');
  assert.ok(specContent.includes('requireWritableStorage'), 'Debe especificar requireWritableStorage');
  assert.ok(specContent.includes('isJtiRevokedInRedis'), 'Debe especificar isJtiRevokedInRedis');
  assert.ok(specContent.includes('failClosedOnRedisOutage'), 'Debe especificar failClosedOnRedisOutage');
  assert.ok(specContent.includes('invalidateCache'), 'Debe especificar invalidateCache');

  // 2. docs/README.md enlaza ADR-027 y FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md
  const docsReadme = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadme.includes('ADR-027-resilience-fail-open-vs-fail-closed-contracts.md'),
    'docs/README.md debe enlazar ADR-027',
  );
  assert.ok(
    docsReadme.includes('FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md'),
    'docs/README.md debe enlazar FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md',
  );

  // 3. Frontend: Módulos compartidos existen y contienen utilidades esperadas
  const sharedDir = path.join(ROOT_DIR, 'apps/frontend/src/shared');
  assert.ok(fs.existsSync(sharedDir), 'Directorio apps/frontend/src/shared debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'constants.ts')), 'constants.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'formatters.ts')), 'formatters.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'ui.ts')), 'ui.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'api.ts')), 'api.ts debe existir');
  assert.ok(fs.existsSync(path.join(sharedDir, 'index.ts')), 'index.ts debe existir');

  const constantsContent = fs.readFileSync(path.join(sharedDir, 'constants.ts'), 'utf-8');
  assert.ok(constantsContent.includes('export const TYPE_COLORS'), 'constants.ts debe exportar TYPE_COLORS');

  const formattersContent = fs.readFileSync(path.join(sharedDir, 'formatters.ts'), 'utf-8');
  assert.ok(formattersContent.includes('export function normalizeStr'), 'formatters.ts debe exportar normalizeStr');
  assert.ok(formattersContent.includes('export function getTypeColor'), 'formatters.ts debe exportar getTypeColor');
  assert.ok(
    formattersContent.includes('export function formatPokemonId'),
    'formatters.ts debe exportar formatPokemonId',
  );

  const uiContent = fs.readFileSync(path.join(sharedDir, 'ui.ts'), 'utf-8');
  assert.ok(uiContent.includes('export function showToast'), 'ui.ts debe exportar showToast');
  assert.ok(uiContent.includes('export function renderTypeBadge'), 'ui.ts debe exportar renderTypeBadge');

  const apiContent = fs.readFileSync(path.join(sharedDir, 'api.ts'), 'utf-8');
  assert.ok(
    apiContent.includes('export async function fetchPokemonsWithCount'),
    'api.ts debe exportar fetchPokemonsWithCount',
  );
  assert.ok(apiContent.includes('export async function loginWithApiKey'), 'api.ts debe exportar loginWithApiKey');

  // 4. Frontend: pokedex.ts y backoffice.ts consumen módulos compartidos sin duplicar constantes
  const pokedexTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/frontend/src/pokedex.ts'), 'utf-8');
  const backofficeTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/frontend/src/backoffice.ts'), 'utf-8');

  assert.ok(pokedexTs.includes("from './shared/index.js'"), "pokedex.ts debe importar desde './shared/index.js'");
  assert.ok(
    !pokedexTs.includes('const TYPE_COLORS: Record<string, string>'),
    'pokedex.ts no debe duplicar TYPE_COLORS localmente',
  );

  assert.ok(backofficeTs.includes("from './shared/index.js'"), "backoffice.ts debe importar desde './shared/index.js'");
  assert.ok(
    !backofficeTs.includes('const TYPE_COLORS: Record<string, string>'),
    'backoffice.ts no debe duplicar TYPE_COLORS localmente',
  );

  // 5. Backend: Contratos de resiliencia alineados en código
  const serverTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/server.ts'), 'utf-8');
  const rateLimiterTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/middleware/rate-limiter.ts'), 'utf-8');
  const authTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/services/auth.ts'), 'utf-8');
  const dbTs = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/services/db.ts'), 'utf-8');

  assert.ok(
    rateLimiterTs.includes('failClosedOnRedisOutage: true'),
    'rate-limiter.ts debe configurar limitadores de IA con failClosedOnRedisOutage: true',
  );
  assert.ok(
    serverTs.includes('requireWritableStorage'),
    'server.ts debe utilizar requireWritableStorage para mutaciones',
  );
  assert.ok(
    authTs.includes("reason: 'service_unavailable'"),
    'auth.ts debe implementar Fail-Closed en verificación de sesión cuando Redis está caído',
  );
  assert.ok(dbTs.includes('invalidateCache'), 'db.ts debe implementar invalidateCache con versionado atómico');
});
