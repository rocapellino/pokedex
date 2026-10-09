# Auditoría de `tests/` y Plan de Mejora — 2026-10-09

> **Estado:** Histórico (snapshot inmutable; no es SSOT)
>
> **Fecha de captura:** 2026-10-09
>
> **Commit auditado:** `e523849` (`main`, incluye #682 a #692)
>
> **Alcance:** directorio `tests/` y herramientas de prueba. No es un baseline integral: no reemplaza a
> [`2026-10-08/baseline.md`](../2026-10-08/baseline.md) ni lleva metadatos de frescura.
>
> [!IMPORTANT]
> Este documento es evidencia histórica del commit auditado. El estado vigente reside en `tests/`,
> `package.json` y `docs/testing/`. El seguimiento de cada hallazgo debe hacerse en issues con título `AUD-*`.

**Vocabulario de estados:** taxonomía de 12 estados de [`repo-testing`](../../../.agents/skills/repo-testing/SKILL.md)
(`KEEP`, `KEEP_IMPROVE`, `DUPLICATE`, `REDUNDANT`, `OBSOLETE`, `MOVE`, `MERGE`, `REVIEW`, entre otros).

---

## 1. Contexto y Método

La auditoría se hizo después de la revisión previa de `tests/` (#682 a #692), que corrigió ejecución de Helm, ubicación de
suites, God Files, duplicados de ADRs, independencia del `cwd`, clasificación de `integration/`, descripciones del catálogo
y tests de Nginx. Se respondieron seis preguntas: distribución del árbol, reestructuración, modernización, reducción de
código, depuración y herramientas.

Mediciones realizadas (solo lectura):

- Inventario de `docs/testing/test-surface.json` por tipo y directorio.
- Ejecución de cada archivo por separado (tiempos) y de la suite completa con cobertura (`npm run test:coverage`).
- Búsquedas de patrones: lectura de archivos, `setTimeout`, mocks, mutación de `process.env`, tipado, esqueletos de DOM.
- Cruce de módulos de `apps/` y `scripts/` contra los tests que los importan.

Límites: la cobertura es la experimental de Node en un worktree sin `node_modules` propio (por eso falla
`AUD-DEP-ZOD-001`); los tiempos incluyen ~1,4 s de arranque de `tsx` por archivo; no se ejecutaron Playwright, k6 ni
Lighthouse, ni se revisaron los tiempos de los jobs de CI.

---

## 2. Línea Base Medida

| Métrica | Valor |
| :--- | :--- |
| Tests / archivos de test | 1.024 / 130 |
| Duración de la suite | ~65 s sin cobertura, ~85 s con cobertura |
| Casos por tipo | Contratos 298, Seguridad 223, Unit 221, Componente 146, Accesibilidad 41, E2E 22, **Integración 11**, Fuzz 7, Golden 3 |
| Tests que leen archivos del repo | 81 de 130 |
| Cobertura de líneas (backend / frontend / scripts) | 81,3 % / 91,8 % / 70,1 % |
| Cobertura de ramas (backend / frontend / scripts) | 82,3 % / 89,5 % / 72,4 % |
| Mediana de tiempo por archivo / p90 | 1,8 s / 6,4 s |
| Módulos de backend bajo 70 % de líneas | `ai.ts` 31 %, `routes/auth.ts` 33 %, `routes/pokemons.ts` 39 %, `cache.ts` 44 %, `pokemon.repository.ts` 57 %, `server.ts` 59 %, `routes/health.ts` 63 %, `routes/ai.ts` 66 %, `db/migrate.ts` 66 % |
| Aserciones sobre texto crudo en contratos | ~756 `includes` y ~240 `match`/`doesNotMatch` |
| Esperas reales (`setTimeout`) en tests | 23, de las cuales 10 son `setTimeout(…, 20)` en el frontend |
| Usos de `mock.*` de `node:test` | 0 |
| Herramienta de catálogo | 1.859 líneas de `scripts/test-surface` y 458 KB de documentos generados |

---

## 3. Respuestas a las Preguntas de la Auditoría

| Pregunta | Respuesta | Resumen |
| :--- | :---: | :--- |
| ¿La distribución del árbol es correcta? | Parcial | Coherente por tipo de prueba, con dos desajustes: `security/` tiene 17 contratos que no son de seguridad y la raíz tiene 15 archivos de gobernanza. |
| ¿Hay que reestructurar los directorios? | Opcional | Un `tests/contracts/` mejoraría la lectura, pero exige actualizar ~40 archivos externos que citan rutas. |
| ¿Hay que modernizar los tests? | Sí | Contratos por parseo en vez de texto, snapshots nativos en vez de golden manual y esperas por evento en vez de `setTimeout`. |
| ¿Hay que reducir código? | Sí | Boilerplate del frontend, 49 golden y el catálogo test-surface versionado. |
| ¿Hay que depurar algún test? | Poco | Un elemento obsoleto en esqueletos de DOM y una revisión pendiente de redundancia con herramientas de CI. |
| ¿Hay que cambiar herramientas? | No; completar | `node:test`, `tsx`, JSDOM, Playwright y k6 son adecuados. El hueco es la capa de integración HTTP. |

`tsx` sigue siendo necesario: los tests importan con `.js` hacia código `.ts` (168 imports frente a 9 con `.ts`) y el
código usa propiedades de parámetro en constructores (por ejemplo `apps/backend/src/utils/result.ts`), que el stripping
nativo de Node 24 no borra. Migrar costaría más de lo que aporta.

---

## 4. Hallazgos

| ID | Estado | Prioridad | Descripción y evidencia |
| :--- | :---: | :---: | :--- |
| `AUD-TST-INT-001` | `KEEP_IMPROVE` | P1 | La capa de integración HTTP es mínima (11 casos) y las rutas son lo menos cubierto: `routes/pokemons.ts` 39 %, `routes/auth.ts` 33 %, `routes/ai.ts` 66 %. Solo las ejercitan los E2E de Playwright, que no entran en la cobertura de Node. |
| `AUD-TST-FE-001` | `MERGE` | P2 | 10 archivos del frontend repiten el esqueleto de la página en `before()` (15 a 25 líneas), la fábrica `mk(...)` y el stub de `fetch`. |
| `AUD-TST-FE-002` | `OBSOLETE` | P2 | El elemento `typePillsContainer` está en 4 esqueletos de DOM y no existe en ningún archivo de `apps/`. Los esqueletos inline pueden quedar desfasados respecto de `apps/frontend/index.html`. |
| `AUD-TST-SNAP-001` | `KEEP_IMPROVE` | P2 | 49 archivos `.html` golden más una lógica propia `UPDATE_GOLDEN` en 3 suites (`html_parity*`). `t.assert.snapshot()` de `node:test` funciona en Node 24.19 y genera su archivo `.snapshot`. |
| `AUD-TST-CTR-001` | `KEEP_IMPROVE` | P2 | Los contratos de infraestructura comparan texto, no estructura (`k8s_workload_hardening` 93 aserciones de texto y 0 de parseo; `dr_backup_security` 122 y 2). Una línea comentada o reordenada puede dar falsos positivos o negativos. |
| `AUD-TST-RED-001` | `REVIEW` | P3 | Aserciones de `k8s_workload_hardening` (`readOnlyRootFilesystem`, `automountServiceAccountToken`, políticas Kyverno) que `kube-linter` y `kyverno test` ya validan en CI sobre manifiestos renderizados. Requiere comparación caso por caso antes de tocar. |
| `AUD-TST-TIM-001` | `KEEP_IMPROVE` | P3 | 23 esperas reales con `setTimeout`, en su mayoría 20 ms en el frontend, y ningún uso de `mock.timers`. Latencia y posible fragilidad bajo carga. |
| `AUD-TST-PERF-001` | `SLOW` | P3 | Los tests de controladores del frontend tardan ~7 s por archivo frente a una mediana de 1,8 s, probablemente por cargar JSDOM más `pokedex.ts` en cada archivo. Sin perfilar. |
| `AUD-TST-SRF-001` | `KEEP_IMPROVE` | P2 | El catálogo versionado incluye hash y conteos por archivo: cualquier cambio de un test modifica `test-surface.json` (328 KB) y provoca conflictos entre PRs concurrentes. En la revisión previa hubo que resolver conflictos en esos archivos en 4 PRs. |
| `AUD-TST-DIR-001` | `MOVE` | P3 | `security/` mezcla 15 archivos de seguridad con 17 contratos que no lo son (documentación, GHCR, Renovate, DR, Grafana); la raíz de `tests/` contiene 15 archivos de gobernanza; `unit/` y `frontend/` contienen 5 contratos cada uno. |
| `AUD-TST-CI-001` | `DUPLICATE` | P3 | `ci.yaml` ejecuta la suite dos veces en jobs paralelos: `npm test` en `code-quality` y `npm run test:coverage` en `sonarcloud`. |

Descartado tras investigación: `startup_fail_closed_contract` y `postgres_fail_closed` (resuelto en #689), el solapamiento
entre contratos de IaC (temas distintos) y el uso de `tsx` (necesario por las razones de la sección 3).

---

## 5. Plan de Mejora

El plan sigue el modelo de [`change-plan.md`](../../../.agents/skills/_shared/change-plan.md). Cada paquete se entrega en un
PR propio, en español, con `npm run test:surface:update` cuando cambien los tests.

### Paquete A — Integración HTTP de rutas (`AUD-TST-INT-001`)

- **Objetivo:** subir la cobertura de `routes/pokemons.ts`, `routes/auth.ts` y `routes/ai.ts` y cubrir el flujo CRUD y
  de sesión sin depender de Playwright. Objetivo propuesto: al menos 80 % de líneas en `routes/`.
- **Alcance:** `tests/integration/` con casos nuevos sobre la app Express, reutilizando la técnica de
  `version_endpoint.test.ts`. Sin cambios en `apps/`.
- **Riesgos:** estado compartido de almacenamiento en memoria entre casos (mitigar con datos únicos por caso); dependencia
  de Redis o de la IA externa (mitigar con los fallbacks existentes del backend, sin llamadas de red).
- **Criterio de aceptación:** cobertura de `routes/` medida con `npm run test:coverage` y casos de integración pasando
  de 11 a un número que cubra lectura, alta, edición, borrado, login y logout.

### Paquete B — Helper de página de catálogo en el frontend (`AUD-TST-FE-001`, `AUD-TST-FE-002`, `AUD-TST-TIM-001`)

- **Objetivo:** un helper `tests/frontend/catalog_page.ts` que cargue `apps/frontend/index.html` real, ofrezca `mk(...)`
  y el stub de `fetch` con restauración, y espere por evento o `mock.timers` en vez de `setTimeout(20)`.
- **Alcance:** los 10 archivos de controladores y accesibilidad con esqueleto inline. Elimina `typePillsContainer`.
- **Riesgos:** diferencias entre el HTML real y los esqueletos mínimos (IDs extra, scripts); mitigar migrando un archivo
  por commit y comprobando que cada suite pase antes de seguir.
- **Criterio de aceptación:** ningún test del frontend define `body.innerHTML` con un esqueleto de la página; reducción
  estimada de 200 a 300 líneas; tiempos por archivo no peores que los medidos.

### Paquete C — Snapshots nativos (`AUD-TST-SNAP-001`)

- **Objetivo:** reemplazar `tests/frontend/golden/*.html` y la lógica `UPDATE_GOLDEN` por `t.assert.snapshot()`.
- **Alcance:** `html_parity.test.ts`, `html_parity_modals.test.ts`, `html_parity_states.test.ts`; elimina 49 archivos.
- **Riesgos:** perder la paridad con la versión anterior del render; mitigar generando los snapshots a partir de los
  golden actuales y comprobando que el contenido sea idéntico antes de borrar los `.html`.
- **Rollback:** `git revert` del PR restaura los golden.

### Paquete D — Contratos por estructura (`AUD-TST-CTR-001`, `AUD-TST-RED-001`)

- **Objetivo:** que los contratos de infraestructura verifiquen la estructura parseada (`js-yaml`) o el manifiesto
  renderizado con Helm, no el texto.
- **Alcance:** incremental, un archivo por PR, empezando por `k8s_workload_hardening.test.ts`. Antes de reescribir cada
  aserción se decide su estado (`KEEP`, `REDUNDANT` frente a `kube-linter` o `kyverno test`) con el protocolo de
  depuración de `repo-testing`.
- **Riesgos:** pérdida de cobertura al eliminar aserciones redundantes; mitigar con una mutación por contrato
  (introducir el defecto y comprobar que el test falla) antes de borrar.
- **Criterio de aceptación:** `k8s_workload_hardening` sin aserciones de texto sobre YAML; contratos migrados con su
  mutación documentada en el PR.

### Paquete E — Catálogo test-surface sin hashes versionados (`AUD-TST-SRF-001`)

- **Objetivo:** que cambiar un test no modifique un artefacto versionado de 328 KB.
- **Alcance:** decisión de diseño previa (ver sección 7): comprobar solo lista de archivos, conteos por suite y
  descripciones, o no versionar el catálogo y generarlo en CI.
- **Riesgos:** perder el control de deriva que hoy aporta `test:surface:check`; mitigar conservando la comprobación de
  archivos nuevos o eliminados y de descripciones genéricas.
- **Criterio de aceptación:** un PR que solo edita un test no toca `docs/testing/`.

### Paquete F — Reestructura opcional (`AUD-TST-DIR-001`)

- **Objetivo:** `tests/contracts/` para contratos de CI, GitOps, infraestructura y documentación; `tests/security/` solo
  para seguridad de la aplicación.
- **Alcance:** mover ~50 archivos con un codemod que también actualice `ci-impact.yaml`, workflows, `package.json`, ADRs,
  skills y el catálogo (~40 archivos externos).
- **Riesgos:** ruptura de referencias y conflictos con PRs abiertos; mitigar ejecutándolo en una ventana sin PRs de tests
  abiertos y con `npm run lint:docs:refs`, `docs:validate` y la suite completa como gates.
- **Recomendación:** hacerlo solo si se acepta el costo; no cambia ninguna garantía de prueba.

### Paquete G — Housekeeping de CI y rendimiento (`AUD-TST-CI-001`, `AUD-TST-PERF-001`)

- **Objetivo:** evaluar ejecutar la suite una sola vez (cobertura en un job y gate sobre ese resultado) y perfilar la
  carga de JSDOM en los tests del frontend.
- **Alcance:** `.github/workflows/ci.yaml` y, si procede, un entorno JSDOM compartido.
- **Riesgos:** alargar el job crítico; mitigar midiendo la duración antes y después.

### Secuencia sugerida

1. **B y C** (bajo riesgo, independientes): reducen código y fragilidad, y B desbloquea medir `AUD-TST-PERF-001`.
2. **A** (mayor valor): puede ejecutarse en paralelo a B y C, pues toca `tests/integration/`.
3. **D** (incremental): un archivo por PR, después de A para no mezclar cobertura nueva con reescrituras.
4. **E** (tras decidir el diseño del catálogo): conviene hacerlo antes de abrir muchos PRs simultáneos, porque elimina
   los conflictos en `docs/testing/`.
5. **G y F** al final y solo si se aprueban.

### Estrategia de rollback

Cada paquete es un PR independiente con commits atómicos: revertir con `git revert <merge>`. Los paquetes B, C y D
conservan los tests originales hasta que los nuevos pasan; D exige la mutación previa para no perder cobertura.

---

## 6. Gates de Validación por Paquete

Los gates se derivan de [`change-impact-matrix.md`](../../../.agents/skills/_shared/change-impact-matrix.md); todos son
obligatorios salvo indicación.

- `npm test` y, si cambia el frontend, la suite de `tests/frontend/`.
- `npm run test:coverage` en el Paquete A (objetivo medido) y D.
- `npm run test:surface:check` tras `npm run test:surface:update`.
- `npm run lint` (Biome y `tsc`) y `npm run lint:md -- <archivos>` si se toca Markdown.
- `npm run pr:validate -- --body <archivo>` para el cuerpo del PR.
- Mutación comprobada del contrato (Paquetes C y D): introducir el defecto, ver que el test falla y revertir.

---

## 7. Decisiones Abiertas

1. **Retención de `docs/audits/`:** `documentation-contract.yaml` fija `max_active_snapshots: 1`. Este documento es una
   auditoría acotada y no un baseline, pero convive con `2026-10-08/baseline.md`. Decidir si se conserva, si sustituye
   al baseline o si se mueve a otro directorio.
2. **Diseño del catálogo test-surface (Paquete E):** qué se versiona (archivos y descripciones) y qué se genera en CI.
3. **Reestructura (Paquete F):** aceptar o no el costo de ~40 referencias externas.
4. **Meta de cobertura de `routes/`:** confirmar el 80 % propuesto o fijar otro umbral y si debe ser un gate de CI.
