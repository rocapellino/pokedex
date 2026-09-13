# ADR-003: Modelo de Despliegue Declarativo GitOps con ArgoCD

## Estado
Aceptado

## Contexto
Los despliegues manuales mediante comandos imperativos (`kubectl apply`) generan deriva de configuración (*drift*), falta de auditoría y riesgo de desincronización entre el código fuente y el estado activo del clúster.

## Decisión
Se adopta **ArgoCD** bajo el paradigma **GitOps** como el **mecanismo oficial y exclusivo de sincronización continua** en Kubernetes:

1. El repositorio Git es la única fuente de verdad (*single source of truth*) para el estado deseado de las aplicaciones.
2. Las aplicaciones se declaran mediante recursos `Application` de ArgoCD (`gitops/apps/`).
3. El uso de `kubectl apply` queda estrictamente restringido a procedimientos iniciales de bootstrap, simulaciones de contingencia y diagnóstico de emergencia documentado.

## Consecuencias
- **Positivas**: Trazabilidad completa por commit, detección y reversión automática de drift, visibilidad visual del estado de los recursos.
- **Compensaciones**: Requiere que el controlador de ArgoCD esté operativo y configurado en el clúster.
