import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

/** Extrae el bloque `location <selector> { ... }` de la configuración de nginx. */
function locationBlock(conf: string, selector: string): string {
  const start = conf.indexOf(`location ${selector} {`);
  assert.notEqual(start, -1, `la configuración debe declarar location ${selector}`);
  const end = conf.indexOf('\n    }', start);
  return conf.slice(start, end);
}

test('🔎 SEO: index.html declara una meta description descriptiva y de longitud razonable', () => {
  const html = read('apps/frontend/index.html');
  const content = /<meta\s+name="description"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(content, 'index.html debe tener <meta name="description">');
  assert.ok(content.length >= 50 && content.length <= 160, `longitud ${content.length}: debe estar entre 50 y 160`);
});

test('🔎 SEO: robots.txt existe en public/, es válido y no bloquea ninguna ruta', () => {
  const robots = read('apps/frontend/public/robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  // Un `Disallow: /backoffice` hace que Lighthouse marque esa página como no rastreable (is-crawlable)
  // y hunde su SEO (92 a 66 medido); el acceso ya está restringido por IP en nginx.
  assert.equal(robots.split('\n').filter((l) => l.startsWith('Disallow:')).length, 0, 'no debe haber Disallow');
});

for (const file of ['apps/frontend/nginx.conf.template', 'apps/frontend/nginx.conf']) {
  test(`🗜️ Compresión (${path.basename(file)}): gzip activo para texto y desactivado en /api/ y /metrics`, () => {
    const conf = read(file);

    assert.match(conf, /^\s*gzip on;/m, 'gzip debe estar activo a nivel de server');
    assert.match(
      conf,
      /^\s*gzip_vary on;/m,
      'Vary: Accept-Encoding evita servir contenido comprimido a quien no lo admite',
    );
    assert.match(conf, /^\s*gzip_min_length \d+;/m);
    const types = /^\s*gzip_types ([^;]+);/m.exec(conf)?.[1] ?? '';
    for (const type of ['text/css', 'application/javascript', 'application/json', 'image/svg+xml']) {
      assert.ok(types.split(/\s+/).includes(type), `gzip_types debe incluir ${type}`);
    }
    assert.ok(!types.includes('woff2'), 'woff2 ya va comprimido: recomprimirlo solo gasta CPU');

    // BREACH: las respuestas de autenticación y de métricas no se comprimen.
    assert.match(locationBlock(conf, '/api/'), /gzip off;/);
    assert.match(locationBlock(conf, '/metrics'), /gzip off;/);
    // El catálogo público sí se comprime (es la mayor parte de los bytes transferidos).
    assert.ok(!/gzip off;/.test(locationBlock(conf, '/pokemons')), '/pokemons debe heredar la compresión');
  });
}
