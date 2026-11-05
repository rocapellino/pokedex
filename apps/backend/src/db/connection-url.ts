import type pg from 'pg';

/**
 * Compone la URL de PostgreSQL a partir de las variables POSTGRES_* (credenciales codificadas).
 * Devuelve undefined si falta alguna de las obligatorias.
 */
export function composePostgresUrl(env: NodeJS.ProcessEnv): string | undefined {
  const { POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = env;
  if (!POSTGRES_HOST || !POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) return undefined;
  return `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@${POSTGRES_HOST}:${env.POSTGRES_PORT || 5432}/${POSTGRES_DB}`;
}

/**
 * Decide si el pool usa TLS: obligatorio si DB_SSL=true o sslmode=require, y por
 * defecto en producción salvo DB_SSL=false o destino loopback.
 */
export function shouldUsePgSsl(dbUrl: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const isProduction = env.NODE_ENV === 'production';
  const isLoopback = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  const isSslExplicitlyRequired = env.DB_SSL === 'true' || dbUrl.includes('sslmode=require');
  return isSslExplicitlyRequired || (isProduction && env.DB_SSL !== 'false' && !isLoopback);
}

/**
 * Resuelve la configuración SSL de PostgreSQL con validación estricta de certificados
 * (rejectUnauthorized: true) por defecto en producción para prevenir MiTM (AUD-SEC-PGTLS-001).
 */
export function getPgSslConfig(dbUrl: string, env: NodeJS.ProcessEnv = process.env): pg.ConnectionConfig['ssl'] {
  if (!shouldUsePgSsl(dbUrl, env)) return undefined;
  return { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
}
