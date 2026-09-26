# Matriz de Responsabilidades y Demarcación Arquitectónica (Responsibility Matrix)

Este documento establece la **Matriz Canónica de Responsabilidades** para todos los componentes de infraestructura, orquestación, seguridad, despliegue y calidad del proyecto Pokédex.

Su propósito es responder de forma definitiva e inequívoca a la pregunta:
> **"¿Para qué existe este componente y qué sucedería si se elimina?"**

---

## 1. Matriz de Responsabilidades de Componentes de Plataforma

| Componente | Responsabilidad Primaria | Ambiente / Capa | ¿Obligatorio? | Justificación Arquitectónica / Consecuencia de su Eliminación |
| --- | --- | --- | --- | --- |
| **OpenTofu** | Aprovisionamiento declarativo de infraestructura base (VMs, LXCs, CPU, RAM, NVMe/ZFS, bridges y firewall perimetral). | On-prem (Proxmox) & Cloud-ready (AWS) | **Sí** | Si se elimina, la infraestructura se convierte en configuraciones manuales irreproducibles (*snowflakes*), impidiendo la reconstrucción automatizada en Disaster Recovery. |
| **Ansible** | Configuración de SO invitado, hardening de kernel/SSH, UFW, runtime K3s, HashiCorp Vault y aprovisionamiento de herramientas en Bastion. | On-prem (Proxmox OS layer) | **Sí** | Si se elimina, no existe automatización para el bootstrap de paquetes, hardening del sistema operativo ni inicialización de Vault. |
| **Bastion Host (LXC 820)** | Punto único de entrada administrativa (Management Plane), sesión interactiva restringida, auditoría local con reenvío remoto a syslog/Loki para no-repudio y ejecución de *Break-Glass*. | On-prem (10.10.13.120) | **Sí** | Si se elimina, los operadores accederían directamente a los nodos de cómputo y clúster K8s sin registro ni forwarding de auditoría (`/var/log/bastion/audit.log`), violando Zero-Trust. |
| **HashiCorp Vault CE (LXC 810)** | Secret Manager on-premise en caliente con almacenamiento transaccional Raft, esquema Shamir 5/3, TLS y particionamiento lógico multi-ambiente. | On-prem (10.10.13.110) | **Sí** | Si se elimina, los secretos deberían guardarse en texto plano en disco o en Git, violando las políticas de Zero-Disk y el principio de no-persistencia de credenciales. |
| **External Secrets Operator (ESO)** | Sincronización periódica y desacoplada de secretos desde Vault hacia objetos `v1/Secret` nativos de Kubernetes. | K8s Runtime (Pre-prod y Prod) | **Sí** | Si se elimina, los pods de Kubernetes no podrían consumir credenciales de forma nativa mediante `envFrom`, o requerirían sidecars pesados de Vault. |
| **ArgoCD** | Controlador GitOps para sincronización continua y reconciliación de estado deseado en Kubernetes sin intervención humana. | K8s Management Plane | **Sí** | Si se elimina, se pierde el principio Zero-Drift y los despliegues dependerían de comandos manuales o runners con permisos excesivos en el clúster. |
| **Helm** | Empaquetado canónico, templating universal y parametrización de la aplicación Pokédex. | Todos (Empaquetado Universal) | **Sí** | Si se elimina, se duplicarían decenas de manifiestos YAML estáticos para cada entorno, incrementando drásticamente el drift. |
| **GitHub Actions** | Orquestación de integración continua (CI), Quality Gates paralelos, compilación de binarios/contenedores, firma criptográfica Cosign y publicación OCI. | SaaS / Nube | **Sí** | Si se elimina, no habría pipeline de testing automatizado, escaneo de seguridad ni publicación de artefactos inmutables. |
| **Grafana Alloy** | Agente unificado y ligero de observabilidad (recolector de métricas de pods, scraping de Prometheus, logs de containerd y trazas OTLP) hacia Grafana Cloud. | K8s Runtime & Nodos | **Sí** | Si se elimina, la plataforma queda a ciegas operativamente, sin capacidad de diagnóstico de latencias, errores o alertas de saturación. |
| **Redis 7** | Caché en memoria de baja latencia (< 3ms) para respuestas de PokéAPI, almacenamiento de sesiones de autenticación y rate limiting atómico en Lua. | K8s Runtime (Pre-prod y Prod) | **Sí** | Si se elimina, la base de datos PostgreSQL se saturaría con consultas repetitivas y las llamadas externas a PokéAPI agotarían los límites de tasa. |
| **PostgreSQL 16** | Base de datos relacional primaria con almacenamiento JSONB estructurado y persistencia de catálogos y usuarios. | K8s Runtime (Pre-prod y Prod) | **Sí** | Si se elimina, se pierde el estado persistente y transaccional de la aplicación Pokédex. |
| **Cilium (eBPF)** | Seguridad de red avanzada L7, políticas de salida estrictas (egress toFQDNs) y mitigación Anti-SSRF. | K8s Red & Seguridad | **Condicional** | En perfil Proxmox Lean puede utilizarse Flannel + K8s NetworkPolicies estándar si se requiere menor consumo de RAM (< 150MB). |
| **PgBouncer** | Multiplexor y pool de conexiones para PostgreSQL. | K8s Runtime | **Condicional** | Solo necesario en Producción cuando la concurrencia supera los 50 pods o conexiones concurrentes para evitar agotar sockets en PostgreSQL. |
| **Stakater Reloader** | Reinicio automático de deployments ante cambios en `v1/Secret` o `v1/ConfigMap`. | K8s Controllers | **Condicional** | **Desactivado en Proxmox** (ADR-024) para ahorrar RAM y overhead de RBAC; reservado para el perfil AWS Cloud-Ready con HPA elástico. |

---

## 2. Demarcación de Herramientas DevSecOps: ¿Qué aporta cada una?

Para erradicar la percepción de redundancia entre analizadores de código y escáneres de seguridad, cada herramienta tiene una frontera técnica delimitada:

```text
                  Pirámide de Calidad y Seguridad DevSecOps
                ┌──────────────────────────────────────────┐
                │          Trivy (SCA & OCI CVEs)          │  Capas de Contenedor & Libs
                ├──────────────────────────────────────────┤
                │         Checkov (IaC Posture)            │  OpenTofu, K8s, Helm, Docker
                ├──────────────────────────────────────────┤
                │      SonarQube (Coverage & Debt Gate)    │  Deuda Técnica, Duplicación
                ├──────────────────────────────────────────┤
                │        Semgrep (AST Semantic SAST)       │  Vulnerabilidades Lógicas/OWASP
                ├──────────────────────────────────────────┤
                │     MegaLinter (Polyglot Format/Lint)    │  YAML, Markdown, Shell, Actions
                ├──────────────────────────────────────────┤
                │        ESLint (TS/JS Syntax & Types)     │  Reglas de Código Node.js/Vite
                └──────────────────────────────────────────┘
```

| Herramienta | Capa de Inspección | Objetivo Específico | ¿Por qué NO la reemplaza otra herramienta? |
| --- | --- | --- | --- |
| **ESLint** | Código Fuente TypeScript / JavaScript | Detecta errores de sintaxis, violaciones de tipos de TypeScript y anti-patrones en tiempo de edición (IDE) y CI rápido (< 15s). | No analiza YAML, ni infraestructura, ni vulnerabilidades semánticas profundas. |
| **MegaLinter** | Archivos No-JS (YAML, Markdown, Dockerfile, GH Actions) | Orquestador unificado de linters para mantener coherencia estilística en documentación, pipelines de CI y manifiestos de K8s. | ESLint no tiene capacidad de parsear YAML, Markdown ni scripts Shell. |
| **Semgrep** | Abstract Syntax Tree (AST) de la aplicación | SAST semántico basado en reglas personalizadas para detectar inyecciones SQL/NoSQL, evasión de autenticación, SSRF y bugs de seguridad específicos. | A diferencia de Sonar o ESLint, permite escribir reglas de seguridad sintácticas de orden superior orientadas al modelo de amenazas del proyecto. |
| **SonarQube / SonarCloud** | Métricas Globales de Calidad y Deuda Técnica | Quality Gate centralizado de cobertura de tests (LCOV), duplicación de líneas de código, complejidad ciclomática y mantenibilidad a largo plazo. | Semgrep y ESLint no calculan cobertura de pruebas ni rastrean deuda técnica agregada en el tiempo. |
| **Checkov** | Manifiestos de Infraestructura como Código (IaC) | Analiza configuraciones de OpenTofu/Terraform, Helm charts, manifiestos de Kubernetes y Dockerfiles buscando configuraciones inseguras (ej. pods sin `securityContext`, puertos privilegiados). | Los linters de código (ESLint/Semgrep) no comprenden la semántica de recursos de nube ni políticas CIS Benchmark para K8s/IaC. |
| **Trivy** | Vulnerabilidades conocidas (CVEs) en dependencias e imágenes | Escaneo de Software Composition Analysis (SCA) en `package-lock.json`, vulnerabilidades de paquetes de sistema operativo en imágenes OCI (Alpine/Debian) y generación de SBOM CycloneDX. | Ninguna de las otras herramientas inspecciona el archivo de bloqueo de paquetes contra bases de datos de vulnerabilidades CVE/NVD ni analiza capas binarias de imágenes Docker. |

---

## 3. Demarcación de Plataformas: Proxmox On-Premise vs AWS Cloud-Ready

Para evitar duplicidad de configuración, se aplica el patrón **Canónico Compartido con Overlays Mínimos**:

```text
                                  infra/helm/pokedex/
                             (Helm Chart Base Universal)
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
       gitops/environments/proxmox/                   gitops/environments/aws/
       (Overlay On-Premise Operativo)                 (Overlay Cloud-Ready Skeleton)
       • Storage: Local-Path PV                       • Storage: AWS EBS gp3 CSI
       • Ingress: Traefik / MetalLB                   • Ingress: AWS Load Balancer Controller
       • Secrets: Vault CE LXC + ESO                  • Secrets: AWS Secrets Manager / IRSA
       • Reloader: false (Perfil Lean)                • Reloader: true (Auto-redeploy elástico)
       • Recursos: CPU/RAM fijos                      • Recursos: HPA v2 con escalado elástico
```

- **Regla de Cero Duplicación:** Los templates de Kubernetes (Deployments, Services, ConfigMaps, NetworkPolicies, ServiceAccounts) residen **únicamente** en `infra/helm/pokedex/`. Ningún archivo YAML de recurso se duplica entre ambientes.

---

## 4. Gobernanza y Catálogo de Scripts (`scripts/`)

En cumplimiento estricto del [ADR-020](../decisions/ADR-020-unified-deployment-governance-and-script-retirement.md), se erradicaron los scripts shell dispersos e históricos. Todos los scripts operativos son programas TypeScript modernos ejecutados mediante `node --experimental-strip-types`:

| Script | Lenguaje | Propósito Operativo | ¿Activo en CI/CD o Runbooks? |
| :--- | :--- | :--- | :--- |
| `scripts/k8s-rollout-restart.ts` | TypeScript | Reinicio progresivo de pods y validación contractual de la arquitectura de secretos Proxmox. | **Sí** (`npm run k8s:rollout-restart`, `npm run k8s:verify-vault-architecture`). |
| `scripts/probe-egress-security.ts` | TypeScript | Sonda de validación de seguridad de red L7 eBPF Anti-SSRF hacia APIs externas. | **Sí** (`npm run probe:security:egress`, Job K8s). |
| `scripts/verify-image-digest-parity.ts` | TypeScript | Validación de inmutabilidad y paridad de digest SHA-256 de imágenes OCI entre GitOps y GHCR. | **Sí** (`npm run gitops:verify-parity`). |
| `scripts/verify-secret-rotation.ts` | TypeScript | Verificación de rotación y frescura de credenciales en Vault y K8s. | **Sí** (`npm run secrets:audit-rotation`). |
| `scripts/update-gitops-pin.ts` | TypeScript | Auditoría y actualización del targetRevision de ArgoCD en manifiestos de GitOps. | **Sí** (`npm run gitops:pin`, `npm run gitops:pin:check`). |
| `scripts/ghcr-retention.ts` | TypeScript | Poda y gestión de retención de paquetes OCI en GitHub Container Registry. | **Sí** (`npm run ghcr:retention`, workflow programado). |
| `scripts/dr-drill.ts` | TypeScript | Simulación E2E de Disaster Recovery con volcado PostgreSQL, cifrado AES-256 y restore drill. | **Sí** (`npm run dr:drill:e2e`, workflow DR). |
| `scripts/dev-backup-gdrive.ts` | TypeScript | Respaldo local de PostgreSQL y sincronización a Google Drive en Docker Compose (Alternativa A). | **Sí** (`task dr:gdrive:backup:dev`). |
| `scripts/lint-markdown.ts` | TypeScript | Quality Gate de linting y formateo para archivos Markdown del monorepo. | **Sí** (`npm run lint:md`, `npm run lint:md:fix`). |
| `scripts/github-security-linear-sync.ts` | TypeScript | Sincronización automática de alertas de seguridad de GitHub Dependabot/CodeQL hacia Linear. | **Sí** (Workflow programado de GitHub Actions). |
| `scripts/sonar-linear-sync.ts` | TypeScript | Sincronización de issues de calidad y deuda técnica de SonarCloud hacia Linear. | **Sí** (Workflow de CI SonarQube). |
| `scripts/dr_verify_restore.sh` | Bash | Script canónico de simulación de Disaster Recovery y restauración de snapshots en entornos aislados. | **Sí** (Único script shell explícitamente autorizado en whitelist por gobernanza). |

---

## 5. Racionalización de Taskfile (`Taskfile.yml`)

El Taskfile centraliza la experiencia de desarrollo (DX). Para evitar comandos muertos, las tareas se clasifican en dos niveles:

1. **Tareas de Uso Diario (Frecuentes):**
   - `task dev`: Inicia el entorno full-stack local.
   - `task test`: Ejecuta tests unitarios y validación de tipos.
   - `task lint`: Linting general del monorepo.
   - `task validate`: Batería completa obligatoria pre-PR (lint, typecheck, build, test, fuzzing).
2. **Tareas de Infraestructura y Despliegue (Operacionales):**
   - `task k8s:rollout-restart`: Reinicio progresivo canónico tras rotación en Vault.
   - `task k8s:verify-vault-architecture`: Simulación contractual de secretos en CI.
   - `task gitops:verify-parity`: Chequeo de digest inmutable en manifiestos GitOps.
   - `task secrets:audit-rotation`: Auditoría de frescura de credenciales.
