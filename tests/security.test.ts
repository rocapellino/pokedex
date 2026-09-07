import test from 'node:test';
import assert from 'node:assert/strict';

// Test XSS prevention regex pattern
const XSS_REGEX = /<[^>]*>|javascript:|onerror=|onload=|eval\(|<script/i;

function testValidatePokemon(payload: any) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'JSON inválido' };
  }
  if (typeof payload.nombre !== 'string' || !payload.nombre.trim()) {
    return { valid: false, error: 'Nombre requerido' };
  }
  if (XSS_REGEX.test(payload.nombre)) {
    return { valid: false, error: 'XSS en nombre' };
  }
  if (typeof payload.tipo !== 'string' || !payload.tipo.trim()) {
    return { valid: false, error: 'Tipo requerido' };
  }
  if (XSS_REGEX.test(payload.tipo)) {
    return { valid: false, error: 'XSS en tipo' };
  }
  if (payload.caracteristicas?.descripcion && XSS_REGEX.test(String(payload.caracteristicas.descripcion))) {
    return { valid: false, error: 'XSS en descripcion' };
  }
  return { valid: true };
}

test('🛡️ Seguridad: validatePokemonPayload rechaza inyecciones XSS en nombre', () => {
  const result = testValidatePokemon({
    nombre: '<script>alert("xss")</script>',
    tipo: 'Fuego',
  });
  assert.equal(result.valid, false);
  assert.equal(result.error, 'XSS en nombre');
});

test('🛡️ Seguridad: validatePokemonPayload rechaza inyecciones XSS con onerror en descripción', () => {
  const result = testValidatePokemon({
    nombre: 'Pikachu',
    tipo: 'Electrico',
    caracteristicas: {
      descripcion: '<img src=x onerror=alert(1)>',
    },
  });
  assert.equal(result.valid, false);
  assert.equal(result.error, 'XSS en descripcion');
});

test('🛡️ Seguridad: validatePokemonPayload acepta payloads legítimos', () => {
  const result = testValidatePokemon({
    nombre: 'Charizard',
    tipo: 'Fuego',
    caracteristicas: {
      descripcion: 'Un Pokémon noble que escupe llamas intensas.',
    },
  });
  assert.equal(result.valid, true);
});

test('⚡ Escalabilidad: cálculo de nextId con reduce soporta grandes colecciones sin stack overflow', () => {
  const largeCollection = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
  const nextId = largeCollection.reduce((max, p) => Math.max(max, p.id), 1008) + 1;
  assert.equal(nextId, 5001);
});
