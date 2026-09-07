import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextPokemonId } from '../src/services/db.js';

test('⚡ Concurrencia: llamadas paralelas a getNextPokemonId generan IDs estrictamente únicos', async () => {
  const NUM_REQUESTS = 50;
  const promises = Array.from({ length: NUM_REQUESTS }, () => getNextPokemonId());
  const ids = await Promise.all(promises);

  assert.equal(ids.length, NUM_REQUESTS);

  const uniqueIds = new Set(ids);
  assert.equal(
    uniqueIds.size,
    NUM_REQUESTS,
    `Colisión de IDs detectada bajo concurrencia. IDs generados: ${ids.length}, únicos: ${uniqueIds.size}`
  );

  // Validar que todos son enteros mayores a 1008
  for (const id of ids) {
    assert.ok(Number.isInteger(id) && id > 1008, `ID inválido generado: ${id}`);
  }
});
