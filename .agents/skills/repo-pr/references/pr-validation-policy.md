# Política de Validación y PR Readiness Gate

Este documento define la relación de consumo de evidencias entre `repo-pr` y las skills de validación técnica, así como los criterios contractuales del PR Readiness Gate en `rocapellino/pokedex`.

---

## 1. Modelo de Consumo de Evidencias

> [!IMPORTANT]
> `repo-pr` **NO** ejecuta auditorías completas ni duplica las pruebas del repositorio. Su función es recopilar, contrastar y estructurar las evidencias provistas por las skills especializadas, garantizando que el Pull Request refleje la realidad fáctica del cambio.

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

## 2. Gobernanza de Pre-Commit en el PR

`repo-pr` no ejecuta directamente los scripts de pre-commit; consulta la evidencia generada por `repo-quality` al inspeccionar [`.pre-commit-config.yaml`](../../../../.pre-commit-config.yaml).

La evidencia debe clasificarse estrictamente en uno de los siguientes estados:

| Estado de Pre-Commit | Significado Operativo | Acción en el PR |
| :--- | :--- | :--- |
| **`EXECUTED_SUCCESS`** | Los hooks aplicables corrieron y pasaron sin errores (exit code 0). | Marcar como superado con mención explícita de los hooks validados. |
| **`EXECUTED_FAILED`** | Los hooks corrieron y detectaron infracciones no corregidas. | **Bloquea el PR (`FAIL`).** Requiere resolver el fallo antes de abrir el PR. |
| **`NOT_AVAILABLE`** | El binario `pre-commit` no está instalado en el entorno local (ej. Windows sin CLI de pre-commit). | Declarar explícitamente en el PR que la herramienta local no está instalada, delegando la verificación formal a los jobs de GitHub Actions. **No marcar como fallo ni falsear como ejecutado.** |
| **`NOT_APPLICABLE`** | Los archivos del diff no coinciden con los tipos auditados por los hooks configurados. | Documentar como no aplicable justificando la exención. |
| **`NOT_EXECUTED`** | Los hooks aplicaban y la herramienta estaba disponible, pero se omitió su ejecución. | El PR no puede marcar la casilla de verificación. Debe ejecutarse o justificarse. |

---

## 3. Estados Contractuales del PR Readiness Gate

Antes de dar por finalizada la preparación de un PR, `repo-pr` debe evaluar cada dimensión del cambio y asignar un estado inequívoco:

### A. `PASS`

- La comprobación fue ejecutada localmente o certificada por tooling activo con resultado exitoso demostrable.
- Existe evidencia en logs, salidas de terminal o reportes generados.

### B. `FAIL`

- La comprobación fue ejecutada y arrojó errores de compilación, tests fallidos, secretos detectados o violaciones de linters.
- Impide el marcado de readiness. El agente debe corregir el problema antes de proceder.

### C. `NOT_APPLICABLE`

- La comprobación no corresponde al radio de impacto del cambio (determinado por `repo-impact` y [change-impact-matrix.md](../../_shared/change-impact-matrix.md)).
- Ejemplo: Pruebas E2E de UI en un cambio exclusivo de documentación o scripts de infraestructura.

### D. `NOT_EXECUTED`

- La comprobación correspondía al tipo de cambio, pero no fue ejecutada en el ciclo actual.
- **Regla Cardinal:** `NOT_EXECUTED` **NUNCA** debe transformarse en `PASS`. En la descripción del PR debe figurar como pendiente o pendiente de ejecución en CI.

### E. `BLOCKED`

- Existen impedimentos estructurales para continuar (ej. PR Template ausente, drift severo sin resolver, rama base desincronizada).

---

## 4. Checklist Contractual del PR Readiness Gate

Antes de emitir el contenido final del Pull Request, `repo-pr` debe verificar los 15 puntos del Readiness Gate:

- [ ] 1. PR Template localizado dinámicamente según precedencia.
- [ ] 2. Todas las secciones del template contempladas sin omisiones silenciosas.
- [ ] 3. Secciones no aplicables debidamente documentadas con `N/A: <motivo>`.
- [ ] 4. Título del PR redactado en español siguiendo Conventional Commits.
- [ ] 5. Descripción, resumen e impacto redactados en español ([language-policy.md](../../_shared/language-policy.md)).
- [ ] 6. Nombres de herramientas, APIs y código preservados en inglés.
- [ ] 7. Archivo `.pre-commit-config.yaml` inspeccionado y su estado reportado con evidencia.
- [ ] 8. Quality Gates técnicos (`npm run lint`, `typecheck`) ejecutados según impacto.
- [ ] 9. Pruebas unitarias o de integración (`npm test`) ejecutadas según impacto.
- [ ] 10. Verificaciones de seguridad (secretos, SAST, dependencias) ejecutadas según impacto.
- [ ] 11. Cierre documental validado por `repo-docs` y Markdown Quality Gate con 0 errores `MDxxx`.
- [ ] 12. Clasificación de impacto coherente con [change-impact-matrix.md](../../_shared/change-impact-matrix.md).
- [ ] 13. Prohibición estricta de afirmaciones sin evidencia (no afirmar despliegue en runtime).
- [ ] 14. Diff higiénico: ningún archivo no relacionado incluido accidentalmente.
- [ ] 15. Estado del repositorio limpio y coherente con el modelo de estados (`MAIN != Producción`).
