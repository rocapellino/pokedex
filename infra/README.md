# Infraestructura

Este directorio agrupa la infraestructura del proyecto:

- `docker/`: contenedores y archivos de runtime
- `k8s/`: manifiestos declarativos de Kubernetes (Deployments, Services, HPA, Ingress)
- `terraform/`: módulos y ambientes para infraestructura como código
- `scripts/`: automatización de despliegue y operaciones

La API backend vive en `apps/api` y el despliegue se orquesta desde este módulo.
