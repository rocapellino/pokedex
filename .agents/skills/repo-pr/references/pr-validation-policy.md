# Política de Validación y PR Readiness Gate

Este documento define la relación de consumo de evidencias entre `repo-pr` y las skills de validación técnica, así como los criterios contractuales del PR Readiness Gate en `rocapellino/pokedex`.

---

## 1. Modelo de Consumo de Evidencias

> [!IMPORTANT]
> `repo-pr` **NO** ejecuta auditorías completas ni duplica las pruebas del repositorio. Su función es recopilar, contrastar y estructurar las evidencias provistas por las skills especializadas, garantizando que el Pull Request refleje la realidad fáctica del cambio.
>
> **Regla Cardenal:** Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio.

```text
  repo-quality    ──────► Evidencias de Lint, Typecheck y pre-commit ──────┐
                                                                           │
  repo-testing    ──────► Evidencias de Tests Unitarios, E2E y Fuzzing ────┼──► repo-pr
                                                                           │    (Readiness Gate)
  repo-security   ──────► Evidencias de Secretos, SAST y Dependencias ─────┤
                                                                           │
  repo-docs       ──────► Evidencias de Integridad Documental y MDxxx ─────┘
```

---

## 2. Gobernanza Dinámica de Pre-Commit

`repo-pr` no asume que pre-commit esté obligatoriamente configurado ni ejecuta directamente los hooks; evalúa dinámicamente la presencia de configuración (`.pre-commit-config.yaml`) y el estado provisto por `repo-quality`.

La evidencia debe clasificarse estrictamente en uno de los siguientes estados:

| Estado de Pre-Commit | Significado Operativo | Acción en el PR |
| :--- | :--- | :--- |
| **`EXECUTED_SUCCESS`** | Los hooks aplicables corrieron localmente y pasaron sin errores (exit code 0). | Marcar como superado con mención de los hooks validados. |
| **`EXECUTED_FAILED`** | Los hooks corrieron y detectaron infracciones no corregidas. | **Bloquea la apertura (`FAIL`).** Requiere resolver el fallo antes de abrir el PR. |
| **`NOT_AVAILABLE_LOCAL / CI_REQUIRED`** | La configuración existe pero el binario `pre-commit` no está instalado en el entorno local. | Declarar explícitamente la ausencia local del CLI; delegar la certificación a los runners de CI. **No falsear como ejecutado ni marcar error local.** |
| **`NOT_CONFIGURED`** | No existe archivo de configuración de pre-commit en el repositorio. | Declarar como no configurado. No genera advertencia ni bloqueo. |
| **`NOT_APPLICABLE`** | Los archivos modificados en el diff no coinciden con los tipos auditados por los hooks configurados. | Documentar como exento según tipos de archivo. |
| **`NOT_EXECUTED`** | La configuración y el CLI estaban disponibles, pero se omitió la ejecución. | Mantener desmarcado `[ ]` y solicitar ejecución previa al PR. |

---

## 3. Estados Contractuales del PR Readiness Gate

Antes de dar por finalizada la preparación de un PR, `repo-pr` evalúa dos dimensiones diferenciadas: **Readiness Local del PR** y **Readiness de Integración en CI**.

### A. Dimensión de Preparación Local (`PR Preparation State`)

- **`READY_FOR_PR`:** Se alcanza cuando el diff está limpio e higiénico, el template de PR fue descubierto y completado en español fáctico, los quality gates locales aplicables (`npm run lint`, `tsc`, `npm test`, Markdown lint) pasaron con éxito o fueron declarados formalmente (`CI_REQUIRED` / `NOT_APPLICABLE`), y no existen bloqueos P0/P1.
- **`NOT_READY`:** Pendiente completar pruebas locales requeridas, documentar secciones o corregir fallos locales detectados.
- **`BLOCKED`:** Impedimentos estructurales que impiden abrir el PR (ej. rama base divergente, template ausente, drift arquitectónico crítico).

### B. Dimensión de Integración Continua (`CI Pipeline State`)

- **`PENDING_CI`:** El PR fue abierto en estado `READY_FOR_PR`, pero los workflows remotos de validación (MegaLinter, SonarCloud, E2E, Pre-Commit en CI) aún están en curso o pendientes de disparo.
- **`ALL_GATES_PASSED`:** Se alcanza **únicamente** cuando la totalidad de los checks requeridos en GitHub Actions han concluido con estado `SUCCESS` y la rama puede integrarse de forma segura.
- **`CI_FAILED`:** Al menos un workflow requerido en CI falló y requiere investigación o corrección.

---

## 4. Clasificación Individual de Controles

Para cada verificación individual, se aplica la siguiente escala:

- **`PASS`:** Comprobación ejecutada localmente o certificada por tooling activo con resultado exitoso demostrable.
- **`FAIL`:** Comprobación ejecutada que arrojó fallos pendientes de corrección. Impide el PR.
- **`NOT_APPLICABLE`:** Comprobación no aplicable al radio de impacto del cambio ([change-impact-matrix.md](../../_shared/change-impact-matrix.md)).
- **`NOT_EXECUTED`:** Comprobación que aplicaba pero no se ejecutó. **Nunca equivale a PASS**.
- **`CI_REQUIRED`:** Herramienta no disponible en el runtime local; verificación formal delegada obligatoriamente a CI.

---

## 5. Checklist Contractual del PR Readiness Gate

Antes de declarar un cambio como `READY_FOR_PR`, `repo-pr` debe validar el siguiente checklist:

- [ ] 1. PR Template localizado dinámicamente según precedencia SSOT.
- [ ] 2. Todas las secciones del template contempladas sin omisiones silenciosas.
- [ ] 3. Secciones no aplicables debidamente documentadas con `N/A: <motivo>`.
- [ ] 4. Título del PR redactado en español siguiendo Conventional Commits.
- [ ] 5. Descripción, resumen e impacto redactados en español ([language-policy.md](../../_shared/language-policy.md)).
- [ ] 6. Nombres de herramientas, APIs, comandos y código preservados en inglés.
- [ ] 7. Estado de pre-commit evaluado dinámicamente y clasificado con rigor factual.
- [ ] 8. Quality Gates técnicos locales (`npm run lint`, `typecheck`) ejecutados según impacto.
- [ ] 9. Pruebas unitarias o de integración (`npm test`) ejecutadas según impacto.
- [ ] 10. Verificaciones de seguridad (secretos, SAST, dependencias) ejecutadas según impacto.
- [ ] 11. Cierre documental validado por `repo-docs` y Markdown Quality Gate con 0 errores `MDxxx`.
- [ ] 12. Clasificación de impacto coherente con [change-impact-matrix.md](../../_shared/change-impact-matrix.md).
- [ ] 13. Prohibición estricta de afirmaciones sin evidencia (no afirmar despliegue en runtime).
- [ ] 14. Diff higiénico: ningún archivo no relacionado incluido accidentalmente.
- [ ] 15. Estado del repositorio limpio y coherente con el modelo de estados (`MAIN != Producción`).
