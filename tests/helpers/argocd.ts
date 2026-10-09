import yaml from 'js-yaml';

/**
 * Devuelve los archivos que excluye `spec.source.directory.exclude` de una
 * Application de ArgoCD.
 *
 * Se lee del documento YAML parseado, no del texto: un `exclude:` comentado o
 * perteneciente a otro bloque no cuenta como si ArgoCD lo aplicara.
 *
 * ArgoCD interpreta `exclude` como UN glob. Varios archivos se expresan con
 * llaves (`'{a.yaml,b.yaml}'`); una lista multilínea no es un glob válido y
 * ArgoCD termina descubriendo los archivos que se pretendía excluir. Si el
 * valor no es un glob de una línea, la función devuelve `[]` para que los
 * contratos fallen en lugar de dar por buena una exclusión que no aplica.
 */
export function parseDirectoryExclude(applicationYaml: string): string[] {
  const application = yaml.load(applicationYaml) as { spec?: { source?: { directory?: { exclude?: unknown } } } };
  const value = application?.spec?.source?.directory?.exclude;
  if (typeof value !== 'string') return [];
  const unquoted = value.trim();
  // Un bloque multilínea (`|` o `>`) llega como cadena con saltos de línea.
  if (!unquoted || unquoted.includes('\n')) return [];
  const braces = /^\{(.+)\}$/.exec(unquoted);
  return (braces ? braces[1].split(',') : [unquoted]).map((f) => f.trim()).filter(Boolean);
}
