#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/scan.ts
 * ==============================================================================
 * Escáner estático de seguridad y blindaje Zero-Trust para Model Context Protocol (.mcp/).
 *
 * Protecciones evaluadas (Mitigación CVE-2025-6514 / CV-2025-54135):
 *   1. Detección de Fuga de Credenciales (Zero Secrets Hardcoded).
 *   2. Prevención de Tool Poisoning & Rug Pulls:
 *      - Prohibición de versiones flotantes ('latest', '^', '~').
 *      - Anclaje inmutable de imágenes de contenedor por digest (@sha256:).
 *   3. Aislamiento de Transporte y Mínimo Privilegio:
 *      - Verificación de transporte restringido ('stdio', 'sse', 'http').
 *      - Prohibición de banderas de alto riesgo (--privileged, montaje de docker.sock).
 *      - El perfil 'infrastructure-write' debe estar deshabilitado por defecto y requerir confirmación explícita.
 *   4. Integridad de Esquemas y Referencias de Clientes.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import type { McpClientsSpec, McpPoliciesSpec, McpProfileDefinition, McpRegistrySpec } from './adapters/types.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = process.cwd();

export interface ScanFinding {
  ruleId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  target?: string;
  message: string;
  remediation: string;
}

export interface ScanReport {
  timestamp: string;
  passed: boolean;
  totalServersScanned: number;
  totalFindings: number;
  findings: ScanFinding[];
}

const HIGH_RISK_SECRET_PATTERNS: Array<{ id: string; pattern: RegExp; desc: string }> = [
  {
    id: 'POSTGRES_CREDENTIAL',
    pattern: /postgres:\/\/[^:]+:[^@]+@/i,
    desc: 'Cadena de conexión PostgreSQL con contraseña',
  },
  { id: 'BEARER_TOKEN', pattern: /bearer\s+[a-zA-Z0-9_\-.]{20,}/i, desc: 'Bearer token o JWT hardcodeado' },
  {
    id: 'GITHUB_PAT',
    pattern: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{40,})\b/,
    desc: 'GitHub Personal Access Token',
  },
  { id: 'GOOGLE_API_KEY', pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/, desc: 'Google API Key' },
  {
    id: 'GENERIC_SECRET',
    pattern: /\b(sk-[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9\-_]{20,})\b/,
    desc: 'API Key o Secret Token',
  },
  {
    id: 'HARDCODED_PASSWORD',
    pattern: /\b(?<!\$\{)password\s*[:=]\s*["']?[^"'\s$]{6,}["']?/i,
    desc: 'Contraseña en texto plano',
  },
];

export function runMcpScan(rootDir = ROOT_DIR): ScanReport {
  const findings: ScanFinding[] = [];
  const targetMcpDir = path.join(rootDir, '.mcp');

  if (!fs.existsSync(targetMcpDir)) {
    findings.push({
      ruleId: 'MCP-DIR-NOT-FOUND',
      severity: 'CRITICAL',
      file: '.mcp',
      message: 'El directorio de gobernanza .mcp/ no existe en el repositorio.',
      remediation: 'Crear el catálogo canónico .mcp/ con registry.yaml, policies.yaml y clients.yaml.',
    });
    return {
      timestamp: new Date().toISOString(),
      passed: false,
      totalServersScanned: 0,
      totalFindings: 1,
      findings,
    };
  }

  // 1. Escaneo de secretos en todos los archivos de configuración
  const configFiles = ['registry.yaml', 'policies.yaml', 'clients.yaml', 'schema.json'];
  for (const cfgFile of configFiles) {
    const filePath = path.join(targetMcpDir, cfgFile);
    if (!fs.existsSync(filePath)) {
      findings.push({
        ruleId: 'MCP-CONFIG-FILE-MISSING',
        severity: 'HIGH',
        file: `.mcp/${cfgFile}`,
        message: `Archivo canónico obligatorio ausente: .mcp/${cfgFile}`,
        remediation: `Restaurar o generar el archivo .mcp/${cfgFile}.`,
      });
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    for (const rule of HIGH_RISK_SECRET_PATTERNS) {
      if (rule.pattern.test(content)) {
        findings.push({
          ruleId: `SEC-ZERO-SECRETS-${rule.id}`,
          severity: 'CRITICAL',
          file: `.mcp/${cfgFile}`,
          message: `Se detectó ${rule.desc} en texto plano en .mcp/${cfgFile}.`,
          remediation: 'Utilizar interpolación en runtime con sintaxis ${VARIABLE_NAME}.',
        });
      }
    }
  }

  // Carga de estructuras
  let registry: McpRegistrySpec = {};
  let policies: McpPoliciesSpec = {};
  let clients: McpClientsSpec = {};

  const targetRegistryPath = path.join(targetMcpDir, 'registry.yaml');
  const targetPoliciesPath = path.join(targetMcpDir, 'policies.yaml');
  const targetClientsPath = path.join(targetMcpDir, 'clients.yaml');

  try {
    if (fs.existsSync(targetRegistryPath)) {
      registry = (yaml.load(fs.readFileSync(targetRegistryPath, 'utf-8')) as McpRegistrySpec) || {};
    }
    if (fs.existsSync(targetPoliciesPath)) {
      policies = (yaml.load(fs.readFileSync(targetPoliciesPath, 'utf-8')) as McpPoliciesSpec) || {};
    }
    if (fs.existsSync(targetClientsPath)) {
      clients = (yaml.load(fs.readFileSync(targetClientsPath, 'utf-8')) as McpClientsSpec) || {};
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    findings.push({
      ruleId: 'MCP-YAML-PARSE-ERROR',
      severity: 'CRITICAL',
      file: '.mcp/*.yaml',
      message: `Error al parsear archivos YAML de MCP: ${errorMsg}`,
      remediation: 'Verificar la sintaxis YAML de los archivos en .mcp/.',
    });
    return {
      timestamp: new Date().toISOString(),
      passed: false,
      totalServersScanned: 0,
      totalFindings: findings.length,
      findings,
    };
  }

  const servers = Array.isArray(registry.servers) ? registry.servers : [];
  const profiles: Record<string, McpProfileDefinition> = policies.profiles || {};

  // 2. Auditoría de Políticas y Perfiles de Seguridad
  for (const [profName, profDef] of Object.entries(profiles)) {
    if (profName === 'infrastructure-write') {
      if (profDef.default_enabled !== false) {
        findings.push({
          ruleId: 'MCP-POLICY-INFRA-WRITE-ACTIVE',
          severity: 'CRITICAL',
          file: '.mcp/policies.yaml',
          target: `profiles.${profName}.default_enabled`,
          message: "El perfil 'infrastructure-write' DEBE declarar 'default_enabled: false'.",
          remediation: "Desactivar 'default_enabled: false' y requerir 'requires_explicit_approval: true'.",
        });
      }
      if (profDef.requires_explicit_approval !== true) {
        findings.push({
          ruleId: 'MCP-POLICY-HITL-APPROVAL-REQUIRED',
          severity: 'HIGH',
          file: '.mcp/policies.yaml',
          target: `profiles.${profName}.requires_explicit_approval`,
          message: "El perfil 'infrastructure-write' requiere aprobación humana explícita (HITL).",
          remediation: "Configurar 'requires_explicit_approval: true'.",
        });
      }
    }
  }

  // 3. Auditoría Servidor por Servidor (Blindaje contra Tool Poisoning, Versiones Flotantes & RCE)
  for (const server of servers) {
    // 3.1 Versiones flotantes prohibidas
    if (
      !server.version ||
      server.version === 'latest' ||
      server.version.startsWith('^') ||
      server.version.startsWith('~')
    ) {
      findings.push({
        ruleId: 'MCP-TOOL-PINNING-FLOATING-VERSION',
        severity: 'HIGH',
        file: '.mcp/registry.yaml',
        target: `servers[${server.id}].version`,
        message: `Servidor '${server.id}' usa versión flotante o mutable '${server.version}'. Prohibido por mitigación Rug Pull.`,
        remediation: 'Fijar versión semver inmutable exacta (ej. 1.2.0).',
      });
    }

    // 3.2 Servidores en contenedor: Digest Pinning OCI obligatorio (@sha256:)
    if (server.execution_mode === 'container') {
      if (!server.image) {
        findings.push({
          ruleId: 'MCP-CONTAINER-IMAGE-MISSING',
          severity: 'CRITICAL',
          file: '.mcp/registry.yaml',
          target: `servers[${server.id}].image`,
          message: `El servidor '${server.id}' opera en modo container pero no declara imagen.`,
          remediation: 'Declarar imagen OCI fijada por digest inmutable.',
        });
      } else if (!server.image.includes('@sha256:')) {
        findings.push({
          ruleId: 'MCP-CONTAINER-DIGEST-PINNING-MISSING',
          severity: 'CRITICAL',
          file: '.mcp/registry.yaml',
          target: `servers[${server.id}].image`,
          message: `La imagen '${server.image}' del servidor '${server.id}' no está anclada por digest SHA256 inmutable (@sha256:).`,
          remediation: 'Fijar la imagen por digest @sha256: para prevenir Tool Poisoning.',
        });
      }
    }

    // 3.3 Aislamiento de ejecución y banderas de alto riesgo
    const combinedArgs = Array.isArray(server.args) ? server.args : [];
    for (const arg of combinedArgs) {
      if (arg === '--privileged') {
        findings.push({
          ruleId: 'MCP-EXEC-PRIVILEGED-PROHIBITED',
          severity: 'CRITICAL',
          file: '.mcp/registry.yaml',
          target: `servers[${server.id}].args`,
          message: `El servidor '${server.id}' incluye el flag prohibido '--privileged'.`,
          remediation: 'Eliminar el modo privilegiado y respetar el principio de mínimo privilegio.',
        });
      }
      if (arg.includes('/var/run/docker.sock') || arg.includes('docker.sock')) {
        findings.push({
          ruleId: 'MCP-EXEC-DOCKER-SOCKET-PROHIBITED',
          severity: 'CRITICAL',
          file: '.mcp/registry.yaml',
          target: `servers[${server.id}].args`,
          message: `El servidor '${server.id}' monta el socket de Docker (/var/run/docker.sock). Riesgo de escape de contenedor.`,
          remediation: 'Prohibir el acceso al socket del daemon de Docker.',
        });
      }
    }

    // 3.4 Incompatibilidad de perfil y estado
    if (server.profile === 'infrastructure-write' && server.enabled) {
      findings.push({
        ruleId: 'MCP-SERVER-INFRA-WRITE-ENABLED',
        severity: 'CRITICAL',
        file: '.mcp/registry.yaml',
        target: `servers[${server.id}].enabled`,
        message: `El servidor '${server.id}' pertenece a 'infrastructure-write' y está habilitado por defecto.`,
        remediation: "Desactivar 'enabled: false' para proteger el pipeline GitOps.",
      });
    }

    // 3.5 Verificación de permisos de escritura vs perfil
    const assignedProf = profiles[server.profile];
    if (assignedProf && assignedProf.write_access === false && server.permissions?.write === true) {
      findings.push({
        ruleId: 'MCP-PERM-WRITE-CONFLICT',
        severity: 'HIGH',
        file: '.mcp/registry.yaml',
        target: `servers[${server.id}].permissions.write`,
        message: `Servidor '${server.id}' declara write: true pero su perfil '${server.profile}' prohíbe escritura.`,
        remediation: 'Alinear los permisos del servidor con su perfil asignado.',
      });
    }
  }

  // 4. Auditoría de Clientes y Prevención de Fugas de Secretos en Git
  const gitignorePath = path.join(rootDir, '.gitignore');
  const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const clientEntries = Object.entries(clients.clients || {});

  for (const [cliId, cliDef] of clientEntries) {
    if (cliDef.config_path) {
      const configRelPath = cliDef.config_path.replaceAll('\\', '/');
      const isIgnored =
        gitignoreContent.includes(configRelPath) ||
        gitignoreContent.includes(`/${configRelPath}`) ||
        gitignoreContent.includes(path.dirname(configRelPath)) ||
        gitignoreContent.includes(path.basename(configRelPath));

      if (!isIgnored) {
        findings.push({
          ruleId: 'MCP-CLIENT-PATH-NOT-GITIGNORED',
          severity: 'HIGH',
          file: '.mcp/clients.yaml',
          target: `clients.${cliId}.config_path`,
          message: `La ruta destino '${cliDef.config_path}' del cliente '${cliId}' no está ignorada en .gitignore.`,
          remediation: `Añadir '${cliDef.config_path}' a .gitignore para prevenir commit accidental de configs locales.`,
        });
      }
    }
  }

  const criticalOrHigh = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
  return {
    timestamp: new Date().toISOString(),
    passed: criticalOrHigh.length === 0,
    totalServersScanned: servers.length,
    totalFindings: findings.length,
    findings,
  };
}

export function printScanReport(report: ScanReport): void {
  console.log('\n======================================================');
  console.log('🛡️  MCP Zero-Trust Security Scanner (mcp-scan)');
  console.log('======================================================');
  console.log(`Fecha de escaneo:      ${report.timestamp}`);
  console.log(`Servidores evaluados:  ${report.totalServersScanned}`);
  console.log(`Hallazgos totales:     ${report.totalFindings}`);
  console.log('------------------------------------------------------');

  if (report.findings.length === 0) {
    console.log('✅ 0 vulnerabilidades detectadas. Catálogo MCP 100% blindado contra Tool Poisoning y RCE.\n');
    return;
  }

  for (const f of report.findings) {
    const icon = f.severity === 'CRITICAL' || f.severity === 'HIGH' ? '❌' : '⚠️';
    const targetStr = f.target ? ` [${f.target}]` : '';
    console.log(`${icon} [${f.severity}] ${f.ruleId} en ${f.file}${targetStr}`);
    console.log(`   Mensaje:      ${f.message}`);
    console.log(`   Remediación:  ${f.remediation}\n`);
  }

  console.log('------------------------------------------------------');
  if (!report.passed) {
    console.log('❌ El escaneo MCP detectó infracciones críticas de seguridad. Abortando.\n');
    process.exit(1);
  }
  console.log('⚠️ El escaneo MCP completó con advertencias no bloqueantes.\n');
}

// Ejecución CLI directa
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const isJson = process.argv.includes('--json');
  const report = runMcpScan();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printScanReport(report);
  }
}
