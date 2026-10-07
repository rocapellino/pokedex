/**
 * Plantilla HTML con escapado automático.
 *
 * Antes, cada valor de la API que se interpolaba en una plantilla tenía que pasar por `escapeText()` a
 * mano: un campo nuevo sin escapar era un defecto silencioso. Con `html` todo valor interpolado se
 * escapa por defecto, y solo pasan intactos los fragmentos `SafeHtml` (el resultado de otro `html` o de
 * `trustedHtml`), que se concatenan sin volver a escaparse.
 *
 *   html`<li class="name">${pokemon.nombre}</li>`            // `nombre` se escapa
 *   html`<ul>${pokemons.map((p) => html`<li>${p.nombre}</li>`)}</ul>`   // un arreglo de fragmentos se une
 *
 * Los atributos deben ir SIEMPRE entre comillas: `escapeText` neutraliza `"`, `'` y el acento grave,
 * pero no protege un valor en un atributo sin comillas.
 *
 * `null`, `undefined` y `false` no pintan nada (así `${cond && html`...`}` funciona). Por eso un atributo
 * booleano de texto, como `aria-selected="true|false"`, debe interpolarse con `String(valor)`: con un
 * `false` sin convertir el atributo quedaría vacío.
 */

import { escapeText, sanitizeHtml } from '../sanitizer.js';

/**
 * Fragmento HTML ya seguro. Es una clase (y no una cadena marcada) porque en ejecución una cadena
 * segura sería indistinguible de una sin escapar.
 */
export class SafeHtml {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  toString(): string {
    return this.#value;
  }
}

/**
 * Marca un fragmento como seguro SIN escaparlo. Reservado para constantes del propio código (por
 * ejemplo un SVG fijo) o para HTML ya saneado por `sanitizeHtml`; nunca para datos de la API.
 */
export function trustedHtml(value: string): SafeHtml {
  return new SafeHtml(value);
}

function render(value: unknown): string {
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeText(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += render(values[i]) + (strings[i + 1] ?? '');
  }
  return new SafeHtml(out);
}

/**
 * Único punto de inserción de HTML en el DOM. Solo acepta `SafeHtml` (una `string` no compila) y,
 * aun así, vuelve a sanear el resultado con DOMPurify: `trustedHtml` no garantiza que el contenido
 * sea inocuo, y esta segunda barrera evita que un uso erróneo llegue al DOM.
 */
export function setHtml(target: Element, content: SafeHtml): void {
  if (!(content instanceof SafeHtml)) {
    throw new TypeError('setHtml solo acepta SafeHtml: use html`...` o trustedHtml()');
  }
  target.innerHTML = sanitizeHtml(content.toString());
}
