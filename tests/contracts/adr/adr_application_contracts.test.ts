import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertDocsPortalLinksAdrIndex } from '../../helpers/docs-portal.js';
import { ROOT_DIR } from '../../helpers/repo.js';

test('🛡️ AI Contracts: apps/backend/src/services/ai.ts fuerza salida estructurada JSON en Gemini', () => {
  const aiServicePath = path.join(ROOT_DIR, 'apps/backend/src/services/ai.ts');
  assert.ok(fs.existsSync(aiServicePath), 'ai.ts debe existir');
  const content = fs.readFileSync(aiServicePath, 'utf-8');

  assert.ok(
    content.includes("responseMimeType: 'application/json'"),
    'ai.ts debe exigir responseMimeType application/json para garantizar contratos estructurados',
  );
  assert.ok(content.includes('mermaid_code'), 'generateDiagram debe solicitar clave estructurada mermaid_code');
  assert.ok(content.includes('html_code'), 'generateMockup debe solicitar clave estructurada html_code');
});

test('🛡️ AI Resilience & Contratos: ADR-009 formaliza Gemini 2.5 Flash, Circuit Breaker y fallback determinista', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-009-ai-resilience-and-contracts.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-009 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.includes('GoogleGenAI'), 'ADR-009 debe documentar SDK oficial @google/genai');
  assert.ok(adrContent.includes('gemini-2.5-flash'), 'ADR-009 debe documentar modelo gemini-2.5-flash');
  assert.ok(
    adrContent.includes("responseMimeType: 'application/json'"),
    'ADR-009 debe documentar modo estructurado JSON',
  );
  assert.ok(adrContent.includes('AICircuitBreaker'), 'ADR-009 debe documentar patrón Circuit Breaker');
  assert.ok(adrContent.includes('getSemanticCacheKey'), 'ADR-009 debe documentar caché semántica en Redis');
  assert.ok(adrContent.includes('sanitizePrompt'), 'ADR-009 debe documentar sanitización contra prompt injection');
  assert.ok(adrContent.includes('getDeterministicDiagram'), 'ADR-009 debe documentar fallback determinista local');
  assert.ok(
    adrContent.includes('pokedex_ai_circuit_breaker_open'),
    'ADR-009 debe documentar métricas de observabilidad en /metrics',
  );

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-009-ai-resilience-and-contracts.md'), 'README.md debe enlazar ADR-009');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-009-ai-resilience-and-contracts.md'),
    'docs/README.md debe enlazar ADR-009',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});

test('🛡️ Autenticación & Sesiones: ADR-010 formaliza doble capa, timingSafeEqual y revocación fail-closed', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-010-authentication-and-session-management.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-010 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(
    adrContent.includes('timingSafeEqual'),
    'ADR-010 debe documentar mitigación timing attacks con timingSafeEqual',
  );
  assert.ok(
    adrContent.includes('ADMIN_SESSION_SECRET'),
    'ADR-010 debe documentar desacoplamiento de ADMIN_SESSION_SECRET',
  );
  assert.ok(
    adrContent.includes('fail-closed') || adrContent.includes('Fail-Closed'),
    'ADR-010 debe documentar revocación fail-closed',
  );
  assert.ok(
    adrContent.includes('pokedex:revoked:') || adrContent.includes('jti'),
    'ADR-010 debe documentar revocación distribuida con jti en Redis',
  );
  assert.ok(
    adrContent.includes('POST /api/v1/auth/session'),
    'ADR-010 debe documentar endpoint de emisión de sesiones',
  );
  assert.ok(adrContent.includes('POST /api/v1/auth/logout'), 'ADR-010 debe documentar endpoint de revocación/logout');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-010-authentication-and-session-management.md'),
    'README.md debe enlazar ADR-010',
  );

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-010-authentication-and-session-management.md'),
    'docs/README.md debe enlazar ADR-010',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});

test('🛡️ Persistencia: el tamaño del pool de pg declarado en ADR-011 coincide con el código (AUD-ARCH-ADR-001)', () => {
  const adr = fs.readFileSync(
    path.join(ROOT_DIR, 'docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md'),
    'utf-8',
  );
  const source = fs.readFileSync(path.join(ROOT_DIR, 'apps/backend/src/services/postgres.ts'), 'utf-8');

  const codeMax = /new Pool\(\{[\s\S]*?\bmax:\s*(\d+)/.exec(source)?.[1];
  const adrMax = /`pg\.Pool` con `max: (\d+)`/.exec(adr)?.[1];

  assert.ok(codeMax, 'postgres.ts debe fijar max en new Pool({...})');
  assert.ok(adrMax, 'ADR-011 debe declarar el max del pg.Pool en la forma `pg.Pool` con `max: N`');
  assert.equal(
    adrMax,
    codeMax,
    'El max del pool declarado en ADR-011 debe coincidir con apps/backend/src/services/postgres.ts',
  );
});

test('🛡️ Persistencia & Migraciones: ADR-011 formaliza Drizzle ORM, PgBouncer y secuencias atómicas', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-011 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.includes('Drizzle ORM'), 'ADR-011 debe documentar Drizzle ORM');
  assert.ok(adrContent.includes('PgBouncer'), 'ADR-011 debe documentar PgBouncer');
  assert.ok(adrContent.includes('pokedex_id_seq'), 'ADR-011 debe documentar secuencia atómica pokedex_id_seq');
  assert.ok(adrContent.includes('pokedex_entries'), 'ADR-011 debe documentar tabla pokedex_entries');
  assert.ok(adrContent.includes('JSONB'), 'ADR-011 debe documentar modelo híbrido JSONB');
  assert.ok(
    adrContent.includes('pool_mode = transaction') || adrContent.includes('transaction'),
    'ADR-011 debe documentar pooling en modo transacción',
  );

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(
    readmeContent.includes('ADR-011-persistence-drizzle-orm-and-pgbouncer.md'),
    'README.md debe enlazar ADR-011',
  );

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-011-persistence-drizzle-orm-and-pgbouncer.md'),
    'docs/README.md debe enlazar ADR-011',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);
});
