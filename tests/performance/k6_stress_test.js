import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ==============================================================================
// Métricas Personalizadas de Rendimiento
// ==============================================================================
export const errorRate = new Rate('custom_error_rate');
export const pokemonListTrend = new Trend('pokemon_list_duration_ms');
export const pokemonDetailTrend = new Trend('pokemon_detail_duration_ms');

// ==============================================================================
// Opciones de Carga y Umbrales de Calidad (SLOs / SLAs)
// ==============================================================================
export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Ramp-up: subir a 10 usuarios concurrentes
    { duration: '30s', target: 20 }, // Steady state: mantener 20 usuarios bajo carga
    { duration: '10s', target: 0 },  // Ramp-down: enfriamiento a 0
  ],
  thresholds: {
    // El 95% de las peticiones debe responder en menos de 200ms
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    // La tasa de error debe ser menor al 1%
    http_req_failed: ['rate<0.01'],
    custom_error_rate: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8000';

export default function () {
  // 1. Healthcheck Endpoint
  group('01_Healthcheck', function () {
    const res = http.get(`${BASE_URL}/healthz`);
    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'status is alive': (r) => r.body && (r.body.includes('ok') || r.body.includes('healthy')),
    });
    errorRate.add(!passed);
  });

  sleep(0.5);

  // 2. Listar Pokémons con paginación
  group('02_Get_Pokemons_List', function () {
    const res = http.get(`${BASE_URL}/pokemons?limit=20&offset=0`);
    pokemonListTrend.add(res.timings.duration);
    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
      'response has pokemons': (r) => r.json() !== undefined,
    });
    errorRate.add(!passed);
  });

  sleep(0.5);

  // 3. Filtrar Pokémons por Tipo
  group('03_Filter_Pokemons_By_Type', function () {
    const res = http.get(`${BASE_URL}/pokemons?type=Fuego`);
    const passed = check(res, {
      'status is 200': (r) => r.status === 200,
    });
    errorRate.add(!passed);
  });

  sleep(0.5);

  // 4. Detalle de Pokémon por ID (probando IDs del 1 al 10 de forma aleatoria)
  group('04_Get_Pokemon_Detail', function () {
    const randomId = Math.floor(Math.random() * 10) + 1;
    const res = http.get(`${BASE_URL}/pokemons/${randomId}`);
    pokemonDetailTrend.add(res.timings.duration);
    const passed = check(res, {
      'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(!passed);
  });

  sleep(1);
}
