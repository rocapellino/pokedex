---
name: repo-security
description: Evaluación DevSecOps profunda y repetible.
---

# repo-security

## Objetivo

Ejecutar auditorías y evaluaciones de seguridad DevSecOps profundas, repetibles y rigurosas sobre todas las capas de `rocapellino/pokedex`: código de aplicación, dependencias, pipelines de CI/CD, infraestructura de contenedores, políticas de clúster Kubernetes y supply chain.

## Alcance y Verificaciones de Dominio

- **Gestión de Secretos y Rotación:**
  - Búsqueda de secretos, tokens o credenciales expuestas en código, historial git o artefactos de build.
  - Verificación del contrato de External Secrets Operator (ESO) con HashiCorp Vault CE (`pokedex/prod` y `pokedex/preprod`).
  - Cumplimiento de la auditoría de rotación dual ([ADR-022](../../docs/decisions/ADR-022-secret-rotation-and-rollout-restart.md)).
- **Seguridad de Aplicación y API:**
  - Validación de esquemas Zod en todas las entradas de datos externos.
  - Aislamiento Egress y protección anti-SSRF mediante Cilium L7 NetworkPolicies.
  - Cabeceras de seguridad HTTP (CSP, Permissions-Policy, X-Content-Type-Options, Referrer-Policy).
  - Rate limiting distribuido respaldado en Redis.
- **Seguridad en Contenedores y Kubernetes:**
  - Dockerfiles multi-stage basados en imágenes mínimas (Alpine/distroless), sin usuarios root (`USER 10001:10001`).
  - Pod Security Standards (`baseline` / `restricted`), `readOnlyRootFilesystem: true`, y supresión de `ALL` capabilities.
  - Restricciones de admisión mediante políticas Kyverno.
- **Supply Chain Security:**
  - Pinning estricto de imágenes mediante digest SHA256 inmutable en Helm y GitOps.
  - Verificación de firma criptográfica con Cosign y atestaciones SLSA Provenance.
  - Generación obligatoria de SBOM en formato CycloneDX.
- **Hardening de CI/CD:**
  - Permisos de menor privilegio (`permissions:`) explícitos por job en GitHub Actions.
  - Pinning de acciones de terceros por SHA de commit.
  - Protección de contextos de build mediante `.dockerignore` y `.gitignore`.

## Comandos

- `/repo-security`: Evaluación integral de seguridad DevSecOps de extremo a extremo.
- `/repo-security app`: Auditoría de código backend, middlewares de seguridad, Zod y saneamiento.
- `/repo-security supply-chain`: Verificación de SBOM, firmas Cosign, OCI digests y procedencia.
- `/repo-security ci`: Auditoría de permisos de runners, secretos y workflows de GitHub Actions.
- `/repo-security k8s`: Evaluación de NetworkPolicies, Pod Security, Kyverno y secretos de K8s.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Toda remediación de vulnerabilidad debe planificarse con [change-plan.md](../_shared/change-plan.md) y evaluarse con `repo-impact`.
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de seguridad, planes) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
