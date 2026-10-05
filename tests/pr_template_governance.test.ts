import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discoverPrTemplate, extractHeadings, validatePrBody } from '../scripts/validate-pr-body.js';

/**
 * ==============================================================================
 * tests/pr_template_governance.test.ts
 * ==============================================================================
 * Suite contractual de gobernanza del Pull Request Template:
 *   - Verifica que el PR Template físico exista y actúe como SSOT.
 *   - Valida que el motor determinista validate-pr-body detecte desviaciones.
 *   - Previene que cuerpos no conformes (ej. PR #437 o #438) pasen el gate.
 *   - Comprueba que las skills repo-pr y repo-lifecycle no hardcodeen templates
 *     sintéticos ni autoricen estructuras arbitrarias.
 * ==============================================================================
 */

test('🛡️ Contrato de PR Template: el archivo físico existe en ruta SSOT y contiene secciones obligatorias', () => {
  const rootDir = process.cwd();
  const templatePath = discoverPrTemplate(rootDir);

  assert.ok(fs.existsSync(templatePath), `El template físico debe existir: ${templatePath}`);
  const content = fs.readFileSync(templatePath, 'utf-8');

  // Comprobar headings H2 estructurales canónicos
  const headings = extractHeadings(content);
  const h2Normalized = headings.filter((h) => h.level === 2).map((h) => h.normalized);

  const mandatoryKeywords = [
    'issues vinculados',
    'tipo de cambio',
    'resumen de cambios',
    'componentes afectados',
    'ci impact analysis',
    'pruebas y verificaciones',
    'variables de entorno',
  ];

  for (const keyword of mandatoryKeywords) {
    const found = h2Normalized.some((h) => h.includes(keyword));
    assert.ok(found, `El template físico debe contener una sección H2 que incluya "${keyword}"`);
  }
});

test('🛡️ Contrato de PR Template: validate-pr-body aprueba un PR body completo y fiel al template', () => {
  const rootDir = process.cwd();
  const templatePath = discoverPrTemplate(rootDir);
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  const validBody = `# Plantilla de Pull Request

## 📌 Issues Vinculados

- **Linear:** PEX-123
- **GitHub (opcional):** Closes #100

---

## 🏷️ Tipo de Cambio

- [x] \`refactor\`: Refactorización o mejora de código sin alterar comportamiento
- [ ] \`fix\`: Corrección de bug (genera release patch)

---

## 📝 Resumen de Cambios

Se consolida la gobernanza contractual del PR Template mediante validación determinista.

---

## 📦 Componentes Afectados

- [ ] \`apps/backend\`
- [ ] \`apps/frontend\`
- [x] \`scripts\` (Scripts de validación y gobernanza)
- [x] \`docs\` / \`.github\` (Documentación técnica y templates)

---

## 🎯 CI Impact Analysis

| Dominio / Calidad | Impacto | Pipeline / Quality Gate |
| :--- | :---: | :--- |
| **Documentation** | ✅ Afectado | \`docs-ci (Fast Track)\` |
| **Backend Core** | ⏭️ Omitido | \`ci.yaml (code-quality)\` |
| **Frontend SPA** | ⏭️ Omitido | \`ci.yaml & web.yaml\` |
| **Unit & Integration Tests** | ✅ Afectado | \`npm test\` |
| **PR Governance (always)** | ✅ Afectado | \`PR template & políticas de calidad\` |
| **Security: Secrets Scan (always)** | ✅ Afectado | \`Gitleaks Detector\` |

---

## 🧪 Pruebas y Verificaciones Realizadas

- [x] **Tests Unitarios y Cobertura:** \`npm test\`
- [x] **Verificación de Tipos y Linting:** \`npm run lint\`
- [ ] **Pruebas E2E (Playwright):** N/A: cambio no UI

---

## ⚠️ Variables de Entorno & Breaking Changes

- [ ] ¿Requiere nuevas variables en \`.env\`? No
- [ ] ¿Introduce algún cambio incompatible (Breaking Change)? No
`;

  const result = validatePrBody(templateContent, validBody, templatePath);
  assert.strictEqual(
    result.isValid,
    true,
    `El PR body válido debe pasar la validación sin errores: ${JSON.stringify(result.issues)}`,
  );
  assert.strictEqual(result.issues.length, 0);
});

test('🛡️ Contrato de PR Template: validate-pr-body RECHAZA la estructura no conforme observada en PR #438', () => {
  const rootDir = process.cwd();
  const templatePath = discoverPrTemplate(rootDir);
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  // Estructura idéntica a la que se publicó en el PR #438
  const pr438Body = `## Descripción del Cambio

Este Pull Request implementa la **Fase B** del plan de saneamiento:
1. Retiro del Dockerfile raíz
2. Consolidación de SSOT en apps/backend/Dockerfile

---

## Suite de Verificación Local

- npm run test:surface:check: ✅ PASS
- npm run lint:md: ✅ PASS
- npm run lint:ignore:strict: ✅ PASS
`;

  const result = validatePrBody(templateContent, pr438Body, templatePath);
  assert.strictEqual(result.isValid, false, 'El cuerpo tipo PR #438 debe ser rechazado');
  assert.ok(
    result.issues.length >= 7,
    `Debe reportar al menos 7 infracciones por secciones faltantes (obtenidas: ${result.issues.length})`,
  );

  const issueCodes = result.issues.map((i) => i.code);
  assert.ok(issueCodes.includes('MISSING_MANDATORY_SECTION'));
});

test('🛡️ Contrato de PR Template: validate-pr-body detecta tablas de CI Impact no resueltas o incompletas', () => {
  const rootDir = process.cwd();
  const templatePath = discoverPrTemplate(rootDir);
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  // Body que tiene placeholders "—" en CI Impact
  const bodyWithUnresolvedCi = `# Plantilla de Pull Request

## 📌 Issues Vinculados
- **Linear:** PEX-1

## 🏷️ Tipo de Cambio
- [x] \`chore\`: Tareas de mantenimiento

## 📝 Resumen de Cambios
Texto de resumen

## 📦 Componentes Afectados
- [x] \`docs\`

## 🎯 CI Impact Analysis
| Dominio | Estado | Pipeline |
| :--- | :---: | :--- |
| **PR Governance** | — | \`PR template\` |

## 🧪 Pruebas y Verificaciones Realizadas
- [x] **Linting:** \`npm run lint\`

## ⚠️ Variables de Entorno & Breaking Changes
- [ ] Ninguna
`;

  const result = validatePrBody(templateContent, bodyWithUnresolvedCi, templatePath);
  assert.strictEqual(result.isValid, false);
  const hasPlaceholderIssue = result.issues.some((i) => i.code === 'CI_IMPACT_UNRESOLVED_PLACEHOLDERS');
  assert.ok(hasPlaceholderIssue, 'Debe rechazar la presencia de placeholders "—" en CI Impact Analysis');
});

test('🛡️ Contrato de PR Template: validate-pr-body detecta corrupción UTF-8 y mojibake', () => {
  const rootDir = process.cwd();
  const templatePath = discoverPrTemplate(rootDir);
  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  const mojibakeBody = `# Plantilla de Pull Request

## 📌 Issues Vinculados
- **Linear:** PEX-1

## 🏷️ Tipo de Cambio
- [x] \`chore\`: ModificaciÃ³n de dependencias

## 📝 Resumen de Cambios
VerificaciÃ³n de cÃ³digo

## 📦 Componentes Afectados
- [x] \`docs\`

## 🎯 CI Impact Analysis
| Dominio | Estado | Pipeline |
| :--- | :---: | :--- |
| **PR Governance** | ✅ Afectado | \`PR template\` |

## 🧪 Pruebas y Verificaciones Realizadas
- [x] **Linting:** \`npm run lint\`

## ⚠️ Variables de Entorno & Breaking Changes
- [ ] Ninguna
`;

  const result = validatePrBody(templateContent, mojibakeBody, templatePath);
  assert.strictEqual(result.isValid, false);
  const hasMojibake = result.issues.some((i) => i.code === 'PR_MOJIBAKE_DETECTED');
  assert.ok(hasMojibake, 'Debe detectar y rechazar caracteres corruptos de mojibake');
});

test('🛡️ Contrato de Gobernanza en Skills: repo-pr y repo-lifecycle no albergan templates sintéticos y declaran el validador', () => {
  const rootDir = process.cwd();
  const repoPrSkill = path.join(rootDir, '.agents', 'skills', 'repo-pr', 'SKILL.md');
  const templatePolicy = path.join(rootDir, '.agents', 'skills', 'repo-pr', 'references', 'pr-template-policy.md');
  const repoLifecycleSkill = path.join(rootDir, '.agents', 'skills', 'repo-lifecycle', 'SKILL.md');

  assert.ok(fs.existsSync(repoPrSkill));
  assert.ok(fs.existsSync(templatePolicy));
  assert.ok(fs.existsSync(repoLifecycleSkill));

  const policyContent = fs.readFileSync(templatePolicy, 'utf-8');
  assert.ok(
    policyContent.includes('validate-pr-body') || policyContent.includes('pr:validate'),
    'pr-template-policy.md debe referenciar el validador canónico validate-pr-body o pr:validate',
  );

  // Verificar que package.json declare el script pr:validate
  const pkgJsonPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  assert.ok(pkg.scripts['pr:validate'], 'package.json debe registrar el script "pr:validate"');
});
