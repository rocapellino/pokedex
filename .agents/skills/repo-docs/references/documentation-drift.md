# Auditoría de Consistencia y Drift Documental (Documentation Drift Audit)

Este documento define la metodología técnica para identificar y prevenir inconsistencias semánticas entre el código fuente, la infraestructura, los manifiestos declarativos y la documentación técnica en `rocapellino/pokedex`.

---

## 1. Categorías Fundamentales de Drift Documental

La auditoría clasifica las anomalías documentales en cuatro categorías operativas, que
se mapean uno a uno sobre los estados canónicos de la sección 3:

1. **`STALE DOCUMENTATION` (Documentación Desactualizada) → `OUTDATED`:**
   El código o la configuración ha evolucionado, pero el documento técnico continúa describiendo el comportamiento o las rutas de una versión previa.
2. **`MISSING DOCUMENTATION` (Documentación Faltante) → `ORPHANED`:**
   Existe una capacidad o componente relevante en el sistema (ej. un nuevo CronJob, script o variable de entorno crítica) sin una guía operativa o especificación técnica asociada. Cuando la ausencia se produce porque el documento **enlaza a algo que ya no existe**, el estado preciso es `ORPHANED` (referencia rota) y no `OUTDATED`.
3. **`CONTRADICTORY DOCUMENTATION` (Documentación Contradictoria) → `INVALID`:**
   Dos o más documentos vigentes afirman estados o estrategias mutuamente excluyentes (ej. un ADR declara una vía como inactiva mientras el Runbook la declara como activa).
4. **`STATE MISREPRESENTATION` (Tergiversación de Estado del Sistema) → `INVALID` (`PENDING_PROMOTION`):**
   La documentación afirma que una capacidad está *"activa"*, *"desplegada"* o *"en producción"* cuando en realidad solamente está implementada en la rama `main` o pendiente de release en GitOps. Este caso requiere además el calificador `PENDING_PROMOTION` (sección 3.1).

---

## 2. Extracción y Verificación de Document Claims

La auditoría no se limita a contrastar títulos o nombres de archivos, sino que descompone el texto en **afirmaciones verificables (*Claims*)** y las somete a prueba contra la Fuente Única de Verdad (SSOT):

```text
┌────────────────────────────────────────────────────────┐
│                     DOCUMENT CLAIM                     │
│    "El backup a Google Drive está activo en K8s"       │
└───────────────────────────┬────────────────────────────┘
                            │  1. Consultar SSOT Registry
                            ▼
┌────────────────────────────────────────────────────────┐
│                 SOURCE OF TRUTH (SSOT)                 │
│ gitops/apps/app-proxmox-preprod.yaml (targetRevision)  │
└───────────────────────────┬────────────────────────────┘
                            │  2. Obtener Evidencia Fáctica
                            ▼
┌────────────────────────────────────────────────────────┐
│                    CURRENT EVIDENCE                    │
│   targetRevision = v1.75.10 (carece de backup-gdrive)  │
└───────────────────────────┬────────────────────────────┘
                            │  3. Evaluar Coherencia
                            ▼
┌────────────────────────────────────────────────────────┐
│                        RESULT                          │
│     MISMATCH -> STATE MISREPRESENTATION (HIGH)         │
└────────────────────────────────────────────────────────┘
```

---

## 3. Estados Documentales Estandarizados

Cada sección o documento analizado se clasifica bajo uno de los siguientes **siete estados
canónicos**, que constituyen el vocabulario único de drift documental del repositorio:

- **`CURRENT`:** El contenido refleja con total fidelidad el estado implementado y declarado.
- **`OUTDATED`:** Describe una configuración o arquitectura previa ya superada en el código.
  *(Absorbe el estado `STALE` de versiones anteriores de este documento.)*
- **`DUPLICATE`:** El contenido queda redundante frente a otro documento vigente que ya
  cubre la misma información. Requiere consolidación, no actualización.
- **`ORPHANED`:** El documento enlaza, invoca o describe rutas, comandos, scripts,
  archivos o componentes que **ya no existen** en el repositorio.
  *(Se diferencia de `OUTDATED`: aquí el problema es la referencia rota, no la
  descripción desfasada de algo que sigue vigente.)*
- **`INVALID`:** El documento afirma algo falso, con mayor gravedad que `OUTDATED`:
  estados de sistema, rutas de secretos, versiones o resultados de pruebas que no se
  corresponden con la realidad comprobable.
  *(Absorbe el estado `CONTRADICTED` de versiones anteriores: toda contradicción con un
  documento vigente o decisión activa se clasifica aquí.)*
- **`NEEDS_REVIEW`:** El estado no puede determinarse con certeza y requiere arbitraje
  humano o validación operativa. Admite los calificadores descritos a continuación.
- **`HISTORICAL`:** Documento inmutable de diagnóstico o auditoría pasada. No genera
  alerta de obsolescencia ni requiere remediación.

### 3.1. Calificadores de `NEEDS_REVIEW`

GitOps introduce estados intermedios que no encajan en los siete estados de primer nivel,
pero cuya pérdida semántica sería un defecto. Se conservan como **calificadores**:

| Calificador | Significado | Cuando se aplica |
| :--- | :--- | :--- |
| `PENDING_PROMOTION` | La capacidad está implementada en `main` pero aún no fue promovida a GitOps ni desplegada. | El `targetRevision` de ArgoCD no apunta aún al commit que la contiene. |
| `NOT_APPLICABLE` | La afirmación no aplica a la dimensión o entorno evaluado. | Un hallazgo sobre runtime en un entorno sin acceso o no afectado por el cambio. |
| `UNKNOWN` | No verificable sin telemetría en vivo. | Afirmaciones sobre el estado de `RUNTIME`. |

> [!IMPORTANT]
> `PENDING_PROMOTION` y `NOT_APPLICABLE` **no deben perderse** al reportar: en un
> repositorio gobernado por GitOps, describir una capacidad como "implementada en `main`"
> sin señalar que aún no está promovida es exactamente el tipo de tergiversación de
> estado que esta auditoría existe para evitar. Todo hallazgo `NEEDS_REVIEW` debe
> declarar su calificador.

### 3.2. Regla de Clasificación

```text
¿El documento describe algo que ya no existe?     ──► ORPHANED
¿Afirma algo falso o contradice otro documento?  ──► INVALID
¿Está desfasado pero su referente sigue vigente? ──► OUTDATED
¿Redunda con otro documento vigente?             ──► DUPLICATE
¿No es determinable con certeza?                  ──► NEEDS_REVIEW (+ calificador)
¿Es un snapshot fechado e inmutable?               ──► HISTORICAL
En otro caso                                       ──► CURRENT
```

---

## 4. Gobernanza y Ciclo de Vida de los ADRs (Architectural Decision Records)

Los registros de decisiones arquitectónicas (`docs/decisions/ADR-*.md`) gozan de máxima jerarquía formal:

- **Regla de No Mutación Automática:** Los agentes y skills **NUNCA deben modificar automáticamente un ADR** por el simple hecho de que la implementación haya cambiado.
- **Protocolo de Detección:** Si una implementación difiere de una decisión formal (ej. ADR-006 declara off-site solo como blueprint S3/PBS, mientras `main` implementa Rclone a Google Drive):
  1. El hallazgo se marca como **`ADR REVIEW REQUIRED`**.
  2. Se expone la contradicción con evidencia concreta.
  3. Se recomienda al equipo actualizar el ADR existente mediante una enmienda explícita o crear un nuevo ADR que lo sustituya formalmente (*Superseded*).

---

## 5. Análisis de Drift Temporal por Git Churn

Se emplea el historial de Git como señal de priorización de revisión:

- **Timestamp de última modificación del documento** vs. **commits posteriores en código relacionado**.
- Si un componente crítico acumula más de 10-15 commits desde la última modificación de su runbook, se eleva la prioridad de auditoría sobre ese documento, contrastando sus claims con el estado actual.

---

## 6. Modos de Operación: Audit vs. Reconcile

- **Modo Audit (Lectura):**
  Inspecciona los documentos frente al código y los manifiestos, extrae claims, construye la matriz de consistencia, detecta contradicciones y emite el reporte en `docs/audits/<fecha>/documentation/documentation-consistency.md` sin modificar archivos.
- **Modo Reconcile (Acción Controlada):**
  1. Identifica los documentos en estado `STALE` o `STATE_MISREPRESENTATION`.
  2. Elabora un plan de cambio formal ([change-plan.md](../../_shared/change-plan.md)).
  3. Actualiza exclusivamente los runbooks o guías operativas autorizadas (reemplazando afirmaciones erróneas por lenguaje preciso como *"implementado en main / pendiente de release"*).
  4. Los ADRs marcados como `ADR REVIEW REQUIRED` se dejan intactos para decisión humana.
  5. Ejecuta el Markdown Quality Gate (`npm run lint:md`) certificando 0 errores `MDxxx`.
