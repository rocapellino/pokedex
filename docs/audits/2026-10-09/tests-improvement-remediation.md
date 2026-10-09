# Remediación del Plan de Mejora de `tests/` — 2026-10-09

> **Estado:** Histórico (informe de remediación puntual; no es SSOT)
>
> **Fecha de captura:** 2026-10-09
>
> **Documento de origen:** [`tests-improvement-plan.md`](tests-improvement-plan.md), que no se modifica
> (los documentos de `docs/audits/` son inmutables).
>
> **Cobertura:** estado de los paquetes A a G del plan, mediciones del Paquete G y un incidente de CI surgido durante
> la ejecución.
>
> [!IMPORTANT]
> Este informe registra lo ocurrido el día de su captura. El estado vigente reside en `tests/`, `package.json`,
> `.github/workflows/` y `docs/testing/`.

---

## 1. Estado de los Paquetes

| Paquete | Hallazgos | Estado | PR |
| :--- | :--- | :--- | :--- |
| A. Integración HTTP de rutas | `AUD-TST-INT-001` | Entregado | [#694](https://github.com/rocapellino/pokedex/pull/694) |
| B. Página real del catálogo en el frontend | `AUD-TST-FE-001`, `AUD-TST-FE-002`, `AUD-TST-TIM-001` | Entregado | [#695](https://github.com/rocapellino/pokedex/pull/695) |
| C. Snapshots nativos | `AUD-TST-SNAP-001` | Entregado | [#696](https://github.com/rocapellino/pokedex/pull/696) |
| D. Contratos de infraestructura sobre estructura | `AUD-TST-CTR-001`, `AUD-TST-RED-001` | Entregado (7 archivos) | [#697](https://github.com/rocapellino/pokedex/pull/697) a [#703](https://github.com/rocapellino/pokedex/pull/703) |
| E. Catálogo `test-surface` sin datos volátiles | `AUD-TST-SRF-001` | Entregado | [#704](https://github.com/rocapellino/pokedex/pull/704) |
| F. Reestructura de directorios | — | No iniciado (decisión abierta) | — |
| G. Housekeeping de CI y rendimiento | `AUD-TST-CI-001`, `AUD-TST-PERF-001` | Medido; sin cambios (sección 3) | — |

---

## 2. Resultados Medidos

- **A.** Cobertura de líneas: `routes/pokemons.ts` 39 % a 100 %, `routes/auth.ts` 33 % a 94 %, `routes/ai.ts` 66 % a 100 %,
  `routes/health.ts` 63 % a 92 %. Backend completo: 81,3 % a 87,4 %. Se superó el objetivo del 80 % en `routes/`.
  Quedó abierto `AUD-SEC-AI-001` (prioridad baja): el fallback local de `generateMockup` no sanea el prompt;
  el test correspondiente está marcado `todo`.
- **B.** Nueve archivos del frontend montan el marcado real de `apps/frontend/index.html`. El ahorro fue de unas 95 líneas,
  menos que las 200 a 300 estimadas; la ganancia real es que renombrar un ID de la página ahora hace fallar los tests
  (8 fallos frente a ninguno con los esqueletos).
- **C.** Los 49 archivos golden de HTML se sustituyeron por snapshots nativos de `node:test`, tras verificar que el
  contenido era idéntico.
- **D.** Siete archivos migrados de comparar texto a comparar estructura (chart de Helm renderizado, YAML, HCL y pasos
  de workflows parseados). En cada PR se aplicaron mutaciones y se comparó el test antiguo con el nuevo: de 63
  mutaciones, 34 pasaban los tests anteriores y ninguna pasa los nuevos.
- **E.** `docs/testing/test-surface.json` pasó de 328 KB (8.764 líneas) a 120 KB (3.443 líneas) y se eliminaron hashes,
  líneas y conteos del catálogo versionado. Un PR que solo edita un test ya no modifica `docs/testing/`.
  `checkDrift()` compara ahora el contenido completo de ambos documentos y no solo la existencia del `.md`.

---

## 3. Paquete G: Mediciones y Decisión

**`AUD-TST-CI-001` (suite ejecutada dos veces).** Medido en una ejecución de `change-impact.yaml` sobre `main`:

| Job | Total | Ejecución de tests |
| :--- | :---: | :---: |
| Auditoría de Calidad y Complejidad (`npm test`) | 87 s | 63 s |
| SonarQube Cloud (`npm run test:coverage` más análisis) | 148 s | 69 s de cobertura y 62 s de análisis |

Fusionar ambas ejecuciones ahorraría unos 63 s de cómputo (alrededor del 5,5 % del tiempo total de runners), pero el repositorio
es público y los minutos de los runners no tienen costo. Haría que Sonar esperara a `code-quality`, con una ruta crítica
estimada de unos 168 s frente a los 148 s actuales, y acoplaría un fallo de lint al análisis. Sonar además corre ante
cambios `security_sast`, que `code-quality` no cubre. **Decisión: no cambiar.** Estado: `DUPLICATE` aceptado.

**`AUD-TST-PERF-001` (tests de controladores del frontend de ~7 s por archivo).** Perfil del archivo más lento
(`catalog_filters_controller`):

| Parte | Tiempo aproximado |
| :--- | :---: |
| Arranque de `tsx` (un archivo vacío ya lo paga) | 1,7 s |
| Importar `jsdom` | 1,1 s |
| Montar la página real y cargar `pokedex.ts` | 0,3 s |
| Los 24 tests (incluye ~0,8 s de esperas de debounce) | 3,1 s |

La hipótesis del plan (coste de cargar JSDOM y `pokedex.ts` en cada archivo) solo se cumple en parte: `documentReady()`
tarda 0 ms y montar la página completa 25 ms. Compartir un entorno JSDOM entre archivos exigiría desactivar el
aislamiento de procesos de `node:test`. Como `npm test` ejecuta los archivos en paralelo y el más lento tarda unos 9 s, no hay
efecto medible en el CI. **Decisión: no cambiar.** Sustituir las esperas de debounce por temporizadores simulados
ahorraría alrededor de 1 s en dos o tres archivos y no se considera rentable.

---

## 4. Incidente Durante la Ejecución

Al medir el Paquete G se detectó que el CI de `main` estaba en rojo desde [#682](https://github.com/rocapellino/pokedex/pull/682)
(9 de octubre, 13:24 UTC; 22 ejecuciones consecutivas). El job `publish` fallaba en el paso de paridad de digests con
`ERR_MODULE_NOT_FOUND`: #682 hizo que `scripts/lib/helm.ts` y `scripts/verify-image-digest-parity.ts` importaran con
extensión `.js`, convención de `tsx`, y esos scripts se ejecutan con `node --experimental-strip-types` (ADR-023), que
exige `.ts`. La imagen se subía a GHCR, pero la firma, la atestación del SBOM, la provenance SLSA y el chart OCI, que van
después, no se ejecutaban. `npm test` no lo detectaba porque usa `tsx`, y `publish` solo corre en `push` a `main`.

Corregido en [#705](https://github.com/rocapellino/pokedex/pull/705), con el test de regresión
`tests/node_strip_types_entrypoints.test.ts`. **Lección:** un job que solo corre tras fusionar no está cubierto por el
CI de los PRs; los contratos que reproducen su ejecución en local (como el nuevo) son la defensa disponible.

---

## 5. Pendientes y Decisiones Abiertas

- **Paquete F** (reestructura de `tests/`): aceptar o no el costo de ~40 referencias externas.
- **`AUD-SEC-AI-001`:** sanear el fallback de `generateMockup` y quitar el `todo` de `routes_ai.test.ts`, con un PR propio y un test de regresión previo.
- **`.gitleaksignore`:** retirar una entrada que ya no tiene efecto.
- **Retención de `docs/audits/`:** `max_active_snapshots: 1` frente a la presencia de este directorio junto a `2026-10-08/baseline.md`.
- **Meta de cobertura de `routes/`:** confirmar el 80 % como gate de CI o fijar otro umbral.
