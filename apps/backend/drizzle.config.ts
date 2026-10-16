import { defineConfig } from 'drizzle-kit';

const host = process.env.POSTGRES_HOST || 'localhost';
const port = process.env.POSTGRES_PORT || '5432';
const user = process.env.POSTGRES_USER || 'pokedex_user';
const password = process.env.POSTGRES_PASSWORD || '';
const db = process.env.POSTGRES_DB || 'pokedex_db';

if (!password && !process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('❌ [drizzle.config] DIRECT_DATABASE_URL, DATABASE_URL o POSTGRES_PASSWORD es obligatoria en entorno de producción.');
  }
  if (process.env.NODE_ENV !== 'test') {
    console.warn('⚠️ [drizzle.config] POSTGRES_PASSWORD no configurada en el entorno. Utilizando fallback sin autenticación para desarrollo local.');
  }
}

const defaultUrl = password
  ? `postgresql://${user}:${password}@${host}:${port}/${db}`
  : `postgresql://${user}@${host}:${port}/${db}`;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || defaultUrl,
  },
});
