# Runbook: Despliegue y Promoción de Versiones

## 1. Propósito
Establecer el procedimiento estándar para la entrega continua y promoción de versiones de la plataforma Pokédex desde el código fuente hasta los entornos de producción en Kubernetes.

## 2. Flujo de Promoción
```
Push/Merge a main
       │
       ▼
CI Pipeline (.github/workflows/ci.yml)
  ├── Tests unitarios, integración y fuzzing
  ├── Análisis SAST (Semgrep, CodeQL) y Secretos (Gitleaks)
  ├── Auditoría de dependencias y Checkov IaC
  ├── Build Docker multi-stage
  ├── Generación de SBOM CycloneDX
  ├── Firma criptográfica Cosign y SLSA Provenance
  └── Push a GitHub Packages (ghcr.io)
       │
       ▼
Sincronización GitOps (ArgoCD)
  ├── Detección de nueva versión/digest
  ├── Verificación de políticas Kyverno en admisión
  └── Despliegue RollingUpdate con zero-downtime
```

## 3. Procedimiento Operativo

### Verificación previa
Antes de fusionar un cambio a `main`:
```bash
task validate
```

### Sincronización Manual de ArgoCD (si la auto-sincronización está pausada)
```bash
task gitops:sync:cloud     # Para AWS EKS
task gitops:sync:proxmox   # Para Proxmox VE
```

### Comprobación posterior
```bash
task k8s:status
curl -f http://<INGRESS_IP>/readyz
curl -f http://<INGRESS_IP>/version
```
