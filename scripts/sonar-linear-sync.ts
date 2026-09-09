/**
 * ==============================================================================
 * scripts/sonar-linear-sync.ts
 * Sincronización Automática entre SonarCloud / SonarQube y Linear
 * ==============================================================================
 * 
 * Consulta el estado del Quality Gate y las incidencias (Bugs / Vulnerabilidades)
 * en SonarCloud y crea tickets correlativos en Linear evitando duplicaciones.
 *
 * Variables de entorno soportadas:
 *   - LINEAR_API_KEY      (Requerido: API Key de Linear)
 *   - SONAR_TOKEN         (Opcional: Token de SonarCloud para consultas autenticadas)
 *   - SONAR_PROJECT_KEY   (Opcional: por defecto 'rocapellino_pokedex')
 *   - LINEAR_TEAM_KEY     (Opcional: por defecto 'PER')
 *   - DRY_RUN             (Opcional: 'true' para simular sin crear tickets)
 */

interface SonarCondition {
  status: string;
  metricKey: string;
  comparator?: string;
  errorThreshold?: string;
  actualValue?: string;
}

interface SonarProjectStatus {
  projectStatus: {
    status: 'OK' | 'ERROR';
    conditions?: SonarCondition[];
  };
}

interface SonarIssue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  message: string;
  type: string;
  effort?: string;
}

interface SonarIssuesResponse {
  total: number;
  issues: SonarIssue[];
}

interface LinearTeamNode {
  id: string;
  key: string;
  name: string;
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  state: {
    name: string;
    type: string;
  };
}

function sanitize(input: unknown): string {
  return String(input ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 120);
}

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const SONAR_API_BASE = 'https://sonarcloud.io/api';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
const SONAR_TOKEN = process.env.SONAR_TOKEN || '';
const SONAR_PROJECT_KEY = process.env.SONAR_PROJECT_KEY || 'rocapellino_pokedex';
const TARGET_TEAM_KEY = process.env.LINEAR_TEAM_KEY || 'PER';
const IS_DRY_RUN = process.env.DRY_RUN === 'true';

async function fetchLinear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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

  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Linear GraphQL Error: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

async function fetchSonar<T>(endpoint: string): Promise<T> {
  const url = `${SONAR_API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (SONAR_TOKEN) {
    headers['Authorization'] = `Bearer ${SONAR_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`SonarCloud API HTTP Error ${response.status} en ${url}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

async function getLinearTeamId(teamKey: string): Promise<string> {
  if (IS_DRY_RUN && (!LINEAR_API_KEY || LINEAR_API_KEY === 'test_dummy_key')) {
    console.log(`[DRY-RUN] Usando mock de equipo Linear: ${teamKey} (mock-team-id)`);
    return 'mock-team-id';
  }

  const query = `
    query GetTeams {
      teams {
        nodes {
          id
          key
          name
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

  console.log(`📌 Equipo Linear seleccionado: ${sanitize(selected.name)} (${sanitize(selected.key)}) - ID: ${sanitize(selected.id)}`);
  return selected.id;
}

async function isIssueAlreadyOpenInLinear(searchTerm: string): Promise<boolean> {
  if (IS_DRY_RUN && (!LINEAR_API_KEY || LINEAR_API_KEY === 'test_dummy_key')) {
    return false;
  }

  const query = `
    query SearchIssues($term: String!) {
      issueSearch(query: $term, first: 10) {
        nodes {
          id
          identifier
          title
          state {
            name
            type
          }
        }
      }
    }
  `;

  try {
    const data = await fetchLinear<{ issueSearch: { nodes: LinearIssueNode[] } }>(query, { term: searchTerm });
    const matches = data.issueSearch.nodes.filter((issue) => {
      const isMatchingTitle = issue.title.includes(searchTerm);
      const isNotClosed = !['completed', 'canceled'].includes(issue.state?.type?.toLowerCase() || '');
      return isMatchingTitle && isNotClosed;
    });

    if (matches.length > 0) {
      console.log(`ℹ️ Ya existe un ticket abierto en Linear para "${searchTerm}": ${matches[0].identifier} (${matches[0].title})`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`⚠️ Error al buscar duplicados en Linear para "${searchTerm}":`, err);
    return false;
  }
}

async function createLinearIssue(teamId: string, title: string, description: string, priority = 2): Promise<void> {
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
    console.log(`✅ Ticket creado exitosamente en Linear: ${sanitize(result.issueCreate.issue.identifier)}`);
    console.log(`   🔗 URL: ${sanitize(result.issueCreate.issue.url)}`);
  } else {
    console.error(`❌ Falló la creación del ticket en Linear para "${sanitize(title)}".`);
  }
}

export async function syncSonarToLinear(): Promise<void> {
  console.log('======================================================');
  console.log('🚀 Iniciando Sincronización SonarCloud ➔ Linear');
  console.log(`📁 Proyecto SonarCloud: ${sanitize(SONAR_PROJECT_KEY)}`);
  console.log(`🏷️ Equipo Linear Objetivo: ${sanitize(TARGET_TEAM_KEY)}`);
  if (IS_DRY_RUN) console.log('⚠️ Modo DRY_RUN activado (solo lectura)');
  console.log('======================================================');

  if (!LINEAR_API_KEY) {
    console.warn('⚠️ LINEAR_API_KEY no encontrada en las variables de entorno. Omitiendo sincronización.');
    return;
  }

  const teamId = await getLinearTeamId(TARGET_TEAM_KEY);

  // 1. Verificar Estado del Quality Gate
  console.log('\n📊 Consultando Quality Gate en SonarCloud...');
  let qualityGateFailed = false;
  try {
    const qgData = await fetchSonar<SonarProjectStatus>(
      `/qualitygates/project_status?projectKey=${encodeURIComponent(SONAR_PROJECT_KEY)}`
    );

    const qgStatus = qgData.projectStatus.status;
    console.log(`Quality Gate Status: ${sanitize(qgStatus)}`);

    if (qgStatus === 'ERROR') {
      qualityGateFailed = true;
      const failedConditions = (qgData.projectStatus.conditions || []).filter((c) => c.status === 'ERROR');

      const title = `[SonarCloud] Quality Gate Fallido en Pokédex`;
      const alreadyExists = await isIssueAlreadyOpenInLinear(title);

      if (!alreadyExists) {
        let conditionList = '';
        failedConditions.forEach((c) => {
          conditionList += `- **${c.metricKey}**: Valor actual \`${c.actualValue}\` (Límite: \`${c.errorThreshold}\`)\n`;
        });

        const desc = `El Quality Gate de SonarCloud ha fallado en la rama principal.\n\n` +
          `### ❌ Condiciones no cumplidas:\n${conditionList || '- Sin detalles adicionales'}\n\n` +
          `🔗 **Panel de SonarCloud:** [Ver Proyecto](https://sonarcloud.io/dashboard?id=${encodeURIComponent(SONAR_PROJECT_KEY)})\n\n` +
          `> *Acción requerida:* Resolver las condiciones que bloquean el estándar de calidad antes del próximo release.`;

        console.log(`🎫 Creando ticket para Quality Gate fallido en Linear...`);
        await createLinearIssue(teamId, title, desc, 1); // Prioridad Urgente (1)
      }
    } else {
      console.log('✅ Quality Gate aprobado (OK).');
    }
  } catch (err) {
    console.error('⚠️ No se pudo obtener el estado del Quality Gate:', err);
  }

  // 2. Consultar Bugs y Vulnerabilidades críticas no resueltas
  console.log('\n🔍 Consultando Bugs y Vulnerabilidades activas en SonarCloud...');
  try {
    const issuesData = await fetchSonar<SonarIssuesResponse>(
      `/issues/search?projectKeys=${encodeURIComponent(SONAR_PROJECT_KEY)}&resolved=false&types=VULNERABILITY,BUG&ps=10`
    );

    console.log(`Total de incidencias activas detectadas: ${sanitize(issuesData.total)}`);

    for (const issue of issuesData.issues || []) {
      const searchKey = `[SonarCloud] ${issue.type}: ${issue.message.substring(0, 60)}`;
      const alreadyExists = await isIssueAlreadyOpenInLinear(searchKey);

      if (!alreadyExists) {
        const title = `[SonarCloud] ${issue.type}: ${issue.message.substring(0, 80)}`;
        const priority = issue.severity === 'BLOCKER' ? 1 : issue.severity === 'CRITICAL' ? 2 : 3;

        const desc = `Se ha detectado una incidencia de tipo **${issue.type}** en SonarCloud.\n\n` +
          `### 📋 Detalle de la incidencia:\n` +
          `- **Regla:** \`${issue.rule}\`\n` +
          `- **Severidad:** \`${issue.severity}\`\n` +
          `- **Componente:** \`${issue.component}\`\n` +
          `- **Esfuerzo estimado:** \`${issue.effort || 'N/A'}\`\n\n` +
          `🔗 **Enlace directo a SonarCloud:** [Abrir Incidencia](https://sonarcloud.io/project/issues?id=${encodeURIComponent(SONAR_PROJECT_KEY)}&issues=${issue.key}&open=${issue.key})\n\n` +
          `> *Generado automáticamente por el workflow de integración SonarCloud ➔ Linear.*`;

        console.log(`🎫 Creando ticket para ${sanitize(issue.type)} (${sanitize(issue.severity)}): ${sanitize(title)}`);
        await createLinearIssue(teamId, title, desc, priority);
      }
    }
  } catch (err) {
    console.error('⚠️ Error consultando incidencias de SonarCloud:', err);
  }

  console.log('\n🏁 Sincronización SonarCloud ➔ Linear completada con éxito.');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('sonar-linear-sync')) {
  syncSonarToLinear().catch((err) => {
    console.error('❌ Error fatal en la sincronización:', err);
    process.exit(1);
  });
}
