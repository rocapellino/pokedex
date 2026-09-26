# 📊 Inventario Canónico del Monorepo Pokédex (Baseline 2026-09-25)

> **Fecha:** 2026-09-25
> **Estado:** BASELINE OFICIAL
> **Alcance:** Monorepo Pokédex (`rocapellino/pokedex`)
> **Versión GitOps Pin:** `v1.77.2` | **Último Git Tag:** `v1.78.1`

---

## 📑 Resumen General del Monorepo

| Dimensión Técnica | Valor Cuantitativo | Detalle / SSOT |
| :--- | :--- | :--- |
| **Arquitectura de Repositorio** | Monorepo NPM Workspaces | `apps/backend`, `apps/frontend` |
| **Versión de Node.js** | 22.13.0 LTS | Anclada en `.nvmrc` y `ci.yml` |
| **Package Manager** | `npm@11.17.0` | `package-lock.json` v3 determinista |
| **Suites de Pruebas Automatizadas** | 225 pruebas (100% pasando) | `npm test` con runner nativo de Node.js |
| **Herramientas de IaC** | OpenTofu 1.8.x + Ansible 2.16+ | Proxmox VE + AWS EKS Blueprint |
| **Packaging & Delivery** | Helm v3.17.0 + ArgoCD v2.12+ | Chart `pokedex` + Patrón App-of-Apps |
| **Aislamiento de Red** | Cilium eBPF L7 + K8s NetPol | Denegación por defecto, bloqueo anti-SSRF |
| **Gestión de Secretos** | Vault CE (LXC 810) + ESO | Raft Shamir 5/3, TLS 1.2+, roles segregados |
| **Pipelines CI/CD** | 15 Workflows de GitHub Actions | SHA Pinning 100%, Keyless Sigstore (Gitsign/Cosign) |
| **Skills de Agentes de IA** | 17 Skills operativas | `.agents/skills/` bajo gobernanza `AGENTS.md` |

---

## 1. Inventario de Aplicaciones y Código Fuente

### 1.1. Backend (`apps/backend`)

- **Framework & Runtime:** Express.js 4.21+ sobre Node.js 22 LTS con TypeScript 5.7+ / ES Modules (`"type": "module"`).
- **Compilador / Bundler:** `esbuild` para builds rápidos y bundle optimizado.
- **Persistencia & Caché:**
  - PostgreSQL con `pg.Pool` nativo (con pool sizing ajustado a 20 conexiones por réplica).
  - Redis 7.x para caché en memoria de alto rendimiento y rate limiting.
- **Inteligencia Artificial:** SDK oficial `@google/genai` con modelo Google Gemini 2.5 Flash para descripciones y análisis pokémon.
- **Observabilidad:** OpenTelemetry SDK nativo con exportador OTLP HTTP (:4318) para trazas distribuidas y correlación por `X-Request-Id`.
- **Hardening de Contenedor:** Distroless Node.js 22 non-root (`UID 65532`), filesystem de solo lectura y `/tmp` efímero montado en RAM.

### 1.2. Frontend (`apps/frontend`)

- **Arquitectura:** Single Page Application (SPA) en Vanilla TypeScript moderno y Vanilla CSS optimizado (cero frameworks pesados o dependencias innecesarias).
- **Herramienta de Construcción:** Vite 6.x.
- **Servidor Web:** `nginxinc/nginx-unprivileged:alpine-slim` ejecutando como usuario `nginx` (`UID 101`) en puerto 8080.
- **Configuración de Proxy:** Proxy inverso seguro con cabeceras estrictas (CSP, Permissions-Policy, HSTS simulado, compresión gzip/brotli).

---

## 2. Inventario de Infraestructura y GitOps

### 2.1. Manifiestos de Helm (`infra/helm/pokedex`)

El chart cuenta con 27 plantillas modulares que cubren:

- Cargas de trabajo: `api-deployment.yaml`, `web-deployment.yaml`, `postgres-statefulset.yaml`, `redis-deployment.yaml`, `pgbouncer-deployment.yaml` (opcional).
- Autoscaling & Resiliencia: `api-hpa.yaml`, `web-hpa.yaml`, `pdb.yaml`, `limitrange.yaml`, `resourcequota.yaml`.
- Networking & Ingress: `api-deployment.yaml` (Services), `web-service.yaml`, `postgres-service.yaml`, `ingress.yaml` (Traefik/ALB).
- Seguridad y Secretos: `secret.yaml`, `configmap.yaml`, `externalsecret.yaml`, `secretstore.yaml`.
- Políticas de Red: `network-policies.yaml` (L4 K8s estándar), `cilium-network-policies.yaml` (L7 FQDN eBPF).
- Tareas Batch y DR: `seed-job.yaml`, `backup-cronjob.yaml`, `backup-gdrive-cronjob.yaml`, `backup-restore-verify-cronjob.yaml`.
- Monitoreo: `servicemonitor.yaml` (Prometheus Operator).

### 2.2. Entornos de GitOps (`gitops/`)

- **`gitops/apps/`:**
  - `root-application.yaml`: Aplicación raíz (App-of-Apps) anclada en `targetRevision: v1.77.2`.
  - `app-proxmox.yaml`: Despliegue de producción on-premise en Proxmox VE con freeze de sincronización en fines de semana.
  - `app-proxmox-preprod.yaml`: Despliegue continuo en LXC 800 (pre-producción) sin freeze.
  - `app-cloud.yaml`: Despliegue de referencia para nube pública AWS EKS.
- **`gitops/environments/`:**
  - `proxmox/values.yaml`: Producción On-Premise con digest pinning, External Secrets conectado a Vault CE (`pokedex/prod`), Cilium L7 eBPF y persistencia Redis.
  - `proxmox-preprod/values.yaml`: Staging On-Premise con SecretStore dedicado (`pokedex/preprod`) y dimensionamiento lean.
  - `aws/values.yaml`: AWS EKS con ALB ingress, AWS Secrets Manager y Reloader activo.

---

## 3. Inventario de Automatización CI/CD

El directorio `.github/workflows/` aloja 15 pipelines automatizados:

1. `ci.yml`: Pipeline principal de Quality Gates, tests, build Docker, SCA y firma OCI con Cosign.
2. `infra.yml`: Validación estricta de Helm, renderizado multi-entorno, Kubeconform y Kube-Linter.
3. `release-tag.yml`: Versionado semántico, changelog y firma de Git tags con Gitsign (Sigstore).
4. `security-gitleaks.yml`: Escaneo continuo de secretos en commits de Git.
5. `security-code-scanning.yml`: Análisis estático avanzado con GitHub CodeQL.
6. `security-trivy.yml`: Escaneo de vulnerabilidades en imágenes OCI y filesystem.
7. `security-dast-zap.yml`: Pruebas de penetración dinámicas DAST con OWASP ZAP.
8. `dr-simulation.yml`: Simulación programada de restauración de desastres con `dr-drill.ts`.
9. `ghcr-retention.yml`: Poda automatizada de versiones antiguas en GHCR.
10. `mega-linter.yml`: Escaneo exhaustivo de linters multi-lenguaje.
11. `performance-k6.yml`: Pruebas de carga y rendimiento de API con Grafana k6.
12. `web.yml`: Validaciones específicas de compilación y bundling frontend.
13. `renovate-linear-sync.yml`: Sincronización de PRs de dependencias con Linear.
14. `sonar-linear-sync.yml`: Sincronización de issues de calidad SonarQube con Linear.
15. `github-security-linear-sync.yml`: Sincronización de alertas de seguridad GitHub con Linear.

---

## 4. Estado de Cobertura de Pruebas

- **Pruebas Unitarias y de Integración:** 225 tests ejecutados en `< 10s` mediante `tsx --test`.
- **E2E & Accesibilidad:** Playwright con Chromium para flujos funcionales completos y auditorías automatizadas WCAG 2.1 AA con `@axe-core/playwright`.
- **Pentesting Dinámico:** Fuzzing de endpoints y suites de pentest contra inyección SQL, XSS, SSRF y desbordamiento de enteros en Pokédex ID.
