# Registro Canónico de Fuentes Únicas de Verdad (Source of Truth Registry)

Este documento define la autoridad formal de información en `rocapellino/pokedex`. Ningún documento Markdown genérico puede ser considerado Source of Truth (SSOT) si contradice los artefactos declarativos o el código ejecutable aquí especificados.

---

## 1. Tabla de Autoridad por Dominio de Información

| Dominio de Información | Fuente Única de Verdad (SSOT) Primaria | Evidencia Fáctica y Rutas Canónicas | Fuente Secundaria / Derivada |
| :--- | :--- | :--- | :--- |
| **Versión de Software** | Metadatos de Release & Package | `package.json` (`version`), Git Tags (`vX.Y.Z`), `infra/helm/pokedex/Chart.yaml` (`appVersion`) | Changelog, Release notes |
| **Despliegue & Promoción** | Manifiestos ArgoCD (GitOps) | `gitops/apps/*.yaml` (`targetRevision`), `gitops/environments/*/values.yaml` | `docs/architecture/APPLICATION_LIFECYCLE.md` |
| **Configuración Kubernetes** | Helm Charts & GitOps Values | `infra/helm/pokedex/` (`templates/`, `values.yaml`), `gitops/environments/` | Runbooks de Kubernetes |
| **Infraestructura Base** | Código OpenTofu y Ansible | `infra/opentofu/`, `infra/ansible/` (`inventory/`, `playbooks/`) | Diagramas de topología |
| **Secretos & Cifrado** | Configuración Vault & ESO | `infra/ansible/playbooks/setup_vault.yml`, `gitops/environments/*/values.yaml` (`externalSecrets`) | Runbook de rotación |
| **Decisiones de Arquitectura** | Architectural Decision Records | `docs/decisions/ADR-*.md` (estrictamente ADRs con estado *Aceptado*) | `docs/architecture/` |
| **Procedimientos Operativos** | Runbooks Oficiales | `docs/runbooks/*.md`, `docs/operations/*.md` | Scripts en `scripts/` |
| **Estrategia y SLAs de DR** | Contratos de DR & Manifests | `docs/decisions/ADR-006-*.md`, `docs/runbooks/DISASTER_RECOVERY_PLAN.md`, `infra/helm/pokedex/templates/backup-*.yaml` | Dashboards de monitoreo |
| **Integración Continua (CI/CD)** | Workflows de GitHub Actions | `.github/workflows/*.yml`, `Taskfile.yml` | Guías de desarrollo |
| **Estado en Tiempo Real** | Evidencia de Runtime Observada | Telemetría en vivo, `kubectl get`, API de ArgoCD (si no hay acceso: `UNKNOWN`) | Métricas históricas |

---

## 2. Reglas de Resolución de Conflictos

1. **Código y Manifiestos superan a Documentación Textual:**
   Si un documento afirma que una característica está activa pero las plantillas Helm o los values de GitOps la tienen desactivada (`enabled: false`) o inexistente, **el manifiesto prevalece** y el documento se clasifica como `STALE` o `STATE_MISREPRESENTATION`.
2. **ADR Aceptado supera a Guías Informales:**
   Una decisión registrada en `docs/decisions/` con estado *Aceptado* representa la intención arquitectónica formal. Si el código diverge de un ADR aceptado, se produce un **ADR Drift** que exige revisión (`ADR REVIEW REQUIRED`) o un ADR que lo sustituya (*Superseded*).
3. **Evidencia Histórica no es SSOT:**
   Los informes bajo `docs/audits/<fecha>/` son capturas inmutables de diagnósticos pasados. Prohibido extraer rutas vigentes o configuraciones activas desde auditorías anteriores (Regla de Demarcación en `AGENTS.md`).
4. **Prohibición de Asumir Runtime:**
   Ningún estado de runtime puede certificarse a partir de un archivo Markdown sin evidencia observable directa. En ausencia de telemetría activa, el estado de runtime debe declararse estrictamente como `UNKNOWN`.
