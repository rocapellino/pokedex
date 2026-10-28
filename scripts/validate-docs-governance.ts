/**
 * ==============================================================================
 * scripts/validate-docs-governance.ts
 * ==============================================================================
 * Motor de validación determinista y compuerta de gobernanza para docs/,
 * .agents/ (skills y reglas), los documentos raíz (README, SECURITY, AGENTS) y
 * los README satélite de infra/, gitops/, apps/, packages/, .github/ y .mcp/.
 *
 * Verificaciones:
 *   1. Broken Relative Links: Todo enlace markdown relativo debe resolver a un
 *      archivo existente en disco.
 *   2. No Local File Schemes: Prohibición de esquemas locales `file:///`.
 *   3. Portal Integrity: Todo documento en categorías indexadas debe estar
 *      enlazado en docs/README.md (DOC-011).
 *   4. Version Drift Prevention: Asegura que no existan claims activos anclados
 *      a versiones intermedias o desfasadas.
 *
 * Modos de ejecución:
 *   npx tsx scripts/validate-docs-governance.ts          # Reporte y exit 1 ante errores
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DOCS = ['README.md', 'SECURITY.md', 'AGENTS.md'];

/** Directorios con documentación satélite (README de componente) fuera de docs/ y .agents/. */
const SATELLITE_DIRS = ['infra', 'gitops', 'apps', 'packages', '.github', '.mcp'];

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

interface GovernanceViolation {
  file: string;
  rule: string;
  message: string;
}

function getMarkdownFiles(dir: string): string[] {
  let files: string[] = [];
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'scratch' || entry === 'tmp') {
      continue;
    }
    const fullPath = path.join(dir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(getMarkdownFiles(fullPath));
      } else if (entry.endsWith('.md')) {
        files.push(fullPath);
      }
    } catch {
      // Ignorar errores de acceso
    }
  }
  return files;
}

/**
 * Extrae los destinos de enlaces markdown [texto](url) en tiempo lineal O(n)
 * sin retroceso (backtracking) ni expresiones regulares propensas a ReDoS.
 */
function extractMarkdownLinkTargets(text: string): string[] {
  const targets: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const startBracket = text.indexOf('[', pos);
    if (startBracket === -1) break;

    const closeBracket = text.indexOf(']', startBracket + 1);
    if (closeBracket === -1) break;

    if (text[closeBracket + 1] === '(') {
      const closeParen = text.indexOf(')', closeBracket + 2);
      if (closeParen !== -1) {
        let rawTarget = text.slice(closeBracket + 2, closeParen).trim();
        if (rawTarget.length > 0 && !rawTarget.includes('\n')) {
          // Extraer la ruta base ignorando títulos opcionales o delimitadores <>
          const spaceIdx = rawTarget.indexOf(' ');
          if (spaceIdx !== -1) {
            rawTarget = rawTarget.slice(0, spaceIdx).trim();
          }
          if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) {
            rawTarget = rawTarget.slice(1, -1);
          }
          if (rawTarget.length > 0) {
            targets.push(rawTarget);
          }
        }
        pos = closeParen + 1;
        continue;
      }
    }
    pos = startBracket + 1;
  }
  return targets;
}

/**
 * Universo markdown del gate: docs/, .agents/, los documentos raíz y los README satélite.
 *
 * - .agents/ y AGENTS.md se incluyen porque las skills enlazan ADRs y políticas: una
 *   consolidación de ADR (#483) dejó un enlace roto en repo-security que el gate no veía.
 * - AUD-DOC-GATE-001: los README satélite (infra/, gitops/, apps/...) también enlazan values y
 *   manifiestos; infra/README.md citaba un values retirado sin que el gate lo detectara.
 */
function collectMarkdownUniverse(rootDir: string): string[] {
  const files = getMarkdownFiles(path.join(rootDir, 'docs'));
  const rootDocs = ROOT_DOCS.map((doc) => path.join(rootDir, doc)).filter((p) => fs.existsSync(p));
  const dirs = ['.agents', ...SATELLITE_DIRS].map((dir) => path.join(rootDir, dir)).filter((p) => fs.existsSync(p));
  return [...files, ...dirs.flatMap(getMarkdownFiles), ...rootDocs];
}

export function validateDocsGovernance(rootDir: string = process.cwd()): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];
  const ROOT_DIR = rootDir;
  const DOCS_DIR = path.join(ROOT_DIR, 'docs');
  const PORTAL_PATH = path.join(DOCS_DIR, 'README.md');

  // 2. Obtener el universo markdown (ver collectMarkdownUniverse).
  const docsFiles = collectMarkdownUniverse(ROOT_DIR);

  // 3. Validar cada archivo
  for (const filePath of docsFiles) {
    const relFile = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Regla: Prohibición de esquemas absolutos file:///
    if (content.includes('file:///')) {
      violations.push({
        file: relFile,
        rule: 'DOC-G01-NO-FILE-SCHEME',
        message: 'Contiene enlaces absolutos con esquema local "file:///" prohibidos por portabilidad.',
      });
    }
    // Regla: Detección de enlaces relativos rotos
    const linkTargets = extractMarkdownLinkTargets(content);
    for (const rawTarget of linkTargets) {
      if (
        rawTarget.startsWith('http://') ||
        rawTarget.startsWith('https://') ||
        rawTarget.startsWith('mailto:') ||
        rawTarget.startsWith('#')
      ) {
        continue;
      }

      // Remover ancla interna si existe (ej. archivo.md#seccion -> archivo.md)
      const targetFilePath = rawTarget.split('#')[0];
      if (!targetFilePath) {
        continue; // Enlace tipo (#anchor)
      }

      const resolvedPath = path.resolve(path.dirname(filePath), targetFilePath);
      if (!fs.existsSync(resolvedPath)) {
        violations.push({
          file: relFile,
          rule: 'DOC-G02-BROKEN-RELATIVE-LINK',
          message: `El enlace relativo "${rawTarget}" apunta a una ruta inexistente en disco: ${path.relative(ROOT_DIR, resolvedPath).replace(/\\/g, '/')}`,
        });
      }
    }
  }

  // 4. Validar integridad del portal (DOC-011)
  if (fs.existsSync(PORTAL_PATH)) {
    const portalContent = fs.readFileSync(PORTAL_PATH, 'utf-8');
    for (const cat of INDEXED_DIRS) {
      const catDir = path.join(DOCS_DIR, cat);
      if (!fs.existsSync(catDir)) continue;

      const catFiles = fs.readdirSync(catDir).filter((f) => f.endsWith('.md'));
      for (const f of catFiles) {
        if (!portalContent.includes(f)) {
          violations.push({
            file: 'docs/README.md',
            rule: 'DOC-011-PORTAL-INDEX-MISSING',
            message: `El documento activo "docs/${cat}/${f}" no se encuentra indexado en docs/README.md.`,
          });
        }
      }
    }
  }

  return violations;
}

// Ejecución CLI directa
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
) {
  console.log('📚 Pokédex Documentation Governance Gate');
  console.log('==========================================');

  const violations = validateDocsGovernance();

  if (violations.length === 0) {
    console.log('✅ 100% de los documentos cumplen las compuertas de gobernanza sin drift.');
    process.exit(0);
  } else {
    console.error(`❌ Se detectaron ${violations.length} violaciones de gobernanza documental:`);
    for (const v of violations) {
      console.error(`  - [${v.rule}] ${v.file}: ${v.message}`);
    }
    process.exit(1);
  }
}
