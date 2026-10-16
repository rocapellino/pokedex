/**
 * ==============================================================================
 * .agents/evals/eval_mcp_zero_trust.test.ts
 * ==============================================================================
 * Evaluación conductual: Blindaje Zero-Trust para Model Context Protocol (.mcp/).
 *
 * Reglas evaluadas:
 *   1. Cero secretos en texto plano (tokens, contraseñas, api keys).
 *   2. Prohibición estricta de capacidades de mutación de infraestructura.
 *   3. Interpolación de variables de entorno mediante sintaxis ${VAR_NAME}.
 * ==============================================================================
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const MCP_DIR = path.join(ROOT_DIR, '.mcp');

test('🤖 Eval MCP: Ningún archivo de configuración en .mcp/ contiene credenciales hardcodeadas', () => {
  assert.ok(fs.existsSync(MCP_DIR), 'Directorio .mcp/ debe existir');
  const files = fs.readdirSync(MCP_DIR).filter((f) => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'));

  const secretPatterns = [
    /postgres:\/\/[^:]+:[^@]+@/i,
    /bearer\s+[a-zA-Z0-9_\-.]{20,}/i,
    /ghp_[a-zA-Z0-9]{36}/i,
    /AIza[0-9A-Za-z-_]{35}/i,
    /"password"\s*:\s*"[^"]{4,}"/i,
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(MCP_DIR, file), 'utf-8');
    for (const pattern of secretPatterns) {
      assert.doesNotMatch(
        content,
        pattern,
        `El archivo .mcp/${file} parece contener un secreto o credencial en texto plano: ${pattern}`,
      );
    }
  }
});

test('🤖 Eval MCP: Las definiciones en .mcp/policies.yaml restringen mutación y aplican sólo lectura', () => {
  const policiesPath = path.join(MCP_DIR, 'policies.yaml');
  if (!fs.existsSync(policiesPath)) return;

  const content = fs.readFileSync(policiesPath, 'utf-8');
  assert.doesNotMatch(content, /infrastructure-write:\s*true/i, 'Prohibido infrastructure-write en políticas MCP');
  assert.doesNotMatch(content, /allowWrite:\s*true/i, 'Servidores MCP deben operar con allowWrite: false por defecto');
});

test('🤖 Eval MCP: Los servidores MCP que requieren credenciales usan interpolación ${VAR_NAME}', () => {
  const catalogPath = path.join(MCP_DIR, 'tool-catalog.yaml');
  if (!fs.existsSync(catalogPath)) return;

  const content = fs.readFileSync(catalogPath, 'utf-8');
  if (content.includes('DATABASE_URL') || content.includes('API_KEY') || content.includes('TOKEN')) {
    assert.match(
      content,
      /\$\{[A-Z0-9_]+\}/,
      'Las variables sensibles en el catálogo MCP deben emplear sintaxis ${VARIABLE}',
    );
  }
});
