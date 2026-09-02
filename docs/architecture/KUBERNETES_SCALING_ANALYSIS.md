# ☸️ Análisis de Escalado Horizontal en Kubernetes (HPA), Persistencia y Balanceo de Carga

Este documento presenta el análisis técnico y arquitectónico para la implementación de autoescalado horizontal (**Horizontal Pod Autoscaler - HPA**) en la plataforma **Pokémon API**, garantizando la coherencia de datos hacia una base de datos centralizada y evaluando la necesidad y roles de **Proxies Inversos** y **Balanceadores de Carga (L4/L7)**.

---

## 📑 Tabla de Contenidos
1. [Resumen Ejecutivo y Diagnóstico](#1-resumen-ejecutivo-y-diagnóstico)
2. [Arquitectura de Autoescalado con Kubernetes (HPA)](#2-arquitectura-de-autoescalado-con-kubernetes-hpa)
3. [Estrategia de Persistencia y Coherencia de Datos](#3-estrategia-de-persistencia-y-coherencia-de-datos)
4. [Análisis Comparativo: ¿Proxy, Balanceador o Ambos?](#4-análisis-comparativo-proxy-balanceador-o-ambos)
5. [Topología de Red y Flujo de Tráfico Propuesto](#5-topología-de-red-y-flujo-de-tráfico-propuesto)
6. [Manifiestos y Configuración de Referencia](#6-manifiestos-y-configuración-de-referencia)
7. [Conclusiones y Siguientes Pasos](#7-conclusiones-y-siguientes-pasos)

---

## 1. Resumen Ejecutivo y Diagnóstico

Actualmente, la aplicación corre sobre **Docker Compose** con una arquitectura de contenedores fijos (1 contenedor web, 1 contenedor API, 1 PostgreSQL, 1 Redis, 1 MinIO). Ante picos de tráfico (alto uso de CPU/Memoria), esta infraestructura no puede reaccionar elásticamente sin intervención manual o reinicio de servicios.

La migración hacia **Kubernetes (K8s)** permite:
- **Elasticidad Automática:** Aumentar o disminuir dinámicamente el número de réplicas de los contenedores web y backend en función de la demanda métrica en tiempo real.
- **Resiliencia y Alta Disponibilidad:** Recuperación automática de pods (*self-healing*) ante caídas o agotamiento de recursos (*OOMKilled*).
- **Garantía de Consistencia:** Mantener los contenedores web y backend en un modelo **Stateless** (sin estado) convergiendo hacia una capa de datos única y transaccionalmente segura (PostgreSQL + Redis).

---

## 2. Arquitectura de Autoescalado con Kubernetes (HPA)

### 2.1. Funcionamiento del Horizontal Pod Autoscaler (HPA v2)

El **HPA** consulta de forma continua el **Metrics Server** de Kubernetes (por defecto cada 15 segundos) para recolectar el uso de CPU y memoria de los pods asociados a un `Deployment`.

```mermaid
flowchart TD
    subgraph K8sCluster["Cluster Kubernetes"]
        MS["Metrics Server (kube-state-metrics)"]
        HPA["Horizontal Pod Autoscaler (HPA Controller)"]
        DEP["Deployment (Web / API)"]
        
        P1["Pod 1 (30% CPU)"]
        P2["Pod 2 (85% CPU)"]
        P3["Pod 3 (Nuevo Pod Escalado)"]
        
        MS -->|Reporta métricas de CPU/RAM| HPA
        HPA -->|Ajusta réplicas según target (ej. 75%)| DEP
        DEP -->|Despliega / Elimina| P1
        DEP -->|Despliega / Elimina| P2
        DEP -->|Despliega / Elimina| P3
    end
```

### 2.2. Algoritmo de Escalado

El número deseado de réplicas se calcula según la fórmula oficial de Kubernetes:

$$\text{Réplicas Deseadas} = \left\lceil \text{Réplicas Actuales} \times \left( \frac{\text{Métrica Actual}}{\text{Métrica Objetivo}} \right) \right\rceil$$

### 2.3. Requisitos Críticos para el Autoescalado
1. **Metrics Server Activo:** Debe estar desplegado en el clúster (`kube-system/metrics-server`).
2. **Definición Obligatoria de `requests` y `limits`:** El HPA calcula los porcentajes sobre los `requests` del contenedor. Si un contenedor no tiene `resources.requests.cpu` o `resources.requests.memory`, el HPA no podrá calcular la utilización y fallará.
3. **Políticas de Enfriamiento (*Cooldown / Stabilization Windows*):**
   - **Scale Up:** Rápido (sin demora o 15s) para absorber el pico de carga inmediatamente.
   - **Scale Down:** Gradual (ventana de estabilización de 300 segundos / 5 min) para prevenir el fenómeno de oscilación (*thrashing / flapping*).

---

## 3. Estrategia de Persistencia y Coherencia de Datos

Para que el autoescalado de réplicas web/API funcione sin provocar inconsistencias, condiciones de carrera o datos huérfanos:

```mermaid
flowchart TD
    subgraph StatelessLayer["Capa de Cómputo Elástica (Stateless)"]
        W1["Web Pod #1"]
        W2["Web Pod #2"]
        WN["Web Pod #N"]
        A1["API Pod #1"]
        A2["API Pod #2"]
        AN["API Pod #N"]
    end

    subgraph ConfigLayer["Inyección de Configuración Unificada"]
        CM["ConfigMap (DATABASE_HOST, PORT, DB_NAME)"]
        SEC["Secret (POSTGRES_USER, POSTGRES_PASSWORD)"]
    end

    subgraph PoolingLayer["Capa de Gestión de Conexiones"]
        PGB["PgBouncer (Connection Pooling)"]
    end

    subgraph StatefulLayer["Capa de Persistencia Centralizada (Single Source of Truth)"]
        PG[("PostgreSQL 16\n(PersistentVolumeClaim)")]
        RD[("Redis 7 (Caché Compartido)")]
        MIN[("MinIO / S3 (Object Storage)")]
    end

    CM -.->|Env Vars| A1 & A2 & AN
    SEC -.->|Env Vars| A1 & A2 & AN
    
    W1 & W2 & WN --> A1 & A2 & AN
    A1 & A2 & AN --> PGB
    PGB --> PG
    A1 & A2 & AN --> RD
    A1 & A2 & AN --> MIN
```

### 3.1. Principios de Consistencia Garantizados
1. **Pods Web y API 100% Stateless:** Ningún contenedor almacena estado en su sistema de archivos local (`rootfs` efímero). Si un pod muere o escala hacia abajo, no se pierde ningún dato.
2. **Fuente Única de Verdad (*Single Source of Truth*):**
   - Todos los pods API leen y escriben en la misma instancia primaria de PostgreSQL mediante una URL centralizada (`postgresql://user:pass@postgres-service:5432/pokedex_db`).
   - Las sesiones o tokens no se guardan en memoria local del pod, sino en **Redis** centralizado o vía JWT sin estado.
3. **Manejo del Límite de Conexiones (*Connection Exhaustion*):**
   - Al escalar de 2 a 15 pods API, cada proceso Uvicorn/FastAPI abre conexiones a la BD.
   - **Solución:** Implementar **PgBouncer** como Connection Pooler intermedio (desplegado en `infra/k8s/02b-pgbouncer.yaml`) o configurar un pool de conexiones adecuado en el driver nativo `psycopg2` para no superar el límite de `max_connections` de PostgreSQL.
4. **Almacenamiento de Multimedia Compartido:**
   - Sprites y assets de Pokémon residen en un bucket centralizado (MinIO / AWS S3 / Google Cloud Storage) con volumen persistente respaldado por un `PersistentVolumeClaim (PVC)`.

---

## 4. Análisis Comparativo: ¿Proxy, Balanceador o Ambos?

Una de las dudas fundamentales en arquitectura cloud-native es si se requiere un Proxy, un Balanceador o ambos. La respuesta técnica es: **Ambos son necesarios y cumplen roles complementarios en diferentes capas del modelo OSI.**

### 4.1. Comparativa de Componentes y Funciones

| Componente | Capa OSI | Función Principal | Implementación en K8s | ¿Es necesario? |
| :--- | :--- | :--- | :--- | :--- |
| **Balanceador Externo (Load Balancer)** | **Capa 4 (TCP/UDP) o Capa 7** | Recibir el tráfico desde Internet / Clientes externos y distribuirlo uniformemente entre los nodos del clúster K8s. | AWS NLB/ALB, GCP Cloud Load Balancing, MetalLB (On-Premises), Service tipo `LoadBalancer`. | **SÍ (Indispensable)** para dar punto de entrada IP pública/DNS al clúster. |
| **Ingress Controller (Reverse Proxy L7)** | **Capa 7 (HTTP/HTTPS)** | Enrutamiento inteligente por Path y Hostname (`/` $\to$ Web, `/api` $\to$ API), terminación SSL/TLS, compresión Gzip/Brotli, rate limiting y CORS. | Ingress-NGINX, Traefik, Emissary-Ingress, Istio Gateway. | **SÍ (Indispensable)** para evitar exponer múltiples IPs públicas y centralizar reglas de tráfico HTTP. |
| **Kube-Proxy + Service (ClusterIP)** | **Capa 4 (Transporte / IPVS/iptables)** | Balanceo de carga interno Este-Oeste (*East-West*) entre los múltiples pods réplicas de un mismo Deployment mediante algoritmos Round-Robin. | Componente nativo de Kubernetes (`kube-proxy` + Service `ClusterIP`). | **SÍ (Viene integrado)**: K8s lo gestiona automáticamente al definir un `Service`. |
| **Nginx Web Container (Local)** | **Capa 7 (HTTP)** | Servir assets estáticos del frontend (HTML, CSS, JS) y reenviar peticiones internas al backend si no se usa Ingress directo. | Contenedor `apps/web` (Nginx Alpine). | **Opcional / Complementario**: Sirve los estáticos del SPA con máxima velocidad. |

### 4.2. Veredicto Arquitectónico

```
Internet (Usuarios)
       │
       ▼
┌──────────────────────────────────────────────┐
│ 1. External Cloud Load Balancer (L4 / L7)    │ ◄── Punto de entrada con IP Pública Fija
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 2. Ingress Controller (NGINX / Reverse Proxy)│ ◄── Enrutamiento (/ $\to$ Web, /api $\to$ API), SSL TLS
└──────────────┬───────────────────────────────┘
               │
       ┌───────┴────────────────────────┐
       │ (Regla / )                     │ (Regla /api )
       ▼                                ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ 3. Service: pokemon-web-svc │  │ 3. Service: pokemon-api-svc │ ◄── Kube-Proxy Balanceo L4 Interno
│    (ClusterIP)              │  │    (ClusterIP)              │
└──────────────┬──────────────┘  └──────────────┬──────────────┘
               │                                │
       ┌───────┴────────┐               ┌───────┴────────┐
       ▼                ▼               ▼                ▼
┌──────────────┐ ┌──────────────┐┌──────────────┐ ┌──────────────┐
│ Web Pod #1   │ │ Web Pod #N   ││ API Pod #1   │ │ API Pod #N   │ ◄── Escalados por HPA
└──────────────┘ └──────────────┘└──────┬───────┘ └──────┬───────┘
                                        │                │
                                        └────────┬───────┘
                                                 ▼
                                ┌─────────────────────────────┐
                                │ Service: postgres-service   │
                                └──────────────┬──────────────┘
                                               ▼
                                ┌─────────────────────────────┐
                                │ PostgreSQL 16 (StatefulSet) │ ◄── Base de Datos Única
                                └─────────────────────────────┘
```

> **Conclusión:** 
> - **El Balanceador de Carga (Load Balancer)** garantiza la disponibilidad de red y entrada al clúster.
> - **El Ingress Controller (Reverse Proxy)** interpreta URLs, certificados SSL y reglas HTTP.
> - **Kubernetes Services** ejecutan el balanceo continuo entre los pods creados por el **HPA**.

---

## 5. Topología de Red y Flujo de Tráfico Propuesto

1. El usuario solicita `https://pokedex.empresa.com/` $\to$ El **Cloud Load Balancer** recibe el paquete TCP y lo dirige a los nodos de Kubernetes en el puerto del **Ingress Controller**.
2. El **Ingress Controller** termina la conexión SSL/TLS y analiza la ruta:
   - Si la ruta es `/`, envía el tráfico al servicio `pokemon-web-svc` (distribuido entre los Pods Web).
   - Si la ruta es `/api/*` o `/pokemons/*`, envía el tráfico al servicio `pokemon-api-svc` (distribuido entre los Pods API).
3. Si el tráfico se incrementa y la CPU supera el **70%** o la RAM el **75%**, el **HPA** escala las réplicas de `pokemon-web` y `pokemon-api` de 2 hasta 10 pods.
4. Cada pod de `pokemon-api` realiza sus transacciones contra `postgres-service:5432` y consulta caché en `redis-service:6379`, manteniendo 100% de consistencia de datos sin duplicidad.

---

## 6. Manifiestos y Configuración de Referencia

Se han estructurado los manifiestos declarativos en el directorio `infra/k8s/`:

```
infra/k8s/
├── 00-namespace.yaml             # Namespace dedicado (pokemon-app)
├── 01-config-and-secrets.yaml    # ConfigMap y Secrets de Base de Datos y Redis
├── 02-postgres-statefulset.yaml  # PostgreSQL con PVC persistente y ClusterIP Service
├── 03-redis-deployment.yaml      # Redis Cache con ClusterIP Service
├── 04-api-deployment.yaml        # Deployment Backend Flask/Gunicorn + Service
├── 05-web-deployment.yaml        # Deployment Frontend Nginx + Service
├── 06-hpa-autoscaling.yaml       # HPA v2 para Web y API (CPU y Memoria)
└── 07-ingress.yaml               # Ingress Controller (Rutas / y /api)
```

### 6.1. Ejemplo de Configuración HPA (`hpa-autoscaling.yaml`)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: pokemon-web-hpa
  namespace: pokemon-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: pokemon-web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 20
          periodSeconds: 60
```

---

## 7. Conclusiones y Siguientes Pasos

1. ✅ **Escalado Horizontal Resuelto:** El uso de HPA v2 con métricas combinadas de CPU (70%) y Memoria (80%) proporciona escalado automático y prevención de saturación de recursos.
2. ✅ **Consistencia de Datos Garantizada:** Separación estricta entre capas *Stateless* (Web/API) y capa *Stateful* (PostgreSQL con almacenamiento persistente), comunicadas vía K8s Services y ConfigMaps centralizados.
3. ✅ **Claridad en Proxy vs Balanceador:** Se ratifica la necesidad de la arquitectura en capas: **Load Balancer (L4 Entrada) + Ingress Controller (L7 Proxy Inverso) + K8s Service (L4 Balanceo de Pods)**.

---
*Documento elaborado para la rama `feature/k8s-web-scaling-analysis`.*
