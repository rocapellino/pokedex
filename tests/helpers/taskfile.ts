import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Carga el contenido efectivo del Taskfile del monorepo resolviendo de forma
 * determinista e inmutable el archivo raíz y todos los submódulos incluidos en
 * el directorio `taskfiles/`.
 *
 * Esto permite a las suites de pruebas de seguridad y gobernanza validar la
 * presencia de tareas críticas y comandos protegidos (ej. `--type merge`) sin
 * acoplarse rígidamente a la estructura de un archivo monolítico.
 */
export function getCompleteTaskfileContent(rootDir: string): string {
  const rootPath = path.join(rootDir, 'Taskfile.yaml');
  let content = fs.existsSync(rootPath) ? fs.readFileSync(rootPath, 'utf-8') : '';

  const taskfilesDir = path.join(rootDir, 'taskfiles');
  if (fs.existsSync(taskfilesDir)) {
    const files = fs.readdirSync(taskfilesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
    for (const file of files) {
      content += '\n' + fs.readFileSync(path.join(taskfilesDir, file), 'utf-8');
    }
  }

  return content;
}
