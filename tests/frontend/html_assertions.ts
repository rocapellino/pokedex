import { dom } from './mega_env.js';
import assert from 'node:assert/strict';

/** Datos hostiles reutilizados por las pruebas de inyección del render HTML. */
export const SCRIPT = '<script>alert(1)</script>';
export const IMG = '<img src=x onerror=alert(1)>';
export const BREAKOUT = '" onmouseover="alert(1)" x="';

const EXECUTABLE_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);

/**
 * Se analiza el DOM resultante en lugar de buscar texto: el dato hostil sigue apareciendo como TEXTO
 * escapado (`&lt;img ... onerror=...&gt;`), y eso es correcto; lo que no puede ocurrir es que genere
 * elementos o atributos.
 */
export function assertNeutralized(output: string, label: string): void {
  const doc = new dom.window.DOMParser().parseFromString(`<table><tbody>${output}</tbody></table>`, 'text/html');
  const elements = [...doc.querySelectorAll('*')];
  const executable = elements.filter((el) => EXECUTABLE_TAGS.has(el.tagName)).map((el) => el.tagName);
  assert.deepEqual(executable, [], `${label}: elementos ejecutables inyectados`);
  assert.equal(doc.querySelectorAll('img[src="x"]').length, 0, `${label}: <img> inyectada`);
  for (const el of elements) {
    const handlers = el.getAttributeNames().filter((name) => name.startsWith('on'));
    assert.deepEqual(handlers, [], `${label}: <${el.tagName.toLowerCase()}> con manejadores ${handlers.join(', ')}`);
  }
}
