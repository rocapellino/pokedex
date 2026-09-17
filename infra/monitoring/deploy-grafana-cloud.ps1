# ==============================================================================
# Script de Despliegue Automatizado e Idempotente para Grafana Cloud en Kubernetes
# ==============================================================================
[CmdletBinding()]
param (
    [string]$Namespace = "monitoring",
    [string]$ReleaseName = "grafana-cloud",
    [string]$ValuesFile = "$PSScriptRoot/grafana-cloud-values.yaml",
    [string]$Username = "1832819",
    [string]$RemoteConfigUrl = "https://fleet-management-prod-015.grafana.net",
    [string]$ChartVersion = "2.0.12",
    [string]$Token = $env:GRAFANA_CLOUD_TOKEN
)

$ErrorActionPreference = "Stop"

Write-Host "📊 [Grafana Cloud] Iniciando aprovisionamiento de k8s-monitoring..." -ForegroundColor Cyan

# 1. Validar Token (debe provenir de $env:GRAFANA_CLOUD_TOKEN o parámetro -Token)
if (-not $Token) {
    Write-Error "❌ No se encontró el token de Grafana Cloud. Configure la variable `$env:GRAFANA_CLOUD_TOKEN o pase el parámetro -Token."
}

# 2. Obtener nombre seguro del clúster actual
$clusterName = "pokedex-k8s-cluster"
try {
    $currentContext = (kubectl config current-context 2>$null)
    if ($currentContext) {
        $clusterName = ($currentContext.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
        if ($clusterName.Length -gt 63) {
            $clusterName = $clusterName.Substring(0, 63).TrimEnd('-')
        }
    }
} catch {
    Write-Warning "⚠️ No se pudo determinar el contexto actual de kubectl. Usando nombre por defecto: $clusterName"
}

Write-Host "☸️ Clúster destino: $clusterName (Namespace: $Namespace)" -ForegroundColor Green

# 3. Añadir o actualizar el repositorio de Helm oficial de Grafana
Write-Host "📦 Actualizando repositorio Helm de Grafana..." -ForegroundColor Cyan
helm repo add grafana https://grafana.github.io/helm-charts --force-update 2>$null
helm repo update grafana

# 4. Desplegar o actualizar k8s-monitoring
# Mitigación de seguridad: El token se pasa mediante --set-file desde un archivo temporal efímero
# para evitar exponer credenciales en la tabla de procesos del sistema operativo (Get-Process / ps aux / auditd)
$tempTokenFile = [System.IO.Path]::GetTempFileName()
try {
    [System.IO.File]::WriteAllText($tempTokenFile, $Token.Trim())
    Write-Host "🚀 Ejecutando helm upgrade --install $ReleaseName (Chart: grafana/k8s-monitoring:$ChartVersion)..." -ForegroundColor Cyan
    helm upgrade --install $ReleaseName grafana/k8s-monitoring `
        --version $ChartVersion `
        --namespace $Namespace --create-namespace `
        --values $ValuesFile `
        --set "cluster.name=$clusterName" `
        --set "collectorCommon.alloy.remoteConfig.enabled=true" `
        --set-string "collectorCommon.alloy.remoteConfig.url=$RemoteConfigUrl" `
        --set-string "collectorCommon.alloy.remoteConfig.auth.username=$Username" `
        --set-file "collectorCommon.alloy.remoteConfig.auth.password=$tempTokenFile"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ [Grafana Cloud] k8s-monitoring instalado exitosamente." -ForegroundColor Green
        Write-Host "🔍 Verifique los pods con: kubectl get pods -n $Namespace" -ForegroundColor Cyan
    } else {
        Write-Error "❌ Error al ejecutar helm upgrade."
    }
} finally {
    if (Test-Path $tempTokenFile) {
        Remove-Item -Path $tempTokenFile -Force -ErrorAction SilentlyContinue
    }
}
