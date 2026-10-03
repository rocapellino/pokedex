---
name: repo-lifecycle
description: Orquestador del ciclo de vida completo del repositorio Pokedex.
---

# repo-lifecycle

## Objetivo

Orquestar de extremo a extremo el ciclo de vida de desarrollo, análisis, refactorización, calidad, pruebas, documentación, higiene de configuración (`configuration-hygiene`), preparación de Pull Requests y publicación de releases en `rocapellino/pokedex`. Esta skill coordina la invocación condicional de las skills especializadas, evitando redundancias y garantizando cambios verificables y gobernados.

---

## Ciclo de Vida en 6 Fases

El ciclo de vida del repositorio es un bucle de seis fases. Cada fase tiene **una** skill responsable, un artefacto de salida y un criterio de salida verificable. `repo-context` se ejecuta antes de la fase 1 si el contexto no está disponible en la sesión.

```text
1 AUDITAR     repo-audit [quick|full|delta]       → hallazgos AUD-* + snapshot inmutable
     │
2 MATRIZ      repo-impact                         → change-plan con gates derivados de la matriz
     │
3 EJECUTAR    repo-fix | repo-refactor            → test que falla primero, commit por hallazgo
     │
4 ACTUALIZAR  repo-lifecycle update               → artefactos derivados + estado del hallazgo
     │
5 DOCUMENTAR  repo-docs                           → drift, ADRs, lint:md, docs:validate
     │
6 DEPURAR     repo-maintenance cleanup            → protocolo único de limpieza, git status limpio
     │
     └──► repo-pr  →  repo-release (si amerita tag)  →  vuelve a 1 (delta)
```

| Fase | Entrada | Criterio de salida |
| :--- | :--- | :--- |
| 1. Auditar | Pedido del usuario o calendario de `repo-maintenance` | Cada P0/P1 tiene evidencia `ruta:línea` y, si afecta despliegue, verificación de configuración efectiva por entorno ([methodology.md](../_shared/methodology.md) §1) |
| 2. Matriz | Hallazgo o requerimiento | Plan con archivos afectados, referencias inversas resueltas y gates del dominio ([change-impact-matrix.md](../_shared/change-impact-matrix.md)) |
| 3. Ejecutar | Plan aprobado | Test nuevo en verde, regresión confirmada (falla sin el fix) y gates del plan con estado real |
| 4. Actualizar | Commits de la fase 3 | Artefactos derivados sincronizados y estado del hallazgo registrado (ver abajo) |
| 5. Documentar | Diff completo | 0 errores `MDxxx`, `docs:validate` en verde y ADR enmendado si hubo `ADR Drift` |
| 6. Depurar | Rama lista | Sin código, scripts ni referencias huérfanas introducidas; `git status --short` sin sorpresas fuera de `tmp/` |

Las fases son secuenciales dentro de un cambio, pero no todas aplican siempre: el *Fast Track* documental salta la fase 3, y un cambio sin hallazgo previo entra por la fase 2.

### Fase 4: Actualizar

Después de ejecutar, `repo-lifecycle update` sincroniza lo que el cambio dejó desactualizado. Recorrer la lista y marcar cada ítem como `UPDATED` o `NOT_APPLICABLE`:

| Artefacto derivado | Disparador | Comando o acción |
| :--- | :--- | :--- |
| Inventario de tests | Se agregó, movió o eliminó un test | `npm run test:surface:update` |
| `apps/frontend/nginx.conf` | Cambió `nginx.conf.template` | `npm run nginx:conf` |
| Pines de digest en GitOps | Se publicó una imagen que debe promoverse | `npm run gitops:pin` (solo en flujo de release) |
| Hechos del stack en skills | Cambió algo descrito en [methodology.md](../_shared/methodology.md) §2 o en un `SKILL.md` | Editar la skill o reemplazar el dato por un enlace ([skill-contract.md](../_shared/skill-contract.md)) |
| Estado del hallazgo | Toda remediación de un `AUD-*` | Actualizar el tracker (ver ciclo de estados) |

**Ciclo de estados de un hallazgo.** Los snapshots en `docs/audits/<fecha>/` son inmutables, así que el estado vigente de cada hallazgo vive fuera de ellos: en un issue (GitHub o Linear) cuyo título comienza con el ID `AUD-*`.

```text
OPEN ──► PLANNED ──► IN_PROGRESS ──► VERIFIED ──► CLOSED
  │                       │              │
  └──► ACCEPTED_RISK      └──────────────┴──► REOPENED ──► IN_PROGRESS
```

| Estado | Significado | Evidencia mínima |
| :--- | :--- | :--- |
| `OPEN` | Emitido por una auditoría | Snapshot fechado con el hallazgo |
| `PLANNED` | Tiene plan de cambio aprobado | `change-plan` enlazado |
| `IN_PROGRESS` | Rama o PR abierto | Rama o PR enlazado |
| `VERIFIED` | Fix integrado con test de regresión | Commit en `main` + test que falla sin el fix |
| `CLOSED` | Verificado en el entorno afectado | Release promovido o evidencia de runtime; si no hay acceso, permanece `VERIFIED` |
| `REOPENED` | El test de regresión falló o el defecto reapareció | Run de CI o auditoría delta |
| `ACCEPTED_RISK` | Se decide no remediar | Justificación y responsable en el issue |

`repo-maintenance delta` compara la auditoría nueva contra los hallazgos en estado distinto de `CLOSED` y `ACCEPTED_RISK`.

---

## Flujo Canónico de `full-audit` en `/repo-lifecycle`

Cuando se invoca una auditoría integral completa (`full-audit`), `repo-lifecycle` ejecuta de forma secuencial y estructurada el flujo canónico de 16 etapas sin duplicar análisis especializados:

```text
PR/repository
 └── 1. inventory (Catálogo de archivos, módulos y artefactos)
      └── 2. code (Calidad estática, modularidad y antipatrones -> repo-quality)
           └── 3. dependencies (Árbol npm, lockfile y licencias -> repo-dependencies)
                └── 4. testing (Pirámide de pruebas, cobertura y valor -> repo-testing)
                     └── 5. security (SAST, secretos, supply chain y K8s -> repo-security)
                          └── 6. infrastructure (Helm, GitOps, Tofu y Ansible -> repo-architecture)
                               └── 7. CI/CD (Workflows, permisos y optimización -> repo-ci)
                                    └── 8. change impact (Matriz de impacto y propagación -> repo-impact)
                                         └── 9. documentation (Integridad, drift y Markdown Gate -> repo-docs)
                                              └── 10. scripts (Utilidades, consumidores y ADR-020 -> repo-maintenance)
                                                   └── 11. configuration hygiene (Auditoría integral de archivos *.ignore)
                                                        └── 12. issues/debt (Deuda técnica consolidada y backlog)
                                                             └── 13. skills (Auditoría de consistencia de skills del agente)
                                                                  └── 14. cleanup (Higiene de artefactos huérfanos o temporales)
                                                                       └── 15. architecture/simplification (Coherencia sistémica)
                                                                            └── 16. consolidated report (Reporte consolidado)
```

> [!NOTE]
> **Higiene de Archivos Temporales (Etapa 14 y Cierre):**
> La gestión de artefactos temporales y working tree limpio se rige por la regla transversal [repository-hygiene.md](../../rules/repository-hygiene.md):
> `Operación ➔ Artefactos efímeros en tmp/ ➔ Limpieza oportuna ➔ git status --short sin sorpresas fuera de tmp/`.

---

## Dominio: Higiene de Configuración y Archivos de Exclusión (`configuration-hygiene`)

La gobernanza de archivos de exclusión y configuración (`*.ignore`) está **centralizada
en `repo-lifecycle`**. No existe una skill separada `repo-ignore`; `repo-lifecycle`
orquesta este análisis y convoca a las skills especializadas (`repo-quality`,
`repo-security`, `repo-docs`) según el aspecto evaluado.

**La normativa completa del dominio reside en
[`references/configuration-hygiene.md`](references/configuration-hygiene.md)** y comprende:

1. Detección dinámica de archivos de exclusión, sin lista fija hardcodeada.
2. Las diez dimensiones de análisis requeridas por archivo detectado.
3. Protocolo de seguridad para `.gitignore` y `.gitleaksignore`.
4. Protocolo de `.dockerignore` y protección contractual del build.
5. Taxonomía de 5 estados de clasificación y modelo de evidencia estructurada.
6. Guardarraíles obligatorios: ninguna eliminación automática durante `full-audit`.

`repo-lifecycle` conserva la **orquestación** de este dominio: incluirlo como etapa 11 del
`full-audit`, consolidar sus hallazgos en el reporte final y respetar la prevalencia de
`REVIEW` ante impacto incierto. El detalle operativo reside en el reference citado.

---

---

## Demarcación Estricta de Responsabilidades entre Skills

Para evitar duplicaciones y mantener límites arquitectónicos claros:

1. **`repo-lifecycle` (Orquestación, Full-Audit & Consolidación):**
   - Decide el flujo general, el orden de invocación y coordina el ciclo de vida completo.
   - Centraliza el dominio de **`configuration-hygiene`** integrando la auditoría de todos los archivos `*.ignore`.
   - Consolida los hallazgos de todas las skills en el reporte final.
2. **`repo-quality` (Quality Gates Técnicos y Formato):**
   - Ejecuta y audita linters (`npm run lint`, `typecheck`), formateo y la inspección/ejecución de [`.pre-commit-config.yaml`](../../../.pre-commit-config.yaml).
   - Valida la sintaxis y formateo de archivos de configuración cuando corresponda.
   - Genera evidencias estructuradas diferenciando `EXECUTED_SUCCESS`, `EXECUTED_FAILED`, `NOT_AVAILABLE`, `NOT_APPLICABLE` o `NOT_EXECUTED`.
3. **`repo-security` (Superficie de Seguridad y DevSecOps):**
   - Analiza implicancias de seguridad de las exclusiones (riesgo de enmascarar secretos o código no auditado).
   - Audita a fondo las excepciones de `.gitleaksignore` y `.trivyignore` bajo principios Zero-Trust.
   - Evalúa secretos, SAST, SBOM, Cosign, SLSA y políticas de clúster Kubernetes.
4. **`repo-testing` (Estrategia y Gobernanza Multidimensional de Pruebas):**
   - Evalúa cobertura, duplicación, valor, velocidad, estabilidad y relación fáctica con el código fuente.
   - Aplica la taxonomía de 12 estados (`KEEP`, `KEEP_IMPROVE`, `DUPLICATE`, `REDUNDANT`, `OBSOLETE`, `BROKEN`, `FLAKY`, `SLOW`, `MOVE`, `MERGE`, `DELETE`, `REVIEW`).
   - Diferencia Application Tests de Policy-as-Test y detecta antipatrones (God Test Files, asertos vacíos, dependencias temporales/externas).
5. **`repo-docs` (Ciclo de Vida, Gobernanza e Integridad Documental):**
   - Responsable de ejecutar el ciclo de vida documental completo conforme a [documentation-governance.md](../../rules/documentation-governance.md) y su contrato declarativo (`documentation-contract.yaml`): límites (*boundaries*), presupuestos (*budgets*), inventario, clasificación en 7 estados, validación cruzada fáctica contra código/configuración/IaC/GitOps, remediación activa, depuración de referencias huérfanas y Markdown Quality Gate (`npm run lint:md`).
   - Evalúa si cambios en archivos `.ignore` generan drift con la documentación funcional.
6. **`repo-pr` (Preparación y Gate de Pull Request):**
   - Descubre dinámicamente el PR Template real del repositorio ([`.github/pull_request_template.md`](../../../.github/pull_request_template.md)) como única Fuente de Verdad.
   - Aplica el contrato determinista `scripts/validate-pr-body.ts` (`npm run pr:validate`) con compuertas bloqueantes pre-publicación (`tmp/pr-body.md`) y post-publicación (`--remote`), asegurando que todos los encabezados del template se preserven (`template headings ⊆ PR headings`) sin estructuras sustitutas.
   - Consume las evidencias consolidadas por `repo-lifecycle` y las skills de dominio para el PR Readiness Gate.
   - Redacta el título, descripción y checklists en español ([language-policy.md](../_shared/language-policy.md)). No realiza auditorías completas redundantes.
7. **`repo-release` (Gobernanza de Release y Promoción):**
   - Gobierna la transición de los cuatro niveles: `MAIN` → `RELEASE` → `GITOPS` → `RUNTIME`.
8. **`repo-maintenance` (Higiene de Tooling, Scripts y Cleanup):**
   - Ejecuta la fase 6 (*Depurar*) aplicando el [protocolo único de depuración](../_shared/cleanup-protocol.md) a scripts, utilidades y artefactos obsoletos, con la taxonomía de 8 estados.
9. **Auditoría del Catálogo de Skills (capacidad interna de `repo-lifecycle`):**
    - Verifica que las skills reflejen fielmente las capacidades activas del repositorio sin desfases ni solapamiento de atribuciones.
    - Contrasta los nombres de skills contra los directorios reales de `.agents/skills/` y contra los comandos documentados, para detectar referencias huérfanas.
    - Declara el vocabulario de estado empleado según el registro canónico de [`state-model.md`](../_shared/state-model.md) §3.
    - Como referencia metodológica externa se admite `project-skill-audit` del catálogo AAS, aprobado solo como `APPROVED_REFERENCE` y gobernado por `repo-lifecycle` (`scripts/aas-governance.ts`). No se materializa ni se ejecuta código upstream.

---

## Estructura del Reporte Consolidado (`## Configuration Hygiene`)

En todo reporte de `full-audit`, debe incluirse obligatoriamente la sección `## Configuration Hygiene` estructurada en las siguientes siete subsecciones:

```markdown
## Configuration Hygiene

### 1. `.ignore inventory`
Catálogo exhaustivo de archivos de exclusión detectados dinámicamente en el monorepo (ruta, tamaño, número de reglas, estado general).

### 2. Obsolete rules
Reglas que referencian rutas, herramientas, lenguajes o tecnologías inexistentes en el estado actual del repositorio.

### 3. Missing rules
Reglas necesarias omitidas que deberían incorporarse para proteger el control de versiones o el build context.

### 4. Overbroad rules
Patrones excesivamente amplios que pueden excluir accidentalmente artefactos legítimos.

### 5. Security-sensitive exclusions
Exclusiones en .gitignore, .gitleaksignore o .trivyignore con potencial impacto en la postura de seguridad.

### 6. Cross-configuration consistency
Validación cruzada de consistencia entre los archivos .ignore y Dockerfiles, CI workflows, package.json, pre-commit, Taskfile y Helm.

### 7. Recommended changes
Tabla consolidada de recomendaciones con clasificación (KEEP, KEEP_IMPROVE, REMOVE, REVIEW, SECURITY_REVIEW), evidencia e impacto.
```

---

## Despacho Condicional por Tipología de Cambio

No todas las skills son obligatorias para todos los cambios. Las skills y gates a ejecutar
por dominio residen **exclusivamente** en la tabla §4 de
[change-impact-matrix.md](../_shared/change-impact-matrix.md), única fuente de verdad del
despacho. Esta skill no mantiene una copia para evitar que ambas diverjan.

El cambio puramente documental conserva su *Fast Track*: `impact → docs → lint:md → pr`,
exento de builds, tests de aplicación y contenedores.

---

## Motor de Change Impact Analysis y DAG Dinámico de CI

`repo-lifecycle` gobierna el contrato declarativo [`.github/ci-impact.yaml`](../../../.github/ci-impact.yaml) y ejecuta el motor determinista [`scripts/detect-change-impact.ts`](../../../scripts/detect-change-impact.ts):

1. **Nivel Always:** Controles no negociables (escaneo de secretos y gobernanza de PR) que corren en todo Pull Request, incluidos los puramente documentales. Se implementan en `applyAlwaysTriggers()` y se aplican en los cuatro caminos de retorno del motor.
2. **Nivel Global:** Alteraciones en archivos transversales activan validación integral de todos los dominios. El conjunto canónico de rutas globales es el bloque `global.paths` de [`.github/ci-impact.yaml`](../../../.github/ci-impact.yaml), que a fecha de hoy incluye `package.json`, `package-lock.json`, `turbo.json`, `tsconfig.json`, `.pre-commit-config.yaml`, `.github/workflows/**`, `scripts/detect-change-impact.ts` y `scripts/declarations.d.ts`.
   > [!IMPORTANT]
   > `scripts/**` **no** es global en bloque: los scripts se clasifican de forma **individual** por dominio. La entrada de los `*.ignore` como "Nivel Global" en [change-impact-matrix.md](../_shared/change-impact-matrix.md) describe los *gates y skills a ejecutar*, no el disparador del motor. Esta clasificación granular es deliberada y más eficiente; ante un script no clasificado aplica la política fail-closed.
3. **Nivel Condicional:** Modificaciones acotadas disparan únicamente los Quality Gates y pipelines afectados (Fast Track documental, suites de backend, empaquetado Helm, etc.).
4. **Política Fail-Closed (Unknown):** Si el análisis no puede determinar con certeza el impacto de una ruta, se inhibe la optimización y se despacha Full CI.

---

## Modos de Operación

- **Full-Audit:** Ciclo completo de 16 etapas desde inventario inicial hasta reporte consolidado, incluyendo `configuration-hygiene`.
- **Full:** Ciclo completo desde contexto y auditoría integral hasta release y mantenimiento.
- **Fast:** Validación rápida de cambios acotados (`repo-context` + `repo-impact` + gates de dominio).
- **Change:** Modo estándar para desarrollo de features o correcciones de bugs (fases 2 a 6: `repo-impact` → `repo-fix`/`repo-refactor` → actualizar → `repo-docs` → depurar → `repo-pr`).
- **Update:** Fase 4 aislada: recorre la tabla de artefactos derivados y actualiza el estado de los hallazgos remediados.
- **Release:** Preparación formal de corte de versión y actualización GitOps (`repo-release`).
- **Maintenance:** Evaluación periódica de salud, higiene y backlog (`repo-maintenance`).

## Evaluación de Frescura de Auditorías

Al procesar el baseline fechado más reciente, `repo-lifecycle` debe ejecutar
[`scripts/audit-freshness.ts`](scripts/audit-freshness.ts) y comparar sus metadatos con
el `HEAD`, `package.json`, `infra/helm/pokedex/Chart.yaml` y las revisiones GitOps vigentes:

- **`CURRENT`**: todos los valores coinciden exactamente.
- **`AUDIT_STALE`**: el commit diverge, falta metadata o difiere una versión declarada.
- Las diferencias de aplicación, Chart y GitOps se reportan como evidencia adicional.
- `AUDIT_STALE` es informativo y **no bloqueante**: un snapshot fechado nunca se
  reescribe para aparentar vigencia ni se utiliza como SSOT del repositorio.

---

## Referencias Compartidas

- **Contrato de Impacto CI:** [ci-impact.yaml](../../../.github/ci-impact.yaml)
- **Metodología Base:** [methodology.md](../_shared/methodology.md)
- **Política de Idioma:** [language-policy.md](../_shared/language-policy.md)
- **Modelo de Estados:** [state-model.md](../_shared/state-model.md)
- **Matriz de Impacto:** [change-impact-matrix.md](../_shared/change-impact-matrix.md)
- **Planes de Cambio:** [change-plan.md](../_shared/change-plan.md)
- **Quality Gate de Markdown:** [markdown-quality.md](../_shared/markdown-quality.md)
- **Plantilla de Reporte:** [report-template.md](../_shared/report-template.md)
