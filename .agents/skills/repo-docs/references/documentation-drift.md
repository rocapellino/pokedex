# Auditoría de Consistencia y Drift Documental (Documentation Drift Audit)

Este documento define la metodología técnica para identificar y prevenir inconsistencias semánticas entre el código fuente, la infraestructura, los manifiestos declarativos y la documentación técnica en `rocapellino/pokedex`.

---

## 1. Categorías Fundamentales de Drift Documental

La auditoría clasifica las anomalías documentales en cuatro categorías operativas:

1. **`STALE DOCUMENTATION` (Documentación Desactualizada):**
   El código o la configuración ha evolucionado, pero el documento técnico continúa describiendo el comportamiento o las rutas de una versión previa.
2. **`MISSING DOCUMENTATION` (Documentación Faltante):**
   Existe una capacidad o componente relevante en el sistema (ej. un nuevo CronJob, script o variable de entorno crítica) sin una guía operativa o especificación técnica asociada.
3. **`CONTRADICTORY DOCUMENTATION` (Documentación Contradictoria):**
   Dos o más documentos vigentes afirman estados o estrategias mutuamente excluyentes (ej. un ADR declara una vía como inactiva mientras el Runbook la declara como activa).
4. **`STATE MISREPRESENTATION` (Tergiversación de Estado del Sistema):**
   La documentación afirma que una capacidad está *"activa"*, *"desplegada"* o *"en producción"* cuando en realidad solamente está implementada en la rama `main` o pendiente de release en GitOps.

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
│      gitops/apps/app-proxmox.yaml (targetRevision)     │
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

Cada sección o documento analizado se clasifica bajo uno de los siguientes estados canónicos:

- **`CURRENT`:** El contenido refleja con total fidelidad el estado implementado y declarado.
- **`STALE`:** Describe una configuración o arquitectura previa ya superada en el código.
- **`CONTRADICTED`:** Presenta discrepancias directas con otro documento vigente o decisión activa.
- **`MISSING`:** La capacidad existe en el código pero carece de documentación formal.
- **`HISTORICAL`:** Documento inmutable de diagnóstico o auditoría pasada (no genera alerta de obsolescencia).
- **`UNKNOWN`:** Afirmación sobre el runtime que no puede verificarse sin telemetría en vivo.
- **`NOT_APPLICABLE`:** No aplica a la dimensión o entorno evaluado.
- **`PENDING_PROMOTION`:** Describe una capacidad implementada en `main` que aguarda corte de release o promoción en ArgoCD.

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
