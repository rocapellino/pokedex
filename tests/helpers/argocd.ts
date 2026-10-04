/**
 * Devuelve los archivos que excluye `spec.source.directory.exclude` de una
 * Application de ArgoCD.
 *
 * ArgoCD interpreta `exclude` como UN glob. Varios archivos se expresan con
 * llaves (`'{a.yaml,b.yaml}'`); una lista multilínea no es un glob válido y
 * ArgoCD termina descubriendo los archivos que se pretendía excluir. Si el
 * valor no es un glob de una línea, la función devuelve `[]` para que los
 * contratos fallen en lugar de dar por buena una exclusión que no aplica.
 */
export function parseDirectoryExclude(applicationYaml: string): string[] {
  const value = /^\s*exclude:\s*(.+)$/m.exec(applicationYaml.replace(/\r\n/g, '\n'))?.[1]?.trim() ?? '';
  const unquoted = value.replace(/^['"]|['"]$/g, '');
  if (!unquoted || unquoted === '|' || unquoted === '>') return [];
  const braces = /^\{(.+)\}$/.exec(unquoted);
  return (braces ? braces[1].split(',') : [unquoted]).map((f) => f.trim()).filter(Boolean);
}
