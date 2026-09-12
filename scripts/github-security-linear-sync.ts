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
  secret_type: string;
  secret_type_display_name: string;
  resolution?: string | null;
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
const TARGET_TEAM_KEY = process.env.LINEAR_TEAM_KEY || 'PEX';
const IS_DRY_RUN = process.env.DRY_RUN === 'true';

export async function fetchLinear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': LINEAR_API_KEY,
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
  if (IS_DRY_RUN && (!LINEAR_API_KEY || LINEAR_API_KEY === 'test_dummy_key')) {
    return {
      id: 'mock-team-id',
      key: teamKey,
      name: 'Mock Team',
      states: {
        nodes: [
          { id: 'state-todo', name: 'Todo', type: 'unstarted' },
          { id: 'state-done', name: 'Done', type: 'completed' },
          { id: 'state-canceled', name: 'Canceled', type: 'canceled' },
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

export async function findExistingLinearIssue(searchTerm: string): Promise<LinearIssueNode | null> {
  if (IS_DRY_RUN && (!LINEAR_API_KEY || LINEAR_API_KEY === 'test_dummy_key')) {
    return null;
  }

  const query = `
    query SearchIssues($term: String!) {
      issueSearch(query: $term, first: 10) {
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
  `;

  try {
    const data = await fetchLinear<{ issueSearch: { nodes: LinearIssueNode[] } }>(query, { term: searchTerm });
    const match = data.issueSearch.nodes.find((issue) => issue.title.includes(searchTerm));
    return match || null;
  } catch (err) {
    console.warn(`⚠️ Error al buscar duplicados en Linear para "${searchTerm}":`, err);
    return null;
  }
}

export async function createLinearIssue(
  teamId: string,
  title: string,
  description: string,
  priority = 3
): Promise<void> {
  if (IS_DRY_RUN) {
    console.log(`[DRY-RUN] Se crearía ticket en Linear:\n  Título: ${title}\n  Prioridad: ${priority}`);
    return;
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

  const result = await fetchLinear<{ issueCreate: { success: boolean; issue: { identifier: string; url: string } } }>(
    mutation,
    { teamId, title, desc: description, priority }
  );

  if (result.issueCreate?.success) {
    console.log(`✅ Ticket creado en Linear: ${sanitize(result.issueCreate.issue.identifier)} - ${sanitize(title)}`);
    console.log(`   🔗 URL: ${sanitize(result.issueCreate.issue.url)}`);
  } else {
    console.error(`❌ Falló la creación del ticket en Linear para "${sanitize(title)}".`);
  }
}

export async function resolveLinearIssue(issueId: string, identifier: string, doneStateId: string): Promise<void> {
  if (IS_DRY_RUN) {
    console.log(`[DRY-RUN] Se marcaría ticket ${identifier} como completado en Linear.`);
    return;
  }

  const mutation = `
    mutation UpdateIssue($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }
  `;

  const result = await fetchLinear<{ issueUpdate: { success: boolean } }>(mutation, {
    issueId,
    stateId: doneStateId,
  });

  if (result.issueUpdate?.success) {
    console.log(`🎉 Ticket ${identifier} actualizado a estado completado en Linear (alerta resuelta en GitHub).`);
  }
}

export async function syncGitHubSecurityToLinear(): Promise<void> {
  console.log('================================================================');
  console.log('🛡️ Iniciando Sincronización GitHub Security & Quality ➔ Linear');
  console.log(`📁 Repositorio GitHub: ${sanitize(GITHUB_REPOSITORY)}`);
  console.log(`🏷️ Equipo Linear: ${sanitize(TARGET_TEAM_KEY)}`);
  if (IS_DRY_RUN) console.log('⚠️ Modo DRY_RUN activado (solo lectura / simulación)');
  console.log('================================================================\n');

  if (!LINEAR_API_KEY) {
    console.warn('⚠️ LINEAR_API_KEY no configurada. Omitiendo sincronización con Linear.');
    return;
  }

  const team = await getLinearTeam(TARGET_TEAM_KEY);
  const doneState = team.states.nodes.find((s) => s.type === 'completed') || team.states.nodes[0];

  // --------------------------------------------------------------------------
  // 1. Sincronización de Alertas de GitHub Code Scanning (CodeQL / Trivy / SARIF)
  // --------------------------------------------------------------------------
  console.log('🔍 [1/3] Consultando alertas de GitHub Code Scanning...');
  try {
    const codeScanningAlerts = await fetchGitHub<GitHubCodeScanningAlert[]>(
      `/repos/${GITHUB_REPOSITORY}/code-scanning/alerts?state=open&per_page=50`
    );

    if (codeScanningAlerts && codeScanningAlerts.length > 0) {
      console.log(`ℹ️ Alertas de Code Scanning abiertas encontradas: ${codeScanningAlerts.length}`);

      for (const alert of codeScanningAlerts) {
        const titleSearchTerm = `[GitHub ${alert.tool?.name || 'CodeQL'} #${alert.number}]`;
        const existingIssue = await findExistingLinearIssue(titleSearchTerm);

        if (!existingIssue) {
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

          console.log(`🎫 Creando ticket para Code Scanning #${alert.number} (${alert.rule?.severity}): ${title}`);
          await createLinearIssue(team.id, title, desc, priority);
        } else {
          console.log(`ℹ️ Alerta Code Scanning #${alert.number} ya sincronizada: ${existingIssue.identifier}`);
        }
      }
    } else {
      console.log('✅ No hay alertas abiertas de GitHub Code Scanning.');
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
      `/repos/${GITHUB_REPOSITORY}/dependabot/alerts?state=open&per_page=50`
    );

    if (dependabotAlerts && dependabotAlerts.length > 0) {
      console.log(`ℹ️ Alertas de Dependabot abiertas encontradas: ${dependabotAlerts.length}`);

      for (const alert of dependabotAlerts) {
        const titleSearchTerm = `[GitHub Dependabot #${alert.number}]`;
        const existingIssue = await findExistingLinearIssue(titleSearchTerm);

        if (!existingIssue) {
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

          console.log(`🎫 Creando ticket para Dependabot #${alert.number} (${advisory?.severity}): ${title}`);
          await createLinearIssue(team.id, title, desc, priority);
        } else {
          console.log(`ℹ️ Alerta Dependabot #${alert.number} ya sincronizada: ${existingIssue.identifier}`);
        }
      }
    } else {
      console.log('✅ No hay alertas abiertas de GitHub Dependabot.');
    }
  } catch (err: any) {
    console.error('⚠️ Error procesando alertas de GitHub Dependabot:', err.message || err);
  }

  // --------------------------------------------------------------------------
  // 3. Sincronización de Alertas de GitHub Secret Scanning
  // --------------------------------------------------------------------------
  console.log('\n🔑 [3/3] Consultando alertas de GitHub Secret Scanning...');
  try {
    const secretAlerts = await fetchGitHub<GitHubSecretScanningAlert[]>(
      `/repos/${GITHUB_REPOSITORY}/secret-scanning/alerts?state=open&per_page=50`
    );

    if (secretAlerts && secretAlerts.length > 0) {
      console.log(`ℹ️ Alertas de Secret Scanning abiertas encontradas: ${secretAlerts.length}`);

      for (const alert of secretAlerts) {
        const titleSearchTerm = `[GitHub Secret #${alert.number}]`;
        const existingIssue = await findExistingLinearIssue(titleSearchTerm);

        if (!existingIssue) {
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

          console.log(`🎫 Creando ticket urgente para Secret Scanning #${alert.number}: ${title}`);
          await createLinearIssue(team.id, title, desc, priority);
        } else {
          console.log(`ℹ️ Alerta Secret Scanning #${alert.number} ya sincronizada: ${existingIssue.identifier}`);
        }
      }
    } else {
      console.log('✅ No hay alertas abiertas de GitHub Secret Scanning.');
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
