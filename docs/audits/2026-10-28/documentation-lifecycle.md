# Ciclo de Vida Documental — 2026-10-28

> **Estado:** Histórico (informe auxiliar posterior al baseline 2026-10-27; se poda cuando el siguiente baseline
> lo absorba).

**Skill:** `repo-docs` (revisar, actualizar, consolidar y depurar).
**Commit base:** `d24358da`.
**Vocabulario de estados:** `CURRENT`, `OUTDATED`, `HISTORICAL`, `DUPLICATE`, `ORPHANED`, `INVALID`,
`NEEDS_REVIEW` y acciones `UPDATE`, `CONSOLIDATE`, `ARCHIVE`, `DELETE`, `KEEP`.

> [!IMPORTANT]
> Evidencia histórica: no describe el estado actual del repositorio (Regla de Oro de `AGENTS.md`).

---

## 1. Alcance y Método

- **Alcance:** 85 documentos activos: la raíz, `docs/` (sin `docs/audits/`) y los README de `infra/`, `gitops/`,
  `apps/` y `.mcp/`. Las skills de `.agents/` quedan fuera: tienen su propia gobernanza.
- **Método:**
  1. Compuertas existentes (`docs:validate`, `lint:md`): ambas en verde al inicio, sin valor probatorio sobre las
     afirmaciones.
  2. Verificador ad hoc de referencias: rutas del repositorio, `task <x>` contra `task --list-all --json` y
     `npm run <x>` contra los `package.json`. Se validó con casos de control antes de usarlo.
  3. Contraste de afirmaciones contra `helm template` de pre-prod y del blueprint cloud.
  4. Barrido de patrones obsoletos (versiones de motores, claves de values y overlays retirados).
- **Runtime:** pre-prod está apagado y el stack de Grafana Cloud no registró ninguna serie `up` en 7 días, por lo
  que no se pudo verificar en runtime el estado de la migración del Alloy (ver §4).

---

## 2. Hallazgos

| ID | Prioridad | Estado → Acción | Evidencia | Resultado |
| :--- | :---: | :--- | :--- | :--- |
| `AUD-DOC-GATE-001` | P1 | `INVALID` → `UPDATE` | `scripts/validate-docs-governance.ts` | El gate no cubría los README satélite; `infra/README.md` enlazaba un values retirado sin detección. Gate ampliado y test de regresión. |
| `AUD-DOC-SSOT-001` | P1 | `OUTDATED` → `UPDATE` | `infra/README.md` | Declaraba como "SSOT de runtime para producción" `gitops/environments/proxmox/values.yaml`, retirado con ADR-030. |
| `AUD-DOC-RENDER-001` | P1 | `OUTDATED` → `UPDATE` | `docs/architecture/DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md` | PgBouncer "inactivo" en cloud (se renderiza), clave `cilium.enabled` inexistente, Alloy como parte del chart, trazas reenviadas, PostgreSQL 16 / Redis 7 y ADR-009 citado para Flannel. Reescrito desde el render. |
| `AUD-DOC-VER-001` | P2 | `OUTDATED` → `UPDATE` | 11 documentos de `docs/` | Citaban PostgreSQL 16 y Redis 7 como estado actual; ADR-031 adoptó PostgreSQL 17 y Valkey 8. |
| `AUD-DOC-CLI-001` | P2 | `DUPLICATE` → `CONSOLIDATE` | `docs/operations/TASKFILE_CLI_REFERENCE.md` | Las 4 fases de retiro de aliases duplicaban ADR-020 (con un diagrama que situaba la Fase 4 en "v2.0") y la tabla proponía sustitutos retirados (`infra:plan:aws`). Reemplazado por una nota que remite a ADR-020; el contrato de `iac_baseline_security.test.ts` pasó a exigir la remisión y la ausencia de aliases. |
| `AUD-DOC-ORPH-001` | P2 | `ORPHANED` → `UPDATE` | ADR-005, ADR-031, `RESPONSIBILITY_MATRIX.md` | `task k8s:restart` y `task k8s:verify-vault-architecture` no existen (son `k8s:rollout-restart` y `k8s:verify-vault`); `services/redis.ts` es `services/cache.ts` y el Service de Kubernetes es `pokemon-redis-svc`. |
| `AUD-DOC-ORPH-002` | P3 | `ORPHANED` → `UPDATE` | ADR-023 | Remitía a una auditoría podada; ahora indica el commit de poda. |
| `AUD-DOC-FMT-001` | P3 | `INVALID` → `UPDATE` | `docs/operations/GDRIVE_BACKUP_GUIDE.md` | Dos secciones numeradas "5". |

---

## 3. Documentos Evaluados sin Cambios

| Documento(s) | Acción | Motivo |
| :--- | :--- | :--- |
| `deployment.md` / `HELM_DEPLOYMENT_GUIDE.md` | `KEEP` | Fronteras declaradas: GitOps frente a Helm manual. |
| `incident-response.md` / `SECURITY_RUNBOOK.md` | `KEEP` | Incidentes operativos frente a incidentes de seguridad. |
| `backup-restore.md` / `DISASTER_RECOVERY_PLAN.md` / `GDRIVE_BACKUP_GUIDE.md` | `KEEP` | Jerarquía de backup declarada en `backup-restore.md`. |
| `ALLOY_K8S_MONITORING_MIGRATION.md` | `KEEP` (`NEEDS_REVIEW`) | Runbook de una sola ejecución; no se pudo confirmar en runtime si ya se aplicó (§4). |
| Menciones de componentes retirados en ADR-005, ADR-011, ADR-020, ADR-025, ADR-030, `SECRETS_MANAGEMENT.md` y `HELM_DEPLOYMENT_GUIDE.md` | `KEEP` (`HISTORICAL`) | Describen el retiro (`seal-secret.ts`, `init.sql`, `proxmox_deploy.sh`, overlays `aws/` y `proxmox/`) y sus enmiendas lo registran. |

---

## 4. Pendientes

1. **Verificación en runtime (`NEEDS_REVIEW`):** el stack de Grafana Cloud consultado no registró series `up` en
   7 días porque pre-prod está apagado (confirmado por el operador el 2026-10-28). Al volver a levantarlo hay que
   comprobar si `ALLOY_K8S_MONITORING_MIGRATION.md` ya se ejecutó (y retirarlo en ese caso) y verificar
   `AUD-ARCH-NET-001` y `AUD-ARCH-DB-001` en runtime.
2. **Skills de `.agents/`:** fuera de este ciclo; `methodology.md` §2 conserva datos volátiles copiados.

---

## 5. Compuertas

| Compuerta | Resultado |
| :--- | :--- |
| `npm run lint:md` (archivos modificados) | `PASS` (0 `MDxxx`) |
| `npm run docs:validate` (con el universo ampliado) | `PASS` |
| `npm run test:contracts` | `PASS` (359/359) |
| `npm run test:security` | `PASS` (215/215) |
| `npm run test:surface:check` y `npm run typecheck` | `PASS` |
