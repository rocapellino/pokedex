/**
 * ==============================================================================
 * scripts/update-image-digests.ts
 * ==============================================================================
 * Fija los digests de pokedex-api y pokedex-web en los values de despliegue.
 *
 * Lo invoca la fase promote de .github/workflows/release-tag.yaml con los
 * digests de las imágenes que ci.yaml publicó y firmó para el mismo commit, de
 * modo que el PR de promoción mueva de forma atómica versión, targetRevision e
 * imágenes. Reemplaza solo la línea `digest:` del bloque de cada componente y
 * conserva comentarios y finales de línea.
 *
 * Uso:
 *   node --experimental-strip-types scripts/update-image-digests.ts \
 *     --api sha256:<64 hex> --web sha256:<64 hex>
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ImageComponent = 'api' | 'web';

/** Values cuyo digest de api y web despliegan los entornos (inter-environment parity). */
export const IMAGE_VALUES_FILES = [
  'gitops/environments/proxmox/values.yaml',
  'gitops/environments/proxmox-preprod/values.yaml',
  'gitops/environments/aws/values.yaml',
  'infra/helm/pokedex/values.prod.yaml',
];

const IMMUTABLE_DIGEST = /^sha256:[a-f0-9]{64}$/;

/** Reemplaza el digest de la imagen del componente (bloque `<component>:` de primer nivel). */
export function replaceComponentDigest(content: string, component: ImageComponent, digest: string): string {
  if (!IMMUTABLE_DIGEST.test(digest)) {
    throw new Error(`Digest inválido para ${component}: se esperaba sha256:<64 hex>, se recibió "${digest}"`);
  }

  const lines = content.split('\n');
  let topLevel = '';
  let matches = 0;

  const updated = lines.map((line) => {
    const key = line.match(/^([A-Za-z][\w-]*):/);
    if (key) topLevel = key[1];
    if (topLevel !== component) return line;
    return line.replace(/^(\s+digest:\s*"?)sha256:[a-f0-9]{64}("?[^\r]*\r?)$/, (_all, prefix: string, suffix: string) => {
      matches++;
      return `${prefix}${digest}${suffix}`;
    });
  });

  if (matches !== 1) {
    throw new Error(`Se esperaba exactamente un digest bajo "${component}:" y se encontraron ${matches}`);
  }
  return updated.join('\n');
}

/** Aplica los digests a todos los values de despliegue. Devuelve los archivos modificados. */
export function applyImageDigests(digests: Record<ImageComponent, string>, root: string = process.cwd()): string[] {
  const changed: string[] = [];
  for (const file of IMAGE_VALUES_FILES) {
    const fullPath = path.join(root, file);
    const original = fs.readFileSync(fullPath, 'utf8');
    let content = original;
    for (const component of Object.keys(digests) as ImageComponent[]) {
      content = replaceComponentDigest(content, component, digests[component]);
    }
    if (content !== original) {
      fs.writeFileSync(fullPath, content);
      changed.push(file);
    }
  }
  return changed;
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const api = argValue(args, '--api');
  const web = argValue(args, '--web');
  if (!api || !web) {
    console.error('Uso: node --experimental-strip-types scripts/update-image-digests.ts --api sha256:<hex> --web sha256:<hex>');
    process.exit(1);
  }
  try {
    const changed = applyImageDigests({ api, web });
    console.log(
      changed.length
        ? `✅ Digests fijados (api=${api}, web=${web}) en:\n${changed.map((f) => `   - ${f}`).join('\n')}`
        : '✅ Los values ya fijan esos digests; sin cambios.'
    );
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
