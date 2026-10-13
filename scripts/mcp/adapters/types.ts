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

/**
 * Resuelve y adapta el mapa de variables de entorno según las capacidades del cliente:
 * - Si clientDef.env_variable_expansion === true: preserva las expresiones ${VAR}
 *   para que el cliente las resuelva dinámicamente en tiempo de ejecución.
 * - Si clientDef.env_variable_expansion === false (ej. Antigravity o Generic):
 *   omite variables opcionales que no estén definidas localmente para evitar inyectar
 *   placeholders literales como "${VAR}" que bloqueen el modo anónimo de servidores como
 *   Context7 o Trivy.
 */
export function resolveClientEnv(
  server: McpServerDefinition,
  clientDef: McpClientDefinition,
): Record<string, string> | undefined {
  if (!server.env || Object.keys(server.env).length === 0) {
    return undefined;
  }

  const result: Record<string, string> = {};
  const requiredVars = new Set(server.required_env_vars || []);

  for (const [key, rawValue] of Object.entries(server.env)) {
    const match = rawValue.match(/^\$\{([A-Z0-9_]+)\}$/);
    if (match) {
      const varName = match[1];
      const isRequired = requiredVars.has(varName);

      if (clientDef.env_variable_expansion) {
        result[key] = rawValue;
      } else {
        // En clientes sin soporte de expansión de variables en runtime:
        // Si la variable es opcional (no requerida) y no está definida en process.env,
        // se omite para no enviar un literal sintético ${VAR} que rompa la autenticación anónima.
        if (!isRequired) {
          const envVal = process.env[varName];
          if (envVal && envVal.trim().length > 0) {
            result[key] = envVal.trim();
          }
          // Si no está definida, se omite intencionalmente.
        } else {
          result[key] = rawValue;
        }
      }
    } else {
      result[key] = rawValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
