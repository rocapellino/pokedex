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
        PUSH --> CI_API["🐍 api.yml (Pytest + Cov + Bandit)"]
        PUSH --> CI_WEB["🌐 web.yml (JS Lint + Nginx Test)"]
        PUSH --> CI_INFRA["⚙️ infra.yml (K8s Kustomize + Terraform)"]
        PUSH --> CI_SEC["🔐 security-gitleaks.yml + 🛡️ security-trivy.yml"]
    end

    %% FASE 4: CODE REVIEW & RULES
    subgraph F4["🛡️ FASE 4: Quality Gate & Review"]
        CI_API & CI_WEB & CI_INFRA & CI_SEC --> GATE{¿Todos los Checks en Verde?}
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
    end

    %% FASE 6: DESPLIEGUE
    subgraph F6["☸️ FASE 6: Despliegue & Orquestación"]
        TAG --> DOCKER_BUILD["Build Multi-Stage Docker Images"]
        DOCKER_BUILD --> K8S_DEPLOY["Despliegue K8s (HPA + Ingress + Sealed Secrets)"]
    end

    %% FASE 7: MANTENIMIENTO CONTINUO
    subgraph F7["🔄 FASE 7: Mantenimiento Continuo"]
        K8S_DEPLOY --> DEP_SCAN["Dependabot Scan Semanal"]
        DEP_SCAN -->|Detecta Update| DEP_PR["Dependabot abre PR Agrupado"]
        DEP_PR --> DEP_SYNC["📌 dependabot-linear-sync.yml"]
        DEP_SYNC --> LIN_NEW["Linear crea nuevo ticket incremental (PER-X)"]
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
* El desarrollador crea la rama local y trabaja en el código de backend (`server.ts`, `src/`), frontend (`apps/web/`) o infraestructura (`infra/`).
* Utiliza el task runner multiplataforma (`task dev`, `task lint`, `task audit`) para verificar:
  * Verificación estricta de tipos con TypeScript (`tsc --noEmit`).
  * Compilación y empaquetado con esbuild (`npm run build`).
  * Detección de duplicación y archivos idénticos (`task audit`).
  * Auditoría de seguridad de dependencias (`npm audit`).
  * Validación de Helm Chart y manifiestos de Kubernetes (`task helm:lint`).
  * Detección de duplicación y archivos idénticos (`scripts/audit_code_quality.py`).
* Los **Hooks de Pre-commit** impiden commits locales si existen secretos o código no formateado.

### Fase 3: Integración Continua y Validación (GitHub Actions)
* Al hacer `git push` y abrir un Pull Request:
  * El bot de Linear detecta la referencia y transiciona el ticket a **In Progress** / **In Review**.
  * Se disparan los workflows optimizados por rutas (`paths`):
    * **`api.yml`**: Pruebas de backend, cobertura y Bandit SAST.
    * **`web.yml`**: Validación de JavaScript y sintaxis de Nginx.
    * **`infra.yml`**: Validación de manifiestos de Kubernetes con Kustomize y HCL con Terraform.
    * **`security-gitleaks.yml`**: Escaneo preventivo de secretos.
    * **`security-trivy.yml`**: Escaneo de vulnerabilidades SCA y contenedor con Trivy.

### Fase 4: Revisión de Código y Quality Gate (GitHub Rulesets)
* Las **Rulesets de GitHub** (`main-protection`) bloquean el merge directo:
  * Requieren que los checks de CI obligatorios estén en verde (✅).
  * Exigen que todas las conversaciones de revisión de código (Copilot / Peer Review) estén resueltas.

### Fase 5: Merge y Versionado Semántico Automático
* Al fusionar el PR en `main`:
  * El issue en Linear pasa automáticamente a **Done** (Completado).
  * El workflow **`release-tag.yml`** analiza los commits convencionales mergeados (`feat:`, `fix:`, `chore(deps):`).
  * Calcula el incremento según **SemVer** (`vMAJOR.MINOR.PATCH`).
  * Genera el **Git Tag** anotado y publica un **GitHub Release** oficial con changelog automático.

### Fase 6: Despliegue y Orquestación (Docker & Kubernetes)
* La aplicación se empaqueta en imágenes multi-stage optimizadas y seguras (ejecutadas por usuario no-root `appuser`).
* Se despliega en Kubernetes con:
  * **HPA v2** para escalado automático basado en CPU/Memoria y tráfico.
  * **Sealed Secrets** para gestión asimétrica de credenciales sin texto plano en Git.
  * **NetworkPolicies** para segmentación estricta entre Frontend, Backend, Redis y PostgreSQL.

### Fase 7: Mantenimiento Continuo y Dependabot Sync
* **Dependabot** analiza semanalmente dependencias de Python (`pip`), imágenes Docker (`docker`) y workflows (`github-actions`).
* Agrupa las actualizaciones en **Grouped PRs** limpios.
* El workflow **`dependabot-linear-sync.yml`** detecta el PR del bot y crea automáticamente un **ticket correlativo en Linear** (`PER-X`) con el enlace directo al PR, cerrando el ciclo de retroalimentación ágil.
