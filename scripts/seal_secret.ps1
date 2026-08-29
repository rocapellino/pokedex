param(
    [string]$SecretName = "pokemon-secrets",
    [string]$Namespace = "pokemon-app",
    [string]$OutputFile = "infra/k8s/01-sealed-secrets.yaml"
)

$ErrorActionPreference = "Stop"
$toolsDir = Join-Path $PSScriptRoot "..\.tools"
$kubesealPath = Join-Path $toolsDir "kubeseal.exe"

# 1. Asegurar que kubeseal esté disponible
if (-not (Test-Path $kubesealPath)) {
    Write-Host "Descargando CLI de kubeseal v0.27.3..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    $kubesealUrl = "https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.3/kubeseal-0.27.3-windows-amd64.tar.gz"
    $tarPath = Join-Path $toolsDir "kubeseal.tar.gz"
    
    Invoke-WebRequest -Uri $kubesealUrl -OutFile $tarPath
    tar -xzf $tarPath -C $toolsDir
    Remove-Item $tarPath -Force
    Write-Host "kubeseal instalado en $kubesealPath" -ForegroundColor Green
}

# 2. Generar Secret temporal en memoria
Write-Host "Generando Secret temporal y sellando con clave publica del cluster..." -ForegroundColor Cyan

$tempSecretYaml = @"
apiVersion: v1
kind: Secret
metadata:
  name: $SecretName
  namespace: $Namespace
type: Opaque
stringData:
  POSTGRES_USER: "postgres"
  POSTGRES_PASSWORD: "postgres_secure_password_k8s"
  MINIO_ROOT_USER: "minioadmin"
  MINIO_ROOT_PASSWORD: "minioadmin_secure_password"
"@

# 3. Sellar secreto con kubeseal
$sealedSecret = $tempSecretYaml | & $kubesealPath --controller-namespace kube-system --controller-name sealed-secrets-controller --format yaml

# 4. Guardar archivo
$sealedSecret | Out-File -FilePath $OutputFile -Encoding utf8
Write-Host "Secreto sellado exitosamente guardado en: $OutputFile" -ForegroundColor Green
Write-Host "Este archivo SealedSecret es seguro para comitear en Git (GitOps)." -ForegroundColor Yellow
