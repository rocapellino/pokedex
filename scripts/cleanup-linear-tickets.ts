/**
 * ==============================================================================
 * scripts/cleanup-linear-tickets.ts
 * Limpieza y Cierre Masivo de Tickets Obsoletos / Duplicados en Linear
 * ==============================================================================
 *
 * Variables de entorno:
 *   - LINEAR_API_KEY      (Requerido: API Key de Linear)
 *   - LINEAR_TEAM_KEY     (Opcional: por defecto 'PEX')
 *   - DRY_RUN             (Opcional: 'true' para simular sin mutar tickets)
 *   - GITHUB_STEP_SUMMARY (Opcional: para reporte en GitHub Actions)
 */

import * as fs from 'node:fs';

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
const TARGET_TEAM_KEY = process.env.LINEAR_TEAM_KEY || 'PEX';
const IS_DRY_RUN = process.env.DRY_RUN === 'true';

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
  state?: {
    id: string;
    name: string;
    type: string;
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

async function updateIssueBatch(ids: [string, ...string[]], stateId: string): Promise<boolean> {
  if (IS_DRY_RUN) {
    console.log(`[DRY-RUN] Se actualizarían ${ids.length} tickets a stateId ${stateId}`);
    return true;
  }

  // Linear GraphQL soporta issueBatchUpdate
  const batchMutation = `
    mutation BatchUpdateIssues($ids: [String!]!, $stateId: String!) {
      issueBatchUpdate(ids: $ids, input: { stateId: $stateId }) {
        success
      }
    }
  `;

  try {
    const result = await fetchLinear<{ issueBatchUpdate: { success: boolean } }>(batchMutation, {
      ids,
      stateId,
    });
    return result.issueBatchUpdate?.success ?? false;
  } catch {
    // Si falla el batch, fallback a actualización individual
    console.warn(`⚠️ Batch update falló, aplicando actualización individual para ${ids.length} tickets...`);
    const singleMutation = `
      mutation UpdateSingleIssue($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
        }
      }
    `;
    let allOk = true;
    for (const id of ids) {
      try {
        const res = await fetchLinear<{ issueUpdate: { success: boolean } }>(singleMutation, { id, stateId });
        if (!res.issueUpdate?.success) allOk = false;
      } catch (e) {
        console.warn(`⚠️ Error actualizando ticket ${id}:`, e);
        allOk = false;
      }
    }
    return allOk;
  }
}

async function main(): Promise<void> {
  console.log('======================================================');
  console.log('🧹 Limpieza y Cierre Masivo de Tickets en Linear');
  console.log(`🏷️ Equipo objetivo: ${TARGET_TEAM_KEY}`);
  console.log(`⚠️ Modo DRY_RUN: ${IS_DRY_RUN}`);
  console.log('======================================================');

  if (!LINEAR_API_KEY) {
    console.error('❌ Error: LINEAR_API_KEY no está configurada.');
    process.exit(1);
  }

  // 1. Obtener equipo y sus estados
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

  const states = selectedTeam.states?.nodes || [];
  console.log(`✅ Equipo: ${selectedTeam.name} (${selectedTeam.key})`);
  console.log('📋 Estados disponibles en el equipo:');
  for (const s of states) {
    console.log(`   - ${s.name} (tipo: ${s.type}) [ID: ${s.id}]`);
  }

  const doneState = states.find((s) => s.type === 'completed') || states.find((s) => s.name.toLowerCase() === 'done');
  const canceledState =
    states.find((s) => s.type === 'canceled') ||
    states.find((s) => s.name.toLowerCase() === 'canceled' || s.name.toLowerCase() === 'cancelled');

  if (!doneState && !canceledState) {
    console.error('❌ No se encontró ningún estado de tipo completed o canceled en el equipo.');
    process.exit(1);
  }

  console.log(`\n🎯 Estado objetivo para resueltos (Done): ${doneState?.name} [${doneState?.id}]`);
  console.log(
    `🎯 Estado objetivo para duplicados (Canceled): ${canceledState?.name || doneState?.name} [${canceledState?.id || doneState?.id}]`,
  );

  // 2. Consultar tickets abiertos en el equipo
  const issuesQuery = `
    query GetTeamIssues($teamId: String!) {
      team(id: $teamId) {
        issues(first: 250, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
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

  const issuesData = await fetchLinear<{ team: { issues: { nodes: LinearIssueNode[] } } }>(issuesQuery, {
    teamId: selectedTeam.id,
  });

  const openIssues = issuesData.team?.issues?.nodes || [];
  console.log(`\n📊 Total de tickets abiertos a evaluar: ${openIssues.length}`);

  // Clasificar tickets
  const sonarBugsToClose: LinearIssueNode[] = [];
  const codeqlDuplicatesToCancel: LinearIssueNode[] = [];
  const otherTickets: LinearIssueNode[] = [];

  for (const issue of openIssues) {
    if (issue.title.startsWith('[SonarCloud]')) {
      sonarBugsToClose.push(issue);
    } else if (issue.title.startsWith('[GitHub CodeQL]') || issue.state?.type === 'duplicate') {
      codeqlDuplicatesToCancel.push(issue);
    } else {
      otherTickets.push(issue);
    }
  }

  console.log(`\n📦 Tickets identificados para limpieza:`);
  console.log(`   - SonarCloud (obsoletos/resueltos): ${sonarBugsToClose.length}`);
  console.log(`   - CodeQL Duplicados: ${codeqlDuplicatesToCancel.length}`);
  console.log(`   - Otros tickets preservados: ${otherTickets.length}`);

  if (otherTickets.length > 0) {
    console.log('ℹ️ Tickets preservados (no automáticos):');
    for (const t of otherTickets) {
      console.log(`   • [${t.identifier}] ${t.title}`);
    }
  }

  // 3. Ejecutar actualizaciones por bloques de 50
  const chunkSize = 50;

  // 3.1 Cierre de SonarCloud -> Done (o Canceled)
  const targetSonarStateId = doneState?.id ?? canceledState?.id ?? '';
  if (sonarBugsToClose.length > 0) {
    console.log(`\n🚀 Cerrando ${sonarBugsToClose.length} tickets de SonarCloud...`);
    for (let i = 0; i < sonarBugsToClose.length; i += chunkSize) {
      const chunk = sonarBugsToClose.slice(i, i + chunkSize);
      const ids = chunk.map((c) => c.id) as [string, ...string[]];
      console.log(
        `   Enviando bloque ${i + 1} - ${i + chunk.length} (${chunk.map((c) => c.identifier).join(', ')})...`,
      );
      const success = await updateIssueBatch(ids, targetSonarStateId);
      console.log(`   Resultado bloque: ${success ? '✅ OK' : '⚠️ Falló algún ticket'}`);
    }
  }

  // 3.2 Cierre de CodeQL Duplicados -> Canceled (o Done)
  const targetCodeqlStateId = canceledState?.id ?? doneState?.id ?? '';
  if (codeqlDuplicatesToCancel.length > 0) {
    console.log(`\n🚀 Cancelando ${codeqlDuplicatesToCancel.length} tickets duplicados de CodeQL...`);
    for (let i = 0; i < codeqlDuplicatesToCancel.length; i += chunkSize) {
      const chunk = codeqlDuplicatesToCancel.slice(i, i + chunkSize);
      const ids = chunk.map((c) => c.id) as [string, ...string[]];
      console.log(
        `   Enviando bloque ${i + 1} - ${i + chunk.length} (${chunk.map((c) => c.identifier).join(', ')})...`,
      );
      const success = await updateIssueBatch(ids, targetCodeqlStateId);
      console.log(`   Resultado bloque: ${success ? '✅ OK' : '⚠️ Falló algún ticket'}`);
    }
  }

  // 4. Reporte final
  const summaryMarkdown = `## 🧹 Limpieza Masiva de Tickets en Linear (${selectedTeam.name} - ${selectedTeam.key})

- **Modo:** ${IS_DRY_RUN ? '`DRY_RUN` (Simulación)' : '`LIVE` (Mutación real)'}
- **Tickets SonarCloud cerrados:** ${sonarBugsToClose.length} ➔ \`${doneState?.name || 'Done'}\`
- **Tickets CodeQL duplicados cancelados:** ${codeqlDuplicatesToCancel.length} ➔ \`${canceledState?.name || 'Canceled'}\`
- **Tickets preservados intactos:** ${otherTickets.length}
`;

  console.log(`\n${summaryMarkdown}`);

  const stepSummaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryFile) {
    try {
      fs.appendFileSync(stepSummaryFile, summaryMarkdown, 'utf-8');
      console.log('📝 Resumen añadido a GITHUB_STEP_SUMMARY.');
    } catch (err) {
      console.warn('⚠️ No se pudo escribir en GITHUB_STEP_SUMMARY:', err);
    }
  }

  console.log('🏁 Proceso de limpieza finalizado con éxito.');
}

main().catch((err) => {
  console.error('💥 Error inesperado en la limpieza de Linear:', err);
  process.exit(1);
});
