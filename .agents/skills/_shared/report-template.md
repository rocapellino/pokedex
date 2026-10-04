# {{SKILL_NAME}} — Reporte

**Repositorio:** `rocapellino/pokedex`
**Fecha:** YYYY-MM-DD
**Commit:** `<sha>`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Proxmox Prod (en retiro) / Prod Cloud (blueprint)

---

## Identificación (obligatoria en `docs/audits/<fecha>/baseline.md`)

`audit-freshness.ts` parsea la línea `**Commit:**` y estas tres filas; sin ellas el baseline
queda `AUDIT_STALE` con diferencias `MISSING_*`.

| Componente | Valor auditado | Fuente |
| :--- | :--- | :--- |
| `package.json` | `<versión>` | Versión de aplicación y monorepo |
| `infra/helm/pokedex/Chart.yaml` (`version` / `appVersion`) | `<versión>` | Empaquetado Helm |
| GitOps `targetRevision` (manifiestos de `gitops/apps/`) | `v<versión>` | Promoción ArgoCD |

---

## 1. Resumen Ejecutivo

- **Total de Hallazgos:** `[Total]`
- **P0 (Crítico):** `[N]`
- **P1 (Alto):** `[N]`
- **P2 (Medio):** `[N]`
- **P3 (Bajo):** `[N]`

---

## 2. Matriz de Hallazgos

| ID                | Área     | Evidencia (`ruta:línea`) | Riesgo / Impacto           | Prioridad | Confianza | Esfuerzo | Recomendación / Acción          |
|-------------------|----------|--------------------------|----------------------------|-----------|-----------|----------|---------------------------------|
| `AUD-SEC-APP-001` | `[Área]` | `[ruta/al/archivo:L10]`  | `[Descripción del riesgo]` | `P1`      | `HIGH`    | `S`      | `[Acción correctiva propuesta]` |

---

## 3. Detalle de Hallazgos Significativos (P0 / P1)

<!-- Repetir la estructura de _shared/finding.md para cada hallazgo crítico -->

### `[ID]` Título del Hallazgo

- **Área:** `[Área técnica]`
- **Prioridad:** `P0` / `P1`
- **Confianza:** `HIGH` / `MEDIUM` / `LOW`
- **Esfuerzo:** `XS` / `S` / `M` / `L` / `XL`
- **Evidencia:** `ruta:línea` / comando / configuración
- **Estado actual:**
- **Riesgo/impacto:**
- **Recomendación:**
- **Verificación:**
- **Impacto en documentación:** `Ninguno` / `ruta/al/doc.md (pendiente|actualizado)`

---

## 4. Cambios Propuestos y Roadmap de Corrección

1. **Inmediato (P0/P1):**
2. **Medio Plazo (P2):**
3. **Mejoras Opcionales (P3):**

---

## 5. Configuration Hygiene (Requerido en modo full-audit)

### 1. `.ignore inventory`
<!-- Catálogo de archivos *.ignore detectados dinámicamente -->

### 2. Obsolete rules
<!-- Reglas que referencian rutas o tecnologías inexistentes -->

### 3. Missing rules
<!-- Reglas omitidas necesarias para control de versiones o build context -->

### 4. Overbroad rules
<!-- Patrones excesivamente amplios -->

### 5. Security-sensitive exclusions
<!-- Exclusiones críticas en .gitignore, .gitleaksignore, etc. -->

### 6. Cross-configuration consistency
<!-- Coherencia con Dockerfiles, CI, package.json, pre-commit, Taskfile -->

### 7. Recommended changes
<!-- Tabla consolidada de recomendaciones con clasificación KEEP, KEEP_IMPROVE, REMOVE, REVIEW, SECURITY_REVIEW -->

---

## 6. Checklist de Verificación y Criterios de Aceptación

- [ ] **Tests Unitarios & Integración:** `npm test` exitoso (0 fallos).
- [ ] **Compilación & Tipado:** `npm run build` y `npm run typecheck` limpios.
- [ ] **Gobernanza de Secretos & Paridad:** `npm run secrets:audit-rotation` y `npm run gitops:verify-parity`.
- [ ] **Pipelines de CI/CD:** Verificación de workflows locales o en GitHub Actions.
- [ ] **Documentación Sincronizada:** Actualización de `docs/` y trazabilidad en ADRs.
