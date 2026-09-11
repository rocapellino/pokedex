import { pgTable, integer, varchar, jsonb, timestamp, index, pgSequence } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Pokemon } from '../types.js';

// Secuencia para autoincremento continuo compatible con seed inicial
export const pokedexIdSeq = pgSequence('pokedex_id_seq', {
  startWith: 1009,
});

export const pokedexEntries = pgTable(
  'pokedex_entries',
  {
    id: integer('id').primaryKey(),
    nombre: varchar('nombre', { length: 100 }).notNull(),
    tipo: varchar('tipo', { length: 50 }).notNull(),
    data: jsonb('data').$type<Pokemon>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('idx_pokedex_tipo').on(table.tipo),
    index('idx_pokedex_nombre').on(table.nombre),
  ]
);

export type PokedexEntry = typeof pokedexEntries.$inferSelect;
export type NewPokedexEntry = typeof pokedexEntries.$inferInsert;
