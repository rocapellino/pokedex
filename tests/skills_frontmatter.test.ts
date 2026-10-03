import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

// AUD-GOV-SKL-011: el despacho condicional de skills (AGENTS.md §3) depende de la
// `description` del frontmatter. Un `description:` sin comillas que contiene ": "
// es YAML inválido y los agentes con parser estricto pierden la descripción.

const SKILLS_DIR = path.join(process.cwd(), '.agents', 'skills');

const skillDirs = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name);

test('🧭 Skills: el catálogo contiene skills', () => {
  assert.ok(skillDirs.length > 0, 'No se encontraron skills en .agents/skills/');
});

for (const dir of skillDirs) {
  test(`🧭 Skills: ${dir}/SKILL.md tiene frontmatter YAML válido con name y description`, () => {
    const content = fs.readFileSync(path.join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(match, `${dir}/SKILL.md no declara frontmatter`);

    let frontmatter: unknown;
    assert.doesNotThrow(() => {
      frontmatter = yaml.load(match[1]);
    }, `${dir}/SKILL.md tiene frontmatter YAML inválido (¿description con ": " sin comillas?)`);

    const { name, description } = frontmatter as { name?: unknown; description?: unknown };
    assert.equal(name, dir, `${dir}/SKILL.md debe declarar name igual al directorio`);
    assert.equal(typeof description, 'string', `${dir}/SKILL.md debe declarar description`);
    assert.ok((description as string).trim().length > 0, `${dir}/SKILL.md tiene description vacía`);
  });
}
