# Registros de Decisión Arquitectónica (ADR)

Este directorio alberga los **Architecture Decision Records (ADR)** oficiales que gobiernan la plataforma Pokédex. Cada documento captura una decisión de diseño arquitectónico crítica, su contexto, motivación, justificación técnica y consecuencias operativas.

---

## 🏛️ Gobernanza y Ciclo de Vida de ADRs

1. **Vigencia Semántica**:
   - **Activo**: Decisiones vigentes que imponen restricciones de diseño o implementación en el sistema actual.
   - **Consolidado**: Decisiones o enmiendas que fueron subsumidas de forma coherente dentro de un ADR de mayor alcance.
   - **Retirado**: Decisiones históricas vinculadas a hitos de migración técnica puntual que completaron su ciclo y ya no imponen restricciones vivas.
2. **Inmutabilidad de Identificadores Históricos**:
   Los identificadores numéricos de decisiones retiradas o consolidadas (ej. `ADR-019`, `ADR-021`, `ADR-022`, `ADR-024`, `ADR-026`, `ADR-028`, `ADR-029`) **nunca serán reutilizados** para futuras decisiones, garantizando la trazabilidad histórica de commits, Pull Requests y auditorías.

---

## 📋 Catálogo de Decisiones Arquitectónicas Activas

Actualmente rigen **23 decisiones arquitectónicas activas**:

| Identificador | Título Canónico | Estado | Alcance / Dominio |
| :--- | :--- | :--- | :--- |
| [**ADR-001**](./ADR-001-kubernetes-as-runtime.md) | Adopción de Kubernetes como Runtime Canónico de Producción | **Activo** | Cómputo / Plataforma |
| [**ADR-002**](./ADR-002-compose-for-local-development.md) | Uso de Docker Compose Restringido a Desarrollo Local | **Activo** | Desarrollo Local |
| [**ADR-003**](./ADR-003-gitops-with-argocd.md) | Modelo de Despliegue Declarativo y Orquestación GitOps Avanzada con ArgoCD | **Activo** | GitOps / CD |
| [**ADR-004**](./ADR-004-opentofu-and-ansible-boundaries.md) | Delimitación de Responsabilidades entre OpenTofu e IaC Ansible | **Activo** | Infraestructura como Código |
| [**ADR-005**](./ADR-005-secret-management.md) | Gestión Canónica de Secretos con External Secrets Operator, Vault y Rotación Automatizada | **Activo** | Seguridad / Secretos |
| [**ADR-006**](./ADR-006-disaster-recovery-strategy.md) | Estrategia de Disaster Recovery (DR), Cifrado 3-2-1 y Respaldo Off-Site en Google Drive | **Activo** | Continuidad Operacional |
| [**ADR-007**](./ADR-007-observability-and-metrics.md) | Observabilidad Unificada, Métricas RED y Prometheus ServiceMonitor | **Activo** | Observabilidad |
| [**ADR-008**](./ADR-008-supply-chain-security.md) | Seguridad de Cadena de Suministro, Inmutabilidad y Atestaciones | **Activo** | DevSecOps / Supply Chain |
| [**ADR-009**](./ADR-009-ai-resilience-and-contracts.md) | Arquitectura de Resiliencia y Contratos Estructurados para IA | **Activo** | Servicios IA |
| [**ADR-010**](./ADR-010-authentication-and-session-management.md) | Arquitectura de Autenticación, Sesiones Criptográficas y Revocación Fail-Closed | **Activo** | Autenticación / Sesiones |
| [**ADR-011**](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md) | Persistencia Relacional, Migraciones con Drizzle ORM y Connection Pooling | **Activo** | Persistencia / Base de Datos |
| [**ADR-012**](./ADR-012-iac-state-management-and-encryption.md) | Gestión de Estados IaC, Bloqueo de Concurrencia y Cifrado con OpenTofu | **Activo** | Seguridad IaC |
| [**ADR-013**](./ADR-013-zero-trust-network-architecture.md) | Arquitectura Zero-Trust, Microsegmentación y Egress Anti-SSRF Cilium L7 | **Activo** | Redes / Zero-Trust |
| [**ADR-014**](./ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md) | Autoescalado Elástico con HPA v2, PodDisruptionBudget y Alta Disponibilidad | **Activo** | Resiliencia de Cómputo |
| [**ADR-015**](./ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md) | Terminación Grácil (Graceful Shutdown), Sondas de Salud y Ciclo de Vida | **Activo** | Resiliencia de Pods |
| [**ADR-016**](./ADR-016-ingress-tls-and-http-hardening.md) | Ingress Controller, Terminación TLS y Hardening de Cabeceras HTTP L7 | **Activo** | Redes / Ingress |
| [**ADR-017**](./ADR-017-kyverno-admission-control-and-pod-security.md) | Control de Admisión con Kyverno y Pod Security Standards (Restricted) | **Activo** | Gobernanza K8s |
| [**ADR-018**](./ADR-018-opentelemetry-distributed-tracing-and-w3c.md) | Observabilidad con OpenTelemetry y Trazabilidad Distribuida W3C | **Activo** | Observabilidad / Tracing |
| [**ADR-020**](./ADR-020-unified-deployment-governance-and-script-retirement.md) | Gobernanza Unificada de Despliegue, CLI Canónico con Taskfile y Retiro de Scripts | **Activo** | Gobernanza de Operaciones |
| [**ADR-023**](./ADR-023-typescript-native-compiler-adoption.md) | Adopción del Compilador Nativo de TypeScript y Desacoplamiento de Bundlers | **Activo** | Runtime Backend |
| [**ADR-025**](./ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md) | Segregación del Plano de Gestión, Plano de Runtime y Separación Cloud-Ready | **Activo** | Arquitectura de Red |
| [**ADR-027**](./ADR-027-resilience-fail-open-vs-fail-closed-contracts.md) | Formalización de Contratos de Resiliencia: Fail-Open vs. Fail-Closed | **Activo** | Resiliencia de Software |
| [**ADR-030**](./ADR-030-environment-model-local-dev-proxmox-preprod-cloud-prod.md) | Modelo de Entornos: Dev Local, Pre-Prod en Proxmox LXC y Prod Cloud Agnóstico | **Activo** | Plataforma / Entornos |

---

## 🗄️ Registro Histórico de Decisiones Consolidadas o Retiradas

Para eliminar el ruido en el directorio de decisiones activas sin perder trazabilidad, las siguientes decisiones fueron absorbidas por registros de mayor alcance:

| ID Histórico | Título Original | Estado | Documento Absorbe | Justificación Técnica |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-019** | Optimización de Build en Monorepo y Caché con Turborepo | **Retirado** | [MONOREPO_STRUCTURE](../architecture/MONOREPO_STRUCTURE.md) | Turborepo solo cacheaba `build`, `lint` y `typecheck` de dos workspaces como capa opt-in local y nunca fue compuerta de CI. Se eliminó `turbo.json` y su dependencia; la orquestación canónica son los npm workspaces. |
| **ADR-021** | Orquestación GitOps Avanzada con ArgoCD: Sync Waves, Hooks y App-of-Apps | **Consolidado** | [ADR-003](./ADR-003-gitops-with-argocd.md) | Orquestación determinista por olas (Sync Waves 0-4), Custom Health Checks en Lua para CRDs y patrón App-of-Apps integrados en el modelo declarativo GitOps oficial. |
| **ADR-022** | Rotación Automatizada de Credenciales con ESO y Stakater Reloader | **Consolidado** | [ADR-005](./ADR-005-secret-management.md) | Protocolo de recarga dinámica con Stakater Reloader, refreshInterval acotado, perfil Lean Proxmox vs Cloud y auditoría CI/CD integrados en la gestión canónica de secretos. |
| **ADR-024** | Arquitectura Bimodal de Cómputo en Proxmox: LXC (Pre-Prod) y VM KVM (Prod) | **Consolidado** | [ADR-030](./ADR-030-environment-model-local-dev-proxmox-preprod-cloud-prod.md) | Proxmox deja de alojar producción. El endurecimiento del LXC, el perfil Lean y las reglas de credenciales de OpenTofu se conservan en ADR-030; se retira la rama de producción en VM KVM. |
| **ADR-026** | Ciclo de Vida Aliases Taskfile CLI | **Retirado** | [ADR-020](./ADR-020-unified-deployment-governance-and-script-retirement.md) | Fase 4 ejecutada con éxito (purga definitiva de los 18 aliases legados). La gobernanza canónica de `task --list` fue integrada en ADR-020. |
| **ADR-028** | Estrategia de Respaldo Off-Site en la Nube con Google Drive y Rclone | **Consolidado** | [ADR-006](./ADR-006-disaster-recovery-strategy.md) | Adenda operacional de replicación en la nube incorporada como la tercera copia oficial de la estrategia 3-2-1 en ADR-006. |
| **ADR-029** | Unificación de Esquema en Drizzle ORM y Retiro de `init.sql` | **Consolidado** | [ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md) | Migración completada; la definición de Drizzle como SSOT exclusivo y erradicación de scripts SQL estáticos fue absorbida en ADR-011. |
