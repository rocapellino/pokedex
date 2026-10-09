import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

interface TaskDefinition {
  desc?: string;
  cmds?: Array<string | { task?: string; cmd?: string }>;
  deps?: Array<string | { task?: string }>;
  [key: string]: unknown;
}

interface ParsedTaskfile {
  tasks?: Record<string, TaskDefinition>;
  vars?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Taskfile efectivo parseado: la raíz y los submódulos de `taskfiles/` (que se incluyen con `flatten: true`, de modo
 * que sus tareas se llaman sin prefijo). Devuelve las tareas por nombre y el contenido parseado de cada archivo, sin
 * comentarios, para comprobar tareas y referencias que Task realmente conoce.
 */
export function readTaskfiles(rootDir: string): {
  tasks: Record<string, TaskDefinition>;
  documents: ParsedTaskfile[];
} {
  const files = [path.join(rootDir, 'Taskfile.yaml')];
  const taskfilesDir = path.join(rootDir, 'taskfiles');
  if (fs.existsSync(taskfilesDir)) {
    for (const file of fs.readdirSync(taskfilesDir).sort()) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) files.push(path.join(taskfilesDir, file));
    }
  }
  const documents = files
    .filter((file) => fs.existsSync(file))
    .map((file) => yaml.load(fs.readFileSync(file, 'utf-8')) as ParsedTaskfile);
  return { tasks: Object.assign({}, ...documents.map((doc) => doc.tasks ?? {})), documents };
}

/** Comandos que lanza una tarea: sus `cmds` y, para las llamadas a otras tareas, `task <nombre>`. */
export function taskCommands(task: TaskDefinition): string[] {
  return (task.cmds ?? []).flatMap((cmd) => {
    if (typeof cmd === 'string') return [cmd];
    if (cmd.task) return [`task ${cmd.task}`];
    return cmd.cmd ? [cmd.cmd] : [];
  });
}

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
    const files = fs
      .readdirSync(taskfilesDir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .sort();
    for (const file of files) {
      content += `\n${fs.readFileSync(path.join(taskfilesDir, file), 'utf-8')}`;
    }
  }

  return content;
}
