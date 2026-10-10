# Remediación de la Segunda Auditoría de `tests/` — 2026-10-09

> **Estado:** Histórico (informe de remediación puntual; no es SSOT)
>
> **Fecha de captura:** 2026-10-09
>
> **Documento de origen:** [`tests-reaudit.md`](tests-reaudit.md), que no se modifica
> (los documentos de `docs/audits/` son inmutables).
>
> **Cobertura:** estado de los paquetes I, H y J del plan de la segunda auditoría, sus mediciones y las lecciones surgidas
> durante la ejecución.
>
> [!IMPORTANT]
> Este informe registra lo ocurrido el día de su captura. El estado vigente reside en `tests/`, `package.json`,
> `.github/workflows/` y `docs/testing/`.

---

## 1. Estado de los Paquetes

| Paquete | Hallazgos | Estado | PR |
| :--- | :--- | :--- | :--- |
| I. Consolidar tests de sesión e IA | `AUD-TST-DUP-002`, `AUD-TST-TIM-002` | Entregado | [#709](https://github.com/rocapellino/pokedex/pull/709) |
| H. PostgreSQL y Redis reales en integración | `AUD-TST-DB-001` | Entregado | [#712](https://github.com/rocapellino/pokedex/pull/712) |
| J. Contratos por estructura, fase 2 | `AUD-TST-CTR-002` | Entregado (8 archivos; #721 en revisión al capturar este informe) | [#713](https://github.com/rocapellino/pokedex/pull/713) a [#718](https://github.com/rocapellino/pokedex/pull/718), [#720](https://github.com/rocapellino/pokedex/pull/720) y [#721](https://github.com/rocapellino/pokedex/pull/721) |
| `AUD-TST-DOC-001` | Frases de documentos Markdown | Sin acción: se mantiene como texto | — |
| `AUD-TST-DIR-001` | Reestructura de directorios (Paquete F) | Sin acción: no se recomienda | — |

La propia auditoría se registró en [#710](https://github.com/rocapellino/pokedex/pull/710).

---

## 2. Resultados Medidos

### Paquete I

- Se eliminó un test duplicado literal, el de `nextId` (probaba `Array.reduce`, no código del repositorio) y los tests de sesión, circuit
  breaker, `withTimeout` y `sanitizePrompt` repetidos entre `security/app/` y `unit/`. Los casos que solo existían en los tests borrados
  pasaron a `unit/auth_service`.
- Tres tests unitarios salieron de `security/app/` hacia `unit/`: `result`, `ai_cache_key` y `session_cookie`.
- La expiración de tokens, el circuit breaker y `withTimeout` usan `mock.timers`.
- Ninguna línea de `services/auth.ts`, `ai-circuit-breaker.ts`, `ai-security.ts`, `ai.ts`, `utils/result.ts` ni `middleware/auth.ts` pasó de
  cubierta a descubierta. De 7 mutaciones en el backend, 6 las detectan los tests nuevos; la restante es un mutante equivalente.
- Suite: de 1.068 a 1.059 tests, de 71 s a 63 s.

### Paquete H

Cobertura de líneas de los módulos que hablan con PostgreSQL y Redis, sin servicios y con ellos:

| Módulo | Sin servicios | Con servicios |
| :--- | :---: | :---: |
| `services/pokemon.repository.ts` | 56,5 % | 97,6 % |
| `services/cache.ts` | 44,3 % | 87,4 % |
| `db/migrate.ts` | 66 % | 88,3 % |
| `services/postgres.ts` | — | 96,3 % |

- Cuatro suites en `tests/integration/db/` (21 tests), opt-in mediante `POKEDEX_TEST_DATABASE_URL` y `POKEDEX_TEST_REDIS_URL`. Cada suite crea y
  elimina su propia base PostgreSQL y reserva una base lógica de Redis.
- `ci.yaml` define esas variables y levanta PostgreSQL 16 y Redis 7 como `services:` en `code-quality` y `sonarcloud`, con las mismas imágenes por
  digest que `docker-compose.yaml`. El contrato `tests/ci/db_integration_services.test.ts` impide que la omisión silenciosa llegue a CI.
- El log del job `code-quality` confirmó que las cuatro suites se ejecutan en el runner: 1.085 tests, 0 fallos.
- De 10 mutaciones en `pokemon.repository.ts`, `cache.ts` y `migrate.ts`, las 10 las detectan los tests. La primera pasada dejó pasar la pérdida del
  `ORDER BY`, porque PostgreSQL devuelve el orden de inserción; se añadió un test que inserta fuera de orden.

### Paquete J

| Archivo | PR | Mutaciones | Pasaban el test antiguo | Pasan el nuevo |
| :--- | :--- | :---: | :---: | :---: |
| `vault_redeploy_contract` | [#713](https://github.com/rocapellino/pokedex/pull/713) | 13 | 9 | 0 |
| `gitops_architecture` | [#714](https://github.com/rocapellino/pokedex/pull/714) | 9 | 4 | 0 |
| `argocd_pinning` | [#715](https://github.com/rocapellino/pokedex/pull/715) | 10 | 6 | 0 |
| `grafana_cloud_collection` | [#716](https://github.com/rocapellino/pokedex/pull/716) | 7 | 1 | 0 |
| `operation_dr_benchmarks` | [#717](https://github.com/rocapellino/pokedex/pull/717) | 10 | 8 | 0 |
| `supply_chain_tooling_pinning` | [#718](https://github.com/rocapellino/pokedex/pull/718) | 9 | 3 | 0 |
| `iac_baseline_security` | [#720](https://github.com/rocapellino/pokedex/pull/720) | 9 | 6 | 0 |
| `gitops_adr_contracts` | [#721](https://github.com/rocapellino/pokedex/pull/721) | 9 | 5 | 0 |
| **Total** | | **76** | **42** | **0** |

Notas sobre estos números:

- En `grafana_cloud_collection` solo 1 de 7 mutaciones distinguía al test antiguo del nuevo: ese test ya renderizaba el chart con `helm template`,
  que descarta los comentarios, y su valor fue de robustez. Se dejó escrito en el PR.
- Se promovieron a `tests/helpers/ansible.ts` los helpers de tareas de Ansible que vivían dentro de `ansible_baseline_security`.
- `Redeploy Invariant` en `vault_redeploy_contract` comparaba una constante local y no podía fallar; ahora lee los values de pre-prod.
- `iac_baseline_security` y `gitops_adr_contracts` solo se migraron en sus partes sobre YAML, Taskfile, workflows y chart renderizado; sus comprobaciones de ADR, runbooks y README siguen como texto.
- Se añadieron `readTaskfiles` y `taskCommands` en `tests/helpers/taskfile.ts` y se reescribió `parseDirectoryExclude` para leer el YAML parseado.
- Una mutación sobrevivió a la primera versión de `iac_baseline_security`: el parche de kubeadm es un escalar de bloque, donde un `#` es texto y no comentario; se resolvió parseando el parche.

---

## 3. Lecciones de la Ejecución

- **Una expresión regular se satisface con lo que no debería.** Dos umbrales de k6 (`p(95)<200` y `rate<0.01`) aceptaban `p(95)<2000` o quedaban
  tapados por otra métrica con el mismo valor. Una regex sobre texto necesita anclas (la comilla de cierre) o, mejor, atarse a la clave que
  la contiene.
- **La mutación detecta lo que la lectura no ve.** Varias veces la primera versión del test nuevo dejó sobrevivir una mutación (el `ORDER BY` del
  repositorio, la relajación de `http_req_failed`); aplicarla a los artefactos reales y comparar contra el test antiguo fue lo que lo mostró.
- **Un comentario no se ejecuta, pero un `includes` lo lee.** Ocho de los diez defectos de `operation_dr_benchmarks` pasaban el test antiguo porque el valor
  original seguía en un comentario o en el nombre de otro paso.
- **Un test puede no probar nada.** `Redeploy Invariant` y el test de `nextId` comprobaban una constante local y `Array.reduce`.
- **Los worktrees no tienen `node_modules`.** `AUD-DEP-ZOD-001` falla en todo worktree sin dependencias propias; se enlazó el `node_modules` del repositorio
  principal con una junction, que debe borrarse antes de eliminar el worktree para no tocar el original.

---

## 4. Pendientes y Decisiones Abiertas

- **`AUD-TST-DOC-001`:** formalizar en la skill `repo-testing` la pauta de comprobar identificadores, enlaces o tablas y no frases.
- **Paquete F** y **retención de `docs/audits/`:** siguen abiertos desde el informe anterior.
- **Cobertura de scripts operativos** (`k8s-rollout-restart.ts` 27 %, `github-security-linear-sync.ts` 42 %, `check-ruleset-parity.ts` 51 %): fuera de
  Sonar (`scripts/**`); sin paquete propio.
