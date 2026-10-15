---
name: k8s-gitops-validator
description: "Validación y hardening de manifiestos Kubernetes, Helm charts y árboles de ArgoCD. Ejecuta comprobaciones con Kubeconform, Kube-Linter, Checkov IaC, políticas Kyverno y directrices de red Zero-Trust."
---

# k8s-gitops-validator

## Objetivo

Garantizar la seguridad, conformidad de esquemas y postura DevSecOps de todos los artefactos de infraestructura como código (Helm, Kubernetes y GitOps con ArgoCD) antes de su integración a ramas principales.

## Alcance y Reglas de Infraestructura

1. **Jerarquía y Delimitación de Entornos (ADR-030):**
   - **Local Dev:** Docker Compose o Kind (`infra/k8s/kind-cluster.yaml`).
   - **Pre-Prod On-Premise:** Target `ACTIVE` desplegado en Proxmox VE (LXC 800) mediante `infra/helm/pokedex/` y sincronizado por `gitops/apps/app-proxmox-preprod.yaml`.
   - **Prod Cloud Blueprint:** Declarado e inactivo en `gitops/apps/app-cloud.yaml` y `gitops/environments/cloud/`.
2. **Validación de Esquemas OpenAPI (Kubeconform):**
   - Todo manifiesto renderizado debe validar contra la versión de Kubernetes objetivo (`1.30.0+`) sin esquemas omitidos de forma no justificada.
3. **Buenas Prácticas y Políticas de Seguridad (Kube-Linter & Checkov):**
   - Cumplir con la configuración canónica en `.kube-linter.yaml` y `.checkov.yaml`.
   - Pods no privilegiados, `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, límites de recursos (`resources.limits` y `resources.requests`) y prohibición terminante de imágenes `:latest` en producción.
4. **Admisión con Kyverno (ADR-017):**
   - Ejecutar la suite de pruebas de políticas de admisión con `kyverno test infra/k8s/kyverno-test/`.
5. **Aislamiento de Red Zero-Trust (ADR-013):**
   - Denegación por defecto en ingress/egress mediante `NetworkPolicy` y `CiliumNetworkPolicy`.
   - Bloqueo estricto de Egress hacia Cloud Metadata IMDS (`169.254.169.254/32`) para prevenir ataques SSRF.

## Comandos de Verificación

```bash
# 1. Renderizar y validar contratos Helm
docker run --rm -v "${PWD}:/apps" alpine/helm:3.22.0 lint /apps/infra/helm/pokedex

# 2. Ejecutar validación de manifiestos y buenas prácticas
npm run test:gitops

# 3. Validar contratos de admisión y seguridad K8s
npm run test:security
```
