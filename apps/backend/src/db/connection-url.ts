/**
 * Compone la URL de PostgreSQL a partir de las variables POSTGRES_* (credenciales codificadas).
 * Devuelve undefined si falta alguna de las obligatorias.
 */
export function composePostgresUrl(env: NodeJS.ProcessEnv): string | undefined {
  const { POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = env;
  if (!POSTGRES_HOST || !POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) return undefined;
  return `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@${POSTGRES_HOST}:${env.POSTGRES_PORT || 5432}/${POSTGRES_DB}`;
}
