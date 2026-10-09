# Segunda Auditoría de `tests/` y Plan de Mejora — 2026-10-09

> **Estado:** Histórico (snapshot inmutable; no es SSOT)
>
> **Fecha de captura:** 2026-10-09
>
> **Commit auditado:** `e4450cc` (`main`, incluye #694 a #708)
>
> **Alcance:** directorio `tests/` y herramientas de prueba, después de ejecutar el plan de
> [`tests-improvement-plan.md`](tests-improvement-plan.md) (ver [`tests-improvement-remediation.md`](tests-improvement-remediation.md)).
> No es un baseline integral: no reemplaza a [`2026-10-08/baseline.md`](../2026-10-08/baseline.md).
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. El estado vigente reside en `tests/`,
> `package.json` y `docs/testing/`. El seguimiento de cada hallazgo debe hacerse en issues con título `AUD-*`.

**Vocabulario de estados:** taxonomía de 12 estados de [`repo-testing`](../../../.agents/skills/repo-testing/SKILL.md).

---

## 1. Método y Límites

Se repitieron las seis preguntas de la primera auditoría. Mediciones (solo lectura): suite completa con cobertura
(`npm run test:coverage`, agregando `coverage/lcov.info` por área), búsquedas de patrones sobre los 136 archivos de test,
lectura de los tests de sesión e IA y del workflow de E2E.

Límites: no se ejecutaron Playwright, k6 ni Lighthouse; la cobertura es la de `node --test` y no incluye los E2E; la
estimación de duración del Paquete H es una proyección, no una medición.

## 2. Línea Base Medida

| Métrica | Auditoría anterior (`e523849`) | Ahora (`e4450cc`) |
| :--- | :---: | :---: |
| Tests / archivos | 1.024 / 130 | 1.068 / 136 |
| Resultado de la suite | — | 1.067 pasan, 0 fallan, 1 omitido a propósito |
| Duración con cobertura | ~85 s | ~68 s |
| Cobertura de líneas (backend / frontend / scripts) | 81,3 / 91,8 / 70,1 % | 87,6 / 91,8 / 71,6 % |
| Cobertura de ramas (backend / frontend / scripts) | 82,3 / 89,5 / 72,4 % | 84,9 / 89,9 / 71,3 % |
| Esperas reales con `setTimeout` | 23 | 16 en 7 archivos |
| Esqueletos de página inline en el frontend | 10 | 1 (`filters_panel`) |
| Archivos golden HTML | 49 | 0 (snapshots nativos) |
| Tamaño de `test-surface.json` | 328 KB | 120 KB, sin deriva |
| Tests con `todo` | 1 | 0 |

## 3. Respuestas a las Preguntas

| Pregunta | Respuesta | Resumen |
| :--- | :---: | :--- |
| ¿La distribución del árbol es correcta? | Sí, en lo esencial | Persisten desajustes de nombre (contratos dentro de `security/`, 16 archivos en la raíz) y 3 tests unitarios puros en `security/app/`. |
| ¿Hay que reestructurar los directorios? | No | El Paquete F sigue sin compensar (~40 referencias externas, ninguna garantía nueva). Basta con mover los 3 casos mal ubicados. |
| ¿Hay que modernizar los tests? | Un poco | Unos 8 contratos buscan texto con regex sobre YAML; hay esperas reales que pueden pasar a temporizadores simulados. |
| ¿Hay que reducir código? | Un poco | Duplicados en los tests de sesión y de IA. |
| ¿Hay que depurar algún test? | Sí, acotado | Un duplicado literal y varios solapados. |
| ¿Hay que cambiar herramientas? | No; completar | `node:test`, `tsx`, JSDOM, Playwright y k6 siguen siendo adecuados. `tsx` sigue haciendo falta (302 imports con `.js` y propiedades de parámetro en `result.ts` y `generate-pokemon-catalog.ts`). Falta PostgreSQL y Redis reales en integración. |

## 4. Hallazgos

| ID | Estado | Prioridad | Descripción y evidencia |
| :--- | :---: | :---: | :--- |
| `AUD-TST-DB-001` | `TEST_COVERAGE_GAP` | P1 | Las consultas de Drizzle, la caché de Redis y las migraciones no se ejecutan en ninguna prueba de CI: `pokemon.repository.ts` 56 %, `cache.ts` 44 %, `db/migrate.ts` 66 %. Los E2E arrancan el backend sin `DATABASE_URL` (memoria) y el smoke de Kind solo prueba `/healthz`, `/version` y `/metrics`. |
| `AUD-TST-DUP-002` | `DUPLICATE` / `MOVE` | P2 | `security/app/security.test.ts` repite idéntico el test de `extractSessionTokenFromRequest` (líneas 210 y 360). `AICircuitBreaker` y `withTimeout` se prueban en `pentest.test.ts` y en `unit/ai_security.test.ts`. `getSessionSecret`, expiración, firma alterada y revocación se repiten entre `security.test.ts` y `unit/auth_service.test.ts`. Tres tests unitarios (`getSemanticCacheKey`, `Result`, `nextId`) están en `security/app/`. |
| `AUD-TST-CTR-002` | `KEEP_IMPROVE` | P2 | Contratos que aún buscan texto con regex sobre YAML: `vault_redeploy_contract` (71 regex, 0 parseos), `gitops_architecture`, `argocd_pinning`, `grafana_cloud_collection`, `operation_dr_benchmarks`, `supply_chain_tooling_pinning` y partes de `iac_baseline_security` y `gitops_adr_contracts`. |
| `AUD-TST-TIM-002` | `KEEP_IMPROVE` | P3 | Circuit breaker, `withTimeout` y expiración de tokens esperan con `setTimeout` real (`pentest`, `ai_security`, `auth_service`). `mock.timers` cubre `Date` y `setTimeout`. |
| `AUD-TST-DOC-001` | `REVIEW` | P3 | 30 archivos comprueban frases de documentos `.md`; reescribir un párrafo rompe el test sin cambiar ninguna garantía. Se propone una pauta (comprobar identificadores, enlaces o tablas) y no una reescritura en bloque. |
| `AUD-TST-DIR-001` | `MOVE` | P3 | Sin cambios respecto de la primera auditoría (Paquete F, no recomendado). |

Observaciones sin paquete propio: `github_security_linear_sync` fija `DRY_RUN` sin restaurarlo (inocuo, cada archivo corre
en su propio proceso); scripts operativos con poca cobertura (`k8s-rollout-restart.ts` 27 %,
`github-security-linear-sync.ts` 42 %, `check-ruleset-parity.ts` 51 %) que Sonar excluye (`scripts/**`).

## 5. Plan de Mejora

Secuencia: I, luego H, luego J de forma incremental. Cada paquete en PR propio, con
`npm run test:surface:update` cuando cambien los tests.

### Paquete I — Consolidar tests de sesión e IA (`AUD-TST-DUP-002`, `AUD-TST-TIM-002`)

- **Alcance:** quitar el duplicado exacto; dejar los tests unitarios en `unit/` y que `pentest` conserve solo escenarios de
  ataque; mover los 3 tests mal ubicados a `unit/`; sustituir esperas reales por `mock.timers`.
- **Riesgo:** perder cobertura al borrar. Mitigación: comparar el lcov por archivo antes y después y exigir un test
  equivalente por cada test eliminado.
- **Aceptación:** cobertura de `services/auth.ts`, `ai-circuit-breaker.ts` y `ai-security.ts` sin descenso.

### Paquete H — PostgreSQL y Redis reales en integración (`AUD-TST-DB-001`)

- **Alcance:** suite `tests/integration/db/` activada por variable de entorno (como `RULESET_LIVE_CHECK`), con
  contenedores de servicio en CI con las imágenes de `docker-compose.yaml`; `docker compose` en local.
- **Riesgo:** más duración del job (~30 a 60 s estimados) e inestabilidad por arranque; mitigar con healthchecks y datos
  únicos por caso.
- **Aceptación:** `pokemon.repository.ts` y `cache.ts` sobre 80 % de líneas en esa ejecución.
- **Decisión abierta:** contenedores de servicio (recomendado, sin dependencias nuevas) o Testcontainers.

### Paquete J — Contratos por estructura, fase 2 (`AUD-TST-CTR-002`)

- **Alcance:** un archivo por PR con `readYaml`, `renderChart` o `workflowJobs`, y mutaciones comparando el test antiguo con
  el nuevo, empezando por `vault_redeploy_contract` y `gitops_architecture`.
