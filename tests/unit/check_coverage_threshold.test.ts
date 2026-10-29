import assert from 'node:assert/strict';
import test from 'node:test';
import { COVERAGE_GATES, evaluateGate, evaluateGates, parseLcov } from '../../scripts/check-coverage-threshold.js';

const record = (file: string, found: number, hit: number) =>
  `SF:${file}\nDA:1,1\nLF:${found}\nLH:${hit}\nend_of_record\n`;

const GATE = { prefix: 'apps/backend/src/routes/', minLines: 80 };

test('📏 Gate de cobertura: parseLcov normaliza rutas de Windows y lee LF/LH de cada registro', () => {
  const files = parseLcov(
    `${record('apps\\backend\\src\\routes\\ai.ts', 50, 40)}${record('apps/backend/server.ts', 10, 10)}`.replace(
      /\n/g,
      '\r\n',
    ),
  );

  assert.deepEqual(files, [
    { file: 'apps/backend/src/routes/ai.ts', linesFound: 50, linesHit: 40 },
    { file: 'apps/backend/server.ts', linesFound: 10, linesHit: 10 },
  ]);
});

test('📏 Gate de cobertura: el porcentaje agrega todas las líneas bajo el prefijo y no promedia por archivo', () => {
  // 100/100 + 0/10: el promedio por archivo sería 50 %, la cobertura agregada es 90,9 %.
  const files = parseLcov(
    record('apps/backend/src/routes/a.ts', 100, 100) +
      record('apps/backend/src/routes/b.ts', 10, 0) +
      record('apps/backend/src/other.ts', 1000, 0),
  );
  const result = evaluateGate(files, GATE);

  assert.equal(result.linesFound, 110);
  assert.equal(result.linesHit, 100);
  assert.ok(Math.abs(result.percent - 90.909) < 0.01);
  assert.equal(result.ok, true);
});

test('📏 Gate de cobertura: el umbral se cumple en 80 % exacto y falla en cuanto baja', () => {
  const at = (hit: number) => evaluateGate(parseLcov(record('apps/backend/src/routes/a.ts', 100, hit)), GATE);

  assert.equal(at(80).ok, true);
  assert.equal(at(79).ok, false);
});

test('📏 Gate de cobertura: un prefijo sin archivos en el informe falla en lugar de aprobar por vacío', () => {
  const result = evaluateGate(parseLcov(record('apps/backend/server.ts', 10, 10)), GATE);

  assert.equal(result.files.length, 0);
  assert.equal(result.ok, false);
});

test('📏 Gate de cobertura: los gates vigentes protegen rutas HTTP (80 %) y servicios (65 %) del backend', () => {
  const SERVICES_GATE = { prefix: 'apps/backend/src/services/', minLines: 65 };
  assert.deepEqual(COVERAGE_GATES, [GATE, SERVICES_GATE]);

  const healthyRoutes = record('apps/backend/src/routes/a.ts', 10, 9);
  const services = (hit: number) => evaluateGates(healthyRoutes + record('apps/backend/src/services/a.ts', 100, hit));
  assert.equal(
    services(65).every((result) => result.ok),
    true,
  );
  assert.equal(
    services(64).every((result) => result.ok),
    false,
    'una regresión de servicios por debajo del 65 % debe fallar aunque las rutas cumplan',
  );
  assert.equal(
    evaluateGates(record('apps/backend/src/routes/a.ts', 10, 5)).every((result) => result.ok),
    false,
  );
});
