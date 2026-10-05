#!/usr/bin/env node
/**
 * ==============================================================================
 * scripts/validate-pr-body.ts
 * ==============================================================================
 * Motor canónico de validación contractual del Pull Request Body contra la SSOT
 * física del template (.github/pull_request_template.md).
 *
 * Responsabilidades:
 *   1. Descubrir dinámicamente el PR Template físico activo (SSOT).
 *   2. Parsear el árbol semántico del template (headings H2, H3, checkboxes, tablas).
 *   3. Parsear el PR Body candidato o remoto.
 *   4. Validar que todos los headings del template estén presentes en el PR Body
 *      (template headings ⊆ PR headings) y en el orden relativo adecuado.
 *   5. Validar que no se usen estructuras sustitutas no autorizadas (ej.
 *      "## Descripción del Cambio" en vez de las secciones canónicas).
 *   6. Validar que CI Impact Analysis incluya una tabla resuelta (sin "—").
 *   7. Validar completitud de checklists y justificación explícita de "N/A".
 *   8. Detectar mojibake y corrupción de codificación UTF-8.
 *
 * Salida:
 *   - Exit Code 0: PASS (conforme al contrato del template).
 *   - Exit Code 1: FAIL (infracciones encontradas).
 *   - Exit Code 2: ERROR de ejecución (argumentos inválidos, archivo ausente, etc.).
 * ==============================================================================
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HeadingNode {
  level: number;
  raw: string;
  normalized: string;
  line: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
  section?: string;
  expected?: string;
  actual?: string;
}

export interface ValidationResult {
  isValid: boolean;
  templatePath: string;
  issues: ValidationIssue[];
  templateHeadings: HeadingNode[];
  bodyHeadings: HeadingNode[];
}

/** Precedencia SSOT para localizar el PR Template */
export const TEMPLATE_CANDIDATE_PATHS = [
  path.join('.github', 'pull_request_template.md'),
  path.join('.github', 'PULL_REQUEST_TEMPLATE.md'),
  path.join('.github', 'pull_request_template.txt'),
  'pull_request_template.md',
  path.join('docs', 'pull_request_template.md'),
];

/** Caracteres y secuencias típicas de mojibake en consolas Windows */
export const MOJIBAKE_PATTERNS = [
  /Ã[¡-ÿ]/,
  /Â[¡-ÿ]/,
  /â€[™œž]/,
  /ï¿½/,
  /[├Ôƒ]/,
];

/** Normaliza un heading eliminando emojis, enlaces markdown, puntuación superflua y espacios extras */
export function normalizeHeading(text: string): string {
  // Quitar prefijo de nivel Markdown '#'
  let str = text.replace(/^#+\s*/, '');
  // Quitar enlaces markdown conservando únicamente el texto visible
  str = str.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Eliminar cualquier directiva o comentario delimitado por '<' y '>' sin regex de sanitización
  while (str.indexOf('<') !== -1 && str.indexOf('>') !== -1) {
    const start = str.indexOf('<');
    const end = str.indexOf('>', start);
    if (end === -1) break;
    str = str.slice(0, start) + str.slice(end + 1);
  }

  return str
    // Quitar emojis comunes y símbolos de presentación
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: rangos emoji intencionales con selectores de variacion
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
    // Conservar caracteres alfanuméricos Unicode, barras, ampersand, guiones y espacios
    .replace(/[^\p{L}\p{N}\s/&_-]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Descubre dinámicamente la ruta del PR Template activo */
export function discoverPrTemplate(rootDir: string = process.cwd()): string {
  for (const candidate of TEMPLATE_CANDIDATE_PATHS) {
    const fullPath = path.resolve(rootDir, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  throw new Error(
    `No se encontró ningún PR Template físico en el repositorio. Evaluadas:\n${TEMPLATE_CANDIDATE_PATHS.map(p => `  - ${p}`).join('\n')}`
  );
}

/** Extrae encabezados markdown de un texto */
export function extractHeadings(markdown: string): HeadingNode[] {
  const lines = markdown.split(/\r?\n/);
  const headings: HeadingNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const raw = match[2].trim();
      const normalized = normalizeHeading(raw);
      if (normalized.length > 0) {
        headings.push({
          level,
          raw,
          normalized,
          line: i + 1,
        });
      }
    }
  }

  return headings;
}

/**
 * Valida un PR Body contra el contenido de un template
 */
export function validatePrBody(
  templateContent: string,
  bodyContent: string,
  templatePath: string = '.github/pull_request_template.md'
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Detección de mojibake en el PR body
  for (const pattern of MOJIBAKE_PATTERNS) {
    if (pattern.test(bodyContent)) {
      issues.push({
        code: 'PR_MOJIBAKE_DETECTED',
        message: `Se detectaron posibles caracteres de mojibake o corrupción UTF-8 en el cuerpo del PR (patrón: ${pattern.toString()}).`,
      });
      break;
    }
  }

  // 2. Extraer encabezados de ambas fuentes
  const templateHeadings = extractHeadings(templateContent);
  const bodyHeadings = extractHeadings(bodyContent);

  // Filtrar encabezados H2 del template (secciones obligatorias)
  const templateH2s = templateHeadings.filter(h => h.level === 2);
  const bodyH2s = bodyHeadings.filter(h => h.level === 2);

  if (templateH2s.length === 0) {
    issues.push({
      code: 'TEMPLATE_INVALID',
      message: 'El template no contiene encabezados H2 (##) que delimiten secciones.',
    });
    return {
      isValid: false,
      templatePath,
      issues,
      templateHeadings,
      bodyHeadings,
    };
  }

  // 3. Comprobar que todos los headings H2 del template estén presentes en el PR Body
  const missingHeadings: HeadingNode[] = [];
  const matchedPositions: number[] = [];

  for (const tH2 of templateH2s) {
    // Buscamos coincidencia exacta de heading normalizado o subcadena significativa
    const matchIndex = bodyH2s.findIndex(bH2 => {
      if (bH2.normalized === tH2.normalized) return true;
      // Compatibilidad con variaciones menores (ej. "tipo de cambio" vs "tipo de cambio conventional commits")
      if (
        bH2.normalized.startsWith(tH2.normalized) ||
        tH2.normalized.startsWith(bH2.normalized)
      ) {
        return true;
      }
      return false;
    });

    if (matchIndex === -1) {
      missingHeadings.push(tH2);
      issues.push({
        code: 'MISSING_MANDATORY_SECTION',
        message: `Falta la sección obligatoria del template: "## ${tH2.raw}"`,
        section: tH2.raw,
        expected: tH2.normalized,
      });
    } else {
      matchedPositions.push(matchIndex);
    }
  }

  // 4. Comprobar orden relativo de las secciones coincidentes
  for (let i = 0; i < matchedPositions.length - 1; i++) {
    if (matchedPositions[i] > matchedPositions[i + 1]) {
      issues.push({
        code: 'SECTION_ORDER_VIOLATION',
        message: `El orden de las secciones está alterado respecto al template canónico: "## ${templateH2s[i].raw}" aparece después de "## ${templateH2s[i + 1].raw}".`,
        section: templateH2s[i].raw,
      });
      break;
    }
  }

  // 5. Detectar sustituciones espurias (ej. "## Descripción del Cambio" en vez de las secciones canónicas)
  const forbiddenHeadings = [
    'descripcion del cambio',
    'suite de verificacion local',
    'resumen ejecutivo',
    'cambios introducidos',
  ];

  for (const bH2 of bodyH2s) {
    if (forbiddenHeadings.some(forbidden => bH2.normalized.includes(forbidden))) {
      const isExpectedInTemplate = templateH2s.some(t => t.normalized.includes(bH2.normalized));
      if (!isExpectedInTemplate && missingHeadings.length > 0) {
        issues.push({
          code: 'UNAUTHORIZED_ALTERNATIVE_STRUCTURE',
          message: `Se detectó una estructura alternativa no permitida ("## ${bH2.raw}") en sustitución de las secciones canónicas del template.`,
          section: bH2.raw,
        });
      }
    }
  }

  // 6. Validaciones específicas de contenido

  /** Extrae el texto de un heading H2 ('## ...') sin usar regex complejas */
  const extractH2Raw = (line: string): string | null => {
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      const raw = line.slice(3).trim();
      return raw.length > 0 ? raw : null;
    }
    return null;
  };

  // 6.A: CI Impact Analysis
  const ciImpactHeading = templateH2s.find(h => h.normalized.includes('ci impact analysis'));
  if (ciImpactHeading && !missingHeadings.includes(ciImpactHeading)) {
    // Buscar la sección en el body
    const bodyLines = bodyContent.split(/\r?\n/);
    const ciHeadingIdx = bodyLines.findIndex(l => {
      const raw = extractH2Raw(l);
      return raw !== null && normalizeHeading(raw).includes('ci impact analysis');
    });

    if (ciHeadingIdx !== -1) {
      // Extraer contenido de la sección hasta el próximo ## o separador ---
      const sectionLines: string[] = [];
      for (let i = ciHeadingIdx + 1; i < bodyLines.length; i++) {
        const l = bodyLines[i];
        if (l.startsWith('## ') && !l.startsWith('### ')) break;
        sectionLines.push(l);
      }
      const sectionText = sectionLines.join('\n');

      // Debe incluir tabla Markdown
      const hasMarkdownTable = sectionLines.some(l => /^\|\s*:\s*---\s*\|/.test(l) || /^\|.*\|.*\|/.test(l));
      if (!hasMarkdownTable) {
        issues.push({
          code: 'CI_IMPACT_MISSING_TABLE',
          message: 'La sección "## 🎯 CI Impact Analysis" debe incluir la tabla de impacto generada por scripts/detect-change-impact.ts.',
          section: ciImpactHeading.raw,
        });
      }

      // No debe contener placeholders de tabla sin resolver ("| — |" o "—")
      if (/\|\s*—\s*\|/.test(sectionText)) {
        issues.push({
          code: 'CI_IMPACT_UNRESOLVED_PLACEHOLDERS',
          message: 'La tabla de CI Impact Analysis contiene celdas con placeholders no resueltos ("—"). Todas las celdas deben indicar "✅ Afectado" u "⏭️ Omitido".',
          section: ciImpactHeading.raw,
        });
      }

      // No debe contener los comentarios crudos de plantilla sin sustituir
      if (/<!-- INICIO TABLA GENERADA/.test(sectionText)) {
        issues.push({
          code: 'CI_IMPACT_RAW_DIRECTIVES',
          message: 'La sección CI Impact Analysis conserva directivas de plantilla no sustituidas ("<!-- INICIO TABLA GENERADA ... -->").',
          section: ciImpactHeading.raw,
        });
      }
    }
  }

  // 6.B: Pruebas y Verificaciones Realizadas
  const testsHeading = templateH2s.find(h => h.normalized.includes('pruebas y verificaciones'));
  if (testsHeading && !missingHeadings.includes(testsHeading)) {
    const bodyLines = bodyContent.split(/\r?\n/);
    const testsHeadingIdx = bodyLines.findIndex(l => {
      const raw = extractH2Raw(l);
      return raw !== null && normalizeHeading(raw).includes('pruebas y verificaciones');
    });

    if (testsHeadingIdx !== -1) {
      const sectionLines: string[] = [];
      for (let i = testsHeadingIdx + 1; i < bodyLines.length; i++) {
        const l = bodyLines[i];
        if (l.startsWith('## ') && !l.startsWith('### ')) break;
        sectionLines.push(l);
      }
      const sectionText = sectionLines.join('\n');

      // Debe contener al menos una casilla de verificación o justificación N/A
      const hasCheckboxes = /- \[[ xX]\]/.test(sectionText);
      const hasNa = /\bN\/A\b/i.test(sectionText);

      if (!hasCheckboxes && !hasNa) {
        issues.push({
          code: 'TESTS_SECTION_EMPTY',
          message: 'La sección "## 🧪 Pruebas y Verificaciones Realizadas" no contiene verificaciones marcadas ni declaraciones justificadas.',
          section: testsHeading.raw,
        });
      }
    }
  }

  // 6.C: Detección de secciones completamente vacías
  for (const tH2 of templateH2s) {
    if (missingHeadings.includes(tH2)) continue;

    const bodyLines = bodyContent.split(/\r?\n/);
    const hIdx = bodyLines.findIndex(l => {
      const raw = extractH2Raw(l);
      return raw !== null && normalizeHeading(raw) === tH2.normalized;
    });

    if (hIdx !== -1) {
      const sectionLines: string[] = [];
      for (let i = hIdx + 1; i < bodyLines.length; i++) {
        const l = bodyLines[i];
        if (l.startsWith('## ') && !l.startsWith('### ')) break;
        if (/^---\s*$/.test(l)) continue; // omitir separadores horizontales
        const trimmed = l.trim();
        if (trimmed.length > 0 && !(trimmed.startsWith('<!--') && trimmed.endsWith('-->'))) {
          sectionLines.push(trimmed);
        }
      }

      if (sectionLines.length === 0) {
        issues.push({
          code: 'EMPTY_SECTION',
          message: `La sección "## ${tH2.raw}" está vacía en el cuerpo del PR. Si no aplica, documentar explícitamente "N/A: <motivo>".`,
          section: tH2.raw,
        });
      }
    }
  }

  return {
    isValid: issues.length === 0,
    templatePath,
    issues,
    templateHeadings,
    bodyHeadings,
  };
}

/** Obtiene el body remoto de un PR utilizando la CLI gh */
export function fetchRemotePrBody(prNumber: number | string): string {
  try {
    const ghBin = process.platform === 'win32' ? 'gh.exe' : 'gh';
    const stdout = execFileSync(ghBin, ['pr', 'view', String(prNumber), '--json', 'body', '--jq', '.body'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    return stdout;
  } catch (error) {
    const err = error as Error & { stderr?: string };
    throw new Error(
      `No se pudo obtener el cuerpo del PR remoto #${prNumber} mediante gh CLI: ${err.stderr || err.message}`
    );
  }
}

/** CLI Entrypoint */
export function main(args: string[] = process.argv.slice(2)): void {
  let templateArg: string | undefined;
  let bodyArg: string | undefined;
  let remotePrArg: string | undefined;
  let isJson = false;
  let isQuiet = false;
  let readFromStdin = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`
Uso:
  tsx scripts/validate-pr-body.ts [opciones]

Opciones:
  --body <ruta>          Ruta al archivo Markdown con el cuerpo del PR a validar.
  --template <ruta>      Ruta al template físico (opcional, por defecto autodescubierto).
  --remote <número_pr>   Consulta y valida directamente el cuerpo remoto en GitHub.
  --stdin                Lee el cuerpo del PR desde la entrada estándar.
  --json                 Emite el resultado en formato JSON.
  --quiet                Solo emite mensajes de error y código de salida.
  --help, -h             Muestra esta ayuda.
`);
      process.exit(0);
    } else if (arg === '--body' && i + 1 < args.length) {
      bodyArg = args[++i];
    } else if (arg === '--template' && i + 1 < args.length) {
      templateArg = args[++i];
    } else if (arg === '--remote' && i + 1 < args.length) {
      remotePrArg = args[++i];
    } else if (arg === '--stdin') {
      readFromStdin = true;
    } else if (arg === '--json') {
      isJson = true;
    } else if (arg === '--quiet') {
      isQuiet = true;
    }
  }

  try {
    // 1. Localizar template
    const templatePath = templateArg ? path.resolve(process.cwd(), templateArg) : discoverPrTemplate();
    if (!fs.existsSync(templatePath)) {
      console.error(`❌ Error: El template especificado no existe: ${templatePath}`);
      process.exit(2);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // 2. Obtener body
    let bodyContent = '';
    if (remotePrArg) {
      if (!isQuiet) console.log(`🔍 Consultando PR remoto #${remotePrArg} con gh CLI...`);
      bodyContent = fetchRemotePrBody(remotePrArg);
    } else if (bodyArg) {
      const fullBodyPath = path.resolve(process.cwd(), bodyArg);
      if (!fs.existsSync(fullBodyPath)) {
        console.error(`❌ Error: El archivo de body especificado no existe: ${fullBodyPath}`);
        process.exit(2);
      }
      bodyContent = fs.readFileSync(fullBodyPath, 'utf-8');
    } else if (readFromStdin) {
      bodyContent = fs.readFileSync(0, 'utf-8');
    } else {
      console.error('❌ Error: Debe especificar --body <archivo>, --remote <número> o --stdin.');
      process.exit(2);
    }

    // 3. Ejecutar validación
    const result = validatePrBody(templateContent, bodyContent, templatePath);

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.isValid) {
        if (!isQuiet) {
          console.log('✅ PASS: El cuerpo del PR cumple estrictamente con el contrato del template físico.');
          console.log(`   Template SSOT: ${templatePath}`);
          console.log(`   Secciones validadas: ${result.templateHeadings.filter(h => h.level === 2).length}`);
        }
      } else {
        console.error('❌ FAIL: El cuerpo del PR incumple el contrato del template físico:');
        console.error(`   Template SSOT: ${templatePath}\n`);
        for (const issue of result.issues) {
          console.error(`   • [${issue.code}] ${issue.message}`);
        }
        console.error(`\nTotal de infracciones: ${result.issues.length}`);
      }
    }

    process.exit(result.isValid ? 0 : 1);
  } catch (error) {
    const err = error as Error;
    console.error(`❌ Error crítico en validate-pr-body: ${err.message}`);
    process.exit(2);
  }
}

// Ejecutar main si se invoca como script directo
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun || process.argv[1]?.endsWith('validate-pr-body.ts')) {
  main();
}
