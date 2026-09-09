# 🧪 Guía Operativa: Pruebas de Estrés y Validación de Autoescalado (HPA)

Este documento detalla el procedimiento de ejecución, análisis y validación de pruebas de estrés y carga masiva concurrente sobre la plataforma **Pokémon API** desplegada en **Kubernetes**.

---

## 📑 Tabla de Contenidos
1. [Objetivo de la Prueba](#1-objetivo-de-la-prueba)
2. [Herramienta de Carga (`tests/performance/k6_stress_test.js`)](#2-herramienta-de-carga-testsperformancek6_stress_testjs)
3. [Procedimiento de Ejecución Paso a Paso](#3-procedimiento-de-ejecución-paso-a-paso)
4. [Métricas Clave y Umbrales de Autoescalado](#4-métricas-clave-y-umbrales-de-autoescalado)
5. [Resultados Obtenidos y Benchmark de Rendimiento](#5-resultados-obtenidos-y-benchmark-de-rendimiento)
6. [Diagnóstico y Solución de Cuellos de Botella](#6-diagnóstico-y-solución-de-cuellos-de-botella)

---

## 1. Objetivo de la Prueba

* **Validar la elasticidad horizontal:** Comprobar que el **Horizontal Pod Autoscaler (HPA)** detecte automáticamente el aumento de consumo de CPU/Memoria y cree nuevos pods para distribuir la carga.
* **Garantizar la consistencia transaccional:** Asegurar que múltiples pods de backend operando concurrentemente contra **PostgreSQL** y **Redis** no generen bloqueos (*deadlocks*), saturación de conexiones (`max_connections`) ni corrupción de datos.
* **Medir rendimiento bajo estrés:** Identificar latencia promedio, tasa de peticiones por segundo (**RPS**) y tasa de error (**0% errores** esperado).

---

## 2. Herramienta de Carga (`tests/performance/k6_stress_test.js`)

El proyecto utiliza **k6** (Grafana k6) para ejecutar pruebas de estrés declarativas y reproducibles contra los endpoints del backend y frontend.

### Ejecución estándar:
```powershell
task perf
```

O invocando directamente el motor k6:
```powershell
k6 run tests/performance/k6_stress_test.js
```

---

## 3. Procedimiento de Ejecución Paso a Paso

### Paso 1: Disponer de Terminales de Monitoreo
Abre dos terminales adicionales para observar la reacción de Kubernetes en tiempo real:

* **Terminal A (Monitoreo de HPA en vivo):**
  ```powershell
  kubectl get hpa -n pokemon-app -w
  ```
* **Terminal B (Monitoreo de Pods escalando en vivo):**
  ```powershell
  kubectl get pods -n pokemon-app -w
  ```

---

### Paso 2: Lanzar la Prueba de Estrés
Ejecuta la prueba desde la terminal principal:

```powershell
task perf
```

---

## 4. Métricas Clave y Umbrales de Autoescalado

| Recurso | Métrica Monitoreada | Umbral Objetivo (Target) | Comportamiento del HPA |
| :--- | :--- | :--- | :--- |
| **`pokemon-api`** | CPU | **75%** de los Requests | Si CPU > 75%, escala hasta 15 réplicas. |
| **`pokemon-api`** | Memoria | **80%** de los Requests | Si RAM > 80%, escala preventivamente. |
| **`pokemon-web`** | CPU | **70%** de los Requests | Si CPU > 70%, escala hasta 10 réplicas. |
| **`pokemon-web`** | Memoria | **80%** de los Requests | Si RAM > 80%, escala preventivamente. |

---

## 5. Resultados Obtenidos y Benchmark de Rendimiento

En la validación oficial realizada sobre el clúster local, se obtuvieron los siguientes resultados:

### Benchmark de Carga:
```text
======================================================================
[+] RESULTADOS DE LA PRUEBA DE CARGA
[OK] Total Peticiones Exitosas (200 OK): 3.000 / 3.000 (100% éxito)
[ERR] Total Peticiones Fallidas:          0 (0.0% tasa de error)
[TIME] Tiempo Total Transcurrido:          57.11s
[PERF] Rendimiento Promedio:                52.5 req/s
[LAT] Latencia Promedio:                   1120.63 ms
======================================================================
```

### Reacción de Kubernetes (Autoescalado en Vivo):
* **`pokemon-api`:** Creció dinámicamente de **2 pods** a **8 pods** al alcanzar 145% de CPU.
* **`pokemon-web`:** Creció dinámicamente de **2 pods** a **6 pods** al alcanzar 80% de CPU.
* **Persistencia:** Todos los pods canalizaron sus transacciones mediante **PgBouncer**, manteniendo la base de datos PostgreSQL estable y sin saturación.

---

## 6. Diagnóstico y Solución de Cuellos de Botella

| Problema Potencial | Causa Raíz | Solución Implementada |
| :--- | :--- | :--- |
| **Error `too many connections` en DB** | Cada pod abre múltiples conexiones directas a PostgreSQL | Implementación de **PgBouncer** como capa intermedia de pooling de conexiones. |
| **HPA muestra `<unknown>/75%`** | Falta de `metrics-server` o falta de `requests` definidos en el pod | Despliegue de `metrics-server` y especificación de `resources.requests` en los manifiestos. |
| **Flapping / Oscilación rápida de réplicas** | HPA reduce réplicas inmediatamente al bajar un pico momentáneo | Configuración de ventana de estabilización (`scaleDown.stabilizationWindowSeconds: 300`). |
