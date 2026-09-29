import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ==============================================================================
// Métricas Personalizadas de Rendimiento
// ==============================================================================
export const errorRate = new Rate('custom_error_rate');
export const pokemonListTrend = new Trend('pokemon_list_duration_ms');
export const pokemonDetailTrend = new Trend('pokemon_detail_duration_ms');
export const pokemonFilterTrend = new Trend('pokemon_filter_duration_ms');

/**
 * Métrica de diagnóstico: separa "la API responde lento" de "el test excedió el
 * rate limit". Antes ambas causas se mezclaban en `http_req_failed`, y un 45%
 * de "errores de performance" escondía en realidad un 429 sistemático. Un
 * umbral dedicado hace que el fallo sea atribuible a su causa real.
 */
export const rateLimited = new Rate('rate_limit_exceeded');
export const unexpectedStatus = new Counter('unexpected_status_count');

// ==============================================================================
// Presupuesto de carga derivado del rate limiter real del backend
// ==============================================================================
// `globalRateLimiterStandard` y `globalRateLimiter` limitan a 300 req / 60s
// (apps/backend/src/middleware/rate-limiter.ts). `/healthz` está exento.
//
//   ciclo por iteración     = 0.5 + 0.5 + 0.5 + 1.0 = 2.5 s
//   iteraciones/min por VU  = 60 / 2.5 = 24
//   requests contados por VU = 24 × 3 = 72   (healthz no cuenta)
//
// Con MAX_VUS = 3 → 216 req/min ≈ 72% del límite. El margen del 28% absorbe el
// jitter del ramp-up y del reloj del runner.
//
// Subir este valor sin recalcular el presupuesto hace que el test mida el rate
// limiter en lugar del rendimiento: ese fue el defecto original (TST-001).
const MAX_VUS = 3;
const CYCLE_SECONDS = 2.5;

// ==============================================================================
// Contrato de datos (verificado contra apps/backend/src/data/initialPokemons.ts)
// ==============================================================================
// IDs presentes en el seed. El test anterior usaba el rango 1..10, pero el ID 10
// NO existe (el seed salta de 9 a 25), lo que generaba un 404 por cada 10
// peticiones de detalle y contaminaba `http_req_failed`.
const KNOWN_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// `tipo` es el parámetro real del endpoint; `type` se ignora en silencio
// (apps/backend/src/routes/pokemons.ts destructura { tipo, nombre, limit, offset }).
const FIRE_TYPE = 'Fuego';

// ==============================================================================
// Opciones de Carga y Umbrales de Calidad (SLOs / SLAs)
// ==============================================================================
export const options = {
  stages: [
    { duration: '10s', target: MAX_VUS }, // Ramp-up
    { duration: '30s', target: MAX_VUS }, // Steady state dentro del presupuesto
    { duration: '10s', target: 0 },        // Ramp-down
  ],
  thresholds: {
    // El 95% de las peticiones debe responder en menos de 200ms
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    // La tasa de error debe ser menor al 1%
    http_req_failed: ['rate<0.01'],
    custom_error_rate: ['rate<0.01'],
    // Cualquier 429 invalida la medición: el test excedió el presupuesto de carga.
    // Nombrar la métrica hace que el mensaje de fallo sea accionable.
    rate_limit_exceeded: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

/**
 * Registra el resultado de una petición separando causas de fallo, para que un
 * 429 no quede indistinguible de un fallo real de la API.
 */
function record(res, passed) {
  rateLimited.add(res.status === 429);
  if (res.status !== 200) unexpectedStatus.add(1);
  errorRate.add(!passed);
}

/**
 * Valida el contrato de "recurso inexistente" UNA vez, fuera del ciclo de carga.
 * Aporta un único request al reporte (~0,1% del total) a cambio de cubrir que un
 * ID inexistente responde 404 y no 500.
 */
export function setup() {
  const res = http.get(`${BASE_URL}/pokemons/999999`);
  if (res.status !== 404) {
    throw new Error(
      `Contrato roto: /pokemons/<id-inexistente> devolvió ${res.status} y se esperaba 404`
    );
  }
}

export default function () {
  // 1. Healthcheck Endpoint (exento del rate limit)
  group('01_Healthcheck', function () {
    const res = http.get(`${BASE_URL}/healthz`);
    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'status is alive': (r) => r.body && (r.body.includes('ok') || r.body.includes('healthy')),
    });
    record(res, passed);
  });

  sleep(0.5);

  // 2. Listar Pokémons con paginación
  group('02_Get_Pokemons_List', function () {
    const res = http.get(`${BASE_URL}/pokemons?limit=20&offset=0`);
    pokemonListTrend.add(res.timings.duration);
    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'returns a non-empty json array': (r) => Array.isArray(r.json()) && r.json().length > 0,
    });
    record(res, passed);
  });

  sleep(0.5);

  // 3. Filtrar Pokémons por Tipo
  // El test anterior enviaba `type=Fuego`, que el backend IGNORA: devolvía 200
  // con el catálogo completo, así que el check pasaba sin ejercitar el filtro.
  group('03_Filter_Pokemons_By_Type', function () {
    const res = http.get(`${BASE_URL}/pokemons?tipo=${encodeURIComponent(FIRE_TYPE)}`);
    pokemonFilterTrend.add(res.timings.duration);
    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'returns a json array': (r) => Array.isArray(r.json()),
      'filter returns results': (r) => Array.isArray(r.json()) && r.json().length > 0,
      // El contrato real (pokemon.repository.ts) filtra por `tipo` principal O
      // por cualquier elemento de `tipos`: un Pokémon de tipo secundario Fuego
      // (p. ej. id 609, tipo Fantasma, tipos [Fantasma, Fuego]) debe aparecer.
      'every result has the filter in tipo or tipos': (r) =>
        Array.isArray(r.json()) &&
        r.json().every(
          (p) =>
            p &&
            (p.tipo === FIRE_TYPE ||
              (Array.isArray(p.tipos) && p.tipos.includes(FIRE_TYPE)))
        ),
    });
    record(res, passed);
  });

  sleep(0.5);

  // 4. Detalle de Pokémon por ID (solo IDs verificados del seed)
  group('04_Get_Pokemon_Detail', function () {
    const randomId = KNOWN_IDS[(__VU * 7 + __ITER) % KNOWN_IDS.length];
    const res = http.get(`${BASE_URL}/pokemons/${randomId}`);
    pokemonDetailTrend.add(res.timings.duration);
    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'id matches the request': (r) => r.json() && r.json().id === randomId,
    });
    record(res, passed);
  });

  // Preserva el ciclo de 2,5 s sobre el que está calculado el presupuesto de carga.
  sleep(CYCLE_SECONDS - 1.5);
}
