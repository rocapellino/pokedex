# ADR-001: Kubernetes como Runtime Oficial y Universal de Producción

## Estado
Aceptado

## Contexto
La plataforma Pokédex requiere un entorno de ejecución altamente disponible, resiliente y portable entre infraestructuras on-premise (Proxmox VE) y nube pública (AWS EKS). Anteriormente se mantenían playbooks de despliegue directo con Docker Compose en servidores de producción, lo que generaba duplicidad de manifiestos, divergencia de configuraciones y falta de orquestación avanzada (autorrecuperación, escalado horizontal automático, aislamiento de red Zero-Trust).

## Decisión
Se establece **Kubernetes** como el **único runtime oficial y universal** para cargas de trabajo productivas y de preproducción.

1. Toda carga de trabajo en producción debe ejecutarse como Pods gestionados mediante Deployments, StatefulSets o Jobs empaquetados con Helm.
2. Quedan expresamente retirados los playbooks de despliegue directo de Compose en entornos productivos (`deploy_proxmox.yml`, `deploy_app.yml`).
3. Kubernetes gobierna la salud del proceso (`livenessProbe`), conectividad a bases de datos (`readinessProbe`), escalado (`HPA`), y alta disponibilidad (`topologySpreadConstraints`).

## Consecuencias
- **Positivas**: Eliminación de divergencia entre entornos, portabilidad total entre nubes y on-premise, resiliencia nativa.
- **Compensaciones**: Requiere un plano de control de Kubernetes activo y mayor disciplina en manifiestos y políticas.
