<#
.SYNOPSIS
    Script de Despliegue Automatizado en Proxmox VE (LXC Container o VM).

.DESCRIPTION
    Permite desplegar la plataforma Pokédex en un contenedor LXC o VM de Proxmox VE vía SSH o comandos pct/docker.

.PARAMETER ProxmoxHost
    IP o Hostname del servidor Proxmox VE o del contenedor LXC de destino.

.PARAMETER User
    Usuario SSH (por defecto: root).

.PARAMETER Port
    Puerto SSH (por defecto: 22).

.EXAMPLE
    .\scripts\proxmox_deploy.ps1 -ProxmoxHost 192.168.1.150 -User root
#>

param (
    [Parameter(Mandatory = $true)]
    [string]$ProxmoxHost,

    [string]$User = "root",
    [int]$Port = 22,
    [string]$RemoteDir = "/opt/pokedex"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 Iniciando Despliegue de Pokédex en Proxmox VE: $ProxmoxHost" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Comprobar conectividad SSH
Write-Host "`n📡 1. Verificando conectividad SSH con $User@$ProxmoxHost..." -ForegroundColor Yellow
$testSSH = ssh -o BatchMode=yes -o ConnectTimeout=5 -p $Port "$User@$ProxmoxHost" "echo 'SSH_OK'" 2>$null

if ($testSSH -ne "SSH_OK") {
    Write-Host "⚠️ No se pudo establecer conexión SSH sin contraseña o la clave no está configurada." -ForegroundColor Yellow
    Write-Host "Intentando conexión interactiva estándar..." -ForegroundColor Gray
}

# 2. Crear directorio remoto
Write-Host "`n📁 2. Preparando directorio remoto en $RemoteDir..." -ForegroundColor Yellow
ssh -p $Port "$User@$ProxmoxHost" "mkdir -p $RemoteDir"

# 3. Sincronizar archivos esenciales del proyecto (excluyendo entornos locales y artefactos temporales)
Write-Host "`n📦 3. Sincronizando código fuente a Proxmox..." -ForegroundColor Yellow
$tarArchive = "pokedex_deploy.tar.gz"

tar --exclude='.git' --exclude='.venv' --exclude='__pycache__' --exclude='node_modules' --exclude='.ruff_cache' -czf $tarArchive .
scp -P $Port $tarArchive "$User@$ProxmoxHost:$RemoteDir/$tarArchive"
Remove-Item $tarArchive -Force -ErrorAction SilentlyContinue

# 4. Desempaquetar y levantar contenedores en Proxmox
Write-Host "`n🐳 4. Extrayendo archivos y levantando Docker Compose en modo Producción..." -ForegroundColor Yellow
$remoteCommands = @"
cd $RemoteDir
tar -xzf $tarArchive
rm -f $tarArchive

# Verificar Docker
if ! command -v docker &> /dev/null; then
    echo 'Instalando Docker Engine en Proxmox...'
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

# Levantar microservicios
echo 'Iniciando contenedores de produccion...'
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans

echo 'Esperando a que la API este saludable...'
sleep 5
curl -s http://localhost:8080/healthz || echo 'Health check pendiente'
"@

ssh -p $Port "$User@$ProxmoxHost" $remoteCommands

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "🎉 Despliegue en Proxmox Completado con Éxito!" -ForegroundColor Green
Write-Host "🌐 Acceso Web: http://$ProxmoxHost:8080/" -ForegroundColor Green
Write-Host "🔌 Swagger Docs: http://$ProxmoxHost:8080/docs" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
