# ==============================================================================
# Script de Despliegue Automatizado en Kubernetes (PowerShell)
# ==============================================================================
param (
    [switch]$BuildImages,
    [switch]$SeedDatabase
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Iniciando despliegue de Pokémon App en Kubernetes..." -ForegroundColor Cyan

# 1. Construcción de imágenes locales si se solicita
if ($BuildImages) {
    Write-Host "📦 Construyendo imágenes Docker locales..." -ForegroundColor Yellow
    docker build -t pokemon-api:latest -f apps/api/Dockerfile .
    docker build -t pokemon-web:latest -f apps/web/Dockerfile .
    Write-Host "✅ Imágenes construidas exitosamente." -ForegroundColor Green
}

# 2. Aplicar manifiestos con Kustomize
Write-Host "☸️ Aplicando manifiestos declarativos en el clúster..." -ForegroundColor Yellow
kubectl apply -k infra/k8s/

# 3. Esperar a que la base de datos esté lista
Write-Host "⏳ Esperando inicialización de PostgreSQL StatefulSet..." -ForegroundColor Yellow
kubectl rollout status statefulset/postgres -n pokemon-app --timeout=120s

# 4. Esperar a que la API y Web estén listos
Write-Host "⏳ Esperando despliegue de servicios Web y API..." -ForegroundColor Yellow
kubectl rollout status deployment/pokemon-api -n pokemon-app --timeout=120s
kubectl rollout status deployment/pokemon-web -n pokemon-app --timeout=120s

# 5. Ejecutar Job de Siembra si se solicita
if ($SeedDatabase) {
    Write-Host "🌱 Ejecutando Job de siembra de Pokémon (1025 registros)..." -ForegroundColor Yellow
    kubectl apply -f infra/k8s/08-db-seed-job.yaml
    kubectl wait --for=condition=complete --timeout=180s job/pokemon-db-seed-job -n pokemon-app
    Write-Host "✅ Siembra de base de datos completada." -ForegroundColor Green
}

# 6. Mostrar estado de los recursos y HPA
Write-Host "`n📊 Estado de los Recursos en el Namespace 'pokemon-app':" -ForegroundColor Cyan
kubectl get pods,svc,hpa,ingress -n pokemon-app

Write-Host "`n🎉 Despliegue finalizado con éxito!" -ForegroundColor Green
Write-Host "💡 Para monitorear el autoescalado en tiempo real ejecuta:"
Write-Host "   kubectl get hpa -n pokemon-app -w" -ForegroundColor Magenta
