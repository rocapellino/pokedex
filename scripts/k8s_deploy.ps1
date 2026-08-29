# ==============================================================================
# Script de Despliegue Automatizado en Kubernetes (PowerShell)
# ==============================================================================
param (
    [switch]$BuildImages,
    [switch]$SeedDatabase
)

$ErrorActionPreference = "Stop"

Write-Host ">>> Iniciando despliegue de Pokemon App en Kubernetes..." -ForegroundColor Cyan

# 0. Verificar conectividad con el cluster de Kubernetes
Write-Host ">>> Verificando conexion con el cluster de Kubernetes..." -ForegroundColor Yellow
try {
    $clusterInfo = kubectl cluster-info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw $clusterInfo
    }
    Write-Host "[OK] Cluster Kubernetes detectado y conectado." -ForegroundColor Green
} catch {
    Write-Host "[ERROR] No se puede conectar a ningun cluster de Kubernetes activo." -ForegroundColor Red
    Write-Host "Para solucionarlo en Docker Desktop:" -ForegroundColor Yellow
    Write-Host "   1. Abre Docker Desktop -> Settings -> Kubernetes."
    Write-Host "   2. Marca la casilla 'Enable Kubernetes' y haz clic en 'Apply & restart'."
    exit 1
}

# 1. Construccion de imagenes locales si se solicita
if ($BuildImages) {
    Write-Host ">>> Construyendo imagenes Docker locales..." -ForegroundColor Yellow
    docker build -t pokemon-api:latest -f apps/api/Dockerfile .
    docker build -t pokemon-web:latest -f apps/web/Dockerfile .
    Write-Host "[OK] Imagenes construidas exitosamente." -ForegroundColor Green
}

# 2. Aplicar manifiestos con Kustomize
Write-Host ">>> Aplicando manifiestos declarativos en el cluster..." -ForegroundColor Yellow
kubectl apply -k infra/k8s/

# 3. Esperar a que la base de datos este lista
Write-Host ">>> Esperando inicializacion de PostgreSQL StatefulSet..." -ForegroundColor Yellow
kubectl rollout status statefulset/postgres -n pokemon-app --timeout=120s

# 4. Esperar a que la API y Web esten listos
Write-Host ">>> Esperando despliegue de servicios Web y API..." -ForegroundColor Yellow
kubectl rollout status deployment/pokemon-api -n pokemon-app --timeout=120s
kubectl rollout status deployment/pokemon-web -n pokemon-app --timeout=120s

# 5. Ejecutar Job de Siembra si se solicita
if ($SeedDatabase) {
    Write-Host ">>> Ejecutando Job de siembra de Pokemon (1025 registros)..." -ForegroundColor Yellow
    kubectl delete job pokemon-db-seed-job -n pokemon-app --ignore-not-found
    kubectl apply -f infra/k8s/08-db-seed-job.yaml
    kubectl wait --for=condition=complete --timeout=300s job/pokemon-db-seed-job -n pokemon-app
    Write-Host "[OK] Siembra de base de datos completada." -ForegroundColor Green
}

# 6. Mostrar estado de los recursos y HPA
Write-Host "`n>>> Estado de los Recursos en el Namespace 'pokemon-app':" -ForegroundColor Cyan
kubectl get pods,svc,hpa,ingress -n pokemon-app

Write-Host "`n[OK] Despliegue finalizado con exito!" -ForegroundColor Green
Write-Host "Para monitorear el autoescalado en tiempo real ejecuta:" -ForegroundColor Yellow
Write-Host "   kubectl get hpa -n pokemon-app -w" -ForegroundColor Magenta
