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
import yaml from 'js-yaml';

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
  /\bghp_[A-Za-z0-9_]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\beyJ[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}\b/,
  /\b(?<!\$\{)password\s*[:=]\s*["']?[^"'\s$]{6,}["']?/i,
  /\b(?<!\$\{)token\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}["']?/i,
];

export function validateMcpArchitecture(): ValidationReport {
  const issues: ValidationIssue[] = [];

  // 1. Verificación de existencia de archivos
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
  let policiesData: any = {};
  let registryData: any = {};
  let clientsData: any = {};

  try {
    const policiesContent = fs.readFileSync(POLICIES_PATH, 'utf-8');
    scanSecretsInContent('.mcp/policies.yaml', policiesContent, issues);
    policiesData = yaml.load(policiesContent);
  } catch (err: any) {
    issues.push({
      severity: 'error',
      file: '.mcp/policies.yaml',
      message: `Error al parsear YAML: ${err.message}`,
    });
  }

  try {
    const registryContent = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    scanSecretsInContent('.mcp/registry.yaml', registryContent, issues);
    registryData = yaml.load(registryContent);
  } catch (err: any) {
    issues.push({
      severity: 'error',
      file: '.mcp/registry.yaml',
      message: `Error al parsear YAML: ${err.message}`,
    });
  }

  try {
    const clientsContent = fs.readFileSync(CLIENTS_PATH, 'utf-8');
    scanSecretsInContent('.mcp/clients.yaml', clientsContent, issues);
    clientsData = yaml.load(clientsContent);
  } catch (err: any) {
    issues.push({
      severity: 'error',
      file: '.mcp/clients.yaml',
      message: `Error al parsear YAML: ${err.message}`,
    });
  }

  // 3. Validación de Políticas
  const profiles = policiesData?.profiles || {};
  const profileKeys = Object.keys(profiles);

  if (profileKeys.length === 0) {
    issues.push({
      severity: 'error',
      file: '.mcp/policies.yaml',
      message: 'No se encontraron perfiles definidos en .mcp/policies.yaml.',
    });
  }

  for (const [profKey, profVal] of Object.entries<any>(profiles)) {
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

    if (profKey === 'ci') {
      if (profVal.allow_production_secrets !== false) {
        issues.push({
          severity: 'error',
          file: '.mcp/policies.yaml',
          field: `profiles.${profKey}.allow_production_secrets`,
          message: "El perfil 'ci' no debe permitir secretos de producción.",
        });
      }
    }
  }

  // 4. Validación de Servidores en Registry
  const servers = Array.isArray(registryData?.servers) ? registryData.servers : [];
  const serverIds = new Set<string>();
  let enabledServersCount = 0;

  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];

    if (!s.id) {
      issues.push({
        severity: 'error',
        file: '.mcp/registry.yaml',
        field: `servers[${i}].id`,
        message: 'Cada servidor debe tener un id único no vacío.',
      });
      continue;
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

    if (s.enabled) {
      enabledServersCount++;
    }

    // Perfil asignado
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

    // Validación de coherencia estricta entre permisos del servidor y su perfil
    const assignedProfile = profiles[s.profile];
    if (assignedProfile) {
      // 1. Verificación de permisos de escritura
      if (assignedProfile.write_access === false && s.permissions?.write === true) {
        issues.push({
          severity: 'error',
          file: '.mcp/registry.yaml',
          field: `servers[${s.id}].permissions.write`,
          message: `El servidor '${s.id}' declara 'permissions.write: true', pero su perfil '${s.profile}' prohíbe la escritura ('write_access: false').`,
        });
      }

      // 2. Verificación de restricciones de red
      if (assignedProfile.network === 'none' && s.permissions?.network && s.permissions.network !== 'none') {
        issues.push({
          severity: 'error',
          file: '.mcp/registry.yaml',
          field: `servers[${s.id}].permissions.network`,
          message: `El servidor '${s.id}' declara 'permissions.network: ${s.permissions.network}', pero su perfil '${s.profile}' prohíbe el acceso a red ('network: none').`,
        });
      }

      // 3. Verificación de contradicción interna de red en argumentos
      if (
        Array.isArray(s.args) &&
        s.args.includes('--network=none') &&
        s.permissions?.network &&
        s.permissions.network === 'outbound-allowed'
      ) {
        issues.push({
          severity: 'error',
          file: '.mcp/registry.yaml',
          field: `servers[${s.id}].permissions.network`,
          message: `Contradicción en servidor '${s.id}': args especifican '--network=none', pero permissions.network declara 'outbound-allowed'.`,
        });
      }

      // 4. Verificación de restricciones de filesystem
      if (assignedProfile.filesystem === 'none' && s.permissions?.filesystem && s.permissions.filesystem !== 'none') {
        issues.push({
          severity: 'error',
          file: '.mcp/registry.yaml',
          field: `servers[${s.id}].permissions.filesystem`,
          message: `El servidor '${s.id}' declara acceso a filesystem ('${s.permissions.filesystem}'), pero su perfil '${s.profile}' prohíbe el acceso al sistema de archivos ('filesystem: none').`,
        });
      }
    }

    // Regla de infraestructura de escritura deshabilitada por defecto
    if (s.profile === 'infrastructure-write' && s.enabled) {
      issues.push({
        severity: 'error',
        file: '.mcp/registry.yaml',
        field: `servers[${s.id}].enabled`,
        message: `El servidor '${s.id}' con perfil 'infrastructure-write' no puede estar habilitado por defecto.`,
      });
    }

    // Validación de transporte
    const allowedTransports = ['stdio', 'sse', 'http'];
    if (!allowedTransports.includes(s.transport)) {
      issues.push({
        severity: 'error',
        file: '.mcp/registry.yaml',
        field: `servers[${s.id}].transport`,
        message: `Transporte no soportado '${s.transport}' en el servidor '${s.id}'. Permitidos: ${allowedTransports.join(', ')}.`,
      });
    }

    // Validación de versión fija (prohibido 'latest')
    if (!s.version || s.version === 'latest' || s.version.startsWith('^') || s.version.startsWith('~')) {
      issues.push({
        severity: 'error',
        file: '.mcp/registry.yaml',
        field: `servers[${s.id}].version`,
        message: `El servidor '${s.id}' debe tener una versión semver fijada explícita (prohibido '${s.version}').`,
      });
    }

    // Validación de imagen OCI en ejecución container
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

    // Validación de variables de entorno requeridas
    if (s.required_env_vars && Array.isArray(s.required_env_vars)) {
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

    // Verificación de valores de entorno (no deben contener secretos literales)
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

  // 5. Validación de Clientes
  const clients = clientsData?.clients || {};
  const clientKeys = Object.keys(clients);
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';

  if (clientKeys.length === 0) {
    issues.push({
      severity: 'error',
      file: '.mcp/clients.yaml',
      message: 'No se encontraron clientes definidos en .mcp/clients.yaml.',
    });
  }

  const validFormats = [
    'cursor-mcp-json',
    'vscode-mcp-json',
    'claude-mcp-json',
    'antigravity-mcp-json',
    'standard-mcp-json',
  ];

  for (const [cKey, cVal] of Object.entries<any>(clients)) {
    if (!cVal.config_path) {
      issues.push({
        severity: 'error',
        file: '.mcp/clients.yaml',
        field: `clients.${cKey}.config_path`,
        message: `El cliente '${cKey}' debe declarar config_path.`,
      });
    } else {
      // Verificar protección en .gitignore
      const configRelPath = cVal.config_path;
      const parentDir = path.dirname(configRelPath).replace(/\\/g, '/');
      const isIgnored =
        gitignoreContent.includes(configRelPath) ||
        gitignoreContent.includes(`/${configRelPath}`) ||
        (parentDir !== '.' && gitignoreContent.includes(`${parentDir}/`)) ||
        (parentDir !== '.' && gitignoreContent.includes(`/${parentDir}/`)) ||
        gitignoreContent.includes(path.basename(configRelPath));

      if (!isIgnored) {
        issues.push({
          severity: 'error',
          file: '.mcp/clients.yaml',
          field: `clients.${cKey}.config_path`,
          message: `La ruta '${configRelPath}' del cliente '${cKey}' debe estar ignorada en .gitignore para prevenir exposición de secretos.`,
        });
      }
    }

    if (!Array.isArray(cVal.supported_transports) || cVal.supported_transports.length === 0) {
      issues.push({
        severity: 'error',
        file: '.mcp/clients.yaml',
        field: `clients.${cKey}.supported_transports`,
        message: `El cliente '${cKey}' debe declarar al menos un transporte soportado.`,
      });
    }

    if (!cVal.format || !validFormats.includes(cVal.format)) {
      issues.push({
        severity: 'error',
        file: '.mcp/clients.yaml',
        field: `clients.${cKey}.format`,
        message: `El cliente '${cKey}' declara un formato no soportado '${cVal.format}'. Permitidos: ${validFormats.join(', ')}.`,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    valid: errors.length === 0,
    totalServers: servers.length,
    enabledServers: enabledServersCount,
    totalProfiles: profileKeys.length,
    totalClients: clientKeys.length,
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

// Ejecución directa por CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const isJson = process.argv.includes('--json');
  const report = validateMcpArchitecture();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n======================================================');
    console.log('🛡️  Validación de Arquitectura y Gobernanza MCP');
    console.log('======================================================');
    console.log(`Servidores registrados: ${report.totalServers} (${report.enabledServers} habilitados)`);
    console.log(`Perfiles definidos:     ${report.totalProfiles}`);
    console.log(`Clientes soportados:    ${report.totalClients}`);
    console.log('------------------------------------------------------');

    if (report.issues.length === 0) {
      console.log('✅ Catálogo, políticas y clientes validados satisfactoriamente sin incidencias.\n');
    } else {
      for (const issue of report.issues) {
        const icon = issue.severity === 'error' ? '❌' : '⚠️';
        const fieldStr = issue.field ? ` [${issue.field}]` : '';
        console.log(`${icon} ${issue.severity.toUpperCase()} en ${issue.file}${fieldStr}: ${issue.message}`);
      }
      console.log('------------------------------------------------------');
      if (!report.valid) {
        console.log('❌ Falló la validación de gobernanza MCP.\n');
        process.exit(1);
      } else {
        console.log('⚠️ Validación completada con advertencias.\n');
      }
    }
  }
}
