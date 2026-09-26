# 📊 Baseline Técnico Post-Release `v1.78.3` — Repositorio Pokédex

> **Fecha:** 2026-09-26
> **Estado:** BASELINE OFICIAL POST-RELEASE (Fase F — Consolidación y Cierre)
> **Alcance:** Monorepo Pokédex (`rocapellino/pokedex`)
> **Versión GitOps Pin:** `v1.78.3` | **Versión Monorepo & Chart:** `1.78.3`

---

## 📑 1. Resumen Ejecutivo del Estado del Repositorio

El presente baseline certifica el estado técnico, arquitectónico y documental del repositorio tras la integración de la promoción GitOps `v1.78.3` ([PR #283](https://github.com/rocapellino/pokedex/pull/283)), el hardening de resiliencia y anti-SSRF ([PR #278](https://github.com/rocapellino/pokedex/pull/278)), y la resolución de inconsistencias documentales y de versionado (Fase F).

| Dimensión Técnica | Valor Cuantitativo / Estado | Detalle / SSOT |
| :--- | :--- | :--- |
| **Rama Principal** | `main` | Sincronizada y sin desfasajes de integración |
| **Versión Monorepo (`package.json`)** | `1.78.3` | Sincronizada con el release operacional |
| **Versión Helm Chart (`Chart.yaml`)** | `1.78.3` | Sincronizada con `appVersion: "1.78.3"` |
| **Pin GitOps (`targetRevision`)** | `v1.78.3` | ArgoCD Apps: `app-proxmox`, `app-proxmox-preprod`, `app-aws-eks`, `app-aws-eks-preprod` |
| **Suites de Pruebas Automatizadas** | 226/226 pruebas pasando (100%) | Node.js Test Runner nativo (`npm test`) |
| **Alineación de Secretos** | HashiCorp Vault CE + ESO | Roles y rutas canónicas: `pokedex/prod` y `pokedex/preprod` |
| **Aislamiento de Red & Anti-SSRF** | Cilium L7 eBPF + Local Simulation | FQDN allowlist + `scripts/probe-egress-security.ts` en suite de tests |
| **Persistencia Redis** | Habilitada (`2Gi` PVC) | Previene desincronización de lista negra de tokens en Proxmox Prod |
| **Superficie CLI (Taskfile)** | 18 aliases legados eliminados | Conforme a ADR-026 Fase 4 y gobernanza técnica |
| **Integridad Documental** | 100% Saneada | Eliminadas referencias obsoletas a Sealed Secrets y scripts retirados |

---

## 2. Consolidación de Arquitectura y Secretos

1. **HashiCorp Vault CE y External Secrets Operator (ESO):**
   - La arquitectura de gestión de secretos se encuentra consolidada sin coexistencia de herramientas legadas.
   - En entorno Proxmox on-premise, ESO sincroniza desde Vault CE (`vault.internal.net:8200`) mediante SecretStores segregados (`vault-backend-prod`, `vault-backend-preprod`).
   - En entorno AWS EKS, ESO sincroniza de forma nativa desde AWS Secrets Manager vía IRSA.
   - **Bitnami Sealed Secrets:** Retirado formalmente (`CLN-002`). La documentación técnica, runbooks, ADRs, matrices de responsabilidad y el PR template han sido completamente saneados.

2. **Estrategia de Conexión a Base de Datos (PostgreSQL):**
   - **Perfil On-Premise Lean (Proxmox):** El backend se conecta directamente a PostgreSQL mediante `pg.Pool` con límite de 20 conexiones concurrentes por réplica, maximizando el rendimiento sin overhead.
   - **Perfil Enterprise / Cloud:** Manifiestos de PgBouncer (`infra/helm/pokedex/templates/pgbouncer-deployment.yaml`) disponibles como componente modular para clústeres a gran escala.

---

## 3. Resiliencia Operativa y Red

1. **Persistencia de Caché y Sesiones (Redis):**
   - Se configuró volumen persistente (`persistence.enabled: true`, `size: 2Gi`) en Proxmox Prod para garantizar que la lista de JTIs revocados (revocación de sesiones) sobreviva a reinicios del pod sin degradar el clúster.

2. **Defensa en Profundidad Anti-SSRF:**
   - **Capa K8s / Runtime:** `CiliumNetworkPolicy` L7 con inspección de cabeceras HTTP y FQDN allowlist explícita (`generativelanguage.googleapis.com`, `raw.githubusercontent.com`, `pokeapi.co`).
   - **Capa Local / Pre-Commit:** `scripts/probe-egress-security.ts` valida localmente las restricciones de egress antes de cualquier despliegue.

---

## 4. Cadena de Suministro y Gobernanza

- **Firma Criptográfica:** Gitsign Keyless OIDC con validación estricta de emisor (`https://token.actions.githubusercontent.com`) e identidades de workflow.
- **Atestación de Imágenes:** Firmas Cosign y metadatos de procedencia SLSA generados durante el pipeline de build.
- **Gobernanza de Skills:** 20 skills operativas en `.agents/skills/`, alineadas a la matriz de impacto transversal y política estricta de idioma español (`AGENTS.md`).

---

## 5. Cierre de Deuda Técnica (Fase F)

| ID | Hallazgo Resuelto | Estado | Verificación |
| :--- | :--- | :--- | :--- |
| `DOC-001` | Referencias legadas a Bitnami Sealed Secrets | `CLOSED` | Saneados `SECURITY.md`, `SECURITY_AND_NETWORK_ISOLATION.md`, `TOOLS_AND_TECH_STACK.md`, `HELM_DEPLOYMENT_GUIDE.md`, ADR-005, ADR-020 y ADR-022. |
| `DOC-002` | `SECURITY.md` indicaba soporte v2.x mientras el repo opera en v1.x | `CLOSED` | Tabla de soporte actualizada: `main` y `v1.x` activos; `< v1.75.0` EOL. |
| `DOC-003` | Clarificación de perfil PgBouncer vs `pg.Pool` nativo | `CLOSED` | Especificado formalmente en `SECURITY.md` y guías operativas. |
| `DOC-004` | Referencias a scripts retirados en `RESPONSIBILITY_MATRIX.md` | `CLOSED` | Tabla de scripts actualizada con los 12 scripts activos en `scripts/`. |
| `DOC-005` | Menciones a `seal_secret.py` y `seal_secret.sh` en stack | `CLOSED` | Eliminadas de `TOOLS_AND_TECH_STACK.md`. |
| `PR-001` | Mención de SealedSecrets en PR Template | `CLOSED` | Actualizado `.github/pull_request_template.md` con Vault CE & ESO. |
| `REL-001` | Desacople de versión `1.76.0` vs GitOps `v1.78.3` | `CLOSED` | `package.json` y `Chart.yaml` actualizados a `1.78.3`. |
| `AUD-001` | Baseline desactualizado tras promoción de release | `CLOSED` | Emitido este documento `baseline_post-release.md` en corte `2026-09-26`. |
| `AUD-002` | Plan de mejora con tareas cerradas pendientes de actualizar | `CLOSED` | `docs/audits/2026-09-25/improvement-plan.md` actualizado con estados de ciclo de vida. |
