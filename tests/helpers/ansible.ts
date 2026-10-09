import { readYaml } from './yaml.js';

const ANSIBLE = 'infra/ansible';

export type Task = Record<string, any>;

/** Aplana tareas anidadas en `block` / `rescue` / `always`. */
export function flattenTasks(tasks: Task[] = []): Task[] {
  return tasks.flatMap((task) => [
    task,
    ...flattenTasks(task.block),
    ...flattenTasks(task.rescue),
    ...flattenTasks(task.always),
  ]);
}

/** Tareas de un rol (`roles/<rol>/tasks/main.yaml`). */
export const roleTasks = (role: string): Task[] =>
  flattenTasks(readYaml<Task[]>(`${ANSIBLE}/roles/${role}/tasks/main.yaml`));

/** Plays de un playbook (`infra/ansible/playbooks/<archivo>`). */
export const playbookPlays = (file: string): Task[] => readYaml<Task[]>(`${ANSIBLE}/playbooks/${file}`);

/** Tareas de un playbook (incluye `pre_tasks`, `tasks`, `post_tasks` y `handlers` de cada play). */
export function playbookTasks(file: string): Task[] {
  return playbookPlays(file).flatMap((play) =>
    flattenTasks([
      ...(play.pre_tasks ?? []),
      ...(play.tasks ?? []),
      ...(play.post_tasks ?? []),
      ...(play.handlers ?? []),
    ]),
  );
}

/** La única tarea cuyo `name` cumple el patrón; falla si hay cero o varias para no verificar la equivocada. */
export function taskNamed(tasks: Task[], name: RegExp): Task {
  const matches = tasks.filter((task) => typeof task.name === 'string' && name.test(task.name));
  if (matches.length !== 1) {
    throw new Error(`Se esperaba una tarea con nombre ${name}, hay ${matches.length}`);
  }
  return matches[0];
}

/** Argumentos del módulo de una tarea, sea cual sea el módulo (`ansible.builtin.copy`, `command`, ...). */
export function moduleArgs(task: Task, module: string): Record<string, any> {
  const key = Object.keys(task).find((k) => k === module || k.endsWith(`.${module}`));
  if (!key) throw new Error(`La tarea "${task.name}" no usa el módulo ${module}`);
  return task[key];
}

/** `content` de un `copy` sin las líneas de comentario de shell, para no contar texto que no se ejecuta. */
export function copiedContent(task: Task): string {
  const content: string = moduleArgs(task, 'copy').content ?? '';
  return content
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}
