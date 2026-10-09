import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './repo.js';

/**
 * Lector mínimo de HCL (OpenTofu/Terraform) para las pruebas de contratos de IaC.
 *
 * No evalúa expresiones: devuelve la estructura de bloques (`variable "x" { ... }`, `resource "t" "n" { ... }`) con
 * sus atributos como texto. Ignora los comentarios (de línea y de bloque) y respeta cadenas con interpolación y
 * llaves anidadas, que es lo que las expresiones regulares sobre el texto no resuelven (un `[^}]*` se corta en la
 * primera llave de un bloque anidado, y un atributo comentado cuenta como si estuviera activo).
 */
export interface HclBlock {
  type: string;
  labels: string[];
  /** Atributos del bloque (sin los de sus sub-bloques); el valor es la expresión como texto, ya recortada. */
  attrs: Record<string, string>;
  blocks: HclBlock[];
  /** Cuerpo completo del bloque (incluidos sub-bloques), sin comentarios. */
  raw: string;
}

/** Avanza desde la comilla de apertura de `src[i]` hasta pasada la comilla de cierre (con `${ ... }` anidado). */
function skipString(src: string, i: number): number {
  let pos = i + 1;
  while (pos < src.length) {
    const ch = src[pos];
    if (ch === '\\') pos += 2;
    else if (ch === '$' && src[pos + 1] === '{') pos = skipBraces(src, pos + 1);
    else if (ch === '"') return pos + 1;
    else pos += 1;
  }
  return pos;
}

/** Avanza desde una `{` hasta pasada su `}` correspondiente. */
function skipBraces(src: string, i: number): number {
  let depth = 0;
  let pos = i;
  while (pos < src.length) {
    const ch = src[pos];
    if (ch === '"') {
      pos = skipString(src, pos);
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return pos + 1;
    }
    pos += 1;
  }
  return pos;
}

/** Elimina los comentarios sin tocar el contenido de las cadenas. */
export function stripHclComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      const end = skipString(src, i);
      out += src.slice(i, end);
      i = end;
    } else if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function parseBody(src: string): Pick<HclBlock, 'attrs' | 'blocks'> {
  const attrs: Record<string, string> = {};
  const blocks: HclBlock[] = [];
  let i = 0;
  const skipSpaces = () => {
    while (i < src.length && /\s/.test(src[i])) i += 1;
  };
  while (i < src.length) {
    skipSpaces();
    const ident = /^[A-Za-z_][\w-]*/.exec(src.slice(i))?.[0];
    if (!ident) {
      i += 1;
      continue;
    }
    i += ident.length;
    while (src[i] === ' ' || src[i] === '\t') i += 1;

    if (src[i] === '=') {
      // Atributo: el valor llega hasta el fin de línea con los corchetes, llaves y cadenas balanceados.
      i += 1;
      const start = i;
      let depth = 0;
      while (i < src.length && !(src[i] === '\n' && depth <= 0)) {
        const ch = src[i];
        if (ch === '"') {
          i = skipString(src, i);
          continue;
        }
        if ('[{('.includes(ch)) depth += 1;
        if (']})'.includes(ch)) depth -= 1;
        i += 1;
      }
      attrs[ident] = src.slice(start, i).trim();
      continue;
    }

    // Bloque: etiquetas entre comillas (o identificadores) y cuerpo entre llaves.
    const labels: string[] = [];
    while (i < src.length && src[i] !== '{') {
      if (src[i] === '"') {
        const end = skipString(src, i);
        labels.push(src.slice(i + 1, end - 1));
        i = end;
      } else {
        i += 1;
      }
    }
    if (src[i] !== '{') break;
    const end = skipBraces(src, i);
    const raw = src.slice(i + 1, end - 1);
    blocks.push({ type: ident, labels, raw, ...parseBody(raw) });
    i = end;
  }
  return { attrs, blocks };
}

/** Parsea código HCL; el resultado es un bloque raíz (`type: ''`) con los atributos y bloques de primer nivel. */
export function parseHcl(source: string): HclBlock {
  const raw = stripHclComments(source);
  return { type: '', labels: [], raw, ...parseBody(raw) };
}

/** Lee y parsea un archivo `.tf` / `.tfvars` (ruta relativa a la raíz del repo). */
export function readHcl(relativePath: string): HclBlock {
  return parseHcl(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf-8'));
}

/** Parsea todos los `.tf` de un directorio. */
export function readHclDir(relativeDir: string): HclBlock[] {
  const dir = path.join(ROOT_DIR, relativeDir);
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.tf'))
    .map((file) => readHcl(path.join(relativeDir, file)));
}

/** Bloques de un tipo (y, opcionalmente, de una etiqueta) en uno o varios árboles. */
export function blocksOf(roots: HclBlock | HclBlock[], type: string, label?: string): HclBlock[] {
  return (Array.isArray(roots) ? roots : [roots]).flatMap((root) =>
    root.blocks.filter((b) => b.type === type && (label === undefined || b.labels[0] === label)),
  );
}

/** Valor de un atributo sin las comillas de una cadena literal; `undefined` si no existe. */
export function stringAttr(block: HclBlock, name: string): string | undefined {
  const value = block.attrs[name];
  return value === undefined ? undefined : value.replace(/^"(.*)"$/s, '$1');
}
