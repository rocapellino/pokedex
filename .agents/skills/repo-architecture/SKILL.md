---
name: repo-architecture
description: Analizar la coherencia entre código, manifiestos y ADRs por entorno, incluido el trazado de rutas cliente → ingress → proxy → handler. Usar al cambiar Helm, GitOps, ingress, nginx o NetworkPolicies, o cuando se sospeche ADR Drift.
---

# repo-architecture

## Objetivo

Analizar integralmente la arquitectura de la aplicación, plataforma e infraestructura de `rocapellino/pokedex`, asegurando coherencia técnica entre el código, los manifiestos declarativos y las decisiones arquitectónicas registradas (ADRs).

## Alcance y Verificaciones de Dominio

- **Flujo de Aplicación:** Mapeo frontend (Vanilla TS/Vite) -> Nginx Alpine -> API Express -> PostgreSQL / Redis / Gemini AI.
- **Límites de Monorepo:** Aislamiento de dependencias entre `apps/backend` y `apps/frontend`, tipado compartido y contratos de DTOs.
- **Arquitectura de Cómputo & Plataforma:**
  - Paridad y delimitación: Docker Compose (`dev`) vs. K3s On-Prem (Pre-prod LXC 800 / Prod VM 801) vs. prod cloud agnóstico (blueprint inactivo, ADR-030).
  - OpenTofu e infraestructura base vs. Ansible vs. manifiestos Kubernetes nativos.
- **GitOps & Inmutabilidad:**
  - Árbol de aplicaciones ArgoCD: targets operativos `ACTIVE` (`root-application.yaml`, `app-proxmox.yaml`, `app-proxmox-preprod.yaml`) vs. blueprint inactivo de prod cloud (`app-cloud.yaml`, `gitops/environments/cloud/`).
  - Promoción de artefactos mediante OCI digest pinning inmutable (`sha256`) y paridad estricta 1:1 en `targetRevision` por tag.
  - Modelo de release desacoplado: `root-application.yaml` anclado a tag de release inmutable.
- **Aislamiento de Red:** Políticas Ingress (Traefik), Cilium L7 NetworkPolicies, bloqueo Egress anti-SSRF y service boundaries.
- **Trazado de Rutas por Entorno (`route-trace`):** Para cada entorno activo (compose, `proxmox-preprod`, `proxmox`) seguir cada ruta que invoca el cliente hasta su handler, verificando en cada salto la **configuración efectiva** ([methodology.md](../_shared/methodology.md) §1):
  1. **Inventario de rutas del cliente:** `fetch(...)` en `apps/frontend/src/` y formularios.
  2. **Borde del entorno:** `ingress.className` y `hosts[].paths` del values del entorno; anotaciones que ese controlador realmente interpreta; `tls` y entrypoints.
  3. **Proxy web:** `location`, `rewrite` y `proxy_pass` en `apps/frontend/nginx.conf.template`, incluida la herencia de `add_header`.
  4. **Handler:** la ruta resultante tras reescrituras debe existir en `apps/backend/src/routes/`.
  5. **Cabeceras y cookies:** CSP, HSTS, COOP/COEP y atributos de cookie (`Secure`, `SameSite`) compatibles con el esquema (HTTP/HTTPS) del entorno.

  Salida: tabla `ruta × entorno → handler | ROTA | NO_EFECTIVA`. Una ruta usada por el cliente que no alcanza su handler en un entorno activo es **P1**.
- **Auditoría de ADRs:** Identificar divergencias o contradicciones entre decisiones formales en `docs/decisions/` y la implementación activa en código.
- **Evolución Arquitectónica:** Proponer target architecture únicamente cuando resuelva un cuello de botella o riesgo concreto documentado.

## Comandos

- `/repo-architecture`: Análisis arquitectónico integral de extremo a extremo.
- `/repo-architecture app`: Análisis específico de capas de backend, frontend y persistencia.
- `/repo-architecture platform`: Análisis de K8s, K3s, Ingress, NetworkPolicies y computación.
- `/repo-architecture route-trace`: Trazado de rutas cliente → borde → proxy → handler por entorno activo.
- `/repo-architecture gitops`: Validación del árbol de reconciliación ArgoCD, valores Helm y digests OCI.

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Si se solicitan modificaciones arquitectónicas, modelar el cambio con [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-impact`.
