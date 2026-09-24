---
name: repo-architecture
description: Analizar arquitectura de aplicación, plataforma e infraestructura y mantenerla coherente.
---

# repo-architecture

## Objetivo

Analizar integralmente la arquitectura de la aplicación, plataforma e infraestructura de `rocapellino/pokedex`, asegurando coherencia técnica entre el código, los manifiestos declarativos y las decisiones arquitectónicas registradas (ADRs).

## Alcance y Verificaciones de Dominio

- **Flujo de Aplicación:** Mapeo frontend (Vanilla TS/Vite) -> Nginx Alpine -> API Express -> PostgreSQL / Redis / Gemini AI.
- **Límites de Monorepo:** Aislamiento de dependencias entre `apps/backend` y `apps/frontend`, tipado compartido y contratos de DTOs.
- **Arquitectura de Cómputo & Plataforma:**
  - Paridad y delimitación: Docker Compose (`dev`) vs. K3s On-Prem (Pre-prod LXC 800 / Prod VM 801) vs. AWS EKS (`cloud-ready`).
  - OpenTofu e infraestructura base vs. Ansible vs. manifiestos Kubernetes nativos.
- **GitOps & Inmutabilidad:**
  - Árbol de aplicaciones ArgoCD (`root-application.yaml`, `app-proxmox.yaml`, `app-proxmox-preprod.yaml`, `app-cloud.yaml`).
  - Promoción de artefactos mediante OCI digest pinning inmutable (`sha256`).
- **Aislamiento de Red:** Políticas Ingress (Traefik), Cilium L7 NetworkPolicies, bloqueo Egress anti-SSRF y service boundaries.
- **Auditoría de ADRs:** Identificar divergencias o contradicciones entre decisiones formales en `docs/decisions/` y la implementación activa en código.
- **Evolución Arquitectónica:** Proponer target architecture únicamente cuando resuelva un cuello de botella o riesgo concreto documentado.

## Comandos

- `/repo-architecture`: Análisis arquitectónico integral de extremo a extremo.
- `/repo-architecture app`: Análisis específico de capas de backend, frontend y persistencia.
- `/repo-architecture platform`: Análisis de K8s, K3s, Ingress, NetworkPolicies y computación.
- `/repo-architecture gitops`: Validación del árbol de reconciliación ArgoCD, valores Helm y digests OCI.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si se solicitan modificaciones arquitectónicas, modelar el cambio con [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-impact`.
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (ADRs, reportes de arquitectura) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
