import { dom } from './mega_env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTableRows } from '../../apps/frontend/src/components/admin-table.js';
import { renderPokemonCard } from '../../apps/frontend/src/components/pokemon-card.js';
import { renderEmptyState, renderTypeBadge, renderTypeBadges } from '../../apps/frontend/src/shared/ui.js';
import type { Pokemon } from '../../apps/frontend/src/types.js';

/**
 * Paridad de salida (refactor del render HTML): cada `render*` migrado a la plantilla `html` debe
 * producir EXACTAMENTE la misma cadena que antes. Los archivos de `golden/` se generaron con el
 * código previo a la migración. Para regenerarlos de forma deliberada:
 *   UPDATE_GOLDEN=1 npx tsx --test tests/frontend/html_parity.test.ts
 */
void dom;

/**
 * Los hooks de pre-commit recortan los espacios finales y fijan el salto de línea final de los
 * archivos; la comparación los ignora para que el golden sea estable (no cambia el HTML).
 */
const normalize = (html: string): string => html.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
const GOLDEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'golden');

const pikachu: Pokemon = {
  id: 25,
  nombre: 'Pikachu',
  tipo: 'Eléctrico',
  tipos: ['Eléctrico'],
  fuerza: 55,
  imagen: 'https://img.example.com/pikachu.png',
  habilidades: ['Elec. estática', 'Pararrayos'],
  caracteristicas: { peso: 6, altura: 0.4, habitat: 'Bosque Verde' },
  evoluciones: [
    { id: 172, nombre: 'Pichu', etapa: 'Bebé' },
    { id: 25, nombre: 'Pikachu', etapa: 'Fase 1', metodo: 'Amistad' },
    { id: 26, nombre: 'Raichu', etapa: 'Fase 2', metodo: 'Piedra trueno' },
  ],
};

const charizard: Pokemon = {
  id: 6,
  nombre: 'Charizard',
  tipo: 'Fuego',
  tipos: ['Fuego', 'Volador'],
  fuerza: 84,
  imagen: 'https://img.example.com/charizard.png',
  habilidades: ['Mar llamas'],
  caracteristicas: { peso: 90.5, altura: 1.7, habitat: 'Montaña' },
  evoluciones: {
    arbol: {
      id: 4,
      nombre: 'Charmander',
      etapa: 'Base',
      evolves_to: [
        { id: 5, nombre: 'Charmeleon', etapa: 'Fase 1', evolves_to: [{ id: 6, nombre: 'Charizard', etapa: 'Fase 2' }] },
      ],
    },
  },
  megaevoluciones: [{ nombre: 'Mega-Charizard X', tipo: 'Fuego', stats: { hp: 78, attack: 130 } }],
} as unknown as Pokemon;

/** Datos ausentes y caracteres especiales en el nombre: ejercita los valores por defecto y el escapado. */
const sparse = {
  id: 1,
  nombre: `Nidoran<&"'>`,
  tipo: 'Veneno',
  habilidades: 'Punto tóxico',
} as unknown as Pokemon;

const CASES: Record<string, () => unknown> = {
  'card-pikachu': () => renderPokemonCard(pikachu),
  'card-charizard': () => renderPokemonCard(charizard),
  'card-sparse': () => renderPokemonCard(sparse),
  'rows-admin': () => renderTableRows([pikachu, charizard, sparse]),
  'rows-admin-empty': () => renderTableRows([]),
  'badge-single': () => renderTypeBadge('Eléctrico'),
  'badges-multi': () => renderTypeBadges('Fuego', ['Fuego', 'Volador']),
  'badges-fallback': () => renderTypeBadges('Agua'),
  'empty-state-retry': () =>
    renderEmptyState({
      title: 'Sin conexión',
      description: 'No se pudo <cargar>',
      retryBtnId: 'btnReintentar',
      retryBtnText: 'Reintentar',
    }),
  'empty-state-plain': () =>
    renderEmptyState({ icon: '🔍', title: 'Sin resultados', description: 'Prueba otro filtro' }),
};

for (const [name, render] of Object.entries(CASES)) {
  test(`🧪 Paridad de render: ${name} produce la misma salida que la versión anterior`, () => {
    const actual = normalize(String(render()));
    const file = path.join(GOLDEN_DIR, `${name}.html`);
    if (process.env.UPDATE_GOLDEN === '1') {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
      fs.writeFileSync(file, `${actual}\n`, 'utf-8');
    }
    assert.ok(fs.existsSync(file), `falta el golden ${name}.html: generarlo con UPDATE_GOLDEN=1`);
    assert.equal(actual, normalize(fs.readFileSync(file, 'utf-8')));
  });
}
