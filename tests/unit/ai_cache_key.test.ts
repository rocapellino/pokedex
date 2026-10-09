import test from 'node:test';
import assert from 'node:assert/strict';
import { getSemanticCacheKey } from '../../apps/backend/src/services/ai.js';

test('⚡ Cache Semántico [AI]: getSemanticCacheKey normaliza espacios, mayúsculas y produce hash determinista', () => {
  const key1 = getSemanticCacheKey('diagram', '  Arquitectura   Microservicios  ', 'flowchart');
  const key2 = getSemanticCacheKey('diagram', 'arquitectura microservicios', 'flowchart');
  assert.equal(key1, key2, 'Prompts equivalentes con distinta capitalización y espacios deben coincidir');
  assert.ok(key1.startsWith('pokedex:ai:cache:diagram:'));

  const keyOther = getSemanticCacheKey('diagram', 'otra cosa', 'flowchart');
  assert.notEqual(key1, keyOther, 'Prompts distintos deben generar claves distintas');
});
