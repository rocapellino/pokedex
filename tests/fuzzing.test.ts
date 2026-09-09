import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { validatePokemonPayload, validateImageUrl } from '../apps/backend/src/validation/pokemon.js';
import { parsePaginationLimit, parsePaginationOffset } from '../apps/backend/src/utils/pagination.js';
import {
  verifyTokenSignature,
  verifySessionTokenDetailed,
  verifySessionToken,
  revokeSessionTokenDetailed,
  getSessionSecret,
} from '../apps/backend/src/services/auth.js';

/**
 * Suite de API Fuzzing & Resiliencia Dinámica
 * Prueba sistemáticamente entradas deformes, desbordamientos numéricos,
 * polución de objetos, inyecciones unicode y estructuras extremas.
 */

test('🧪 Fuzzing [Payloads Primitivos]: validatePokemonPayload rechaza tipos no estructurados', () => {
  const badInputs = [
    null,
    undefined,
    true,
    false,
    0,
    12345,
    -1,
    Infinity,
    -Infinity,
    NaN,
    '',
    '{"nombre": "Pikachu"}', // String en lugar de objeto parsed
    [],
    [1, 2, 3],
    [['nested', 'array']],
    () => {},
    Symbol('fuzz'),
  ];

  for (const input of badInputs) {
    const res = validatePokemonPayload(input as any);
    assert.equal(res.valid, false, `Esperado fallo para input: ${String(input)}`);
    assert.ok(res.error, 'Debe proveer un mensaje de error descriptivo');
  }
});

test('🧪 Fuzzing [Números Extremos]: validatePokemonPayload rechaza floats descomunales, Infinity y NaN en stats', () => {
  const extremeNumbers = [
    Infinity,
    -Infinity,
    NaN,
    1e308,
    -1e308,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    -0.000000001,
    1000.1, // Fuera del rango 0-1000
    -1,
    1001,
    999999999999999,
  ];

  for (const val of extremeNumbers) {
    const res = validatePokemonPayload({
      nombre: 'Fuzzmon',
      tipo: 'Normal',
      stats: {
        hp: val as any,
      },
    });
    assert.equal(res.valid, false, `Esperado fallo para valor extremo de hp: ${val}`);
  }
});

test('🧪 Fuzzing [Mass Assignment / Object Pollution]: validatePokemonPayload rechaza payloads con 1000 propiedades espurias', () => {
  const pollutedPayload: Record<string, any> = {
    nombre: 'FuzzMon',
    tipo: 'Fuego',
    stats: { hp: 50 },
    caracteristicas: { descripcion: 'Normal' },
  };

  // Inyectar 1000 claves maliciosas o inesperadas
  for (let i = 0; i < 1000; i++) {
    pollutedPayload[`malicious_key_${i}`] = `exploit_value_${i}`;
    pollutedPayload[`__proto__${i}`] = 'polluter';
  }

  // En stats
  const pollutedStats: Record<string, any> = { hp: 50 };
  for (let i = 0; i < 500; i++) {
    pollutedStats[`stat_injection_${i}`] = 100;
  }

  const resStats = validatePokemonPayload({
    nombre: 'FuzzMon',
    tipo: 'Fuego',
    stats: pollutedStats as any,
  });
  assert.equal(resStats.valid, false, 'Debe rechazar stats con mass-assignment masivo');
  assert.match(resStats.error || '', /no permitid/i);

  // En características
  const pollutedChars: Record<string, any> = { descripcion: 'Ok' };
  for (let i = 0; i < 500; i++) {
    pollutedChars[`char_injection_${i}`] = 'malicious';
  }

  const resChars = validatePokemonPayload({
    nombre: 'FuzzMon',
    tipo: 'Fuego',
    caracteristicas: pollutedChars as any,
  });
  assert.equal(resChars.valid, false, 'Debe rechazar características con mass-assignment masivo');
  assert.match(resChars.error || '', /no permitid/i);
});

test('🧪 Fuzzing [Unicode & Caracteres de Control]: validatePokemonPayload maneja secuencias extremas sin crashear', () => {
  const fuzzedStrings = [
    '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0e\x0f', // Bytes de control NUL / terminal
    '﷽'.repeat(100), // Caracter árabe complejo repetido
    '🔥'.repeat(500), // Emojis masivos
    '\u202E\u2066\u2067\u2068RTL_OVERRIDE_INJECTION', // Caracteres Bidi Override
    '\r\n\r\nHTTP/1.1 200 OK\r\nSet-Cookie: admin=true', // CRLF injection
    '../../../etc/passwd\x00.png', // Path traversal con NUL byte
    '<svg onload=alert(document.domain)>', // SVG XSS vector
  ];

  for (const str of fuzzedStrings) {
    const resNombre = validatePokemonPayload({
      nombre: str,
      tipo: 'Normal',
    });
    // Debe rechazar limpiamente por sanitización o longitud sin lanzar uncaught exception
    assert.equal(typeof resNombre.valid, 'boolean');

    const resImg = validateImageUrl(str);
    assert.equal(typeof resImg, 'boolean');
    assert.equal(resImg, false, `URL corrupta esperada como false: ${str.slice(0, 30)}`);
  }
});

test('🧪 Fuzzing [Evoluciones Circulares y Profundidad Extrema]: validatePokemonPayload previene recursión destructiva', () => {
  // Construir árbol profundamente anidado (50 niveles)
  let deepTree: any = { nombre: 'L50', nivel: 50 };
  for (let i = 49; i >= 1; i--) {
    deepTree = {
      nombre: `L${i}`,
      nivel: i,
      evoluciones: [deepTree],
    };
  }

  const resDeep = validatePokemonPayload({
    nombre: 'Root',
    tipo: 'Planta',
    evoluciones: [deepTree],
  });

  assert.equal(resDeep.valid, false);
  assert.match(resDeep.error || '', /profundidad|límite/i);
});

test('🧪 Fuzzing [Pagination Limits]: parsePagination maneja valores absurdos con gracia', () => {
  const fuzzedPaginationInputs = [
    { limit: 'NaN', offset: 'Infinity' },
    { limit: '-999999', offset: '-500' },
    { limit: '1e100', offset: '1e100' },
    { limit: '0x10', offset: '0b101' },
    { limit: 'null', offset: 'undefined' },
    { limit: '   ', offset: '   ' },
    { limit: '50.999', offset: '20.123' },
    { limit: [10] as any, offset: { val: 20 } as any },
  ];

  for (const input of fuzzedPaginationInputs) {
    const limit = parsePaginationLimit(input.limit);
    const offset = parsePaginationOffset(input.offset);

    assert.ok(Number.isInteger(limit), 'Limit siempre debe ser un entero válido');
    assert.ok(Number.isInteger(offset), 'Offset siempre debe ser un entero válido');
    assert.ok(limit >= 1 && limit <= 100, `Limit fuera de rango: ${limit}`);
    assert.ok(offset >= 0 && offset <= 10000, `Offset fuera de rango: ${offset}`);
  }
});

test('🧪 Fuzzing [Auth Session Tokens]: verifyTokenSignature resiste payloads malformados masivos', async () => {
  const secret = getSessionSecret();

  const fuzzedTokenStructures = [
    '',
    '.',
    '..',
    '...',
    'header.payload.signature.extra',
    'not_base64_json.signature',
    'eyJhbGciOiJub25lIn0',
    Buffer.from('not json at all').toString('base64url') + '.validsig',
    Buffer.from(JSON.stringify([])).toString('base64url') + '.validsig',
    Buffer.from(JSON.stringify(12345)).toString('base64url') + '.validsig',
    Buffer.from(JSON.stringify(true)).toString('base64url') + '.validsig',
    Buffer.from(JSON.stringify({ role: 123, exp: 'never', jti: {} })).toString('base64url') + '.validsig',
    Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 60000, jti: null })).toString('base64url') + '.validsig',
    Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 60000, jti: '\x00\x00\x00' })).toString('base64url') + '.validsig',
  ];

  for (const token of fuzzedTokenStructures) {
    const res = verifyTokenSignature(token);
    assert.equal(res.valid, false, `Token fuzzed no debe ser válido: ${token.slice(0, 30)}`);
    assert.ok(res.reason, 'Debe especificar motivo de rechazo');

    const fullCheck = await verifySessionTokenDetailed(token);
    assert.equal(fullCheck.valid, false);

    const revokedCheck = await revokeSessionTokenDetailed(token);
    assert.equal(revokedCheck.success, false);
  }
});
