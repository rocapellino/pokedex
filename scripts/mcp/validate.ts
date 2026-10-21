#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/mcp/validate.ts
 * ==============================================================================
 * Motor de validación estricta y determinista de la arquitectura MCP gobernada.
 *
 * Valida:
 *   1. Integridad de archivos de configuración (.mcp/registry.yaml, policies.yaml, clients.yaml).
 *   2. Ausencia de IDs duplicados y tipos incorrectos.
 *   3. Integridad referencial entre servidores y perfiles de políticas.
 *   4. Verificación de versiones explícitas y fijación por digest en imágenes OCI.
 *   5. Prevención de secretos en archivos de configuración (Zero-Trust).
 *   6. Restricción estricta del perfil 'infrastructure-write' (deshabilitado por defecto).
 *   7. Conformidad con los transportes y esquemas autorizados.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { withMcpAudit } from './audit.js';
import type {
  McpClientDefinition,
  McpClientsSpec,
  McpPoliciesSpec,
  McpProfileDefinition,
  McpRegistrySpec,
  McpServerDefinition,
} from './adapters/types.js';

const __filename = fileURLToPath(import.meta.url);

export interface ValidationIssue {
  severity: 'error' | 'warning';
  file: string;
  field?: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  totalServers: number;
  enabledServers: number;
  totalProfiles: number;
  totalClients: number;
  issues: ValidationIssue[];
}

const ROOT_DIR = process.cwd();
const MCP_DIR = path.join(ROOT_DIR, '.mcp');
const REGISTRY_PATH = path.join(MCP_DIR, 'registry.yaml');
const POLICIES_PATH = path.join(MCP_DIR, 'policies.yaml');
const CLIENTS_PATH = path.join(MCP_DIR, 'clients.yaml');
const SCHEMA_PATH = path.join(MCP_DIR, 'schema.json');

const SUSPICIOUS_SECRET_PATTERNS = [
  /\bghp_\w{36,}\b/,
  /\bgithub_pat_\w{40,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\beyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}\b/,
  /\b(?<!\$\{)password\s*[:=]\s*["']?[^"'\s$]{6,}["']?/i,
  /\b(?<!\$\{)token\s*[:=]\s*["']?[\w-]{20,}["']?/i,
];

const VALID_CLIENT_FORMATS = [
  'cursor-mcp-json',
  'vscode-mcp-json',
  'claude-mcp-json',
  'antigravity-mcp-json',
  'standard-mcp-json',
];

function checkRequiredFiles(issues: ValidationIssue[]): void {
  const requiredFiles = [
    { name: 'schema.json', path: SCHEMA_PATH },
    { name: 'policies.yaml', path: POLICIES_PATH },
    { name: 'registry.yaml', path: REGISTRY_PATH },
    { name: 'clients.yaml', path: CLIENTS_PATH },
  ];

  for (const req of requiredFiles) {
    if (!fs.existsSync(req.path)) {
      issues.push({
        severity: 'error',
        file: `.mcp/${req.name}`,
        message: `El archivo obligatorio .mcp/${req.name} no existe.`,
      });
    }
  }
}

function loadAndScanYamlFile<T>(relFile: string, absPath: string, issues: ValidationIssue[]): T {
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    scanSecretsInContent(relFile, content, issues);
    return (yaml.load(content) as T | undefined) ?? ({} as T);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({
      severity: 'error',
      file: relFile,
      message: `Error al parsear YAML: ${msg}`,
    });
    return {} as T;
  }
}

function validateProfilesSection(profiles: Record<string, McpProfileDefinition>, issues: ValidationIssue[]): void {
  const profileKeys = Object.keys(profiles);

  if (profileKeys.length === 0) {
    issues.push({
      severity: 'error',
      file: '.mcp/policies.yaml',
      message: 'No se encontraron perfiles definidos en .mcp/policies.yaml.',
    });
  }

  for (const [profKey, profVal] of Object.entries(profiles)) {
    if (!profVal.description) {
      issues.push({
        severity: 'error',
        file: '.mcp/policies.yaml',
        field: `profiles.${profKey}.description`,
        message: `El perfil '${profKey}' carece de descripción.`,
      });
    }

    if (profKey === 'infrastructure-write') {
      if (profVal.default_enabled !== false) {
        issues.push({
          severity: 'error',
          file: '.mcp/policies.yaml',
          field: `profiles.${profKey}.default_enabled`,
          message:
            "El perfil 'infrastructure-write' DEBE tener 'default_enabled: false' para proteger el flujo GitOps.",
        });
      }
      if (profVal.requires_explicit_approval !== true) {
        issues.push({
          severity: 'error',
          file: '.mcp/policies.yaml',
          field: `profiles.${profKey}.requires_explicit_approval`,
          message: "El perfil 'infrastructure-write' requiere 'requires_explicit_approval: true'.",
        });
      }
    }

    if (profKey === 'ci' && profVal.allow_production_secrets !== false) {
      issues.push({
        severity: 'error',
        file: '.mcp/policies.yaml',
        field: `profiles.${profKey}.allow_production_secrets`,
        message: "El perfil 'ci' no debe permitir secretos de producción.",
      });
    }
  }
}

function validateServerProfileCoherence(
  s: McpServerDefinition,
  assignedProfile: McpProfileDefinition | undefined,
  issues: ValidationIssue[],
): void {
  if (!assignedProfile) return;

  if (assignedProfile.write_access === false && s.permissions?.write === true) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].permissions.write`,
      message: `El servidor '${s.id}' declara 'permissions.write: true', pero su perfil '${s.profile}' prohíbe la escritura ('write_access: false').`,
    });
  }

  if (assignedProfile.network === 'none' && s.permissions?.network && s.permissions.network !== 'none') {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].permissions.network`,
      message: `El servidor '${s.id}' declara 'permissions.network: ${s.permissions.network}', pero su perfil '${s.profile}' prohíbe el acceso a red ('network: none').`,
    });
  }

  if (Array.isArray(s.args) && s.args.includes('--network=none') && s.permissions?.network === 'outbound-allowed') {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].permissions.network`,
      message: `Contradicción en servidor '${s.id}': args especifican '--network=none', pero permissions.network declara 'outbound-allowed'.`,
    });
  }

  if (assignedProfile.filesystem === 'none' && s.permissions?.filesystem && s.permissions.filesystem !== 'none') {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].permissions.filesystem`,
      message: `El servidor '${s.id}' declara acceso a filesystem ('${s.permissions.filesystem}'), pero su perfil '${s.profile}' prohíbe el acceso al sistema de archivos ('filesystem: none').`,
    });
  }
}

const FORBIDDEN_AUTO_APPROVAL_FIELDS = ['autoApprove', 'alwaysAllow', 'autoStart', 'auto_approve', 'trust'];

/**
 * HITL (4.3): servidores con capacidad de mutación exigen un perfil con aprobación
 * explícita, y ningún servidor puede declarar auto-aprobación o auto-arranque.
 */
function validateHumanInTheLoop(
  s: McpServerDefinition,
  assignedProfile: McpProfileDefinition | undefined,
  issues: ValidationIssue[],
): void {
  const mutating = s.permissions?.write === true || assignedProfile?.infra_access === 'readwrite';
  if (mutating && assignedProfile && assignedProfile.requires_explicit_approval !== true) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].profile`,
      message: `El servidor '${s.id}' puede mutar estado, pero su perfil '${s.profile}' no declara 'requires_explicit_approval: true' (HITL).`,
    });
  }

  for (const field of FORBIDDEN_AUTO_APPROVAL_FIELDS) {
    if (field in (s as unknown as Record<string, unknown>)) {
      issues.push({
        severity: 'error',
        file: '.mcp/registry.yaml',
        field: `servers[${s.id}].${field}`,
        message: `El servidor '${s.id}' declara '${field}': se prohíbe la auto-aprobación o auto-arranque silencioso de herramientas MCP.`,
      });
    }
  }
}

function validateServerTransportAndVersion(s: McpServerDefinition, issues: ValidationIssue[]): void {
  if (s.profile === 'infrastructure-write' && s.enabled) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].enabled`,
      message: `El servidor '${s.id}' con perfil 'infrastructure-write' no puede estar habilitado por defecto.`,
    });
  }

  const allowedTransports = ['stdio', 'sse', 'http'];
  if (!allowedTransports.includes(s.transport)) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].transport`,
      message: `Transporte no soportado '${s.transport}' en el servidor '${s.id}'. Permitidos: ${allowedTransports.join(', ')}.`,
    });
  }

  if (!s.version || s.version === 'latest' || s.version.startsWith('^') || s.version.startsWith('~')) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].version`,
      message: `El servidor '${s.id}' debe tener una versión semver fijada explícita (prohibido '${s.version}').`,
    });
  }

  if (s.execution_mode === 'container') {
    if (!s.image) {
      issues.push({
        severity: 'error',
        file: '.mcp/registry.yaml',
        field: `servers[${s.id}].image`,
        message: `El servidor en contenedor '${s.id}' debe declarar una imagen OCI.`,
      });
    } else if (!s.image.includes('@sha256:')) {
      issues.push({
        severity: 'error',
        file: '.mcp/registry.yaml',
        field: `servers[${s.id}].image`,
        message: `La imagen OCI '${s.image}' del servidor '${s.id}' debe estar fijada por digest SHA256 inmutable (@sha256:).`,
      });
    }
  }
}

function validateServerEnvVars(s: McpServerDefinition, issues: ValidationIssue[]): void {
  if (Array.isArray(s.required_env_vars)) {
    for (const envVar of s.required_env_vars) {
      if (!/^[A-Z0-9_]+$/.test(envVar)) {
        issues.push({
          severity: 'error',
          file: '.mcp/registry.yaml',
          field: `servers[${s.id}].required_env_vars`,
          message: `Nombre de variable de entorno inválido '${envVar}' en '${s.id}'.`,
        });
      }
    }
  }

  if (s.env && typeof s.env === 'object') {
    for (const [key, val] of Object.entries<string>(s.env)) {
      if (typeof val === 'string' && !val.startsWith('${') && val.length > 20) {
        issues.push({
          severity: 'warning',
          file: '.mcp/registry.yaml',
          field: `servers[${s.id}].env.${key}`,
          message: `El valor de '${key}' parece contener un valor literal extenso. Use referencias '\${VAR}' para secretos.`,
        });
      }
    }
  }
}

function validateSingleServer(
  s: McpServerDefinition,
  index: number,
  serverIds: Set<string>,
  profiles: Record<string, McpProfileDefinition>,
  issues: ValidationIssue[],
): boolean {
  if (!s.id) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${index}].id`,
      message: 'Cada servidor debe tener un id único no vacío.',
    });
    return false;
  }

  if (!/^[a-z0-9-]+$/.test(s.id)) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].id`,
      message: `El id '${s.id}' debe contener únicamente minúsculas, números y guiones.`,
    });
  }

  if (serverIds.has(s.id)) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].id`,
      message: `ID de servidor duplicado: '${s.id}'.`,
    });
  }
  serverIds.add(s.id);

  if (!s.profile) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].profile`,
      message: `El servidor '${s.id}' no declara un perfil de seguridad.`,
    });
  } else if (!profiles[s.profile]) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      field: `servers[${s.id}].profile`,
      message: `El servidor '${s.id}' referencia un perfil inexistente: '${s.profile}'.`,
    });
  }

  validateServerProfileCoherence(s, profiles[s.profile], issues);
  validateHumanInTheLoop(s, profiles[s.profile], issues);
  validateServerTransportAndVersion(s, issues);
  validateServerEnvVars(s, issues);

  return Boolean(s.enabled);
}

function isClientPathGitignored(configRelPath: string, gitignoreContent: string): boolean {
  const parentDir = path.dirname(configRelPath).replaceAll('\\', '/');
  return (
    gitignoreContent.includes(configRelPath) ||
    gitignoreContent.includes(`/${configRelPath}`) ||
    (parentDir !== '.' && gitignoreContent.includes(`${parentDir}/`)) ||
    (parentDir !== '.' && gitignoreContent.includes(`/${parentDir}/`)) ||
    gitignoreContent.includes(path.basename(configRelPath))
  );
}

function validateClientsSection(
  clients: Record<string, McpClientDefinition>,
  gitignoreContent: string,
  issues: ValidationIssue[],
): void {
  const clientKeys = Object.keys(clients);

  if (clientKeys.length === 0) {
    issues.push({
      severity: 'error',
      file: '.mcp/clients.yaml',
      message: 'No se encontraron clientes definidos en .mcp/clients.yaml.',
    });
  }

  for (const [cKey, cVal] of Object.entries(clients)) {
    if (!cVal.config_path) {
      issues.push({
        severity: 'error',
        file: '.mcp/clients.yaml',
        field: `clients.${cKey}.config_path`,
        message: `El cliente '${cKey}' debe declarar config_path.`,
      });
    } else if (!isClientPathGitignored(cVal.config_path, gitignoreContent)) {
      issues.push({
        severity: 'error',
        file: '.mcp/clients.yaml',
        field: `clients.${cKey}.config_path`,
        message: `La ruta '${cVal.config_path}' del cliente '${cKey}' debe estar ignorada en .gitignore para prevenir exposición de secretos.`,
      });
    }

    if (!Array.isArray(cVal.supported_transports) || cVal.supported_transports.length === 0) {
      issues.push({
        severity: 'error',
        file: '.mcp/clients.yaml',
        field: `clients.${cKey}.supported_transports`,
        message: `El cliente '${cKey}' debe declarar al menos un transporte soportado.`,
      });
    }

    if (!cVal.format || !VALID_CLIENT_FORMATS.includes(cVal.format)) {
      issues.push({
        severity: 'error',
        file: '.mcp/clients.yaml',
        field: `clients.${cKey}.format`,
        message: `El cliente '${cKey}' declara un formato no soportado '${cVal.format}'. Permitidos: ${VALID_CLIENT_FORMATS.join(', ')}.`,
      });
    }
  }
}

export function validateMcpArchitecture(): ValidationReport {
  const issues: ValidationIssue[] = [];

  // 1. Verificación de existencia de archivos
  checkRequiredFiles(issues);
  if (issues.length > 0) {
    return {
      valid: false,
      totalServers: 0,
      enabledServers: 0,
      totalProfiles: 0,
      totalClients: 0,
      issues,
    };
  }

  // 2. Parseo de archivos
  const policiesData = loadAndScanYamlFile<McpPoliciesSpec>('.mcp/policies.yaml', POLICIES_PATH, issues);
  const registryData = loadAndScanYamlFile<McpRegistrySpec>('.mcp/registry.yaml', REGISTRY_PATH, issues);
  const clientsData = loadAndScanYamlFile<McpClientsSpec>('.mcp/clients.yaml', CLIENTS_PATH, issues);

  // 3. Validación de Políticas
  const profiles: Record<string, McpProfileDefinition> = policiesData?.profiles ?? {};
  validateProfilesSection(profiles, issues);

  // 4. Validación de Servidores en Registry
  const servers = Array.isArray(registryData?.servers) ? registryData.servers : [];
  const serverIds = new Set<string>();
  let enabledServersCount = 0;

  for (let i = 0; i < servers.length; i++) {
    if (validateSingleServer(servers[i], i, serverIds, profiles, issues)) {
      enabledServersCount++;
    }
  }

  // 5. Validación de Clientes
  const clients: Record<string, McpClientDefinition> = clientsData?.clients ?? {};
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  validateClientsSection(clients, gitignoreContent, issues);

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    valid: errors.length === 0,
    totalServers: servers.length,
    enabledServers: enabledServersCount,
    totalProfiles: Object.keys(profiles).length,
    totalClients: Object.keys(clients).length,
    issues,
  };
}

function scanSecretsInContent(file: string, content: string, issues: ValidationIssue[]): void {
  for (const pattern of SUSPICIOUS_SECRET_PATTERNS) {
    if (pattern.test(content)) {
      issues.push({
        severity: 'error',
        file,
        message: `Posible secreto detectado en el archivo según el patrón ${pattern.toString()}. Prohibido versionar credenciales.`,
      });
    }
  }
}

function printValidationReport(report: ValidationReport): void {
  console.log('\n======================================================');
  console.log('🛡️  Validación de Arquitectura y Gobernanza MCP');
  console.log('======================================================');
  console.log(`Servidores registrados: ${report.totalServers} (${report.enabledServers} habilitados)`);
  console.log(`Perfiles definidos:     ${report.totalProfiles}`);
  console.log(`Clientes soportados:    ${report.totalClients}`);
  console.log('------------------------------------------------------');

  if (report.issues.length === 0) {
    console.log('✅ Catálogo, políticas y clientes validados satisfactoriamente sin incidencias.\n');
    return;
  }

  for (const issue of report.issues) {
    const icon = issue.severity === 'error' ? '❌' : '⚠️';
    const fieldStr = issue.field ? ` [${issue.field}]` : '';
    console.log(`${icon} ${issue.severity.toUpperCase()} en ${issue.file}${fieldStr}: ${issue.message}`);
  }
  console.log('------------------------------------------------------');
  if (!report.valid) {
    console.log('❌ Falló la validación de gobernanza MCP.\n');
    process.exit(1);
  }
  console.log('⚠️ Validación completada con advertencias.\n');
}

// Ejecución directa por CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const isJson = process.argv.includes('--json');
  const report = withMcpAudit('mcp:validate', () => validateMcpArchitecture(), { isSuccess: (r) => r.valid });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printValidationReport(report);
  }
}
