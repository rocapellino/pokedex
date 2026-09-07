# 🔄 Ciclo de Vida Integral de la Aplicación (SDLC & DevOps Lifecycle)

Este documento describe el flujo de vida completo de la plataforma **Pokédex**, desde la concepción de una tarea o actualización de seguridad hasta su despliegue, versionado semántico y mantenimiento automatizado.

---

## 📑 Índice
1. [Diagrama de Flujo del Ciclo de Vida](#1-diagrama-de-flujo-del-ciclo-de-vida)
2. [Fases Detalladas del Ciclo](#2-fases-detalladas-del-ciclo)
   * [Fase 1: Planificación y Gestión Ágil (Linear)](#fase-1-planificación-y-gestión-ágil-linear)
   * [Fase 2: Desarrollo Local y Quality Gates (DX)](#fase-2-desarrollo-local-y-quality-gates-dx)
   * [Fase 3: Integración Continua y Validación (GitHub Actions)](#fase-3-integración-continua-y-validación-github-actions)
   * [Fase 4: Revisión de Código y Quality Gate (GitHub Rulesets)](#fase-4-revisión-de-código-y-quality-gate-github-rulesets)
   * [Fase 5: Merge y Versionado Semántico Automático](#fase-5-merge-y-versionado-semántico-automático)
   * [Fase 6: Despliegue y Orquestación (Docker & Kubernetes)](#fase-6-despliegue-y-orquestación-docker--kubernetes)
   * [Fase 7: Mantenimiento Continuo y Dependabot Sync](#fase-7-mantenimiento-continuo-y-dependabot-sync)

---

## 1. Diagrama de Flujo del Ciclo de Vida

```mermaid
flowchart TD
    %% FASE 1: PLANIFICACIÓN
    subgraph F1["📋 FASE 1: Planificación (Linear)"]
        L1["Ticket Creado (ej: PER-6)"] --> L2["Copiar Formato de Rama (Ctrl+Shift+.)"]
    end

    %% FASE 2: DESARROLLO LOCAL
    subgraph F2["💻 FASE 2: Desarrollo Local (DX)"]
        L2 --> G1["git checkout -b rocapellino/PER-X-tarea"]
        G1 --> DEV["Desarrollo de Código / Tests"]
        DEV --> LOC_TEST["Validación Local: task test / task audit"]
        LOC_TEST --> PRECOMMIT["Hooks Pre-commit (Ruff, Gitleaks, JSCPD)"]
    end

    %% FASE 3: CI & SEGURIDAD
    subgraph F3["🤖 FASE 3: Integración Continua (CI/CD)"]
        PRECOMMIT --> PUSH["git push & Abrir Pull Request"]
        PUSH --> LIN_BOT["Linear Bot vincula PR y pasa a In Progress"]
        PUSH --> CI_MAIN["🔍 ci.yml (Auditoría, Semgrep SAST, Gitleaks, Trivy, Checkov)"]
        PUSH --> CI_API["🧪 api.yml (TypeScript Lint, Test & Build)"]
        PUSH --> CI_WEB["🌐 web.yml (JS Lint + Nginx Test)"]
        PUSH --> CI_INFRA["⚙️ infra.yml (Helm Lint & Template + OpenTofu/TF)"]
    end

    %% FASE 4: CODE REVIEW & RULES
    subgraph F4["🛡️ FASE 4: Quality Gate & Review"]
        CI_MAIN & CI_API & CI_WEB & CI_INFRA --> GATE{¿Todos los Checks en Verde?}
        GATE -->|❌ Falló| FIX["Corregir errores en local y pushear"]
        FIX --> PUSH
        GATE -->|✅ Verde| REVIEW["Revisión de Código (Copilot / Peer Review)"]
    end

    %% FASE 5: RELEASE AUTOMÁTICO
    subgraph F5["🏷️ FASE 5: Merge & Versionado Automático"]
        REVIEW --> MERGE["Merge Pull Request a 'main'"]
        MERGE --> LIN_DONE["Linear Bot pasa Ticket a 'Done'"]
        MERGE --> AUTO_TAG["🏷️ release-tag.yml (SemVer Auto-Bump)"]
        AUTO_TAG --> TAG["Crea Git Tag (v1.x.x) + GitHub Release"]
        MERGE --> GHCR_PUB["📦 ci.yml publica imágenes OCI a GHCR"]
    end

    %% FASE 6: DESPLIEGUE GITOPS
    subgraph F6["☸️ FASE 6: Despliegue Continuo GitOps (ArgoCD)"]
        GHCR_PUB --> ARGO_SYNC["ArgoCD detecta cambios en gitops/"]
        ARGO_SYNC --> ARGO_PVE["🖥️ app-proxmox.yaml (On-Premise)"]
        ARGO_SYNC --> ARGO_CLOUD["☁️ app-cloud.yaml (AWS EKS)"]
    end

    %% FASE 7: MANTENIMIENTO CONTINUO
    subgraph F7["🔄 FASE 7: Mantenimiento Continuo con Renovate"]
        ARGO_PVE & ARGO_CLOUD --> RENOVATE_SCAN["Renovate Bot Escaneo Multi-Manager"]
        RENOVATE_SCAN -->|Detecta Updates| RENO_PR["Renovate abre PR Agrupado con Auto-Merge"]
        RENO_PR --> RENO_SYNC["📌 dependabot-linear-sync.yml"]
        RENO_SYNC --> LIN_NEW["Linear crea nuevo ticket incremental (PER-X)"]
        LIN_NEW --> F1
    end

    classDef primary fill:#2563eb,stroke:#1d4ed8,color:#fff;
    classDef success fill:#16a34a,stroke:#15803d,color:#fff;
    classDef warning fill:#ea580c,stroke:#c2410c,color:#fff;
    classDef info fill:#0891b2,stroke:#0e7490,color:#fff;

    class F1 primary;
    class F2 info;
    class F3 warning;
    class F5 success;
```

---

## 2. Fases Detalladas del Ciclo

### Fase 1: Planificación y Gestión Ágil (Linear)
* Toda nueva funcionalidad, mejora o bug se origina en **Linear** dentro del equipo `PER`.
* Cada ticket recibe automáticamente un identificador incremental (`PER-1`, `PER-2`, ..., `PER-6`).
* Al copiar el nombre de la rama desde Linear (`Ctrl + Shift + .`), se asegura la convención estándar `rocapellino/PER-X-descripcion`.

### Fase 2: Desarrollo Local y Quality Gates (DX)
* El desarrollador crea la rama local y trabaja en el código de backend (`server.ts`, `src/`), frontend (`apps/web/`) o infraestructura (`infra/`, `gitops/`).
* Utiliza el task runner multiplataforma (`task dev`, `task ts:lint`, `task audit`) para verificar:
  * Verificación estricta de tipos con TypeScript (`tsc --noEmit`).
  * Compilación y empaquetado con esbuild (`npm run build`).
  * Ejecución de tests unitarios de seguridad y almacenamiento (`npm test`).
  * Detección de duplicación de código (`task audit`).
  * Auditoría de vulnerabilidades de dependencias (`npm audit`).
  * Validación y renderizado de Helm Chart (`task helm:lint`, `task helm:template`).
* Los **Hooks de Pre-commit** impiden commits locales si existen secretos o código no formateado.

### Fase 3: Integración Continua y Validación (GitHub Actions)
* Al hacer `git push` y abrir un Pull Request:
  * El bot de Linear detecta la referencia y transiciona el ticket a **In Progress** / **In Review**.
  * Se disparan los workflows optimizados por rutas (`paths`) y el pipeline central consolidado:
    * **`ci.yml`**: Calidad y complejidad, Semgrep SAST, Gitleaks, Checkov IaC y escaneo de vulnerabilidades Trivy sobre contenedor Docker Alpine endurecido.
    * **`api.yml`**: Tipado estricto, compilación esbuild y suite de tests unitarios Node.js.
    * **`web.yml`**: Validación de interfaz frontend y configuración de Nginx.
    * **`infra.yml`**: Lint y renderizado de Helm Charts (`values.yaml` y `values.prod.yaml`) y validación HCL de OpenTofu/Terraform.
    * **`security-gitleaks.yml`**: Detección estricta de secretos y tokens expuestos.

### Fase 4: Revisión de Código y Quality Gate (GitHub Rulesets)
* Las **Rulesets de GitHub** (`main-protection`) bloquean el merge directo:
  * Requieren que los checks de CI obligatorios (`🔍 Auditoría de Calidad y Complejidad`, `🛡️ Gitleaks Secret Detection`) estén en verde (✅).
  * Exigen que todas las conversaciones de revisión de código estén resueltas.

### Fase 5: Merge y Versionado Semántico Automático
* Al fusionar el PR en `main`:
  * El issue en Linear pasa automáticamente a **Done** (Completado).
  * El workflow **`release-tag.yml`** analiza los commits convencionales mergeados (`feat:`, `fix:`, `chore(deps):`).
  * Calcula el incremento según **SemVer** (`vMAJOR.MINOR.PATCH`).
  * Genera el **Git Tag** anotado y publica un **GitHub Release** oficial con changelog automático.
  * El workflow **`ci.yml`** compila la imagen Docker de producción y realiza el push al registro OCI de GitHub Container Registry (`ghcr.io`).

### Fase 6: Despliegue Continuo GitOps (ArgoCD & Kubernetes)
* El despliegue se gestiona de forma declarativa e independiente de agentes CI mediante **ArgoCD**:
  * **On-Premise (Proxmox VE)**: Sincronizado mediante [`gitops/apps/app-proxmox.yaml`](file:///gitops/apps/app-proxmox.yaml) aplicando valores específicos de [`gitops/environments/proxmox/values.yaml`](file:///gitops/environments/proxmox/values.yaml).
  * **Cloud Pública (AWS EKS)**: Sincronizado mediante [`gitops/apps/app-cloud.yaml`](file:///gitops/apps/app-cloud.yaml) aplicando valores específicos de [`gitops/environments/cloud/values.yaml`](file:///gitops/environments/cloud/values.yaml).
  * La plataforma opera con **HPA v2** para escalado automático, **Sealed Secrets** para cifrado de credenciales y **NetworkPolicies** para segmentación estricta de base de datos PostgreSQL y Redis.

### Fase 7: Mantenimiento Continuo con Renovate Bot
* **Renovate Bot** (`renovate.json`) audita continuamente dependencias multi-gestor:
  * Node.js (`npm`), imágenes Docker (`dockerfile`), Helm charts (`helm-values`), GitHub Actions y módulos de OpenTofu/Terraform.
  * Agrupa las actualizaciones en PRs no disruptivos y aplica **automerge** automático para parches seguros que superen todos los Quality Gates de CI.
  * El workflow **`dependabot-linear-sync.yml`** sincroniza los PRs de bots de dependencias con Linear creando el ticket correlativo correspondiente.
