import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');
const WORKFLOWS_DIR = path.join(ROOT_DIR, '.github', 'workflows');

function listWorkflows(): string[] {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => path.join(WORKFLOWS_DIR, f));
}

test('🔒 Supply Chain: las actions del release no usan runtimes de Node retirados', () => {
  // GitHub retiró el runtime Node 20 de los runners el 2026-09-23 y eliminó el
  // opt-out ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION. Una action fijada a un commit
  // que declare `using: node20` sigue ejecutándose porque el runner la fuerza a
  // Node 24, pero solo con un warning, y deja de hacerlo cuando se retire el
  // forzado. El release se bloquearía en silencio (la fase `promote` no calcularía
  // `new_tag` y el paso 8 se saltaría por su guard fail-closed).
  const wf = fs.readFileSync(path.join(WORKFLOWS_DIR, 'release-tag.yaml'), 'utf8');

  const pins = [...wf.matchAll(/uses:\s*([a-z0-9_-]+\/[a-z0-9_.-]+)@([a-f0-9]{40})/g)].map((m) => ({
    action: m[1],
    sha: m[2],
  }));

  assert.ok(pins.length >= 4, 'El workflow debe fijar sus actions por SHA');
  for (const pin of pins) {
    assert.match(pin.sha, /^[a-f0-9]{40}$/, `${pin.action} debe estar fijada por SHA completo (supply chain policy)`);
  }

  // github-tag-action es la única action del repositorio que quedó en un runtime
  // retirado. Se fija el SHA de v7 (node24) de forma explícita.
  assert.ok(
    wf.includes('mathieudutour/github-tag-action@af99e60ce8132224b8e6ebab5023449fe256ed46'),
    'github-tag-action debe estar fijada al commit de v7 (runtime node24)',
  );
  assert.ok(
    !wf.includes('a22cf08638b34d5badda920f9daf6e72c477b07b'),
    'No debe mantenerse el pin de v6.2, que declara using: node20 (retirado)',
  );
});

test('🏷️ Release Tag: el header de la API de GitHub tiene el quoting balanceado', () => {
  const wf = fs.readFileSync(path.join(WORKFLOWS_DIR, 'release-tag.yaml'), 'utf8');
  assert.match(
    wf,
    /-H 'X-GitHub-Api-Version: 2022-11-28'/,
    "El header debe ser -H 'X-GitHub-Api-Version: 2022-11-28' (comillas simples balanceadas)",
  );
  assert.doesNotMatch(
    wf,
    /'X-GitHub-Api-Version: '2022-11-28'/,
    "No debe existir el quoting desbalanceado 'X-GitHub-Api-Version: '2022-11-28' (REL-002)",
  );
});

test('🔤 Workflows: los archivos usan fin de línea LF (relacionado con REL-002)', () => {
  // Los bloques `run:` embeben shell script. Con CRLF el caracter \r se incorpora
  // al quoting de bash y rompe el parseo en los runners Ubuntu con
  // `syntax error near unexpected token '('`. Detectado en release-tag.yaml, pero
  // la condicion es latente en los demas workflows del directorio.
  const offenders: string[] = [];
  for (const file of listWorkflows()) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('\r\n')) offenders.push(path.relative(ROOT_DIR, file));
  }
  assert.deepEqual(offenders, [], `Workflows con CRLF (deben usar LF): ${offenders.join(', ')}`);
});

test('🔤 Workflows: .gitattributes fuerza LF en los workflows', () => {
  const gitattributes = path.join(ROOT_DIR, '.gitattributes');
  assert.ok(fs.existsSync(gitattributes), '.gitattributes debe existir');
  const content = fs.readFileSync(gitattributes, 'utf8');
  assert.match(content, /\.github\/workflows\/\*\.yaml\s+text\s+eol=lf/, 'debe forzar LF en los workflows .yaml');
  assert.match(content, /\.sh\s+text\s+eol=lf/, 'debe preservar la regla existente para .sh');

  test('🔒 INFRA-005: toda imagen del Chart debe soportar fijacion por digest', () => {
    // Antes de este cambio, solo api/web/gdrive tenían el override condicional de
    // digest; postgres, pgbouncer, redis y seed concatenaban `repository:tag` de
    // forma directa. Con el digest incrustado dentro del campo `tag` era imposible
    // migrar a un campo `digest` dedicado sin reescribir la etiqueta completa.
    const chartDir = path.join(ROOT_DIR, 'infra/helm/pokedex/templates');
    const valuesPath = path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml');

    const offenders: string[] = [];
    for (const file of fs.readdirSync(chartDir)) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const content = fs.readFileSync(path.join(chartDir, file), 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/image:\s*"\{\{.*\}\}"/);
        if (!m) continue;
        // Toda plantilla de imagen debe ofrecer la rama del digest.
        if (!m[0].includes('if .Values') || !m[0].includes('image.digest')) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `INFRA-005: estas plantillas no soportan fijacion por digest: ${offenders.join(', ')}`,
    );

    // El valor por defecto de un despliegue productivo debe llevar SIEMPRE digest.
    // El patron es `repository:tag@digest` (no `repository@digest`), que preserva la
    // etiqueta legible y por tanto mantiene la referencia EXACTA que se renderizaba
    // antes de migrar el valor al campo `digest`.
    const values = fs.readFileSync(valuesPath, 'utf8');
    const required: Array<[string, RegExp]> = [
      ['postgresql', /postgresql:[\s\S]*?digest:\s*"sha256:[a-f0-9]{64}"/],
      ['pgbouncer', /pgbouncer:[\s\S]*?digest:\s*"sha256:[a-f0-9]{64}"/],
      ['redis', /redis:[\s\S]*?digest:\s*"sha256:[a-f0-9]{64}"/],
    ];
    for (const [name, pattern] of required) {
      assert.match(values, pattern, `INFRA-005: values.yaml debe fijar digest para ${name}`);
    }

    // Prohibido el antipatron: un digest incrustado dentro de `tag` impide migrar al
    // campo `digest` dedicado y oculta que la imagen esta fijada.
    const inlineDigest = [...values.matchAll(/tag:\s*"[^"]*@sha256:[a-f0-9]{64}"/g)];
    assert.deepEqual(
      inlineDigest.map((m) => m[0]),
      [],
      'INFRA-005: el digest no debe incrustarse en `tag`; declararlo en el campo `digest`',
    );
  });
});

test('🐚 Workflows: ningun reusable workflow se invoca con la extension .yml obsoleta', () => {
  const offenders: string[] = [];
  for (const file of listWorkflows()) {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/uses:\s*(\.\/\.github\/workflows\/[a-z0-9-]+)\.yml\b/);
    if (match) offenders.push(`${path.relative(ROOT_DIR, file)} -> ${match[1]}.yml`);
  }
  assert.deepEqual(offenders, [], `Workflows con rutas obsoletas: ${offenders.join(', ')}`);
});
