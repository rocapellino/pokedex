# Plan de Cambio — Remediación del Catálogo de Skills (`.agents/`)

> **Estado:** Propuesta. Pendiente de revisión y aprobación antes de ejecutar.
> **Fecha:** 2026-09-30
> **Reporte de origen:** [`agents-catalog-audit.md`](agents-catalog-audit.md)
> **Alcance:** exclusivamente `.agents/`. Sin cambios en código, CI, IaC ni tests.

---

## 1. Objetivo y Justificación Técnica

Corregir los defectos de autoridad, vocabulario y jerarquía detectados en el corpus de
skills, **sin alterar el comportamiento de ningún gate de CI** y preservando los tests de
contrato que ya gobiernan el directorio.

Tres hallazgos P1 justifican actuar antes que el resto:

1. El documento canónico de impacto (`_shared/change-impact-matrix.md`) describe un
   motor que no existe. Las 18 skills lo consumen.
2. `repo-docs` se contradice a sí misma sobre su taxonomía principal (7 estados frente
   a 8), lo que hace sus hallazgos no agregables.
3. `rules/ssot-governance.md` apunta a `src/`, ruta inexistente, en la regla que gobierna
   la autoridad del resto.

Se descarta explícitamente la alternativa de **crear** una skill `repo-skills-audit`: la
allowlist de AAS ya asigna esa capacidad a `repo-lifecycle`, por lo que la opción
coherente es una capacidad interna, no una adición al catálogo.

---

## 2. Alcance Detallado

- **Código de Aplicación (`apps/`):** sin cambios.
- **Infraestructura & Orquestación (`infra/`, `gitops/`):** sin cambios.
- **Automatización & CI/CD (`.github/`, `scripts/`, `Taskfile.yaml`):** sin cambios.
  `.github/ci-impact.yaml` y `scripts/aas-governance.ts` se usan **como referencia de
  verdad** y no se modifican.
- **Suites de Pruebas (`tests/`):** sin cambios en esta fase. Se ejecutan como
  verificación de no regresión.
- **Documentación & ADRs (`docs/`):** se añade el reporte de auditoría y este plan.
  Ningún ADR requiere enmienda: no se altera arquitectura ni tooling.
- **Gobernanza de agentes (`.agents/`):** único objetivo del plan. 9 archivos.

---

## 3. Secuencia de Ejecución

El orden es **obligatorio**: los pasos 1 y 2 fijan el vocabulario y el modelo del motor
que los pasos posteriores deben respetar. Ejecutarlos en otro orden reintroduce drift.

### Fase 1 — Corrección de P1 (modelo y autoridad)

| # | Paso | Archivo | Hallazgo |
| --- | :--- | :--- | :--- |
| 1 | Sustituir la etiqueta "Nivel Global" de los `.*ignore` por la distinción real *gates vs. disparador*, replicando la aclaración de `repo-lifecycle:305-306` | `.agents/skills/_shared/change-impact-matrix.md` | `AUD-GOV-SKL-001` |
| 2 | Sustituir `src/` por `apps/` y añadir `tests/` a la fila de código fuente | `.agents/rules/ssot-governance.md` | `AUD-GOV-SKL-003` |
| 3 | Reconciliar `references/documentation-drift.md` con el vocabulario canónico de 7 estados de `SKILL.md` (ver mapa en la sección 3.1) | `.agents/skills/repo-docs/references/documentation-drift.md` | `AUD-GOV-SKL-002` |

### Fase 2 — Taxonomías y jerarquía (P2)

| # | Paso | Archivo | Hallazgo |
| --- | :--- | :--- | :--- |
| 4 | Añadir un registro canónico de taxonomías: qué vocabulario aplica a qué dominio | `.agents/skills/_shared/state-model.md` | `AUD-GOV-SKL-002` |
| 5 | Documentar la frontera de entrada mutua `lifecycle ↔ audit`, noting que no hay recursión | `.agents/README.md` | `AUD-GOV-SKL-004` |
| 6 | Extraer las líneas 77-188 (dominio `*.ignore`) a `references/configuration-hygiene.md` y dejar en `SKILL.md` el puntero y la orquestación | `.agents/skills/repo-lifecycle/` | `AUD-GOV-SKL-005` |

### Fase 3 — Higiene P3

| # | Paso | Archivo | Hallazgo |
| --- | :--- | :--- | :--- |
| 7 | Eliminar "orquestador" de la línea 24 y describir a `repo-audit` como agregador read-only | `.agents/skills/repo-audit/SKILL.md` | `AUD-GOV-SKL-001` colateral |
| 8 | Renombrar `repo-skills-audit` a capacidad interna de auditoría del catálogo | `.agents/skills/repo-lifecycle/SKILL.md:225` | `AUD-GOV-SKL-007` |
| 9 | Etiquetar `/repo-context agents` como modo `UPDATE` con guardarraíl explícito | `.agents/skills/repo-context/SKILL.md` | `AUD-GOV-SKL-008` |
| 10 | Enlazar el estado `BLOCKED` del MCP con el destino reservado `plans/` | `.agents/aas/README.md` | `AUD-GOV-SKL-009` |

> [!NOTE]
> El paso 6 se ejecuta **después** del 1 porque el dominio `*.ignore` que extrae depende
> de la distinción gates/disparador que el paso 1 corrige en el documento compartido.

### 3.1 Mapa de Equivalencias para el Paso 3 (decisión tomada)

El vocabulario canónico de drift documental es el de `repo-docs/SKILL.md` (7 estados),
por cubrir el ciclo de vida documental completo. `documentation-drift.md` se reescribe
adoptando ese conjunto y declara las equivalencias para no perder semántica:

| Estado canónico (7) | Equivalente actual en el reference | Tratamiento |
| :--- | :--- | :--- |
| `CURRENT` | `CURRENT` | Sin cambio |
| `OUTDATED` | `STALE` | Sin cambio de nombre; se absorbe el significado de `STALE` |
| `HISTORICAL` | `HISTORICAL` | Sin cambio |
| `DUPLICATE` | *(sin equivalente)* | Estado nuevo canónico |
| `ORPHANED` | `MISSING` *(parcial)* | Se diferencia: `MISSING` es capacidad sin doc; `ORPHANED` es doc que apunta a algo inexistente |
| `INVALID` | `CONTRADICTED` | Sin cambio de nombre; se absorbe el significado de `CONTRADICTED` |
| `NEEDS_REVIEW` | `UNKNOWN`, `NOT_APPLICABLE`, `PENDING_PROMOTION` | Se conservan como **calificadores** de `NEEDS_REVIEW`, no como estados de primer nivel |

> [!IMPORTANT]
> `PENDING_PROMOTION` y `NOT_APPLICABLE` no deben perderse: son necesarios para un
> repositorio con GitOps, donde "implementado en `main`" no equivale a "desplegado".
> Se conservan explícitamente como calificadores dentro de `NEEDS_REVIEW`, y el paso 4
> (registro de taxonomías) los documenta como tales.

---

## 4. Matriz de Riesgos y Mitigación

- **Riesgo 1 — Romper el test SKILL-001.** `tests/ci_impact.test.ts:747` valida que el
  `full-audit` declare tantas etapas como enumera. El paso 6 toca ese archivo.
  *Mitigación:* el paso 6 mueve prosa, **no** la enumeración de 16 etapas. Se ejecuta
  `npm test` inmediatamente después de ese paso y antes de continuar.
- **Riesgo 2 — Romper el test SKILL-001 de extensión `.yml`.** Cualquier archivo nuevo bajo
  `.agents/` es barrido por `tests/ci_impact.test.ts:783`.
  *Mitigación:* el archivo extraído no contendrá rutas de workflows; si las necesita, en
  formato `.yaml`.
- **Riesgo 3 — Contradigir la allowlist AAS.** `scripts/aas-governance.ts:16` asigna
  `project-skill-audit` a `repo-lifecycle`. El paso 8 debe ser coherente con ese mapeo.
  *Mitigación:* ejecutar `npm run aas:verify` tras el paso 8.
- **Riesgo 4 — Sobrecorrección del vocabulario.** Elegir 7 frente a 8 estados puede
  invalidar reportes históricos ya emitidos.
  *Mitigación:* los documentos bajo `docs/audits/` son inmutables y **no se reescriben**.
  La reconciliación solo afecta al catálogo de skills; los snapshots históricos conservan
  su taxonomía original.
- **Riesgo 5 — Deriva entre `AGENTS.md` y la regla corregida.**
  *Mitigación:* tras el paso 2, comparar ambas tablas y confirmar paridad exacta.
- **Riesgo 6 — Scope creep.** El reporte detecta superficie normativa amplia
  (`repo-doc-governance`, `repo-docs`, `_shared`).
  *Mitigación:* el alcance de este plan son 9 archivos. **La consolidación normativa
  detectada en `AUD-GOV-SKL-010` y la reducción general de duplicación quedan
  explícitamente fuera de este plan** y requieren análisis propio.

---

## 5. Estrategia de Rollback

Todos los cambios son documentales y no destructivos: no se borra ni se mueve código
ejecutable, salvo la extracción del paso 6, que es una copia seguida del borrado de prosa
dentro del mismo archivo.

**Rollback Preferencial (por commit):**

```bash
# Antes de empezar, registrar el baseline
git rev-parse HEAD

# Revertir el plan completo
git checkout -- .agents/
git status -s
```

**Rollback Parcial (por fase):** las fases 1, 2 y 3 tocan archivos disjuntos, salvo el
paso 6. Es posible revertir la Fase 3 completa sin tocar las Fases 1 y 2:

```bash
git checkout -- .agents/skills/repo-audit/ .agents/aas/
```

**Punto de control intermedio:** tras la Fase 1, crear un commit. Si la Fase 2 o 3
introducen regresiones, revertir ese commit restaura un estado verificado con `npm test`
en verde.

---

## 6. Criterios de Aceptación y Checklist de Validación

Validación **Fast Track documental** (`ci-impact.yaml` clasifica `.agents/**` bajo la
regla `documentation`): no requiere build, tests de aplicaciones ni contenedores.

- [ ] `npm run lint:md -- <archivos modificados>` → 0 errores `MDxxx`
- [ ] `npm test` → 0 fallos, en particular los tests **SKILL-001** (`:747` y `:783`)
- [ ] `npm run aas:verify` → gobierno local AAS válido
- [ ] `Test-Path src` → `False` y sin referencias a `src/` en `.agents/rules/`
- [ ] La fila `.*ignore` de `change-impact-matrix.md` ya no afirma "Nivel Global"
- [ ] `repo-lifecycle/SKILL.md` conserva la enumeración de 16 etapas
- [ ] Paridad exacta entre la tabla de `ssot-governance.md` y `AGENTS.md` sección 1
- [ ] `grep -r "repo-skills-audit" .agents/` → sin resultados
- [ ] `grep -r "orquestador" .agents/skills/repo-audit/` → sin resultados
- [ ] Ningún archivo bajo `.agents/` cita workflows con extensión `.yml`

---

## 7. Riesgos Aceptados y Trabajo No Planificado

> [!WARNING]
> Se acepta conscientemente **no** resolver en este plan:
>
> - **Duplicación de hechos volátiles** (`AUD-GOV-SKL-010`): `methodology.md`,
>   `repo-context/SKILL.md` y `aas-stack.json` replican el stack. Resolverlo exige
>   decidir si `_shared` enlaza a `docs/architecture/` o lo reproduce. Es una decisión de
>   arquitectura documental, no una limpieza.
> - **Superficie normativa de `repo-doc-governance` vs `repo-docs`** (8 + 4 referencias):
>   la causa raíz identificada es la multiplicación de taxonomías (paso 4), no el número
>   de archivos. Fusionar o eliminar requiere análisis posterior.
> - **Código dentro de `.agents/`** (`repo-lifecycle/scripts/audit-freshness.ts`): mudarlo
>   a `scripts/` raíz rompe el import de `tests/audit_freshness.test.ts:4`. Fuera de alcance.
> - **AAS `plans/`** (`AUD-GOV-SKL-009`): se mantiene el directorio; solo se mejora la
>   redacción del README.

---

## 8. Orden de Revisión Propuesto

1. Validar el reporte: [`agents-catalog-audit.md`](agents-catalog-audit.md).
2. Validar la Fase 1 (P1) — es la de mayor impacto y menor riesgo.
3. Validar la Fase 2, en especial el paso 6 por su efecto sobre SKILL-001.
4. Validar la Fase 3 (higiene).
5. Decidir el destino de la Sección 7 antes de cerrar el alcance.

| 10 | Enlazar el estado `BLOCKED` del MCP con el destino reservado `plans/` | `.agents/aas/README.md` | `AUD-GOV-SKL-009` |

> [!NOTE]
> El paso 6 se ejecuta **después** del 1 porque el dominio `*.ignore` que extrae depende
> de la distinción gates/disparador que el paso 1 corrige en el documento compartido.
