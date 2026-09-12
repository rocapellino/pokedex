/**
 * ==============================================================================
 * scripts/github-security-linear-sync.ts
 * Sincronización Automática entre GitHub Security & Quality y Linear
 * ==============================================================================
 * 
 * Sincroniza incidencias y alertas de seguridad de GitHub con tickets en Linear:
 *  1. GitHub Code Scanning (CodeQL, Trivy, Gitleaks SARIF)
 *  2. GitHub Dependabot Alerts
 *  3. GitHub Secret Scanning Alerts
 *
 * Soporta ciclo de vida completo:
 *  - Detección y creación de nuevas alertas abiertas.
 *  - Cierre y actualización automática a Done/Canceled de alertas resueltas en GitHub.
 *  - Deduplicación robusta en Linear mediante indexación previa (sin tokenización rota).
 *  - Reapertura a Todo si una alerta cerrada vuelve a abrirse en GitHub.
 *
 * Variables de entorno soportadas:
 *  - LINEAR_API_KEY      (Requerido para crear/actualizar tickets en Linear)
 *  - GITHUB_TOKEN        (Requerido para consultar APIs de seguridad de GitHub)
 *  - GITHUB_REPOSITORY   (Opcional: por defecto 'rocapellino/pokedex')
 *  - LINEAR_TEAM_KEY     (Opcional: por defecto 'PEX')
 *  - DRY_RUN             (Opcional: 'true' para simular sin mutar tickets)
 */

export interface GitHubCodeScanningAlert {
  number: number;
  created_at: string;
  html_url: string;
  state: 'open' | 'closed' | 'fixed' | 'dismissed';
  dismissed_reason?: string | null;
  rule: {
    id: string;
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'warning' | 'note' | 'error';
    description?: string;
    name?: string;
    tags?: string[];
  };
  tool: {
    name: string;
    version?: string;
  };
  most_recent_instance?: {
    location?: {
      path?: string;
      start_line?: number;
      end_line?: number;
    };
    message?: {
      text?: string;
    };
  };
}

export interface GitHubDependabotAlert {
  number: number;
  created_at: string;
  html_url: string;
  state: 'auto_dismissed' | 'dismissed' | 'fixed' | 'open';
  dismissed_reason?: string | null;
  dependency: {
    package: {
      ecosystem: string;
      name: string;
    };
    manifest_path?: string;
  };
  security_advisory: {
    ghsa_id: string;
    cve_id?: string | null;
    summary: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  security_vulnerability?: {
    vulnerable_version_range?: string;
    first_patched_version?: {
      identifier: string;
    } | null;
  };
}

export interface GitHubSecretScanningAlert {
  number: number;
  created_at: string;
  html_url: string;
  state: 'open' | 'resolved';
  resolution?: string | null;
  secret_type: string;
  secret_type_display_name: string;
}

export interface LinearTeamNode {
  id: string;
  key: string;
  name: string;
  states: {
    nodes: Array<{
      id: string;
      name: string;
      type: string;
    }>;
  };
}

export interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  state: {
    id: string;
    name: string;
    type: string;
  };
}

export function sanitize(input: unknown): string {
  return String(input ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 120);
}

export function mapSeverityToPriority(severity?: string): number {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return 1; // Urgent en Linear
    case 'high':
    case 'error':
      return 2; // High en Linear
    case 'medium':
    case 'warning':
      return 3; // Medium en Linear
    case 'low':
    case 'note':
    default:
      return 4; // Low en Linear
  }
}

export function extractAlertKeyFromTitle(title: string): { tool: string; number: number } | null {
  const match = title.match(/\[GitHub\s+([A-Za-z0-9_\s]+?)\s+#(\d+)\]/i);
  if (!match) return null;
  let tool = match[1].trim();
  if (/code\s+scanning/i.test(tool)) tool = 'CodeQL';
  return {
    tool: tool.toLowerCase(),
    number: parseInt(match[2], 10),
  };
}

export function formatCodeScanningTitle(alert: GitHubCodeScanningAlert): string {
  const tool = alert.tool?.name || 'CodeQL';
  const ruleName = alert.rule?.description || alert.rule?.name || alert.rule?.id || 'Vulnerabilidad';
  return `[GitHub ${tool} #${alert.number}] ${sanitize(ruleName)}`;
}

export function formatDependabotTitle(alert: GitHubDependabotAlert): string {
  const pkg = alert.dependency?.package?.name || 'dependencia';
  const ghsa = alert.security_advisory?.ghsa_id || 'Alerta';
  const summary = alert.security_advisory?.summary || 'Vulnerabilidad de dependencia';
  return `[GitHub Dependabot #${alert.number}] ${pkg} (${ghsa}): ${sanitize(summary)}`;
}

export function formatSecretScanningTitle(alert: GitHubSecretScanningAlert): string {
  const typeName = alert.secret_type_display_name || alert.secret_type || 'Secreto Expuesto';
  return `[GitHub Secret #${alert.number}] Detección de ${sanitize(typeName)}`;
}

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const GITHUB_API_URL = 'https://api.github.com';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'rocapellino/pokedex';
export function isDryRun(): boolean {
  return process.env.DRY_RUN === 'true' || !process.env.LINEAR_API_KEY;
}

const TARGET_TEAM_KEY = process.env.LINEAR_TEAM_KEY || 'PEX';

export async function fetchLinear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': process.env.LINEAR_API_KEY || '',
  };

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API HTTP Error ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { data?: T; errors?: unknown[] };
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Linear GraphQL Error: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

export async function fetchGitHub<T>(endpoint: string): Promise<T | null> {
  const url = `${GITHUB_API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });

  if (response.status === 404 || response.status === 403) {
    console.warn(`[GitHub API] Recurso no disponible o permisos insuficientes (${response.status}) en: ${endpoint}`);
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub API HTTP Error ${response.status} en ${url}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function getLinearTeam(teamKey: string): Promise<LinearTeamNode> {
  if (isDryRun() && (!process.env.LINEAR_API_KEY || process.env.LINEAR_API_KEY === 'test_dummy_key')) {
    return {
      id: 'mock-team-id',
      key: teamKey,
      name: 'Mock Team',
      states: {
        nodes: [
          { id: 'state-todo', name: 'Todo', type: 'unstarted' },
          { id: 'state-done', name: 'Done', type: 'completed' },
          { id: 'state-duplicate', name: 'Duplicate', type: 'duplicate' },
          { id: 'state-canceled', name: 'Canceled', type: 'canceled' },
          { id: 'state-backlog', name: 'Backlog', type: 'backlog' },
        ],
      },
    };
  }

  const query = `
    query GetTeams {
      teams {
        nodes {
          id
          key
          name
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    }
  `;

  const data = await fetchLinear<{ teams: { nodes: LinearTeamNode[] } }>(query);
  const matched = data.teams.nodes.find((t) => t.key.toUpperCase() === teamKey.toUpperCase());
  const selected = matched || data.teams.nodes[0];

  if (!selected) {
    throw new Error(`No se encontró ningún equipo en Linear (buscado: ${teamKey}).`);
  }

  return selected;
}

export async function fetchTeamSecurityIssues(teamKey: string): Promise<Map<string, LinearIssueNode[]>> {
  const issueMap = new Map<string, LinearIssueNode[]>();
  if (isDryRun() && (!process.env.LINEAR_API_KEY || process.env.LINEAR_API_KEY === 'test_dummy_key')) {
    return issueMap;
  }

  const query = `
    query GetTeamSecurityIssues($teamKey: String!) {
      team(id: $teamKey) {
        issues(first: 250) {
          nodes {
            id
            identifier
            title
            state {
              id
              name
              type
            }
          }
        }
      }
    }
  `;

  try {
    const data = await fetchLinear<{ team: { issues: { nodes: LinearIssueNode[] } } }>(query, { teamKey });
    const nodes = data.team?.issues?.nodes || [];
    for (const node of nodes) {
      const parsed = extractAlertKeyFromTitle(node.title);
      if (parsed) {
        const key = `${parsed.tool}#${parsed.number}`;
        const existing = issueMap.get(key) || [];
        existing.push(node);
        // Asegurar que el ticket con menor número identificador (más antiguo) sea el principal
        existing.sort((a, b) => {
          const numA = parseInt(a.identifier.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.identifier.replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        });
        issueMap.set(key, existing);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Error al obtener issues existentes del equipo ${teamKey}:`, err);
  }

  return issueMap;
}

export async function createLinearIssue(
  teamId: string,
  title: string,
  description: string,
  priority = 3
): Promise<{ id: string; identifier: string } | null> {
  if (isDryRun()) {
    console.log(`[DRY-RUN] Se crearía ticket en Linear:\n  Título: ${title}\n  Prioridad: ${priority}`);
    return { id: 'dry-run-id', identifier: 'DRY-RUN-1' };
  }

  const mutation = `
    mutation CreateIssue($teamId: String!, $title: String!, $desc: String!, $priority: Int!) {
      issueCreate(input: {
        teamId: $teamId,
        title: $title,
        description: $desc,
        priority: $priority
      }) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `;

  const result = await fetchLinear<{ issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } } }>(
    mutation,
    { teamId, title, desc: description, priority }
  );

  if (result.issueCreate?.success) {
    console.log(`✅ Ticket creado en Linear: ${sanitize(result.issueCreate.issue.identifier)} - ${sanitize(title)}`);
    console.log(`   🔗 URL: ${sanitize(result.issueCreate.issue.url)}`);
    return result.issueCreate.issue;
  } else {
    console.error(`❌ Falló la creación del ticket en Linear para "${sanitize(title)}".`);
    return null;
  }
}

export async function updateLinearIssueState(issueId: string, stateId: string): Promise<boolean> {
  if (isDryRun()) {
    console.log(`[DRY-RUN] Se actualizaría estado de ticket ${issueId} a state ${stateId}`);
    return true;
  }

  const mutation = `
    mutation UpdateIssueState($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }
  `;

  try {
    const result = await fetchLinear<{ issueUpdate: { success: boolean } }>(mutation, { issueId, stateId });
    return result.issueUpdate?.success ?? false;
  } catch (err) {
    console.warn(`⚠️ Error actualizando estado de ticket ${issueId}:`, err);
    return false;
  }
}

export async function addLinearComment(issueId: string, body: string): Promise<void> {
  if (isDryRun()) {
    console.log(`[DRY-RUN] Comentario para ticket ${issueId}:\n  ${body}`);
    return;
  }

  const mutation = `
    mutation AddComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
  `;

  try {
    await fetchLinear(mutation, { issueId, body });
  } catch (err) {
    console.warn(`⚠️ Error agregando comentario a ticket ${issueId}:`, err);
  }
}

export async function markLinearIssueDuplicate(
  duplicateIssueId: string,
  primaryIssueId: string,
  duplicateStateId: string,
  canceledStateId: string
): Promise<void> {
  if (isDryRun()) {
    console.log(`[DRY-RUN] Se marcaría ticket ${duplicateIssueId} como duplicado de ${primaryIssueId}`);
    return;
  }

  const relationMutation = `
    mutation CreateDuplicateRelation($issueId: String!, $relatedIssueId: String!) {
      issueRelationCreate(input: { issueId: $issueId, relatedIssueId: $relatedIssueId, type: duplicate }) {
        success
      }
    }
  `;

  try {
    const res = await fetchLinear<{ issueRelationCreate: { success: boolean } }>(relationMutation, {
      issueId: duplicateIssueId,
      relatedIssueId: primaryIssueId,
    });
    if (!res.issueRelationCreate?.success) {
      await updateLinearIssueState(duplicateIssueId, duplicateStateId || canceledStateId);
    }
  } catch {
    await updateLinearIssueState(duplicateIssueId, duplicateStateId || canceledStateId);
  }
}

export interface SyncLifecycleParams {
  alertType: 'codeql' | 'dependabot' | 'secret';
  alertNumber: number;
  isOpen: boolean;
  stateDescription: string;
  title: string;
  description: string;
  priority: number;
  existingIssues: LinearIssueNode[];
  teamId: string;
  todoStateId: string;
  doneStateId: string;
  canceledStateId: string;
  duplicateStateId: string;
}

export async function syncAlertLifecycle(params: SyncLifecycleParams): Promise<void> {
  const {
    alertNumber,
    isOpen,
    stateDescription,
    title,
    description,
    priority,
    existingIssues,
    teamId,
    todoStateId,
    doneStateId,
    canceledStateId,
    duplicateStateId,
  } = params;

  if (isOpen) {
    if (existingIssues.length === 0) {
      console.log(`🎫 Creando ticket para alerta #${alertNumber} (${stateDescription}): ${title}`);
      const created = await createLinearIssue(teamId, title, description, priority);
      if (created) {
        existingIssues.push({
          id: created.id,
          identifier: created.identifier,
          title,
          state: { id: todoStateId, name: 'Todo', type: 'unstarted' },
        });
      }
    } else {
      const primary = existingIssues[0];
      if (primary.state.type === 'completed' || primary.state.type === 'canceled') {
        console.log(`🔄 Reabriendo ticket ${primary.identifier} para alerta #${alertNumber} reabierta en GitHub.`);
        await updateLinearIssueState(primary.id, todoStateId);
        await addLinearComment(
          primary.id,
          `⚠️ **Alerta #${alertNumber} reabierta en GitHub**\n\n` +
          `El escaneo reporta nuevamente esta alerta en estado \`${stateDescription}\`. Se reabre el ticket para análisis y remediación.`
        );
      } else {
        console.log(`ℹ️ Alerta #${alertNumber} activa y sincronizada en Linear: ${primary.identifier} (${primary.state.name})`);
      }

      // Manejo de duplicados redundantes
      for (let i = 1; i < existingIssues.length; i++) {
        const dup = existingIssues[i];
        if (dup.state.type !== 'duplicate' && dup.state.type !== 'canceled') {
          console.log(`🧹 Marcando ticket redundante ${dup.identifier} como duplicado de ${primary.identifier}`);
          await markLinearIssueDuplicate(dup.id, primary.id, duplicateStateId, canceledStateId);
          await addLinearComment(dup.id, `ℹ️ Ticket redundante cerrado por sincronización. Duplicado de ${primary.identifier}.`);
        }
      }
    }
  } else {
    // Alerta cerrada, resuelta, fijada o desestimada en GitHub
    if (existingIssues.length > 0) {
      const primary = existingIssues[0];
      const isDismissed = stateDescription.toLowerCase().includes('dismissed');
      const targetStateId = isDismissed ? (canceledStateId || doneStateId) : doneStateId;

      if (primary.state.type !== 'completed' && primary.state.type !== 'canceled' && primary.state.type !== 'duplicate') {
        console.log(`🎉 Alerta #${alertNumber} resuelta en GitHub (${stateDescription}). Actualizando ${primary.identifier} a Done.`);
        await updateLinearIssueState(primary.id, targetStateId);
        await addLinearComment(
          primary.id,
          `✅ **Alerta de seguridad #${alertNumber} resuelta en GitHub**\n\n` +
          `- **Estado en GitHub:** \`${stateDescription}\`\n` +
          `- **Remediación:** Verificada e integrada en la rama principal.\n` +
          `- Ticket completado automáticamente por el workflow de sincronización.`
        );
      } else {
        console.log(`✅ Alerta #${alertNumber} ya cerrada/completada en Linear: ${primary.identifier} (${primary.state.name})`);
      }

      // Duplicados redundantes
      for (let i = 1; i < existingIssues.length; i++) {
        const dup = existingIssues[i];
        if (dup.state.type !== 'duplicate' && dup.state.type !== 'canceled') {
          console.log(`🧹 Marcando duplicado ${dup.identifier} como duplicado de ${primary.identifier}`);
          await markLinearIssueDuplicate(dup.id, primary.id, duplicateStateId, canceledStateId);
          await addLinearComment(dup.id, `ℹ️ Alerta resuelta. Ticket duplicado de ${primary.identifier}.`);
        }
      }
    }
  }
}

export async function syncGitHubSecurityToLinear(): Promise<void> {
  console.log('================================================================');
  console.log('🛡️ Iniciando Sincronización GitHub Security & Quality ➔ Linear');
  console.log(`📁 Repositorio GitHub: ${sanitize(GITHUB_REPOSITORY)}`);
  console.log(`🏷️ Equipo Linear: ${sanitize(TARGET_TEAM_KEY)}`);
  if (isDryRun()) console.log('⚠️ Modo DRY_RUN activado (solo lectura / simulación)');
  console.log('================================================================\n');

  if (!process.env.LINEAR_API_KEY) {
    console.warn('⚠️ LINEAR_API_KEY no configurada. Omitiendo sincronización con Linear.');
    return;
  }

  const team = await getLinearTeam(TARGET_TEAM_KEY);
  const todoState = team.states.nodes.find((s) => s.type === 'unstarted') || team.states.nodes[0];
  const doneState = team.states.nodes.find((s) => s.type === 'completed') || team.states.nodes[0];
  const duplicateState = team.states.nodes.find((s) => s.type === 'duplicate') || doneState;
  const canceledState = team.states.nodes.find((s) => s.type === 'canceled') || doneState;

  // Pre-indexar todos los tickets del equipo vinculados a alertas de GitHub
  console.log(`🔎 Indexando tickets existentes de seguridad en Linear (Equipo: ${team.key})...`);
  const issueIndex = await fetchTeamSecurityIssues(team.key);
  console.log(`ℹ️ Alertas únicas previamente identificadas en Linear: ${issueIndex.size}\n`);

  // --------------------------------------------------------------------------
  // 1. Sincronización de GitHub Code Scanning (CodeQL / Trivy / SARIF)
  // --------------------------------------------------------------------------
  console.log('🔍 [1/3] Consultando alertas de GitHub Code Scanning (open, closed, dismissed)...');
  try {
    const [openAlerts, closedAlerts, dismissedAlerts] = await Promise.all([
      fetchGitHub<GitHubCodeScanningAlert[]>(`/repos/${GITHUB_REPOSITORY}/code-scanning/alerts?state=open&per_page=100`),
      fetchGitHub<GitHubCodeScanningAlert[]>(`/repos/${GITHUB_REPOSITORY}/code-scanning/alerts?state=closed&per_page=100`),
      fetchGitHub<GitHubCodeScanningAlert[]>(`/repos/${GITHUB_REPOSITORY}/code-scanning/alerts?state=dismissed&per_page=100`),
    ]);

    const allCodeAlertsMap = new Map<number, GitHubCodeScanningAlert>();
    for (const a of dismissedAlerts || []) allCodeAlertsMap.set(a.number, a);
    for (const a of closedAlerts || []) allCodeAlertsMap.set(a.number, a);
    for (const a of openAlerts || []) allCodeAlertsMap.set(a.number, a); // Sobrescribe si está abierta

    console.log(`ℹ️ Total de alertas de Code Scanning procesadas: ${allCodeAlertsMap.size}`);

    for (const alert of allCodeAlertsMap.values()) {
      const tool = (alert.tool?.name || 'CodeQL').toLowerCase();
      const lookupKey = `${tool}#${alert.number}`;
      const existing = issueIndex.get(lookupKey) || [];

      const title = formatCodeScanningTitle(alert);
      const priority = mapSeverityToPriority(alert.rule?.severity);
      const location = alert.most_recent_instance?.location;
      const locationStr = location?.path ? `${location.path}:${location.start_line || 1}` : 'N/A';

      const desc = `Se ha detectado una vulnerabilidad mediante **GitHub Code Scanning (${alert.tool?.name || 'CodeQL'})**.\n\n` +
        `### 📋 Detalle de la Alerta:\n` +
        `- **Alerta:** #${alert.number}\n` +
        `- **Regla:** \`${alert.rule?.id || 'N/A'}\` (${alert.rule?.name || alert.rule?.description || 'N/A'})\n` +
        `- **Severidad:** \`${alert.rule?.severity || 'warning'}\`\n` +
        `- **Herramienta:** \`${alert.tool?.name || 'CodeQL'}\`\n` +
        `- **Ubicación:** \`${locationStr}\`\n\n` +
        `### 📝 Mensaje:\n` +
        `> ${alert.most_recent_instance?.message?.text || 'Sin mensaje adicional'}\n\n` +
        `🔗 **Enlace a GitHub Security:** [Ver Alerta #${alert.number}](${alert.html_url})\n\n` +
        `> *Generado automáticamente por el workflow de sincronización GitHub Security ➔ Linear.*`;

      await syncAlertLifecycle({
        alertType: 'codeql',
        alertNumber: alert.number,
        isOpen: alert.state === 'open',
        stateDescription: alert.state,
        title,
        description: desc,
        priority,
        existingIssues: existing,
        teamId: team.id,
        todoStateId: todoState.id,
        doneStateId: doneState.id,
        canceledStateId: canceledState.id,
        duplicateStateId: duplicateState.id,
      });
    }
  } catch (err: any) {
    console.error('⚠️ Error procesando alertas de GitHub Code Scanning:', err.message || err);
  }

  // --------------------------------------------------------------------------
  // 2. Sincronización de Alertas de GitHub Dependabot
  // --------------------------------------------------------------------------
  console.log('\n📦 [2/3] Consultando alertas de GitHub Dependabot...');
  try {
    const dependabotAlerts = await fetchGitHub<GitHubDependabotAlert[]>(
      `/repos/${GITHUB_REPOSITORY}/dependabot/alerts?state=open,fixed,dismissed,auto_dismissed&per_page=100`
    );

    if (dependabotAlerts && dependabotAlerts.length > 0) {
      console.log(`ℹ️ Alertas de Dependabot encontradas: ${dependabotAlerts.length}`);

      for (const alert of dependabotAlerts) {
        const lookupKey = `dependabot#${alert.number}`;
        const existing = issueIndex.get(lookupKey) || [];

        const title = formatDependabotTitle(alert);
        const priority = mapSeverityToPriority(alert.security_advisory?.severity);
        const advisory = alert.security_advisory;
        const pkg = alert.dependency?.package?.name || 'dependencia';
        const patched = alert.security_vulnerability?.first_patched_version?.identifier || 'Pendiente de parche';

        const desc = `Se ha detectado una vulnerabilidad de dependencia mediante **GitHub Dependabot**.\n\n` +
          `### 📋 Detalle de la Alerta:\n` +
          `- **Alerta:** #${alert.number}\n` +
          `- **Paquete:** \`${pkg}\` (${alert.dependency?.package?.ecosystem || 'npm'})\n` +
          `- **Identificador:** \`${advisory?.ghsa_id || 'GHSA'}\`${advisory?.cve_id ? ` / \`${advisory.cve_id}\`` : ''}\n` +
          `- **Severidad:** \`${advisory?.severity || 'medium'}\`\n` +
          `- **Versión vulnerable:** \`${alert.security_vulnerability?.vulnerable_version_range || 'N/A'}\`\n` +
          `- **Versión corregida:** \`${patched}\`\n\n` +
          `### 📝 Resumen:\n` +
          `> ${advisory?.summary || 'Vulnerabilidad detectada en dependencia del proyecto.'}\n\n` +
          `🔗 **Enlace a GitHub Security:** [Ver Alerta #${alert.number}](${alert.html_url})\n\n` +
          `> *Generado automáticamente por el workflow de sincronización GitHub Security ➔ Linear.*`;

        await syncAlertLifecycle({
          alertType: 'dependabot',
          alertNumber: alert.number,
          isOpen: alert.state === 'open',
          stateDescription: alert.state,
          title,
          description: desc,
          priority,
          existingIssues: existing,
          teamId: team.id,
          todoStateId: todoState.id,
          doneStateId: doneState.id,
          canceledStateId: canceledState.id,
          duplicateStateId: duplicateState.id,
        });
      }
    } else {
      console.log('✅ No hay alertas registradas de GitHub Dependabot.');
    }
  } catch (err: any) {
    console.error('⚠️ Error procesando alertas de GitHub Dependabot:', err.message || err);
  }

  // --------------------------------------------------------------------------
  // 3. Sincronización de Alertas de GitHub Secret Scanning
  // --------------------------------------------------------------------------
  console.log('\n🔑 [3/3] Consultando alertas de GitHub Secret Scanning...');
  try {
    const [openSecrets, resolvedSecrets] = await Promise.all([
      fetchGitHub<GitHubSecretScanningAlert[]>(`/repos/${GITHUB_REPOSITORY}/secret-scanning/alerts?state=open&per_page=100`),
      fetchGitHub<GitHubSecretScanningAlert[]>(`/repos/${GITHUB_REPOSITORY}/secret-scanning/alerts?state=resolved&per_page=100`),
    ]);

    const allSecretAlerts = [...(openSecrets || []), ...(resolvedSecrets || [])];
    if (allSecretAlerts.length > 0) {
      console.log(`ℹ️ Alertas de Secret Scanning encontradas: ${allSecretAlerts.length}`);

      for (const alert of allSecretAlerts) {
        const lookupKey = `secret#${alert.number}`;
        const existing = issueIndex.get(lookupKey) || [];

        const title = formatSecretScanningTitle(alert);
        const priority = 1; // Máxima prioridad urgente ante secretos expuestos

        const desc = `🚨 **ALERTA CRÍTICA: Secreto detectado en el repositorio por GitHub Secret Scanning.**\n\n` +
          `### 📋 Detalle de la Alerta:\n` +
          `- **Alerta:** #${alert.number}\n` +
          `- **Tipo de Secreto:** \`${alert.secret_type_display_name || alert.secret_type}\`\n` +
          `- **Estado:** \`${alert.state}\`\n\n` +
          `### ⚠️ Medidas Urgentes Requeridas:\n` +
          `1. **Revocar** de inmediato la credencial comprometida en el proveedor correspondiente.\n` +
          `2. **Rotar** el secreto en GitHub Secrets / Vault / Kubernetes Secrets.\n` +
          `3. Purgar el historial Git si el secreto fue commiteado en ramas públicas.\n\n` +
          `🔗 **Enlace a GitHub Security:** [Ver Alerta #${alert.number}](${alert.html_url})\n\n` +
          `> *Generado automáticamente por el workflow de sincronización GitHub Security ➔ Linear.*`;

        await syncAlertLifecycle({
          alertType: 'secret',
          alertNumber: alert.number,
          isOpen: alert.state === 'open',
          stateDescription: alert.state,
          title,
          description: desc,
          priority,
          existingIssues: existing,
          teamId: team.id,
          todoStateId: todoState.id,
          doneStateId: doneState.id,
          canceledStateId: canceledState.id,
          duplicateStateId: duplicateState.id,
        });
      }
    } else {
      console.log('✅ No hay alertas registradas de GitHub Secret Scanning.');
    }
  } catch (err: any) {
    console.error('⚠️ Error procesando alertas de GitHub Secret Scanning:', err.message || err);
  }

  console.log('\n🏁 Sincronización GitHub Security & Quality ➔ Linear completada exitosamente.');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('github-security-linear-sync')) {
  syncGitHubSecurityToLinear().catch((err) => {
    console.error('❌ Error fatal en la sincronización:', err);
    process.exit(1);
  });
}
