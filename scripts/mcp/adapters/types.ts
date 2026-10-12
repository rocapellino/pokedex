/**
 * ==============================================================================
 * scripts/mcp/adapters/types.ts
 * ==============================================================================
 * Contratos de tipos y utilidades compartidas para los adaptadores de clientes MCP.
 * ==============================================================================
 */

export interface McpServerDefinition {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse' | 'http';
  execution_mode: 'local' | 'container' | 'remote';
  package?: string;
  image?: string;
  version: string;
  license: string;
  profile: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  required_env_vars?: string[];
  allowed_repositories?: string[];
  url?: string;
  headers?: Record<string, string>;
  permissions: {
    read?: boolean;
    write?: boolean;
    filesystem?: string;
    network?: string;
  };
  notes?: string;
}

export interface McpClientDefinition {
  name: string;
  description: string;
  supported_transports: ('stdio' | 'sse' | 'http')[];
  config_path: string;
  format: string;
  env_variable_expansion: boolean;
  verified: boolean;
  limitations?: string;
}

export interface McpProfileDefinition {
  description?: string;
  default_enabled?: boolean;
  network?: string;
  filesystem?: string;
  write_access?: boolean;
  infra_access?: string;
  allowed_repositories?: string[];
  requires_explicit_approval?: boolean;
  allow_production_secrets?: boolean;
}

export interface McpRegistrySpec {
  version?: string;
  servers?: McpServerDefinition[];
}

export interface McpPoliciesSpec {
  version?: string;
  profiles?: Record<string, McpProfileDefinition>;
}

export interface McpClientsSpec {
  version?: string;
  clients?: Record<string, McpClientDefinition>;
}

export interface McpAdapter {
  clientId: string;
  format: string;
  generateConfig(servers: McpServerDefinition[], clientDef: McpClientDefinition): Record<string, unknown>;
}

/**
 * Resuelve expresiones de variables de entorno con fallback (ej: ${VAR:-default})
 * de forma segura y determinista sin exponer secretos en texto plano.
 */
export function resolveEnvExpression(value: string | undefined): string | undefined {
  if (!value) return value;

  // Patrón ${VAR:-default}
  const fallbackMatch = value.match(/^\$\{([A-Z0-9_]+):-(.+)\}$/);
  if (fallbackMatch) {
    const [, varName, defaultValue] = fallbackMatch;
    const envVal = process.env[varName];
    if (envVal && envVal.trim().length > 0) {
      return envVal.trim();
    }
    return defaultValue;
  }

  // Patrón ${VAR} simple
  const simpleMatch = value.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (simpleMatch) {
    const [, varName] = simpleMatch;
    const envVal = process.env[varName];
    if (envVal && envVal.trim().length > 0) {
      return envVal.trim();
    }
    // Si no está definida la variable no secreta, retornar como referencia
    return value;
  }

  return value;
}
