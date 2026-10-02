# ☸️ Controles de Plataforma Kubernetes (`infra/k8s/`)

Este directorio contiene las definiciones declarativas de plataforma, políticas de admisión y seguridad, configuración de clúster de pruebas y recursos transversales para el ecosistema **Pokédex** en Kubernetes.

---

## 🏛️ Taxonomía de Componentes

| Componente | Rol y Taxonomía | Propósito y Alcance |
| :--- | :--- | :--- |
| **`eso/`** | 🟢 **ACTIVE** | External Secrets Operator y `ClusterSecretStore` canónico consolidado ([`eso/README.md`](eso/README.md)). |
| **`namespace-pod-security.yaml`** | 🟢 **ACTIVE** | Admisión de Pod Security Standards (PSS `baseline` enforce / `restricted` audit y warn). |
| **`policies/`** | 🟢 **ACTIVE** | Políticas de admisión de seguridad Kyverno (`disallow-latest-tag`, `pod-security-standards`, `require-seccomp-profile`, `verify-image-signature`). |
| **`kyverno-cosign-policy.yaml`** | 🟢 **ACTIVE** | Verificación criptográfica de firma de imágenes OCI con Cosign / Sigstore. |
| **`kind-cluster.yaml`** | 🔵 **SUPPORTED** | Configuración de clúster multi-nodo KinD (1 control plane, 2 workers) con `extraPortMappings` para CI y desarrollo local. |
| **`kyverno-test/`** | 🔵 **SUPPORTED** | Suite declarativa de pruebas y fixtures para validación de políticas con el CLI de Kyverno (`kyverno test`). |
| **`jobs/egress-anti-ssrf-probe-job.yaml`** | 🔵 **SUPPORTED** | Job de verificación activa de políticas de egreso Zero-Trust y mitigación SSRF gobernadas por Cilium L7. |

---

## 📁 Estructura del Directorio

```text
infra/k8s/
├── README.md                          # Este documento de arquitectura y controles de plataforma
├── kind-cluster.yaml                  # [SUPPORTED] Clúster KinD de 3 nodos para CI y desarrollo local
├── namespace-pod-security.yaml        # [ACTIVE] Configuración PSS de namespaces pokemon-app / pokemon-preprod
├── kyverno-cosign-policy.yaml         # [ACTIVE] ClusterPolicy de verificación de firmas Cosign
├── eso/                               # [ACTIVE] External Secrets Operator (ClusterSecretStore unificado)
│   ├── README.md                      # Documentación y taxonomía de secrets management
│   ├── cluster-secret-store.yaml      # SSOT canónica de ClusterSecretStores (Vault y AWS)
│   ├── external-secret-pokedex.yaml   # ExternalSecret estático de referencia técnica
│   └── backup-offsite-externalsecret.yaml.template # Plantilla para credenciales de backup off-site
├── jobs/                              # [SUPPORTED] Jobs de prueba y diagnóstico de seguridad
│   └── egress-anti-ssrf-probe-job.yaml # Sonda de validación anti-SSRF y aislamiento de egreso Cilium
├── policies/                          # [ACTIVE] Políticas de admisión declarativas de Kyverno
│   ├── disallow-latest-tag.yaml       # Prohibición estricta de tags :latest y sin versión
│   ├── pod-security-standards.yaml    # Requisitos de no-root, read-only FS y límites de capabilities
│   ├── require-seccomp-profile.yaml   # Enforcement de perfiles RuntimeDefault de seccomp
│   └── verify-image-signature.yaml    # Validación de atestaciones y firmas de artefactos OCI
└── kyverno-test/                      # [SUPPORTED] Casos de prueba declarativos para Kyverno CLI
    └── kyverno-test.yaml              # Matriz de evaluación de políticas vs recursos de prueba
```

---

## 🛡️ Controles de Seguridad de Plataforma

### 1. Pod Security Standards (PSS)

Kubernetes aplica Pod Security Admission de forma nativa a nivel de namespace:

- **Enforce (`baseline`):** Previene elevaciones de privilegios graves conocidas sin bloquear despliegues estándar.
- **Audit & Warn (`restricted`):** Registra y emite advertencias ante cualquier desviación del perfil restrictivo para asegurar convergencia continua hacia mínimos privilegios.

### 2. Políticas de Admisión con Kyverno (`policies/`)

Kyverno actúa como motor de políticas declarativas en tiempo de admisión:

- **Inmutabilidad de Tags:** Todo contenedor debe especificar un tag semántico fijo o digest criptográfico (`sha256:...`). Se rechaza `latest`.
- **Hardening de Contenedores:** `readOnlyRootFilesystem: true`, `runAsNonRoot: true`, `allowPrivilegeEscalation: false` y eliminación de capabilities innecesarias.
- **Validación de Firmas:** Las imágenes provenientes de `ghcr.io/rocapellino/pokedex-*` deben poseer firma válida comprobada con la clave pública de Cosign.

### 3. Validación de Políticas en CI

Las políticas se prueban de manera determinista sin necesidad de levantar un clúster completo:

```bash
# Ejecutar validación declarativa de políticas con Kyverno CLI
kyverno test infra/k8s/kyverno-test/
```
