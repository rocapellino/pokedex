declare module 'js-yaml' {
  export function loadAll(input: string): unknown[];
  export function load(input: string): unknown;
}
