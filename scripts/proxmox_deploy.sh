#!/usr/bin/env bash
# ==============================================================================
# Script de Despliegue Automatizado en Proxmox VE (Bash / CI/CD)
# ==============================================================================
set -e

# Priorizar variables de entorno para evitar fuga de credenciales en /proc y ps aux
PROXMOX_HOST="${PROXMOX_HOST:-${1:-192.168.1.100}}"
PROXMOX_USER="${PROXMOX_USER:-${2:-root}}"
USER="$PROXMOX_USER"
PROXMOX_PORT="${PROXMOX_PORT:-${3:-22}}"
PORT="$PROXMOX_PORT"
REMOTE_DIR="${PROXMOX_REMOTE_DIR:-/opt/pokedex}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXCLUDES_FILE="${SCRIPT_DIR}/deploy_excludes.txt"

# Archivo temporal con permisos estrictos de lectura (umask 077) para mitigar accesos locales concurrentes
DEPLOY_ARCHIVE="/tmp/pokedex_deploy_$$.tar.gz"
trap 'rm -f "$DEPLOY_ARCHIVE"' EXIT INT TERM

echo "============================================================"
echo "🚀 Iniciando Despliegue de Pokédex en Proxmox VE: $PROXMOX_HOST"
echo "============================================================"

# 1. Crear directorio remoto
echo "📁 1. Preparando directorio en $PROXMOX_HOST:$REMOTE_DIR..."
ssh -p "$PORT" "$USER@$PROXMOX_HOST" "mkdir -p $REMOTE_DIR"

# 2. Empaquetar y transferir archivos excluyendo estrictamente secretos locales
echo "📦 2. Empaquetando y transfiriendo archivos del repositorio..."
TAR_OPTS=()
if [[ -f "$EXCLUDES_FILE" ]]; then
    TAR_OPTS+=("--exclude-from=$EXCLUDES_FILE")
fi
# Exclusiones explícitas de seguridad mandatarias
TAR_OPTS+=(
    "--exclude=.git"
    "--exclude=.env"
    "--exclude=.env.*"
    "--exclude=.venv"
    "--exclude=__pycache__"
    "--exclude=node_modules"
    "--exclude=.ruff_cache"
)

# Garantizar permisos estrictos 600 en el archivo empaquetado
(
  umask 077
  tar "${TAR_OPTS[@]}" -czf "$DEPLOY_ARCHIVE" .
)

scp -P "$PORT" "$DEPLOY_ARCHIVE" "$USER@$PROXMOX_HOST:$REMOTE_DIR/pokedex_deploy.tar.gz"
rm -f "$DEPLOY_ARCHIVE"

# 3. Desempaquetar, configurar entorno seguro y levantar contenedores
echo "🐳 3. Compilando y levantando contenedores con Docker Compose..."
ssh -p "$PORT" "$USER@$PROXMOX_HOST" << 'EOF'
set -e
cd /opt/pokedex
tar -xzf pokedex_deploy.tar.gz
rm -f pokedex_deploy.tar.gz

if ! command -v docker &> /dev/null; then
    echo "Instalando Docker Engine..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

# Inicializar .env en el host remoto si no existe (previene fallos de variables obligatorias)
if [[ ! -f /opt/pokedex/.env ]]; then
    echo "⚙️ Inicializando /opt/pokedex/.env con credenciales seguras autogeneradas..."
    cp /opt/pokedex/.env.example /opt/pokedex/.env
    ADMIN_SECRET=$(openssl rand -hex 32)
    PG_PASS=$(openssl rand -hex 16)
    REDIS_PASS=$(openssl rand -hex 16)
    ADMIN_KEY=$(openssl rand -hex 24)
    sed -i "s/ADMIN_SESSION_SECRET=.*/ADMIN_SESSION_SECRET=${ADMIN_SECRET}/" /opt/pokedex/.env
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${PG_PASS}/" /opt/pokedex/.env
    sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=${REDIS_PASS}/" /opt/pokedex/.env
    sed -i "s/ADMIN_API_KEY=.*/ADMIN_API_KEY=${ADMIN_KEY}/" /opt/pokedex/.env
    chmod 600 /opt/pokedex/.env
fi

echo "Iniciando stack de producción..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans

sleep 4
curl -fsSL http://localhost:8080/healthz || true
EOF

PROTO="${PROXMOX_PROTOCOL:-https}"
echo "============================================================"
echo "🎉 Despliegue en Proxmox finalizado!"
echo "🌐 Web: ${PROTO}://$PROXMOX_HOST:8080/"
echo "🔌 Healthz: ${PROTO}://$PROXMOX_HOST:8080/healthz"
echo "============================================================"
