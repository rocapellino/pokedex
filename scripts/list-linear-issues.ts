/**
 * ==============================================================================
 * scripts/list-linear-issues.ts
 * Consulta y Listado de Tickets en Linear para el Equipo Objetivo
 * ==============================================================================
 *
 * Variables de entorno:
 *   - LINEAR_API_KEY  (Requerido: API Key de Linear)
 *   - LINEAR_TEAM_KEY (Opcional: por defecto 'PEX')
 *   - GITHUB_STEP_SUMMARY (Opcional: ruta para reporte en GitHub Actions)
 */

import * as fs from 'node:fs';

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
const TARGET_TEAM_KEY = process.env.LINEAR_TEAM_KEY || 'PEX';

interface LinearState {
  id: string;
  name: string;
  type: string;
}

interface LinearTeamNode {
  id: string;
  key: string;
  name: string;
  states?: {
    nodes: LinearState[];
  };
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  priorityLabel?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  state?: {
    name: string;
    type: string;
  };
  assignee?: {
    name?: string;
    displayName?: string;
  };
  labels?: {
    nodes: Array<{ name: string }>;
  };
}

async function fetchLinear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: LINEAR_API_KEY,
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

async function main(): Promise<void> {
  console.log('======================================================');
  console.log('📋 Consulta de Tickets en Linear');
  console.log(`🏷️ Equipo objetivo: ${TARGET_TEAM_KEY}`);
  console.log('======================================================');

  if (!LINEAR_API_KEY) {
    console.error('❌ Error: LINEAR_API_KEY no está definida.');
    process.exit(1);
  }

  // 1. Obtener equipos
  const teamsQuery = `
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

  const teamsData = await fetchLinear<{ teams: { nodes: LinearTeamNode[] } }>(teamsQuery);
  const matched = teamsData.teams.nodes.find((t) => t.key.toUpperCase() === TARGET_TEAM_KEY.toUpperCase());
  const selectedTeam = matched || teamsData.teams.nodes[0];

  if (!selectedTeam) {
    console.error(`❌ No se encontró ningún equipo en Linear (buscado: ${TARGET_TEAM_KEY}).`);
    process.exit(1);
  }

  console.log(`✅ Equipo seleccionado: ${selectedTeam.name} (${selectedTeam.key}) [ID: ${selectedTeam.id}]`);

  // 2. Consultar tickets abiertos
  const issuesQuery = `
    query GetTeamIssues($teamId: String!) {
      team(id: $teamId) {
        issues(first: 250, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
          nodes {
            id
            identifier
            title
            priority
            priorityLabel
            url
            createdAt
            updatedAt
            state {
              name
              type
            }
            assignee {
              name
            }
            labels {
              nodes {
                name
              }
            }
          }
        }
      }
    }
  `;

  const issuesData = await fetchLinear<{ team: { issues: { nodes: LinearIssueNode[] } } }>(issuesQuery, {
    teamId: selectedTeam.id,
  });

  const openIssues = issuesData.team?.issues?.nodes || [];
  console.log(`\n📊 Total de tickets abiertos en el equipo ${selectedTeam.key}: ${openIssues.length}`);

  let summaryMarkdown = `## 📋 Tickets Abiertos en Linear (${selectedTeam.name} - ${selectedTeam.key})\n\n`;
  summaryMarkdown += `**Total de tickets abiertos:** ${openIssues.length}\n\n`;

  if (openIssues.length === 0) {
    console.log('🎉 No hay tickets abiertos pendientes en este equipo.');
    summaryMarkdown += '🎉 *No hay tickets abiertos pendientes en este equipo.*\n';
  } else {
    summaryMarkdown += '| ID | Título | Estado | Prioridad | Asignado | Etiquetas | URL |\n';
    summaryMarkdown += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

    for (const issue of openIssues) {
      const stateName = issue.state?.name || 'Desconocido';
      const assigneeName = issue.assignee?.name || 'Sin asignar';
      const labels = (issue.labels?.nodes || []).map((l) => l.name).join(', ') || '-';
      const priority = issue.priorityLabel || `P${issue.priority}`;

      console.log(`\n• [${issue.identifier}] ${issue.title}`);
      console.log(`  Estado: ${stateName} (${issue.state?.type}) | Prioridad: ${priority} | Asignado: ${assigneeName}`);
      console.log(`  Etiquetas: ${labels}`);
      console.log(`  URL: ${issue.url}`);

      summaryMarkdown += `| [${issue.identifier}](${issue.url}) | ${issue.title.replace(/\|/g, '\\|')} | \`${stateName}\` | ${priority} | ${assigneeName} | ${labels} | [Link](${issue.url}) |\n`;
    }
  }

  // 3. Escribir a GITHUB_STEP_SUMMARY si está disponible
  const stepSummaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryFile) {
    try {
      fs.appendFileSync(stepSummaryFile, summaryMarkdown, 'utf-8');
      console.log('\n📝 Resumen añadido a GITHUB_STEP_SUMMARY.');
    } catch (err) {
      console.warn('⚠️ No se pudo escribir en GITHUB_STEP_SUMMARY:', err);
    }
  }

  console.log('\n🏁 Consulta finalizada con éxito.');
}

main().catch((err) => {
  console.error('💥 Error inesperado durante la consulta de Linear:', err);
  process.exit(1);
});

