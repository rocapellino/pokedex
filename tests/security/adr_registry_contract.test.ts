/**
 * Contrato único del registro de ADRs: existencia de los ADRs requeridos, estado Aceptado e
 * indexación en `docs/decisions/README.md`. Las suites `adr_*_contracts`, `k8s_workload_hardening`,
 * `network_policies_security`, `opentofu_baseline_security`, `iac_baseline_security` y
 * `gitops_adr_contracts` verifican el contenido de cada ADR y no repiten estas comprobaciones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DECISIONS_DIR = path.resolve(import.meta.dirname, '../../docs/decisions');
const RETIRED_ADRS = new Set([19]); // ADR-019 (Turborepo) retirado: no conserva archivo.
const LAST_CONTIGUOUS_ADR = 20; // ADR-001..020 son contiguos salvo los retirados.

const adrFiles = () => fs.readdirSync(DECISIONS_DIR).filter((file) => file.startsWith('ADR-'));

test('🗂️ Registro de ADRs: existen los ADRs activos contiguos 001 a 020 (salvo los retirados)', () => {
  const files = adrFiles();
  for (let n = 1; n <= LAST_CONTIGUOUS_ADR; n++) {
    const num = String(n).padStart(3, '0');
    const exists = files.some((file) => file.startsWith(`ADR-${num}`));
    if (RETIRED_ADRS.has(n)) {
      assert.equal(exists, false, `ADR-${num} está retirado y no debe conservar archivo`);
    } else {
      assert.ok(exists, `Debe existir archivo para ADR-${num} en docs/decisions/`);
    }
  }
  assert.ok(files.length >= 20, 'Debe existir un conjunto sustancial de ADRs activos');
});

test('🗂️ Registro de ADRs: todo ADR activo tiene nombre canónico y está indexado en docs/decisions/README.md', () => {
  const index = fs.readFileSync(path.join(DECISIONS_DIR, 'README.md'), 'utf-8');
  for (const file of adrFiles()) {
    assert.match(file, /^ADR-\d{3}-[a-z0-9-]+\.md$/, `${file} debe tener formato canónico ADR-XXX-slug.md`);
    assert.ok(index.includes(file), `docs/decisions/README.md debe indexar el ADR activo ${file}`);
  }
});

test('🗂️ Registro de ADRs: todo ADR activo declara el estado Aceptado', () => {
  // Dos formatos vigentes: encabezado `## Estado` seguido del valor, o fila de tabla `| **Estado** | ... |`.
  const accepted = /^## Estado\s+Aceptado|\|\s*\*\*Estado\*\*\s*\|\s*Aceptado/m;
  for (const file of adrFiles()) {
    const content = fs.readFileSync(path.join(DECISIONS_DIR, file), 'utf-8').replaceAll('\r\n', '\n');
    assert.match(content, accepted, `${file} debe declarar el estado Aceptado`);
  }
});
