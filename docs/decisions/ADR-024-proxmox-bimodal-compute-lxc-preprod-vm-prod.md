# ADR-024: Estrategia de Cómputo Bi-Modal en Proxmox VE: Contenedores LXC para Pre-Producción y Máquinas Virtuales KVM para Producción

## Estado

Aceptado

## Contexto

Para el aprovisionamiento automatizado del nodo Kubernetes (K3s) sobre la infraestructura on-premise en Proxmox VE mediante OpenTofu ([ADR-004](./ADR-004-opentofu-and-ansible-boundaries.md)), existen dos modelos de virtualización soportados nativamente por el hipervisor:

1. **Máquinas Virtuales KVM (QEMU)**: Virtualización por hardware completa (Intel VT-x / AMD-V) con espacio de memoria y kernel de Linux totalmente independiente y aislado del hipervisor.
2. **Contenedores de Sistema LXC**: Virtualización a nivel de sistema operativo que comparte el kernel de Linux del host Proxmox subyacente.

### El Desafío de Seguridad en LXC

Para ejecutar un nodo Kubernetes (K3s) y su motor de contenedores (`containerd`) dentro de un contenedor LXC en Proxmox VE, es técnicamente indispensable habilitar privilegios y anidación:

```hcl
unprivileged = false
features {
  nesting = true
}
```

Asimismo, el agente `kubelet` requiere acceso en lectura y escritura a ciertos subsistemas del kernel (como `/proc/sys/kernel/panic_on_oops`), montajes de cgroups y `/dev/kmsg`. En consecuencia, la jerarquía de ejecución resultante es:

```
Proxmox Host (Kernel)
   │
   └── Privileged LXC (Comparte Kernel del Host + Nesting)
          │
          └── K3s (containerd runtime)
                │
                └── Application Containers (Pods)
```

En este modelo, el límite de aislamiento ante una eventual vulnerabilidad de kernel o escape de contenedor en un Pod es significativamente menor que en una VM KVM:

```
Proxmox Host (Kernel)
   │
   └── KVM Virtual Machine (Kernel propio y aislado por Hardware / QEMU)
          │
          └── K3s (containerd runtime)
                │
                └── Application Containers (Pods)
```

### Trade-Off de Rendimiento y Recursos

Por otro lado, la medición empírica de recursos en laboratorio demostró que la virtualización KVM impone un overhead significativo para entornos de desarrollo y pruebas:
- **KVM VM**: ~5.1 GB de RAM consumida por la sobrecarga del emulador QEMU, sistema operativo invitado completo y buffers de virtualización.
- **LXC Container**: **867 MB** de RAM total consumida para el stack completo (OS Debian 12 + K3s v1.36.4 + PostgreSQL + Redis + 2 réplicas de API Express + Frontend Web Nginx), con inicio en frío en menos de 5 segundos.

## Decisión

Se adopta formalmente una **Estrategia de Cómputo Bi-Modal** en el módulo OpenTofu de Proxmox VE (`infra/opentofu/environments/proxmox`), parametrizada mediante las variables `compute_type` (`"lxc"` | `"vm"`) y `environment_tier` (`"preprod"` | `"prod"`):

### 1. Pre-Producción / Laboratorio / Staging: Contenedor LXC (`compute_type = "lxc"`)

- **Objetivo**: Máxima densidad, bajo consumo de memoria (ahorro >80% de RAM), velocidad de despliegue y agilidad para iteraciones continuas y pruebas de integración.
- **Postura de Seguridad**: Trade-off de seguridad **explícitamente aceptado y documentado** para cargas de trabajo sin datos sensibles de producción.
- **Medidas de Endurecimiento Aplicadas**:
  - Red segmentada en puente local dedicado (`vmbr0` / VLAN privada).
  - Acceso SSH restringido exclusivamente mediante llave pública Ed25519 (`ssh_public_key`).
  - No exposición de puertos administrativos de Proxmox hacia el contenedor.
  - Sincronización de `/dev/kmsg` hacia `/dev/console` vía servicio de sistema en lugar de exponer dispositivos de bloques arbitrarios.

### 2. Producción: Máquina Virtual KVM (`compute_type = "vm"`)

- **Objetivo**: Aislamiento estricto de grado corporativo y mitigación total de riesgos de escape de kernel multi-tenant.
- **Postura de Seguridad**:
  - Frontera de aislamiento reforzada por microcódigo de CPU (VT-x/AMD-V) y emulación QEMU.
  - Kernel propio e inmutable respecto al host Proxmox: un compromiso a nivel de kernel dentro del nodo K3s no puede saltar directamente al espacio de memoria del hipervisor ni a otros contenedores del host.
  - Soporte completo de AppArmor, SELinux, Seccomp y políticas de Pod Security Admission / Kyverno ([ADR-017](./ADR-017-kyverno-admission-control-and-pod-security.md)) sin restricciones de cgroups compartidos.
  - Discos aprovisionados con emulación SCSI con flags de `discard=on`, `ssd=true` e `iothread=true` para alto rendimiento I/O.

### 3. Abstracción Unificada en Infraestructura como Código (OpenTofu)

La implementación en OpenTofu desacopla el tipo de cómputo del resto de la arquitectura:
- El mismo bloque de código soporta el aprovisionamiento condicional (`count`) tanto de la plantilla/imagen como de la instancia de cómputo (`proxmox_virtual_environment_container` vs `proxmox_virtual_environment_vm`).
- Los outputs exponen identificadores genéricos estandarizados: `instance_id`, `instance_name`, `instance_ip`, manteniendo compatibilidad hacia atrás con los alias existentes `vm_id`, `vm_name`, `vm_ip`.
- Los artefactos de despliegue superiores (Helm Charts de Pokédex, manifiestos de Kubernetes, scripts de instalación de K3s) operan de manera 100% agnóstica al sustrato de virtualización subyacente.

## Consecuencias

### Positivas

- **Optimización de Costos y Densidad**: Permite ejecutar el clúster completo de pruebas y pre-producción en servidores con recursos acotados (menos de 1 GB de RAM base), liberando capacidad para otros servicios de desarrollo.
- **Seguridad Inflexible en Producción**: Garantiza que ningún entorno productivo exponga el kernel del hipervisor a través de contenedores privilegiados.
- **Código Declarativo Unificado**: Sin duplicación de módulos Terraform/OpenTofu; el cambio de entorno se realiza simplemente alternando `compute_type = "lxc"` a `compute_type = "vm"` en el archivo `terraform.tfvars`.

### Riesgos y Mitigaciones

| Riesgo | Severidad | Mitigación |
| :--- | :--- | :--- |
| **Diferencia de sustrato entre Pre-Prod y Prod** | Media | La API de Kubernetes (K3s), las versiones de runtime (`containerd`), las arquitecturas de red CNI y los Ingress Controllers se mantienen exactamente idénticos en ambos sustratos. |
| **Riesgo de kernel panic en host por LXC en Pre-Prod** | Baja | Monitoreo del host Proxmox y límites de memoria/swap definidos explícitamente en el recurso OpenTofu (`memory { dedicated = 5120, swap = 1024 }`). |
| **Consumo de disco en Prod por imágenes Cloud-Init** | Baja | Descarga automatizada vía `proxmox_download_file` con deduplicación y almacenamiento en volumen LVM-Thin (`local-lvm`). |
