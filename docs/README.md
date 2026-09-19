# 📚 Portal de Documentación Técnica: Pokédex DevOps Platform

Bienvenido al centro de documentación oficial del monorepo **Pokédex DevOps Platform**. Este portal organiza y enlaza todas las especificaciones de arquitectura, contratos de API, manuales operativos, seguridad DevSecOps y guías de desarrollo del proyecto.

---

## 🗺️ Mapa de Navegación de la Documentación

```mermaid
flowchart TD
    PORTAL(["📚 Portal de Documentación\ndocs/README.md"]) --> ARCH["🏗️ 1. Arquitectura & Diseño\n(docs/architecture/)"]
    PORTAL --> API["📡 2. Contratos de API REST\n(docs/api/)"]
    PORTAL --> DEVOPS["🤖 3. DevOps, CI/CD & Herramientas\n(docs/devops/)"]
    PORTAL --> BEST["🌿 4. Estándares & Mejores Prácticas\n(docs/best-practices/)"]
    PORTAL --> RUN["📖 5. Runbooks & Operaciones\n(docs/runbooks/)"]
    PORTAL --> SEC["🛡️ 6. Seguridad & Incidentes\n(docs/security/)"]
    PORTAL --> ADR["📐 7. Decisiones de Arquitectura\n(docs/decisions/)"]
    PORTAL --> OPS["🚨 8. Operaciones de Plataforma\n(docs/operations/)"]

    ARCH --> A1["🎨 MOCKUPS_Y_DISENO_UI.md"]
    ARCH --> A2["🔬 ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md"]
    ARCH --> A3["🔄 APPLICATION_LIFECYCLE.md"]
    ARCH --> A4["🛡️ SECURITY_AND_NETWORK_ISOLATION.md"]
    ARCH --> A5["📊 DATABASE_ANALYSIS.md"]
    ARCH --> A6["☁️ CLOUD_INFRASTRUCTURE_DESIGN.md"]
    ARCH --> A7["☸️ KUBERNETES_SCALING_ANALYSIS.md"]
    ARCH --> A8["📂 MONOREPO_STRUCTURE.md"]
    ARCH --> A9["🔐 SECRETS_MANAGEMENT_SEALED_SECRETS.md"]
    ARCH --> A10["📋 RESPONSIBILITY_MATRIX.md"]
    ARCH --> A11["🏢 ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md"]
    ARCH --> A12["🔍 DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md"]
    ARCH --> A13["🛡️ FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md"]
    ARCH --> A14["🏷️ KUBERNETES_NAMESPACE_TAXONOMY.md"]
    ARCH --> A15["🔍 END_TO_END_COHERENCE_AUDIT.md"]

    API --> AP1["📡 API_SPECIFICATION.md"]

    DEVOPS --> D1["🤖 GITHUB_WORKFLOWS_GUIDE.md"]
    DEVOPS --> D2["🌿 GIT_BRANCHING_AND_MERGE_WORKFLOW.md"]
    DEVOPS --> D3["🛠️ TOOLS_AND_TECH_STACK.md"]

    BEST --> B1["🐳 MEJORES_PRACTICAS_DOCKERFILE.md"]

    RUN --> R1["⎈ HELM_DEPLOYMENT_GUIDE.md"]
    RUN --> R2["🚀 KUBERNETES_AUTOSCALING_GUIDE.md"]
    RUN --> R3["🧪 STRESS_TESTING_GUIDE.md"]
    RUN --> R4["🖥️ PROXMOX_DEPLOYMENT_GUIDE.md"]
    RUN --> R5["📋 DISASTER_RECOVERY_PLAN.md"]
    RUN --> R6["🚨 BREAK_GLASS_PROCEDURE.md"]

    SEC --> S1["🛡️ SECURITY.md (Root)"]
    SEC --> S2["🚨 SECURITY_RUNBOOK.md"]
    SEC --> S3["🔍 DEVSECOPS_AUDIT.md"]

    ADR --> AD1["📐 ADR-001 a ADR-022 (y ADR-023 a ADR-027)"]
    OPS --> OP1["🚨 observability-alerts.md"]
    OPS --> OP2["💾 backup-restore.md"]
    OPS --> OP3["🚀 deployment.md"]
    OPS --> OP4["🚑 incident-response.md"]
    OPS --> OP5["☸️ kubernetes-troubleshooting.md"]
    OPS --> OP6["⏪ rollback.md"]
    OPS --> OP7["🔐 secret-rotation.md"]
    OPS --> OP8["🛠️ TASKFILE_CLI_REFERENCE.md"]

    classDef main fill:#2563eb,stroke:#1d4ed8,color:#fff;
    classDef section fill:#0891b2,stroke:#0e7490,color:#fff;
    classDef doc fill:#64748b,stroke:#475569,color:#fff;

    class PORTAL main;
    class ARCH,API,DEVOPS,BEST,RUN,SEC,ADR,OPS section;
    class A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,A13,A14,A15,AP1,D1,D2,D3,B1,R1,R2,R3,R4,R5,R6,S1,S2,S3,AD1,OP1,OP2,OP3,OP4,OP5,OP6,OP7,OP8 doc;
```

---

## 📑 Directorio de Documentos por Categoría

### 1. 🏗️ Arquitectura y Decisiones de Diseño ([`docs/architecture/`](./architecture/))

* 🔄 [**APPLICATION_LIFECYCLE.md**](./architecture/APPLICATION_LIFECYCLE.md): **Ciclo de vida integral (SDLC & DevOps)** con diagrama de flujo de punta a punta (Linear, CI/CD, SemVer, Cosign Keyless OIDC, SBOM CycloneDX, Kyverno ClusterPolicy, ArgoCD y notificaciones Slack).
* 🛡️ [**SECURITY_AND_NETWORK_ISOLATION.md**](./architecture/SECURITY_AND_NETWORK_ISOLATION.md): Modelo de **Defensa en Profundidad**, segmentación de red DMZ de 4 capas, control de admisión con Kyverno, políticas *fail-closed* y aislamiento de base de datos con NetworkPolicies.
* 📊 [**DATABASE_ANALYSIS.md**](./architecture/DATABASE_ANALYSIS.md): Análisis de persistencia híbrida (PostgreSQL 16 con almacenamiento JSONB y secuencia atómica + Redis 7 para aceleración sub-3ms, revocación de sesiones y rate limiting atómico en Lua).
* ☁️ [**CLOUD_INFRASTRUCTURE_DESIGN.md**](./architecture/CLOUD_INFRASTRUCTURE_DESIGN.md): Arquitectura de infraestructura en la nube, topología Zero-Trust y despliegue híbrido GitOps (Proxmox VE on-premise + AWS EKS cloud) con OpenTofu.
* ☸️ [**KUBERNETES_SCALING_ANALYSIS.md**](./architecture/KUBERNETES_SCALING_ANALYSIS.md): Autoescalado elástico horizontal (**HPA v2**), garantía de consistencia de réplica única de base de datos y comparativa L4 vs L7.
* 🎨 [**MOCKUPS_Y_DISENO_UI.md**](./architecture/MOCKUPS_Y_DISENO_UI.md): Maquetación, arquitectura de componentes, esquemas wireframe ASCII y tokens de diseño para catálogo, modales y panel administrativo Backoffice.
* 🔬 [**ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md**](./architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md): Análisis comparativo de lenguajes de programación (TypeScript vs Python vs Go), arquitectura limpia y justificación del stack Node.js 22 LTS.
* 📂 [**MONOREPO_STRUCTURE.md**](./architecture/MONOREPO_STRUCTURE.md): Organización de directorios del monorepo (`apps/`, `infra/`, `gitops/`, `src/`, `scripts/`, `docs/`) y responsabilidades por dominio.
* 🔐 [**SECRETS_MANAGEMENT_SEALED_SECRETS.md**](./architecture/SECRETS_MANAGEMENT_SEALED_SECRETS.md): Gestión segura de credenciales sin secretos en claro en Git mediante Bitnami Sealed Secrets y escaneo con Gitleaks.
* 📋 [**RESPONSIBILITY_MATRIX.md**](./architecture/RESPONSIBILITY_MATRIX.md): **Matriz canónica de responsabilidades** de componentes (OpenTofu, Ansible, Bastion, Vault, ESO, ArgoCD, Cilium, Alloy) y demarcación técnica de herramientas DevSecOps.
* 🏢 [**ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md**](./architecture/ONPREM_SPOF_AND_FAILURE_DOMAIN_ANALYSIS.md): Análisis de aislamiento lógico vs físico, dominios de falla compartidos y mitigaciones del SPOF on-premise en Proxmox.
* 🔍 [**DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md**](./architecture/DECLARED_VS_RENDERED_ARCHITECTURE_ANALYSIS.md): Comparativa exhaustiva entre arquitectura declarada vs. realmente renderizada en Helm/GitOps (AWS vs Proxmox).
* 🛡️ [**FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md**](./architecture/FAIL_OPEN_VS_FAIL_CLOSED_CONTRACTS.md): Especificación formal de contratos de resiliencia ante contingencias de DB y Redis (Fail-Open vs. Fail-Closed).
* 🏷️ [**KUBERNETES_NAMESPACE_TAXONOMY.md**](./architecture/KUBERNETES_NAMESPACE_TAXONOMY.md): **Taxonomía canónica de namespaces de Kubernetes** (`pokemon-app` como SSOT), segregación de namespaces de plataforma y disambiguación de rutas/roles en HashiCorp Vault.
* 🔍 [**END_TO_END_COHERENCE_AUDIT.md**](./architecture/END_TO_END_COHERENCE_AUDIT.md): **Auditoría de coherencia operacional extremo a extremo** a través de los 8 eslabones de la cadena (OpenTofu $\rightarrow$ Ansible $\rightarrow$ K3s $\rightarrow$ Helm $\rightarrow$ GitOps $\rightarrow$ ESO/Vault $\rightarrow$ NetworkPolicy $\rightarrow$ CI/CD).

---

### 2. 📡 Contratos e Interfaces de API ([`docs/api/`](./api/))

* 📡 [**API_SPECIFICATION.md**](./api/API_SPECIFICATION.md): Especificación formal de los endpoints REST del backend (`/pokemons`, `/api/v1/auth/session`, `/api/v1/auth/logout`, `/api/v1/ai/*`, `/healthz`, `/readyz`, `/metrics`), diagrama de flujo del pipeline de middlewares, rate limiting y códigos HTTP.

---

### 3. 🤖 DevOps, CI/CD y Herramientas ([`docs/devops/`](./devops/))

* 🤖 [**GITHUB_WORKFLOWS_GUIDE.md**](./devops/GITHUB_WORKFLOWS_GUIDE.md): Guía completa de workflows de GitHub Actions con filtrado por rutas (`paths`), Quality Gates paralelos, firmado de imágenes con Cosign y sincronización bidireccional con Linear y alertas en Slack.
* 🌿 [**GIT_BRANCHING_AND_MERGE_WORKFLOW.md**](./devops/GIT_BRANCHING_AND_MERGE_WORKFLOW.md): Estrategia de ramas GitHub Flow, estándares de Conventional Commits, apertura de Pull Requests, reglas de protección y resolución de conflictos.
* 🛠️ [**TOOLS_AND_TECH_STACK.md**](./devops/TOOLS_AND_TECH_STACK.md): Catálogo exhaustivo de tecnologías utilizadas en el proyecto y diagrama de flujo del ecosistema de herramientas.

---

### 4. 🌿 Estándares y Mejores Prácticas ([`docs/best-practices/`](./best-practices/))

* 🐳 [**MEJORES_PRACTICAS_DOCKERFILE.md**](./best-practices/MEJORES_PRACTICAS_DOCKERFILE.md): Construcción multi-stage en Alpine, reducción de superficie de ataque (usuario no-root UID 1001), orden de capas y cacheo eficiente.

---

### 5. 📖 Manuales Operativos y Runbooks ([`docs/runbooks/`](./runbooks/))

* ⎈ [**HELM_DEPLOYMENT_GUIDE.md**](./runbooks/HELM_DEPLOYMENT_GUIDE.md): Manual de despliegue con Helm 3, parametrización de entornos (`values.yaml`, `values.prod.yaml`) y sincronización con ArgoCD.
* 🚀 [**KUBERNETES_AUTOSCALING_GUIDE.md**](./runbooks/KUBERNETES_AUTOSCALING_GUIDE.md): Procedimiento de validación del autoescalado con métricas de CPU y siembra masiva de datos.
* 🧪 [**STRESS_TESTING_GUIDE.md**](./runbooks/STRESS_TESTING_GUIDE.md): Guía para ejecución de pruebas de carga y estrés con k6 y generador concurrente de tráfico.
* 🖥️ [**PROXMOX_DEPLOYMENT_GUIDE.md**](./runbooks/PROXMOX_DEPLOYMENT_GUIDE.md): Guía de despliegue y virtualización en clústeres locales Proxmox VE con contenedores LXC, Cloud-Init, Ansible y OpenTofu.
* 📋 [**DISASTER_RECOVERY_PLAN.md**](./runbooks/DISASTER_RECOVERY_PLAN.md): Plan de contingencia, arquitectura 3-2-1 y protocolos de recuperación ante desastres.
* 🚨 [**BREAK_GLASS_PROCEDURE.md**](./runbooks/BREAK_GLASS_PROCEDURE.md): Protocolo de contingencia y acceso de emergencia Break-Glass mediante Bastion auditado (LXC 820).

---

### 6. 🛡️ Seguridad, Auditoría y Runbooks de Incidentes ([`docs/security/`](./security/))

* 🛡️ [**SECURITY.md**](../SECURITY.md): **Política oficial de seguridad** y divulgación responsable de vulnerabilidades (Responsible Disclosure) en la raíz del repositorio.
* 🚨 [**SECURITY_RUNBOOK.md**](./security/SECURITY_RUNBOOK.md): Procedimientos operativos estándar (**SOP**) de respuesta a incidentes de seguridad clasificados por matriz de severidad (SEV-1 a SEV-4).
* 🔍 [**DEVSECOPS_AUDIT.md**](./security/DEVSECOPS_AUDIT.md): Evaluación técnica integral de arquitectura, matriz de mitigación de vectores de vulnerabilidad y madurez operativa DevSecOps.

---

### 7. 📐 Registros de Decisión Arquitectónica ([`docs/decisions/`](./decisions/))

* 📐 [**ADR-001**](./decisions/ADR-001-kubernetes-as-runtime.md): Adopción de Kubernetes como Runtime Canónico de Producción.
* 📐 [**ADR-002**](./decisions/ADR-002-compose-for-local-development.md): Uso de Docker Compose Restringido a Desarrollo Local.
* 📐 [**ADR-003**](./decisions/ADR-003-gitops-with-argocd.md): GitOps Declarativo mediante ArgoCD y Digests Inmutables OCI.
* 📐 [**ADR-004**](./decisions/ADR-004-opentofu-and-ansible-boundaries.md): Delimitación de Responsabilidades entre OpenTofu e IaC Ansible.
* 📐 [**ADR-005**](./decisions/ADR-005-secret-management.md): Gestión de Secretos en Reposo con Bitnami Sealed Secrets y ESO.
* 📐 [**ADR-006**](./decisions/ADR-006-disaster-recovery-strategy.md): Estrategia de Recuperación ante Desastres con Validación Activa y Cifrado AES-256.
* 📐 [**ADR-007**](./decisions/ADR-007-observability-and-metrics.md): Observabilidad Unificada, Métricas RED y Prometheus ServiceMonitor.
* 📐 [**ADR-008**](./decisions/ADR-008-supply-chain-security.md): Seguridad de Cadena de Suministro (Supply Chain), Inmutabilidad de Artefactos y Atestaciones Criptográficas.
* 📐 [**ADR-009**](./decisions/ADR-009-ai-resilience-and-contracts.md): Arquitectura de Resiliencia, Contratos Estructurados y Mitigación de Fallas para Servicios de Inteligencia Artificial.
* 📐 [**ADR-010**](./decisions/ADR-010-authentication-and-session-management.md): Arquitectura de Autenticación, Gestión de Sesiones Criptográficas y Revocación Distribuida Fail-Closed.
* 📐 [**ADR-011**](./decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md): Estrategia de Persistencia Relacional, Migraciones Declarativas con Drizzle ORM y Connection Pooling con PgBouncer.
* 📐 [**ADR-012**](./decisions/ADR-012-iac-state-management-and-encryption.md): Estrategia de Gestión de Estados IaC, Bloqueo de Concurrencia y Cifrado en Cliente con OpenTofu.
* 📐 [**ADR-013**](./decisions/ADR-013-zero-trust-network-architecture.md): Arquitectura de Red Zero-Trust, Microsegmentación en 4 Capas y Filtrado Egress Anti-SSRF y FQDN.
* 📐 [**ADR-014**](./decisions/ADR-014-elastic-autoscaling-hpa-and-pod-disruption-budget.md): Estrategia de Autoescalado Elástico con HPA v2, PodDisruptionBudget y Alta Disponibilidad de Cómputo.
* 📐 [**ADR-015**](./decisions/ADR-015-pod-lifecycle-graceful-shutdown-and-probes.md): Estrategia de Terminación Grácil (Graceful Shutdown), Sondas de Salud y Ciclo de Vida de Pods.
* 📐 [**ADR-016**](./decisions/ADR-016-ingress-tls-and-http-hardening.md): Ingress Controller, Terminación TLS y Hardening de Cabeceras de Seguridad HTTP L7.
* 📐 [**ADR-017**](./decisions/ADR-017-kyverno-admission-control-and-pod-security.md): Control de Admisión con Kyverno ClusterPolicies y Pod Security Standards (PSS Restricted).
* 📐 [**ADR-018**](./decisions/ADR-018-opentelemetry-distributed-tracing-and-w3c.md): Observabilidad de Extremo a Extremo con OpenTelemetry y Trazabilidad Distribuida W3C.
* 📐 [**ADR-019**](./decisions/ADR-019-monorepo-build-optimization-and-dependency-graph.md): Optimización de Build en Monorepo, Grafo de Dependencias y Caché Declarativo con Turborepo.
* 📐 [**ADR-020**](./decisions/ADR-020-unified-deployment-governance-and-script-retirement.md): Gobernanza Unificada de Despliegue, CLI Canónico con Taskfile y Retiro de Scripts Legados.
* 📐 [**ADR-021**](./decisions/ADR-021-advanced-gitops-sync-waves-and-health-checks.md): Orquestación GitOps Avanzada con ArgoCD: Sync Waves, Hooks de Ciclo de Vida, Health Checks Declarativos y Patrón App-of-Apps.
* 📐 [**ADR-022**](./decisions/ADR-022-automated-credential-rotation-and-reloader.md): Rotación Automatizada de Credenciales, Sincronización Periódica con ESO y Recarga Dinámica con Stakater Reloader.
* 📐 [**ADR-023**](./decisions/ADR-023-typescript-native-compiler-adoption.md): Adopción del Compilador Nativo de TypeScript (`node --experimental-strip-types`) y Desacoplamiento de Bundlers.
* 📐 [**ADR-024**](./decisions/ADR-024-proxmox-bimodal-compute-lxc-preprod-vm-prod.md): Arquitectura Bimodal de Cómputo en Proxmox: Contenedores LXC para Pre-Prod y Máquinas Virtuales KVM para Producción.
* 📐 [**ADR-025**](./decisions/ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md): Segregación del Plano de Gestión, Plano de Runtime y Separación Cloud-Ready.
* 📐 [**ADR-026**](./decisions/ADR-026-taskfile-cli-alias-deprecation-and-lifecycle.md): Ciclo de Vida, Estrategia en Cuatro Fases y Deprecación de Aliases en Taskfile CLI.
* 📐 [**ADR-027**](./decisions/ADR-027-resilience-fail-open-vs-fail-closed-contracts.md): Formalización de Contratos de Resiliencia: Fail-Open vs. Fail-Closed en Backend y Frontend.

---

### 8. 🚨 Excelencia Operacional y Runbooks de Plataforma ([`docs/operations/`](./operations/))

* 📊 [**observability-alerts.md**](./operations/observability-alerts.md): Runbook operacional y procedimientos de mitigación para las 6 alertas de Prometheus.
* 💾 [**backup-restore.md**](./operations/backup-restore.md): Ciclo de vida operativo de copias de seguridad PostgreSQL, cifrado AES-256 y restauración manual y automatizada.
* 🚀 [**deployment.md**](./operations/deployment.md): Procedimiento estándar de entrega continua, verificación previa y sincronización con ArgoCD.
* 🚑 [**incident-response.md**](./operations/incident-response.md): Matriz de escalado por severidad (SEV-1 a SEV-3), diagnóstico rápido y triage operativo.
* ☸️ [**kubernetes-troubleshooting.md**](./operations/kubernetes-troubleshooting.md): Diagnóstico rápido para CrashLoopBackOff, ImagePullBackOff, fallos de endpoints y ExternalSecrets.
* ⏪ [**rollback.md**](./operations/rollback.md): Protocolos de reversión controlada vía ArgoCD, Helm de emergencia y Git revert.
* 🔐 [**secret-rotation.md**](./operations/secret-rotation.md): Protocolo de rotación periódica y de emergencia de secretos con External Secrets Operator y Stakater Reloader.
* 📈 [**capacity-and-quotas.md**](./operations/capacity-and-quotas.md): Dimensionamiento de recursos, límites y cuotas operacionales por namespace.
* 🛠️ [**TASKFILE_CLI_REFERENCE.md**](./operations/TASKFILE_CLI_REFERENCE.md): Referencia oficial del CLI unificado con Taskfile, catálogo canónico y estrategia en 4 fases de ciclo de vida de aliases.
