import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, nextClientIp, randomSecret, startApp, type RunningApp } from '../helpers/http-app.js';

const AI_KEY = randomSecret('ai');
const ADMIN_KEY = randomSecret('admin');
const ENDPOINTS = ['/api/v1/ai/diagram', '/api/v1/ai/mock', '/api/v1/ai/image'] as const;

let server: RunningApp;
const saved: Record<string, string | undefined> = {};
const ENV_KEYS = ['AI_API_KEY', 'ADMIN_API_KEY', 'GEMINI_API_KEY'] as const;

before(async () => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.AI_API_KEY = AI_KEY;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  // Sin GEMINI_API_KEY el servicio no llama a la red y responde con su fallback determinista.
  delete process.env.GEMINI_API_KEY;
  server = await startApp();
});

after(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await server.close();
});

// El limitador de IA admite 10 peticiones por minuto y por IP: cada test usa la suya.
const post = (path: string, json: unknown, headers: Record<string, string> = { 'x-api-key': AI_KEY }) =>
  api(server.baseUrl, path, { method: 'POST', json, headers, clientIp: nextClientIp() });

// ------------------------------------------------------------------------------
// Autenticación
// ------------------------------------------------------------------------------
test('🤖 IA: sin clave en la petición responde 401 en los tres endpoints', async () => {
  for (const path of ENDPOINTS) {
    const res = await post(path, { prompt: 'hola' }, {});
    assert.equal(res.status, 401, path);
    assert.match(res.body.detail, /se requiere clave/);
  }
});

test('🤖 IA: una clave incorrecta responde 401', async () => {
  const res = await post('/api/v1/ai/diagram', { prompt: 'hola' }, { 'x-api-key': 'incorrecta' });
  assert.equal(res.status, 401);
  assert.match(res.body.detail, /inválida/);
});

test('🤖 IA: sin AI_API_KEY ni GEMINI_API_KEY en el servidor responde 503 (fail-closed)', async () => {
  delete process.env.AI_API_KEY;
  try {
    const res = await post('/api/v1/ai/diagram', { prompt: 'hola' });
    assert.equal(res.status, 503);
    assert.match(res.body.detail, /AI_API_KEY/);
  } finally {
    process.env.AI_API_KEY = AI_KEY;
  }
});

test('🤖 IA: la clave de administración también autoriza el acceso', async () => {
  const res = await post('/api/v1/ai/diagram', { prompt: 'hola' }, { 'x-api-key': ADMIN_KEY });
  assert.equal(res.status, 200);
});

// ------------------------------------------------------------------------------
// Validación del cuerpo
// ------------------------------------------------------------------------------
test('🤖 IA: un prompt ausente, vacío o no textual responde 400', async () => {
  for (const path of ENDPOINTS) {
    for (const body of [{}, { prompt: '' }, { prompt: '   ' }, { prompt: 42 }]) {
      const res = await post(path, body);
      assert.equal(res.status, 400, `${path} ${JSON.stringify(body)}`);
      assert.match(res.body.error, /prompt es requerido/);
    }
  }
});

// ------------------------------------------------------------------------------
// Respuestas (fallback determinista, sin red)
// ------------------------------------------------------------------------------
test('🤖 POST /ai/diagram: devuelve un diagrama Mermaid y normaliza un tipo desconocido a flowchart', async () => {
  const res = await post('/api/v1/ai/diagram', { prompt: 'flujo de login', diagram_type: 'sequence' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.diagram_type, 'sequence');
  assert.match(res.body.mermaid_code, /graph|sequenceDiagram|flowchart/);

  const unknown = await post('/api/v1/ai/diagram', { prompt: 'flujo', diagram_type: 'inventado' });
  assert.equal(unknown.body.diagram_type, 'flowchart');
});

test('🤖 POST /ai/mock: devuelve la plantilla local con el prompt y normaliza un framework desconocido', async () => {
  const res = await post('/api/v1/ai/mock', { prompt: 'Tarjeta de Pikachu', framework: 'inventado' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.framework, 'html/css');
  assert.match(res.body.html_code, /Tarjeta de Pikachu/);
});

// Hallazgo: la rama de IA sanea la salida con sanitizeAIHtml, pero la plantilla local (fallback, usada sin clave de
// Gemini o con el circuit breaker abierto) interpola el prompt sin escapar ni sanear. Marcado como `todo` hasta que se
// corrija; al hacerlo, quitar la opción `todo` para que sea un test de regresión.
test('🤖 POST /ai/mock: el HTML de la plantilla local no contiene etiquetas script del prompt', {
  todo: 'Hallazgo AUD-SEC-AI-001: el fallback de generateMockup no sanea el prompt',
}, async () => {
  const res = await post('/api/v1/ai/mock', { prompt: 'Tarjeta <script>alert(1)</script>' });
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.body.html_code, /<script/i, 'el prompt no debe inyectar etiquetas script');
});

test('🤖 POST /ai/image: devuelve la imagen de fallback con la proporción pedida', async () => {
  const res = await post('/api/v1/ai/image', { prompt: 'Pikachu', aspect_ratio: '16:9' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.aspect_ratio, '16:9');
  assert.match(res.body.image_url, /^https:\/\//);
});

test('🤖 IA: la longitud del prompt se acota (la ruta a 1000 y sanitizePrompt a 500 caracteres)', async () => {
  const res = await post('/api/v1/ai/mock', { prompt: `${'a'.repeat(600)}ZZZ-FIN` });
  assert.equal(res.status, 200);
  assert.ok(!res.body.html_code.includes('ZZZ-FIN'), 'lo que excede el límite no debe llegar a la plantilla');
  const run = res.body.html_code.match(/a{10,}/)?.[0] ?? '';
  assert.ok(
    run.length > 0 && run.length <= 500,
    `el prompt efectivo debe tener como máximo 500 caracteres (${run.length})`,
  );
});

test('🤖 IA: el limitador corta con 429 tras 10 peticiones por minuto desde la misma IP', async () => {
  const ip = nextClientIp();
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await api(server.baseUrl, '/api/v1/ai/image', {
      method: 'POST',
      json: { prompt: `p${i}` },
      headers: { 'x-api-key': AI_KEY },
      clientIp: ip,
    });
    statuses.push(res.status);
  }
  assert.ok(
    statuses.slice(0, 10).every((s) => s === 200),
    `las 10 primeras deben pasar: ${statuses}`,
  );
  assert.ok(
    statuses.slice(10).every((s) => s === 429),
    `la 11 y la 12 deben recibir 429: ${statuses}`,
  );
});
