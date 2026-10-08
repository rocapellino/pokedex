/**
 * ==============================================================================
 * Verificación Pre-Flight de Variables de Entorno al Arranque
 * ==============================================================================
 * Verifica que las variables de entorno críticas estén presentes antes de que el
 * servidor Express empiece a escuchar peticiones, evitando fallos silenciosos
 * o 503 tardíos en runtime.
 *
 * Se omite automáticamente cuando NODE_ENV=test para permitir suites de testing
 * unitario con mocks y configuraciones efímeras.
 */

export interface EnvVarSpec {
  name: string;
  hint: string;
  requiredInProduction: boolean;
  requiredInDevelopment?: boolean;
}

export interface EnvCheckResult {
  valid: boolean;
  missingRequired: string[];
  warnings: string[];
}

export const MONITORED_ENV_VARS: EnvVarSpec[] = [
  {
    name: 'ADMIN_API_KEY',
    hint: 'Clave administrativa para acceso a endpoints de gestión y emisión de tokens. Definir en .env o secrets.',
    requiredInProduction: true,
  },
  {
    name: 'ADMIN_SESSION_SECRET',
    hint: 'Secreto criptográfico de al menos 32 bytes para firma de tokens HMAC de sesión. Requerido en producción.',
    requiredInProduction: true,
  },
  {
    name: 'CORS_ORIGINS',
    hint: 'Lista separada por comas de orígenes HTTP/HTTPS autorizados para CORS en producción (ej. https://pokedex.example.com).',
    requiredInProduction: true,
  },
  {
    name: 'DATABASE_URL',
    hint: 'String de conexión a PostgreSQL (o variables POSTGRES_*). OBLIGATORIA en producción: sin ella el arranque falla en vez de degradar a memoria volátil (APPS-008). En desarrollo y tests es opcional y activa el fallback en memoria.',
    requiredInProduction: true,
  },
  {
    name: 'REDIS_URL',
    hint: 'String de conexión a Redis (o variables REDIS_*). Si falta, el rate limiting distribuido recurrirá a memoria local.',
    requiredInProduction: false,
  },
  {
    name: 'METRICS_BEARER_TOKEN',
    hint: 'Token Bearer que Prometheus/Alloy debe enviar al consultar /metrics (AUD-SEC-OBS-001). Si falta, /metrics queda abierto para cualquiera que alcance la API.',
    requiredInProduction: false,
  },
  {
    name: 'GEMINI_API_KEY',
    hint: 'API Key para Google Gemini AI. Si falta, los endpoints de diagramas y mockups operarán en modo fallback sintético.',
    requiredInProduction: false,
  },
];

/**
 * Resuelve si una variable tiene un valor valido, considerando las alternativas
 * compuestas (p. ej. `DATABASE_URL` o el juego `POSTGRES_*`).
 *
 * [APPS-008] Esto se evalua ANTES del requisito de produccion. Antes de que
 * `DATABASE_URL` pasara a ser obligatoria, la comprobacion de alternativas vivia
 * en la rama `else if`, que en produccion nunca se ejecuta: un despliegue valido
 * configurado con `POSTGRES_HOST`/`POSTGRES_USER` (sin `DATABASE_URL`) se habria
 * reportado como variable faltante y el arranque habria abortado.
 */
function isConfigured(spec: EnvVarSpec): boolean {
  const value = process.env[spec.name];
  if (value && value.trim().length > 0) return true;

  if (spec.name === 'DATABASE_URL') {
    return Boolean(process.env.POSTGRES_HOST && process.env.POSTGRES_USER);
  }
  if (spec.name === 'REDIS_URL') {
    return Boolean(process.env.REDIS_HOST);
  }
  return false;
}

export function inspectEnvironment(): EnvCheckResult {
  const isProduction = process.env.NODE_ENV === 'production';
  const missingRequired: string[] = [];
  const warnings: string[] = [];

  for (const spec of MONITORED_ENV_VARS) {
    const isPresent = isConfigured(spec);

    if (isProduction && spec.requiredInProduction && !isPresent) {
      missingRequired.push(spec.name);
    } else if (!isPresent) {
      // Chequear si hay alternativas compuestas (ej. POSTGRES_* o REDIS_*)
      if (spec.name === 'DATABASE_URL') {
        warnings.push(
          `DATABASE_URL / POSTGRES_* no configurado: almacenamiento PostgreSQL inactivo (fallback en memoria activo)`,
        );
      } else if (spec.name === 'REDIS_URL') {
        warnings.push(
          `REDIS_URL / REDIS_* no configurado: rate limiter distribuido inactivo (fallback en memoria local activo)`,
        );
      } else if (spec.name === 'METRICS_BEARER_TOKEN') {
        if (isProduction) {
          warnings.push(`METRICS_BEARER_TOKEN no configurado: /metrics responde sin autenticación`);
        }
      } else if (spec.name === 'GEMINI_API_KEY') {
        warnings.push(`GEMINI_API_KEY no configurado: servicios de IA en modo fallback generativo local`);
      }
    }
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    warnings,
  };
}

export function checkRequiredEnvVars(options: { throwOnError?: boolean; logWarnings?: boolean } = {}): EnvCheckResult {
  const { throwOnError = true, logWarnings = true } = options;

  const isTest = process.env.NODE_ENV === 'test';
  const isProduction = process.env.NODE_ENV === 'production';
  const shouldSkip = isTest || (process.env.SKIP_ENV_CHECK === 'true' && !isProduction);

  if (shouldSkip) {
    return { valid: true, missingRequired: [], warnings: [] };
  }

  const result = inspectEnvironment();

  if (logWarnings && result.warnings.length > 0) {
    console.warn('\n[Startup Diagnostics] Advertencias de configuración de entorno:');
    result.warnings.forEach((w) => {
      console.warn(`  ⚠ ${w}`);
    });
    console.warn('');
  }

  if (!result.valid) {
    const lines = result.missingRequired.map((name) => {
      const spec = MONITORED_ENV_VARS.find((v) => v.name === name);
      return `\n  ✗ ${name}\n      → ${spec?.hint || 'Variable requerida en producción'}`;
    });

    const errorMsg =
      `\n\n` +
      `═══════════════════════════════════════════════════════════════\n` +
      `  ERROR DE ARRANQUE: Faltan variables de entorno obligatorias\n` +
      `═══════════════════════════════════════════════════════════════\n` +
      `\n` +
      `El servidor no puede arrancar en modo producción (NODE_ENV="${process.env.NODE_ENV}") ` +
      `sin las siguientes configuraciones de seguridad:\n` +
      `${lines.join('\n')}\n` +
      `\n` +
      `Cómo solucionarlo:\n` +
      `  • En entorno local: crea un archivo .env en la raíz del repo (revisa .env.example).\n` +
      `  • En Kubernetes / CI / Producción: inyecta los secrets correspondientes en el deployment o Helm chart.\n` +
      `\n` +
      `Validación implementada en src/config/startup-env-check.ts.\n` +
      `═══════════════════════════════════════════════════════════════\n`;

    if (throwOnError) {
      throw new Error(errorMsg);
    } else {
      console.error(errorMsg);
    }
  }

  return result;
}
