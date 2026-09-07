# ⎈ Guía de Despliegue y Operación con Helm (Pokédex Platform)

Esta guía documenta la arquitectura, parametrización, instalación y ciclo de vida de la plataforma **Pokédex** mediante su Chart oficial de **Helm 3** (`infra/helm/pokedex`).

---

## 1. Visión General del Chart

El Chart empaqueta de forma modular y estandarizada todos los componentes cloud-native de la solución:

| Componente | Tipo de Recurso | Puerto(s) | Descripción |
| :--- | :--- | :--- | :--- |
| **API Backend** | `Deployment`, `Service`, `HPA` | `5000` | FastAPI ASGI, instrumentación OpenTelemetry, Prometheus metrics y probes `/healthz`, `/readyz`. |
| **Frontend Web** | `Deployment`, `Service` | `80`, `8080` | Nginx SPA con reverse proxy hardening y probes de salud. |
| **PostgreSQL** | `StatefulSet`, `Service` Headless | `5432` | Base de datos relacional con esquema DDL versionado (`init.sql`) y persistencia PVC. |
| **PgBouncer** | `Deployment`, `Service` | `6432` | Connection pooler transaccional optimizado para alta concurrencia y prevención de saturación de sockets DB. |
| **Redis** | `Deployment`, `Service` | `6379` | Cache de alta velocidad para endpoints y rate limiting. |
| **Ingress** | `Ingress` | `80`, `443` | Enrutamiento perimetral L7 (`/` -> web, `/api` -> api) con terminación TLS. |
| **Seguridad** | `NetworkPolicy`, `PDB` | — | Modelo Zero-Trust de aislamiento de red y PodDisruptionBudgets para resiliencia en drenado. |
| **Seed Job** | `Job` (Helm Hook) | — | Carga inicial opcional de 1025 Pokémon (`bulk_load_pokemons.py`). |

---

## 2. Estructura de Archivos

```text
infra/helm/
└── pokedex/
    ├── Chart.yaml                     # Metadatos del Chart (versión 1.0.0, appVersion 1.9.5)
    ├── .helmignore                    # Patrones de exclusión de empaquetado
    ├── values.yaml                    # Configuración por defecto (entorno local / desarrollo)
    ├── values.prod.yaml               # Overrides para producción (HA, TLS, 2 réplicas, límites)
    └── templates/
        ├── _helpers.tpl               # Macros de nombres, etiquetas y selectores estándar
        ├── configmap.yaml             # Variables de entorno y host dinámico (PostgreSQL vs PgBouncer)
        ├── secret.yaml                # Secretos de autenticación (API Keys, BD, Redis)
        ├── postgres-init-configmap.yaml # Script DDL inicial (tablas, índices y tipos)
        ├── postgres-service.yaml      # Servicio Headless para StatefulSet
        ├── postgres-statefulset.yaml  # StatefulSet con PVC y probes
        ├── pgbouncer-deployment.yaml  # Deployment y Servicio de PgBouncer
        ├── redis-deployment.yaml      # Deployment y Servicios de Redis
        ├── api-deployment.yaml        # Deployment FastAPI con PSS Restricted y Service
        ├── api-hpa.yaml               # Autoscaling horizontal basado en CPU y Memoria
        ├── web-deployment.yaml        # Deployment Nginx frontend
        ├── web-service.yaml           # Servicios para frontend web (ClusterIP/LoadBalancer)
        ├── ingress.yaml               # Ingress Controller rules y TLS
        ├── network-policies.yaml      # Reglas Zero-Trust ingress/egress por pod
        ├── pdb.yaml                   # PodDisruptionBudgets para API y Web
        ├── seed-job.yaml              # Helm post-install/post-upgrade Hook para seed de datos
        └── NOTES.txt                  # Guía post-instalación mostrada en terminal
```

---

## 3. Requisitos Previos

- **Kubernetes Cluster**: Versión `1.28+` (Kind, Minikube, K3s, AKS, EKS o GKE).
- **Helm CLI**: Versión `3.14+` instalada en host o ejecución mediante contenedor `alpine/helm:3.17.0`.
- **Ingress Controller** (Opcional, recomendado): `ingress-nginx`.
- **cert-manager** (Opcional para TLS automático en producción).

---

## 4. Comandos con Taskfile (Recomendado)

El proyecto incluye tareas automatizadas en `Taskfile.yml` que encapsulan la ejecución de Helm a través de contenedores sin necesidad de instalar binarios en el sistema host:

```bash
# Validar sintaxis y reglas del Chart
task helm:lint

# Renderizar los manifiestos por defecto
task helm:template

# Renderizar con el perfil de producción
task helm:template:prod

# Empaquetar el chart en formato .tgz para distribución
task helm:package
```

---

## 5. Instalación y Despliegue

### 5.1 Despliegue en Desarrollo / Local

```bash
# Crear namespace
kubectl create namespace pokemon-app

# Instalar el release pokedex
helm install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --create-namespace
```

### 5.2 Despliegue en Producción (Alta Disponibilidad)

```bash
helm install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --values ./infra/helm/pokedex/values.prod.yaml \
  --set secrets.adminApiKey="<CLAVE_ADMIN_FUERTE_PRODUCCION>" \
  --set secrets.aiApiKey="<CLAVE_AI_FUERTE_PRODUCCION>"
```

### 5.3 Actualizaciones y Rollbacks

```bash
# Aplicar cambios / upgrades
helm upgrade pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --values ./infra/helm/pokedex/values.prod.yaml

# Ver historial de revisiones
helm history pokedex -n pokemon-app

# Revertir a una revisión anterior (ej: revisión 1)
helm rollback pokedex 1 -n pokemon-app
```

---

## 6. Integración GitOps con ArgoCD
 
Para sincronización continua y despliegue declarativo en la arquitectura híbrida, aplica los manifiestos de ArgoCD según corresponda:
 
```bash
# Despliegue en clúster On-Premise (Proxmox VE):
kubectl apply -f gitops/apps/app-proxmox.yaml

# Despliegue en clúster Nube Pública (EKS / GKE / AKS):
kubectl apply -f gitops/apps/app-cloud.yaml
```
 
ArgoCD sincronizará automáticamente el Chart ubicado en `infra/helm/pokedex` aplicando los valores de `values.yaml` combinados con la sobrescritura del entorno (`gitops/environments/proxmox/values.yaml` o `gitops/environments/cloud/values.yaml`).

---

## 7. Verificación del Despliegue

```bash
# Verificar estado de todos los recursos del release
kubectl get pods,svc,hpa,ingress,pdb -n pokemon-app

# Acceso local vía Port-Forwarding (si Ingress no está configurado)
# Frontend Web:
kubectl port-forward svc/pokedex-web-svc 8080:8080 -n pokemon-app

# API Backend:
kubectl port-forward svc/pokemon-api-svc 5000:5000 -n pokemon-app
```
