/**
 * =============================================================================
 * Gate de Integridad Documental del Portal [DOC-011]
 * =============================================================================
 *
 * `docs/README.md` es el portal de navegación del corpus documental. Antes de
 * este gate no existía ninguna comprobacion de que el reflejara: el unico
 * contrato eran assertions puntuales sobre ADRs concretos en
 * `network_policies_security.test.ts`.
 *
 * Eso permitia dos fallos silenciosos, ambos observados en auditoria:
 *
 *   1. DOCUMENTO NO INDEXADO: `GITOPS_PROMOTION_WORKFLOW.md` existia en
 *      `docs/architecture/` pero no aparecia ni en el mermaid ni en la lista por
 *      categoria. Un documento invisible en el portal es un documento que nadie
 *      encuentra ni mantiene.
 *
 *   2. REFERENCIA A DOCUMENTO INEXISTENTE: la matriz de impacto documental
 *      (`.agents/skills/_shared/documentation-impact-matrix.md`) instruia a los
 *      agentes a actualizar `docs/architecture/ARCHITECTURE_SPECIFICATION.md` y
 *      `docs/architecture/VAULT_PROXMOX_ARCHITECTURE.md`, que nunca existieron.
 *      Una skill que apunta a un archivo inexistente instruye trabajo sobre un
 *      archivo que no esta, y el agente no tiene forma de detectar el fallo.
 *
 * El gate es fail-closed y cubre ambas direcciones:
 *   - Todo `.md` de las categorias indexadas DEBE linkearse desde el portal.
 *   - Toda ruta `docs/...` citada en la politica DEBE existir en disco.
 *
 * EXENCIONES (declaradas explicitamente, nunca por omision):
 *   - `docs/audits/`: evidencia historica inmutable. No se indexa en el portal
 *     porque no describe el estado actual (Regla de Oro de `AGENTS.md`).
 *   - `docs/README.md` mismo: es el portal.
 * =============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const PORTAL_PATH = path.join(DOCS_DIR, 'README.md');
const IMPACT_MATRIX_PATH = path.join(
  ROOT_DIR,
  '.agents/skills/_shared/documentation-impact-matrix.md'
);

/** Categorias que el portal indexa de forma explicita. */
const INDEXED_DIRS = [
  'api',
  'architecture',
  'best-practices',
  'devops',
  'operations',
  'runbooks',
  'security',
  'testing',
];

/** Directorios excluidos del contrato de indexacion, con su motivo. */
const NOT_INDEXED: Record<string, string> = {
  audits: 'Evidencia historica inmutable; no describe el estado actual (Regla de Oro AGENTS.md).',
  decisions:
    'Los ADR si se indexan en el portal, pero agrupados por rango ("ADR-001 a ADR-029") ' +
    'en el diagrama, con el detalle individual en la tabla de la seccion 7. Enumerar 29 nodos ' +
    'mermaid no aporta navegabilidad, asi que no se exige que cada ADR aparezca por nombre.',
};

function readPortal(): string {
  return fs.readFileSync(PORTAL_PATH, 'utf-8');
}

test('📚 DOC-011: todo documento de las categorias indexadas esta enlazado en docs/README.md', () => {
  assert.ok(fs.existsSync(PORTAL_PATH), 'docs/README.md debe existir');
  const portal = readPortal();

  const missing: string[] = [];

  for (const dir of INDEXED_DIRS) {
    const fullDir = path.join(DOCS_DIR, dir);
    assert.ok(fs.existsSync(fullDir), `docs/${dir}/ debe existir`);

    for (const file of fs.readdirSync(fullDir).filter((f) => f.endsWith('.md')).sort()) {
      // El portal puede enlazar el archivo con o sin ruta; basta con que el
      // nombre del documento aparezca en el contenido del portal.
      if (!portal.includes(file)) {
        missing.push(`docs/${dir}/${file}`);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `Documentos existentes que NO estan enlazados en docs/README.md:\n  ${missing.join('\n  ')}\n` +
      'Un documento no indexado es un documento que nadie encuentra. Anadelo al ' +
      'diagrama mermaid (con su nodo en `classDef doc`) y a la lista por categoria.'
  );
});

test('📚 DOC-011: las categorias del portal coinciden con las carpetas reales de docs/', () => {
  const portal = readPortal();
  const realDirs = fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const undocumented = realDirs.filter(
    (d) => !INDEXED_DIRS.includes(d) && !(d in NOT_INDEXED)
  );

  assert.deepEqual(
    undocumented,
    [],
    `Carpetas de docs/ sin categoria en el portal y sin exencion declarada: ` +
      `${undocumented.join(' | ')}. Declara la categoria en el portal o documenta la ` +
      'exencion en NOT_INDEXED con su motivo.'
  );
});

test('📚 DOC-011: toda ruta docs/... citada por la politica existe en disco', () => {
  assert.ok(
    fs.existsSync(IMPACT_MATRIX_PATH),
    '.agents/skills/_shared/documentation-impact-matrix.md debe existir'
  );
  const matrix = fs.readFileSync(IMPACT_MATRIX_PATH, 'utf-8');

  // Solo se validan rutas concretas (`docs/<algo>/<archivo>.md`). Los globs con
  // comodin (`docs/decisions/ADR-006-*.md`) y las carpetas sin archivo concreto
  // (`docs/api/`) son patrones de busqueda intencionales, no rutas literales.
  const cited = new Set(
    [...matrix.matchAll(/`(docs\/[A-Za-z0-9_\-./]+\.md)`/g)].map((m) => m[1])
  );

  assert.ok(cited.size > 0, 'La matriz debe citar al menos una ruta docs/ concreta');

  const broken = [...cited].filter((rel) => !fs.existsSync(path.join(ROOT_DIR, rel)));

  assert.deepEqual(
    broken,
    [],
    `La politica documental cita documentos que NO existen: ${broken.join(' | ')}.\n` +
      'Una skill que apunta a un archivo inexistente instruye a los agentes a ' +
      'trabajar sobre un archivo que no esta. Corrige la matriz para apuntar a ' +
      'documentos reales.'
  );
});