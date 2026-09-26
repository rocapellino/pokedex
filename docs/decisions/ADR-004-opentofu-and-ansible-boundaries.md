# ADR-004: Separación Estricta de Responsabilidades entre OpenTofu y Ansible

## Estado

Aceptado

## Contexto

El acoplamiento operativo entre herramientas de aprovisionamiento de infraestructura física/cloud y herramientas de configuración de sistemas operativos genera solapamiento de estado, dificultades para ejecutar pruebas unitarias y riesgo de ejecuciones redundantes.

## Decisión

Se definen fronteras arquitectónicas estrictas entre **OpenTofu** (Capa 1) y **Ansible** (Capa 2):

1. **OpenTofu (Capa 1 - Infraestructura Inmutable)**:
   - Responsable exclusivo de instanciar VMs en Proxmox VE, VPCs, subredes, grupos de seguridad, buckets S3 y clústeres EKS.
   - Prohibido configurar software o ejecutar tareas dentro del sistema operativo invitado.
2. **Ansible (Capa 2 - Configuración de Hosts)**:
   - Responsable exclusivo de configurar el sistema operativo base (`base_os`), instalar el runtime de contenedores (`container_runtime`), aplicar prerrequisitos de Kubernetes (`kubernetes_prerequisites`), firewall perimetral (`firewall`) y hardening SSH (`hardening`).
   - Prohibido crear VMs o recursos cloud que pertenezcan al ciclo de vida de OpenTofu.
   - Prohibido utilizar `ignore_errors: true` en tareas críticas; se exige el uso de `register`, `failed_when` y comprobaciones explícitas de servicio.

## Consecuencias

- **Positivas**: Desacoplamiento total, claridad de propiedad por componente, facilidad de testeo individual con linters específicos (`tofu validate`, `ansible-playbook --syntax-check`).
- **Compensaciones**: Requiere orquestar la secuencia de aprovisionamiento en dos pasos diferenciados.
