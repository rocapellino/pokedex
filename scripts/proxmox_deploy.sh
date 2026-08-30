#!/usr/bin/env bash
# ==============================================================================
# Script de Despliegue Automatizado en Proxmox VE (Bash / CI/CD)
# ==============================================================================
set -e

PROXMOX_HOST="${1:-192.168.1.100}"
USER="${2:-root}"
PORT="${3:-22}"
REMOTE_DIR="/opt/pokedex"

echo "============================================================"
echo "🚀 Iniciando Despliegue de Pokédex en Proxmox VE: $PROXMOX_HOST"
echo "============================================================"

# 1. Crear directorio remoto
echo "📁 1. Preparando directorio en $PROXMOX_HOST:$REMOTE_DIR..."
ssh -p "$PORT" "$USER@$PROXMOX_HOST" "mkdir -p $REMOTE_DIR"

# 2. Empaquetar y transferir archivos
echo "📦 2. Empaquetando y transfiriendo archivos del repositorio..."
tar --exclude='.git' \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='node_modules' \
    --exclude='.ruff_cache' \
    -czf /tmp/pokedex_deploy.tar.gz .

scp -P "$PORT" /tmp/pokedex_deploy.tar.gz "$USER@$PROXMOX_HOST:$REMOTE_DIR/pokedex_deploy.tar.gz"
rm -f /tmp/pokedex_deploy.tar.gz

# 3. Desempaquetar y levantar contenedores
echo "🐳 3. Compilando y levantando contenedores con Docker Compose..."
ssh -p "$PORT" "$USER@$PROXMOX_HOST" << 'EOF'
cd /opt/pokedex
tar -xzf pokedex_deploy.tar.gz
rm -f pokedex_deploy.tar.gz

if ! command -v docker &> /dev/null; then
    echo "Instalando Docker Engine..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

echo "Iniciando stack de producción..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans

sleep 4
curl -fsSL http://localhost:8080/healthz || true
EOF

echo "============================================================"
echo "🎉 Despliegue en Proxmox finalizado!"
echo "🌐 Web: http://$PROXMOX_HOST:8080/"
echo "🔌 Docs: http://$PROXMOX_HOST:8080/docs"
echo "============================================================"
