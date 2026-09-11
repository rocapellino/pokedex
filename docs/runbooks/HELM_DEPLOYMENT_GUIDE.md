# ⎈ Guía de Despliegue y Operación con Helm (Pokédex Platform)

Esta guía documenta la arquitectura, parametrización, instalación y ciclo de vida de la plataforma **Pokédex** mediante su Chart oficial de **Helm 3** (`infra/helm/pokedex`).

---

## 1. Visión General del Chart

El Chart empaqueta de forma modular y estandarizada todos los componentes cloud-native de la solución:

| Componente | Tipo de Recurso | Puerto(s) | Descripción |
| :--- | :--- | :--- | :--- |
| **API Backend** | `Deployment`, `Service`, `HPA` | `3000` | Node.js 22 LTS / Express 4.21, TypeScript, Prometheus metrics y probes `/healthz`, `/readyz`. |
| **Frontend Web** | `Deployment`, `Service` | `80`, `8080` | Nginx SPA con reverse proxy hardening, compresión gzip y probes de salud. |
| **PostgreSQL** | `StatefulSet`, `Service` Headless | `5432` | Base de datos relacional con esquema DDL versionado (`init.sql`) y persistencia PVC. |
| **PgBouncer** | `Deployment`, `Service` | `5432` | Connection pooler transaccional obligatorio en producción para mitigar saturación de sockets de base de datos. |
| **Redis** | `Deployment`, `Service` | `6379` | Caché de alta velocidad para endpoints, revocación distribuida de sesiones y rate limiting en Lua. |
| **Ingress** | `Ingress` | `80`, `443` | Enrutamiento perimetral L7 (`/` -> web, `/api` -> api) con terminación TLS. |
| **Seguridad de Red** | `NetworkPolicy`, `PDB` | — | Zero-Trust NetworkPolicies (anti-SSRF, PgBouncer enforced isolation, CoreDNS restriction) y PodDisruptionBudgets. |
| **Gestión de Secretos** | `Secret`, `ExternalSecret` | — | Soporte para Sealed Secrets, Secrets locales desacoplados (`existingSecret`) y External Secrets Operator. |
| **Seed Job** | `Job` (Helm Hook) | — | Carga inicial opcional de 1.025 Pokémon (`src/seed.ts` compilado). |

---

## 2. Estructura de Archivos

```text
infra/helm/
└── pokedex/
    ├── Chart.yaml                       # Metadatos del Chart (versión 1.0.0, appVersion 1.9.5)
    ├── .helmignore                      # Patrones de exclusión de empaquetado
    ├── values.yaml                      # Configuración por defecto (desarrollo / local)
    ├── values.prod.yaml                 # Overrides para producción (HA, TLS, Zero-Trust, PgBouncer, ESO)
    └── templates/
        ├── _helpers.tpl                 # Macros de nombres, etiquetas y helper pokedex.secretName
        ├── configmap.yaml               # Variables de entorno y host dinámico (PostgreSQL vs PgBouncer)
        ├── secret.yaml                  # Secret condicional (solo activo si no hay existingSecret ni ESO)
        ├── externalsecret.yaml          # Sincronización automática con Vault / AWS / GCP Secrets
        ├── postgres-init-configmap.yaml # Script DDL inicial (tablas, índices JSONB y secuencias)
        ├── postgres-service.yaml        # Servicio Headless para StatefulSet
        ├── postgres-statefulset.yaml    # StatefulSet con PVC y probes
        ├── pgbouncer-deployment.yaml    # Deployment y Servicio de PgBouncer (digest pinned)
        ├── redis-deployment.yaml        # Deployment y Servicios de Redis
        ├── api-deployment.yaml          # Deployment API con PSS Restricted y soporte para digest
        ├── api-hpa.yaml                 # Autoscaling horizontal basado en CPU y Memoria
        ├── web-deployment.yaml          # Deployment Nginx frontend con soporte para digest
        ├── web-service.yaml             # Servicios para frontend web (ClusterIP/LoadBalancer)
        ├── ingress.yaml                 # Ingress Controller rules y TLS
        ├── network-policies.yaml        # Reglas Zero-Trust ingress/egress con Anti-SSRF
        ├── pdb.yaml                     # PodDisruptionBudgets para API y Web
        ├── seed-job.yaml                # Helm post-install/post-upgrade Hook para seed de datos
        └── NOTES.txt                    # Guía post-instalación mostrada en terminal
```

---

## 3. Requisitos Previos

- **Kubernetes Cluster**: Versión `1.28+` (Kind, Minikube, K3s, AKS, EKS, GKE o Proxmox).
- **Helm CLI**: Versión `3.14+` instalada en host o ejecución mediante contenedor `alpine/helm:3.17.0`.
- **Ingress Controller** (Opcional, recomendado): `ingress-nginx`.
- **cert-manager** (Opcional para TLS automático en producción).

---

## 4. Comandos con Taskfile (Recomendado)

El proyecto incluye tareas automatizadas en `Taskfile.yml` que encapsulan la ejecución de Helm a través de contenedores Docker aislados:

```bash
# Validar sintaxis y reglas del Chart
task helm:lint

# Renderizar los manifiestos por defecto (desarrollo)
task helm:template

# Renderizar con el perfil de producción y reglas Zero-Trust
task helm:template:prod

# Empaquetar el chart en formato .tgz para distribución
task helm:package
```

---

## 5. Instalación y Despliegue

### 5.1 Despliegue en Desarrollo / Local

En desarrollo, Helm genera automáticamente un secreto local con contraseñas por defecto:

```bash
# Crear namespace
kubectl create namespace pokemon-app

# Instalar el release pokedex con valores por defecto
helm install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --create-namespace
```

### 5.2 Despliegue en Producción (Zero-Trust & Secretos Desacoplados)

En producción, **nunca se pasan contraseñas por línea de comandos mediante `--set`**. El perfil `values.prod.yaml` implementa:

1. `secrets.existingSecret: "pokedex-prod-secrets"` (o `externalSecrets.enabled: true`).
2. `pgbouncer.enabled: true` (mediador obligatorio; bloquea tráfico directo API -> PostgreSQL).
3. `networkPolicies.egress.antiSsrf.enabled: true` (bloquea IMDS `169.254.169.254/32`, RFC1918 y loopback).
4. Inmutabilidad de imágenes con tags semánticos fijos (`1.9.5`) y digests criptográficos.

```bash
# 1. Crear previamente el secreto en el clúster (o dejar que External Secrets Operator lo cree):
kubectl create secret generic pokedex-prod-secrets \
  --namespace pokemon-app \
  --from-literal=admin-api-key="<CLAVE_ADMIN_PROD>" \
  --from-literal=admin-session-secret="<HMAC_SECRET_PROD>" \
  --from-literal=ai-api-key="<GEMINI_KEY_PROD>" \
  --from-literal=postgres-password="<PG_PASS_PROD>" \
  --from-literal=redis-password="<REDIS_PASS_PROD>"

# 2. Desplegar con values.prod.yaml:
helm install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --values ./infra/helm/pokedex/values.prod.yaml
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

Para sincronización continua y despliegue declarativo en la arquitectura multi-backend:

```bash
# Despliegue en clúster On-Premises (Proxmox VE):
kubectl apply -f gitops/apps/app-proxmox.yaml

# Despliegue en clúster Cloud (AWS EKS):
kubectl apply -f gitops/apps/app-cloud.yaml
```

ArgoCD sincroniza automáticamente el Chart ubicado en `infra/helm/pokedex` aplicando los valores base de `values.yaml` combinados con la sobrescritura del entorno ([`gitops/environments/proxmox/values.yaml`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/gitops/environments/proxmox/values.yaml) o [`gitops/environments/aws/values.yaml`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/gitops/environments/aws/values.yaml)).

---

## 7. Entorno de Desarrollo Local con Paridad Kubernetes (Kind)

Para validar cambios en el Chart de Helm localmente antes de abrirlos a GitOps o subirlos a producción:

```bash
# Levantar clúster Kind local y desplegar Helm chart con imágenes locales:
task dev:k8s:up

# Comprobar estado de los recursos en el namespace pokemon-app:
task dev:k8s:status

# Destruir clúster local al finalizar:
task dev:k8s:down
```

---

## 8. Verificación del Despliegue

```bash
# Verificar estado de todos los recursos del release
kubectl get pods,svc,hpa,ingress,pdb,networkpolicy -n pokemon-app

# Acceso local vía Port-Forwarding (si Ingress no está configurado):
# Frontend Web (Nginx):
kubectl port-forward svc/pokedex-web-svc 8080:80 -n pokemon-app

# API Backend (Node.js):
kubectl port-forward svc/pokemon-api-svc 3000:3000 -n pokemon-app
```
