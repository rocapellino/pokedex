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

- **Autoescalado:** `minReplicas: 2`, `maxReplicas: 6`
- **Requests por Pod:** CPU `250m`, Memoria `256Mi`
- **Limits por Pod:** CPU `1000m` (1 CPU), Memoria `1Gi` (1024Mi)

### B. Capa Web Frontend (`pokemon-web`)

- **Autoescalado:** `minReplicas: 2`, `maxReplicas: 5`
- **Requests por Pod:** CPU `100m`, Memoria `128Mi`
- **Limits por Pod:** CPU `500m`, Memoria `512Mi`

### C. Servicios de Estado e Infraestructura del Namespace

- **PostgreSQL + PgBouncer (`postgres`: `500m`/`512Mi` req, `2000m`/`2Gi` lim; `pgbouncer`: `100m`/`128Mi` req, `500m`/`256Mi` lim):**
  - Requests combinados: CPU `600m`, Memoria `640Mi` (`0.625Gi`)
  - Limits combinados: CPU `2500m` (`2.5 CPU`), Memoria `2304Mi` (`2.25Gi`)
- **Redis Standalone (Persistente):**
  - Requests: CPU `250m`, Memoria `256Mi`
  - Limits: CPU `500m`, Memoria `512Mi`
- **CronJob DR Backup (Ejecución efímera nocturna):**
  - Requests: CPU `100m`, Memoria `128Mi`
  - Limits: CPU `500m`, Memoria `512Mi`

---

## 3. Matriz de Coexistencia en Carga Máxima (Escenario Pico HPA)

| Componente | Réplicas Pico | Requests CPU | Requests RAM | Limits CPU | Limits RAM |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `pokemon-api` | 6 | 1500m (1.5 CPU) | 1536Mi (1.5Gi) | 6000m (6.0 CPU) | 6144Mi (6.0Gi) |
| `pokemon-web` | 5 | 500m (0.5 CPU) | 640Mi (0.625Gi) | 2500m (2.5 CPU) | 2560Mi (2.5Gi) |
| `postgresql` + `pgbouncer` | 2 | 600m (0.6 CPU) | 640Mi (0.625Gi) | 2500m (2.5 CPU) | 2304Mi (2.25Gi) |
| `redis` | 1 | 250m (0.25 CPU) | 256Mi (0.25Gi) | 500m (0.5 CPU) | 512Mi (0.5Gi) |
| `dr-backup` (efímero) | 1 | 100m (0.1 CPU) | 128Mi (0.125Gi) | 500m (0.5 CPU) | 512Mi (0.5Gi) |
| **TOTAL CONSUMO PICO** | **15 pods** | **2950m (2.95 CPU)** | **3200Mi (3.125Gi)** | **12000m (12.0 CPU)** | **12032Mi (11.75Gi)** |
| **CUOTA MÁXIMA (`ResourceQuota`)** | **50 pods** | **8000m (8.0 CPU)** | **8192Mi (8.0Gi)** | **16000m (16.0 CPU)** | **16384Mi (16.0Gi)** |
| **Margen de Seguridad Libre** | **+35 pods (70%)** | **+5.05 CPU (63%)** | **+4.875Gi (61%)** | **+4.0 CPU (25%)** | **+4.25Gi (26.5%)** |

---

## 4. Conclusión de Capacidad

1. **Garantía Anti-Evicción:** En el escenario más extremo de saturación de tráfico donde el HPA escale tanto la API (`6 réplicas`) como el frontend Web (`5 réplicas`) al 100% de su capacidad simultáneamente, el namespace consumirá **12.0 CPUs de límite** y **11.75Gi de memoria límite**, quedando holgadamente por debajo del techo asignado de **16 CPUs y 16Gi** (margen libre $\ge 25\%$).
2. **Compatibilidad con Admission Controller:** Ningún pod del clúster será rechazado por el Admission Controller de Kubernetes por exceder las cuotas del namespace durante eventos de escalado rápido.
