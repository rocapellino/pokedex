# 📖 Guía Operativa: Autoescalado (HPA), Persistencia y Balanceo en Kubernetes

Este runbook detalla el procedimiento paso a paso para desplegar, probar el autoescalado horizontal (**HPA**), verificar la consistencia de datos en la base de datos única y validar el comportamiento de los balanceadores y proxies.

---

## 📑 Contenidos
1. [Requisitos Previos](#1-requisitos-previos)
2. [Despliegue de la Infraestructura en Kubernetes](#2-despliegue-de-la-infraestructura-en-kubernetes)
3. [Siembra y Verificación de la Base de Datos Centralizada](#3-siembra-y-verificación-de-la-base-de-datos-centralizada)
4. [Prueba de Carga y Simulación de Autoescalado HPA](#4-prueba-de-carga-y-simulación-de-autoescalado-hpa)
5. [Monitoreo y Diagnóstico en Tiempo Real](#5-monitoreo-y-diagnóstico-en-tiempo-real)
6. [Resolución de Problemas Comunes](#6-resolución-de-problemas-comunes)

---

## 1. Requisitos Previos

* Clúster de Kubernetes activo (**Minikube**, **Kind**, **Docker Desktop K8s**, **EKS**, **GKE** o **AKS**).
* `kubectl` configurado apuntando al clúster.
* **Metrics Server** instalado en el clúster (indispensable para que el HPA obtenga métricas de CPU y Memoria):
  ```bash
  # En Minikube:
  minikube addons enable metrics-server

  # En Kubernetes estándar / Kind:
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  ```

---

## 2. Despliegue de la Infraestructura en Kubernetes

### Opción A: Despliegue con Script Automatizado
* **PowerShell (Windows):**
  ```powershell
  .\scripts\k8s_deploy.ps1 -BuildImages -SeedDatabase
  ```
* **Bash (Linux/Mac):**
  ```bash
  chmod +x scripts/k8s_deploy.sh
  ./scripts/k8s_deploy.sh
  ```

### Opción B: Despliegue Manual con Kustomize
```bash
# 1. Aplicar todos los manifiestos
kubectl apply -k infra/k8s/

# 2. Verificar que los pods estén en estado Running
kubectl get pods -n pokemon-app -w
```

---

## 3. Siembra y Verificación de la Base de Datos Centralizada

Todos los pods de la API y de la Web consultan la misma base de datos PostgreSQL respaldada por un `PersistentVolumeClaim`.

Para ejecutar la siembra de los **1.025 Pokémon**:
```bash
kubectl apply -f infra/k8s/08-db-seed-job.yaml

# Seguir los logs del Job
kubectl logs -n pokemon-app job/pokemon-db-seed-job -f
```

---

## 4. Prueba de Carga y Simulación de Autoescalado HPA

El HPA de la Web (`pokemon-web-hpa`) y de la API (`pokemon-api-hpa`) están configurados para escalar cuando la CPU supere el **70%** o la memoria el **80%**.

### Paso 1: Abrir Terminales de Monitoreo
**Terminal 1 (Monitoreo de HPA):**
```bash
kubectl get hpa -n pokemon-app -w
```

**Terminal 2 (Monitoreo de Pods escalando):**
```bash
kubectl get pods -n pokemon-app -l app=pokemon-web -w
```

### Paso 2: Ejecutar la Carga Concurrente
Ejecuta el script de estrés:
```bash
python scripts/k8s_load_test.py --url http://localhost:8080/api/pokemons --concurrency 50 --total-requests 4000
```

### Paso 3: Observación del Comportamiento
1. **Scale-Up:** Las métricas de CPU subirán de `5%/70%` a `120%/70%`. En 15 segundos, el HPA aumentará las réplicas de 2 a 5 o más pods automáticamente.
2. **Distribución:** El `Service` de Kubernetes balanceará las solicitudes entre todos los nuevos pods activos.
3. **Scale-Down:** Al terminar la prueba de carga y pasar la ventana de estabilización (300 segundos / 5 minutos), el HPA reducirá gradualmente las réplicas de regreso a 2.

---

## 5. Monitoreo y Diagnóstico en Tiempo Real

```bash
# Ver uso real de CPU y memoria por Pod
kubectl top pods -n pokemon-app

# Ver eventos del HPA
kubectl describe hpa pokemon-web-hpa -n pokemon-app

# Inspeccionar logs de un pod específico
kubectl logs -n pokemon-app -l app=pokemon-api --tail=50 -f
```

---

## 6. Resolución de Problemas Comunes

| Síntoma | Causa Probable | Solución |
| :--- | :--- | :--- |
| `TARGETS: <unknown>/70%` en HPA | Metrics Server no está instalado o los pods no tienen `resources.requests` | Verificar `kubectl top pods` y asegurar que `requests.cpu` y `requests.memory` estén en el Deployment. |
| Pods en `Pending` | Falta de recursos en los nodos del clúster | Aumentar memoria/CPU asignada a Docker Desktop / Minikube. |
| Inconsistencia de datos | Pods apuntando a bases locales en vez del servicio | Verificar que `DATABASE_URL` apunte a `postgres-service:5432` en el ConfigMap. |
