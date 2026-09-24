---
name: repo-testing
description: Gobernar la estrategia de pruebas desde unitarias hasta producción simulada.
---

# repo-testing

## Objetivo

Gobernar la estrategia integral de pruebas automatizadas en `rocapellino/pokedex`, asegurando determinismo, aislamiento, cobertura de caminos críticos y gates de calidad confiables desde pruebas unitarias locales hasta simulaciones de producción en clústeres reales.

## Alcance y Verificaciones de Dominio

- **Pirámide de Pruebas y Tipologías:**
  - **Unitarias & Integración:** Ejecutadas vía `tsx --test tests/**/*.test.ts` (Node.js test runner nativo).
  - **Fuzz Testing:** Pruebas de robustez y mutación de payloads (`tests/fuzzing.test.ts`).
  - **E2E & Accesibilidad:** Pruebas de navegación en navegador mediante Playwright (`@axe-core/playwright` para a11y WCAG 2.1 AA).
  - **Rendimiento & Carga:** Pruebas k6 y auditorías de Core Web Vitals / Lighthouse (`lhci`).
  - **Gobernanza de Seguridad e IaC:** Tests contractuales en `tests/security/` (Egress anti-SSRF, paridad GitOps, rotación de secretos Vault, inmutabilidad de imágenes).
- **Cobertura de Flujos Críticos:**
  - Endpoints de autenticación, sesión y autorización.
  - Operaciones CRUD con Drizzle ORM sobre PostgreSQL.
  - Caché y rate limiting en Redis con fallback transparente en memoria.
  - Sondas de salud (`/healthz`, `/readyz`, `/version`).
- **Determinismo y Aislamiento:**
  - Fixtures de prueba limpios, mocks de red y aislamiento de bases de datos de test.
  - Eliminación de condiciones de carrera (*flaky tests*) y tests dependientes del orden de ejecución.
- **Validación Canónica en Kind:** Uso de clústeres Kind en CI (`infra.yml`) para verificar despliegues reales de Helm antes de promover a GitOps.

## Comandos

- `/repo-testing`: Auditoría integral de la suite y cobertura de pruebas.
- `/repo-testing coverage`: Análisis de cobertura de líneas, branches y funciones (`coverage/lcov.info`).
- `/repo-testing api`: Ejecución y diagnóstico de tests de integración de API.
- `/repo-testing e2e`: Evaluación de flujos de usuario completos y accesibilidad en frontend.
- `/repo-testing security`: Ejecución de tests de contratos de seguridad y políticas.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si se requiere reestructurar suites o añadir nuevos frameworks, modelar la propuesta con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (planes de prueba, reportes de cobertura) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
