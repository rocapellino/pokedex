import { defineConfig } from 'drizzle-kit';

const host = process.env.POSTGRES_HOST || 'localhost';
const port = process.env.POSTGRES_PORT || '5432';
const user = process.env.POSTGRES_USER || 'pokedex_user';
const password = process.env.POSTGRES_PASSWORD || '';
const db = process.env.POSTGRES_DB || 'pokedex_db';
const defaultUrl = password
  ? `postgresql://${user}:${password}@${host}:${port}/${db}`
  : `postgresql://${user}@${host}:${port}/${db}`;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || defaultUrl,
  },
});
