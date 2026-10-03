# 📋 Registro y Política de Auditorías del Repositorio

Este directorio aloja los informes técnicos y snapshots de auditoría generados durante los ciclos de revisión, verificación de release y gobernanza de la plataforma **Pokédex**.

---

## 📌 Política de Retención y Conservación

De acuerdo con la especificación de ciclo de vida documental gobernada por la skill `repo-docs` y la política de retención del proyecto:

1. **Snapshot de Baseline más reciente (Árbol Activo):**
   - En el árbol de trabajo activo se mantiene exclusivamente el **último baseline consolidado** como evidencia histórica.
   - El directorio de fecha más reciente no implica vigencia: `repo-lifecycle` lo clasifica como `CURRENT` o `AUDIT_STALE` comparando sus metadatos con las fuentes actuales.
   - `AUDIT_STALE` es informativo y no bloqueante; ningún baseline fechado constituye evidencia del estado actual (ver la Regla de Oro más abajo).
   - Cualquier referencia a versiones concretas (por ejemplo `v1.78.3`) en este README se considera obsoleta: la versión vigente se lee en `package.json` y en `infra/helm/pokedex/Chart.yaml`.
2. **Ciclo de Consolidación y Poda:**
   - Una vez que los hallazgos de un ciclo de auditoría han sido remediados, consolidados en la documentación canónica activa (`docs/architecture/`, `docs/runbooks/`, etc.) y reflejados en el nuevo baseline, los snapshots intermedios y reportes auxiliares cerrados se podan del árbol de trabajo activo.
   - Esto previene la sobrecarga cognitiva y el desperdicio de tokens de contexto en los agentes de IA, garantizando que el análisis automatizado se enfoque en la arquitectura vigente.
3. **Preservación Histórica en Git:**
   - La eliminación del árbol de trabajo **no destruye la historia ni la trazabilidad**. Todos los diagnósticos, planes de remediación y auditorías previas (incluyendo los ciclos 2026-09-23 a 2026-09-25 y el baseline 2026-10-02) permanecen inmutables y consultables en el historial de commits de Git:

     ```bash
     git log --stat -- docs/audits/
     ```

---

## ⚠️ Regla de Oro Operativa (AGENTS.md)

> [!IMPORTANT]
> **Demarcación Estricta: SSOT Actual vs. Evidencia Histórica**
>
> Al analizar el repositorio, buscar dependencias, validar configuraciones de infraestructura o inspeccionar secretos:
>
> - **Fuentes Únicas de Verdad (SSOT Actual):** `gitops/`, `infra/`, `docs/architecture/`, `apps/`, `scripts/`, `tests/`.
> - **Evidencia Histórica:** `docs/audits/`.
>
> **NUNCA inferir el estado actual, rutas de secretos o configuración vigente desde `docs/audits/`**.
> Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio.
