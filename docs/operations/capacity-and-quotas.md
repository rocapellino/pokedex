# ⚖️ Planificación de Capacidad, Cuotas de Recursos y Presupuesto HPA

Este documento formaliza el dimensionamiento de recursos computacionales, los límites de espacio de nombres (**`ResourceQuota`**), las restricciones por pod (**`LimitRange`**) y su compatibilidad matemática con el autoescalado horizontal de pods (**`HPA v2`**) configurado para producción en [`infra/helm/pokedex/values.prod.yaml`](../../infra/helm/pokedex/values.prod.yaml).

---

## 1. Definición del ResourceQuota de Producción

El archivo `values.prod.yaml` impone los siguientes límites duros para el namespace `pokemon-app`:

```yaml
resourceQuota:
  enabled: true
  hard:
    requestsCpu: "8"        # 8000m CPU garantizadas
    requestsMemory: "8Gi"   # 8192Mi RAM garantizada
    limitsCpu: "16"         # 16000m CPU límite máximo del namespace
    limitsMemory: "16Gi"    # 16384Mi RAM límite máximo del namespace
    pods: "50"              # Máximo 50 pods concurrentes
    services: "15"          # Máximo 15 servicios K8s
```

---

## 2. Desglose de Recursos por Componente

### A. Capa de Aplicación API (`pokemon-api`)
* **Autoescalado:** `minReplicas: 2`, `maxReplicas: 10`
* **Requests por Pod:** CPU `250m`, Memoria `256Mi`
* **Limits por Pod:** CPU `1000m` (1 CPU), Memoria `1Gi` (1024Mi)

### B. Capa Web Frontend (`pokemon-web`)
* **Réplicas:** `2` fijas (o HPA `maxReplicas: 6`)
* **Requests por Pod:** CPU `100m`, Memoria `64Mi`
* **Limits por Pod:** CPU `500m`, Memoria `256Mi`

### C. Servicios de Estado e Infraestructura del Namespace
* **PostgreSQL + PgBouncer:**
  * Requests: CPU `350m`, Memoria `384Mi`
  * Limits: CPU `1500m`, Memoria `1.5Gi`
* **Redis Standalone (Persistente):**
  * Requests: CPU `100m`, Memoria `128Mi`
  * Limits: CPU `500m`, Memoria `512Mi`
* **CronJob DR Backup (Ejecución efímera nocturna):**
  * Requests: CPU `50m`, Memoria `128Mi`
  * Limits: CPU `300m`, Memoria `384Mi`

---

## 3. Matriz de Coexistencia en Carga Máxima (Escenario Pico HPA)

| Componente | Réplicas Pico | Requests CPU | Requests RAM | Limits CPU | Limits RAM |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `pokemon-api` | 10 | 2500m (2.5 CPU) | 2560Mi (2.5Gi) | 10000m (10 CPU) | 10240Mi (10Gi) |
| `pokemon-web` | 2 | 200m (0.2 CPU) | 128Mi (0.125Gi) | 1000m (1 CPU) | 512Mi (0.5Gi) |
| `postgresql` + `pgbouncer` | 2 | 350m (0.35 CPU) | 384Mi (0.375Gi) | 1500m (1.5 CPU) | 1536Mi (1.5Gi) |
| `redis` | 1 | 100m (0.1 CPU) | 128Mi (0.125Gi) | 500m (0.5 CPU) | 512Mi (0.5Gi) |
| `dr-backup` (efímero) | 1 | 50m (0.05 CPU) | 128Mi (0.125Gi) | 300m (0.3 CPU) | 384Mi (0.375Gi) |
| **TOTAL CONSUMO PICO** | **16 pods** | **3200m (3.2 CPU)** | **3328Mi (3.25Gi)** | **13300m (13.3 CPU)** | **13184Mi (12.87Gi)** |
| **CUOTA MÁXIMA (`ResourceQuota`)** | **50 pods** | **8000m (8.0 CPU)** | **8192Mi (8.0Gi)** | **16000m (16.0 CPU)** | **16384Mi (16.0Gi)** |
| **Margen de Seguridad Libre** | **+34 pods (68%)** | **+4.8 CPU (60%)** | **+4.75Gi (59%)** | **+2.7 CPU (17%)** | **+3.13Gi (19%)** |

---

## 4. Conclusión de Capacidad

1. **Garantía Anti-Evicción:** En el escenario más extremo de saturación de tráfico donde el HPA escale la API al 100% de su capacidad (`10 réplicas`), el namespace consumirá **13.3 CPUs de límite** y **12.87Gi de memoria límite**, quedando holgadamente por debajo del techo asignado de **16 CPUs y 16Gi** (margen libre $>17\%$).
2. **Compatibilidad con Admission Controller:** Ningún pod del clúster será rechazado por el Admission Controller de Kubernetes por exceder las cuotas del namespace durante eventos de escalado rápido.
