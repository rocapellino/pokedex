import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../utils/logger.js';

export function getMigrationsFolder(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
    }
  } catch {
    // Fallback para entornos donde import.meta no esté definido
  }
  if (typeof __dirname !== 'undefined') {
    return path.resolve(__dirname, 'migrations');
  }
  return path.resolve(process.cwd(), 'apps/backend/src/db/migrations');
}

export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    logger.warn('[Migrations] DATABASE_URL no configurado. Omitiendo migración.');
    return;
  }

  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  const db = drizzle(pool);
  try {
    const migrationsFolder = getMigrationsFolder();
    logger.info(`[Migrations] Aplicando migraciones Drizzle desde ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    logger.info('[Migrations] Migraciones declarativas aplicadas con éxito');
  } finally {
    await pool.end();
  }
}

// Ejecución directa vía CLI (tsx src/db/migrate.ts o node dist/migrate.cjs)
const isCli = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.cjs'))
);

if (isCli) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('[Migrations] Error fatal ejecutando migraciones:', { error: err });
      process.exit(1);
    });
}
