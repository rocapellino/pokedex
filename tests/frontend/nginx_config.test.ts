import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('🌐 Nginx SSOT (DOC-003/CI-004): CI valida contra la imagen del Dockerfile, sin version hardcodeada', () => {
  const dockerfile = fs.readFileSync(path.join(ROOT_DIR, 'apps/frontend/Dockerfile'), 'utf-8');
  const webWf = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/web.yaml'), 'utf-8');

  // La imagen productiva declarada en el Dockerfile.
  const imageMatch = dockerfile.match(/^FROM (nginx:[^\s@]+@sha256:[a-f0-9]{64})/m);
  assert.ok(imageMatch, 'El Dockerfile del frontend debe declarar FROM nginx:<version>@sha256:<digest>');
  const nginxImage = imageMatch[1];

  // La version de produccion (tag, sin el prefijo `nginx:`).
  const version = nginxImage.split('@')[0].replace(/^nginx:/, '');
  const digest = nginxImage.split('@')[1];

  // 1. Ningun workflow debe hardcodear una version de Nginx: debe derivarse del
  //    Dockerfile, que es la unica SSOT.
  assert.doesNotMatch(
    webWf,
    /nginx:\d+\.\d+/,
    'web.yaml no debe hardcodear una version de Nginx: debe extraerse del Dockerfile (SSOT)'
  );

  // 2. El workflow debe resolver la imagen desde el Dockerfile.
  assert.match(
    webWf,
    /DOCKERFILE=apps\/frontend\/Dockerfile/,
    'web.yaml debe apuntar al Dockerfile del frontend como SSOT'
  );
  assert.match(
    webWf,
    /grep -oE '\^FROM nginx:/,
    'web.yaml debe extraer la imagen de Nginx del Dockerfile'
  );

  // 3. La validacion debe usar la plantilla que realmente despliega produccion.
  assert.match(
    webWf,
    /nginx\.conf\.template/,
    'web.yaml debe validar nginx.conf.template, que es lo que renderiza el Dockerfile en produccion'
  );
  // El renderizado no puede ejecutarse inline con `node -e`: los backticks y
  // los `${...}` se interpretan como command substitution en bash y la
  // validacion falla con literales sin sustituir. Debe delegar en el script.
  assert.match(
    webWf,
    /node scripts\/generate-nginx-conf\.mjs --render/,
    'web.yaml debe delegar el renderizado en scripts/generate-nginx-conf.mjs --render'
  );
  assert.doesNotMatch(
    webWf,
    /node -e/,
    'web.yaml no debe usar `node -e` inline: bash expande los backticks y ${...}'
  );
  // El template declara `proxy_pass http://api:3000`, y `nginx -t` resuelve los
  // hosts de upstream en tiempo de validacion: sin --add-host falla.
  assert.match(webWf, /proxy_pass/, 'sanity: el template debe usar proxy_pass');
  assert.match(
    webWf,
    /--add-host=api:127\.0\.0\.1/,
    'web.yaml debe resolver el host `api`, usado por proxy_pass en nginx.conf.template'
  );

  // 4. La documentacion de seguridad debe reflejar la imagen real, no una anterior.
  const securityDoc = fs.readFileSync(
    path.join(ROOT_DIR, 'docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md'),
    'utf-8'
  );
  assert.ok(
    securityDoc.includes(version),
    `SECURITY_AND_NETWORK_ISOLATION.md debe documentar la version productiva ${version}`
  );
  assert.ok(
    securityDoc.includes(digest),
    'SECURITY_AND_NETWORK_ISOLATION.md debe documentar el digest productivo real'
  );
});

test('🌐 Nginx SSOT: el generador unificado sustituye las variables y falla si faltan en modo --render', () => {
  const scriptPath = path.join(ROOT_DIR, 'scripts/generate-nginx-conf.mjs');
  assert.ok(fs.existsSync(scriptPath), 'scripts/generate-nginx-conf.mjs debe existir');

  const script = fs.readFileSync(scriptPath, 'utf-8');
  const template = fs.readFileSync(
    path.join(ROOT_DIR, 'apps/frontend/nginx.conf.template'),
    'utf-8'
  );

  // Toda variable usada por la plantilla debe estar contemplada por el renderizador.
  const used = [...new Set([...template.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]))];
  for (const key of used) {
    assert.ok(script.includes(key), `El renderizador debe conocer la variable ${key}`);
  }

  const outOk = path.join(ROOT_DIR, 'render-probe-ok.conf');
  try {
    execSync(`node "${scriptPath}" --render "${outOk}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      env: {
        ...process.env,
        BACKOFFICE_ALLOWED_IP_1: '10.42.0.1/32',
        BACKOFFICE_ALLOWED_IP_2: '192.168.1.50/32',
        METRICS_ALLOWED_CIDR: '10.42.0.0/24',
      },
    });
    const rendered = fs.readFileSync(outOk, 'utf-8');
    assert.doesNotMatch(
      rendered,
      /\$\{\w+\}/,
      'La configuracion renderizada no debe conservar placeholders'
    );
    assert.ok(
      rendered.includes('allow 10.42.0.1/32;'),
      'La IP del backoffice debe quedar sustituida en la configuracion'
    );
  } finally {
    if (fs.existsSync(outOk)) fs.rmSync(outOk, { force: true });
  }

  // Fail-closed: una variable ausente debe abortar con exit 1.
  const outBad = path.join(ROOT_DIR, 'render-probe-bad.conf');
  let failed = false;
  try {
    execSync(`node "${scriptPath}" --render "${outBad}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      env: { ...process.env, METRICS_ALLOWED_CIDR: '' },
      stdio: 'pipe',
    });
  } catch {
    failed = true;
  } finally {
    if (fs.existsSync(outBad)) fs.rmSync(outBad, { force: true });
  }
  assert.equal(failed, true, 'El renderizador debe fallar si falta una variable de entorno');
});

test('📦 OCI-001: los labels de imagen usan la version y revision reales', () => {
  const dockerfiles = [
    ['apps/backend/Dockerfile', 'pokedex-api'],
    ['apps/frontend/Dockerfile', 'pokedex-web'],
  ];

  for (const [relPath, title] of dockerfiles) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf-8');

    // El `version="X.Y.Z"` generico debe desaparecer: no coincide con la release.
    assert.doesNotMatch(
      content,
      /^\s*version="/m,
      `${relPath} no debe declarar un label \`version\` generico (OCI-001)`
    );

    // Version y revision OCI deben venir de los build-args inyectados por CI.
    assert.match(
      content,
      /org\.opencontainers\.image\.version="\$\{APP_VERSION\}"/,
      `${relPath} debe declarar org.opencontainers.image.version desde APP_VERSION`
    );
    assert.match(
      content,
      /org\.opencontainers\.image\.revision="\$\{GIT_SHA\}"/,
      `${relPath} debe declarar org.opencontainers.image.revision desde GIT_SHA`
    );

    // Los ARG deben declararse ANTES del LABEL para que puedan expandirse.
    const argIdx = content.indexOf('ARG APP_VERSION');
    const labelIdx = content.indexOf('org.opencontainers.image.version');
    assert.ok(argIdx > -1, `${relPath} debe declarar ARG APP_VERSION`);
    assert.ok(argIdx < labelIdx, `${relPath} debe declarar ARG APP_VERSION antes del LABEL`);

    assert.ok(
      content.includes(`org.opencontainers.image.title="${title}"`),
      `${relPath} debe declarar el titulo OCI ${title}`
    );
  }
});
