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
       (Proxmox VE)              (Prod, blueprint)
               │                         │
     [ environments/proxmox ]  [ environments/cloud-template ]
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

## 📁 Estructura de Directorios y Taxonomía

```text
infra/opentofu/
├── README.md                      # Esta documentación de arquitectura y guía de uso
├── environments/
│   ├── backend.tf.example         # Plantilla para estado remoto seguro (S3/GCS con SSE y bloqueo)
│   ├── proxmox/                   # [ACTIVE] Backend On-Premise: LXC K3s de pre-prod, Vault y Bastion
│   │   ├── main.tf
│   │   ├── providers.tf
│   │   └── variables.tf
│   ├── lab/                       # [SUPPORTED] Entorno de laboratorio para VMs efímeras de prueba
│   │   ├── main.tf
│   │   ├── providers.tf
│   │   └── variables.tf
│   └── cloud-template/            # [BLUEPRINT] Base agnóstica del blueprint prod cloud (ADR-030)
│       ├── main.tf
│       └── variables.tf
└── modules/                       # Módulos reutilizables compartidos
    ├── compute/                   # Contrato de especificación de recursos de cómputo
    ├── naming/                    # Convención estandarizada de nomenclatura de recursos
    ├── security_baseline/         # Parámetros y contratos de seguridad base
    └── tagging/                   # Gobernanza de etiquetas y trazabilidad
```

---

## 🚀 Uso Operativo (Comandos Canónicos)

### Validación del Blueprint Prod Cloud

```bash
# Valida proxmox, cloud-template y lab sin credenciales ni backend remoto
task infra:validate
```

El blueprint prod cloud no tiene `plan` ni `apply` hasta que un ADR fije el proveedor (ADR-030).

### Aprovisionamiento en Proxmox VE

```bash
# Validación previa e inicialización
task infra:validate

# Planificación y aplicación en Proxmox VE
task infra:plan:proxmox
task infra:apply:proxmox
```

### Validación Global de Sintaxis

```bash
task infra:validate
```

---

## 🔒 Buenas Prácticas de Seguridad en IaC

1. **Sin Credenciales Hardcodeadas:** Variables sensibles como tokens de API y claves SSH se inyectan mediante variables de entorno (`TF_VAR_*`) o secrets managers.
2. **Estado Remoto Cifrado:** No se almacenan archivos `.tfstate` locales en el repositorio (están explícitamente excluidos en `.gitignore`).
3. **Versiones Fijas:** Todos los proveedores y módulos oficiales declaran versiones semánticas fijas.
