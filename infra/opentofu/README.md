# 🌍 Infraestructura como Código (IaC) Multi-Backend con OpenTofu

Este directorio contiene las definiciones declarativas de **OpenTofu** (alternativa libre y abierta a Terraform) para el aprovisionamiento de infraestructura subyacente para los entornos de **Pokédex**.

---

## 🏛️ Filosofía de Arquitectura: Core Portable & Backends Desacoplados

La aplicación Pokédex está empaquetada como un **Helm Chart agnóstico y portable** (`infra/helm/pokedex`). La capa de OpenTofu se encarga exclusivamente de aprovisionar los recursos de computo, red y almacenamiento necesarios para que el clúster Kubernetes opere:

```text
                     POKÉDEX PLATFORM
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
      On-Premise Backend           Cloud Backend
       (Proxmox VE / KVM)            (AWS EKS)
               │                         │
     [ environments/proxmox ]     [ environments/aws ]
               │                         │
               ▼                         ▼
         Kubernetes                 Kubernetes
         (Conformant)               (Conformant)
               │                         │
               └────────────┬────────────┘
                            │
                            ▼
                    Helm Chart Universal
                    (infra/helm/pokedex)
```

---

## 📁 Estructura de Directorios

```text
infra/opentofu/
├── README.md                      # Esta documentación de arquitectura
└── environments/
    ├── backend.tf.example         # Plantilla para estado remoto seguro (S3/GCS con SSE y bloqueo)
    ├── aws/                       # Backend Cloud: Clúster AWS EKS, VPC, subredes y NodeGroups
    │   ├── main.tf
    │   ├── providers.tf
    │   └── variables.tf
    └── proxmox/                   # Backend On-Premise: Máquinas virtuales Proxmox VE con Cloud-Init
        ├── main.tf
        ├── providers.tf
        └── variables.tf
```

---

## 🚀 Uso Operativo

### Aprovisionamiento en AWS (EKS)
```bash
task tofu:init:aws
task tofu:plan:aws
task tofu:apply:aws
```

### Aprovisionamiento en Proxmox VE
```bash
task tofu:init:proxmox
task tofu:plan:proxmox
task tofu:apply:proxmox
```

### Validación Global de Sintaxis
```bash
task tofu:validate
```

---

## 🔒 Buenas Prácticas de Seguridad en IaC

1. **Sin Credenciales Hardcodeadas:** Variables sensibles como tokens de API y claves SSH se inyectan mediante variables de entorno (`TF_VAR_*`) o secrets managers.
2. **Estado Remoto Cifrado:** No se almacenan archivos `.tfstate` locales en el repositorio (están explícitamente excluidos en `.gitignore`).
3. **Versiones Fijas:** Todos los proveedores y módulos oficiales declaran versiones semánticas fijas.
