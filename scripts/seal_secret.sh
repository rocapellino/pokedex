#!/usr/bin/env bash
# ==============================================================================
# Script para Sellar Secretos con Bitnami Sealed Secrets (Bash / Multiplataforma)
# ==============================================================================
set -euo pipefail

SECRET_NAME="${1:-pokemon-secrets}"
NAMESPACE="${2:-pokemon-app}"
OUTPUT_FILE="${3:-infra/k8s/01-sealed-secrets.yaml}"

echo "🔐 Generando Secret temporal y sellando con Sealed Secrets..."

if ! command -v kubeseal &> /dev/null; then
  echo "⚠️ 'kubeseal' no está en el PATH del sistema."
  echo "   Instálalo desde: https://github.com/bitnami-labs/sealed-secrets/releases"
  exit 1
fi

# Generar valores seguros o utilizar variables de entorno
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9')}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9')}"
ADMIN_API_KEY="${ADMIN_API_KEY:-$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9')}"
AI_API_KEY="${AI_API_KEY:-$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9')}"

cat <<EOF | kubeseal --controller-namespace kube-system --controller-name sealed-secrets-controller --format yaml > "$OUTPUT_FILE"
apiVersion: v1
kind: Secret
metadata:
  name: $SECRET_NAME
  namespace: $NAMESPACE
type: Opaque
stringData:
  POSTGRES_USER: "$POSTGRES_USER"
  POSTGRES_PASSWORD: "$POSTGRES_PASSWORD"
  MINIO_ROOT_USER: "$MINIO_ROOT_USER"
  MINIO_ROOT_PASSWORD: "$MINIO_ROOT_PASSWORD"
  ADMIN_API_KEY: "$ADMIN_API_KEY"
  AI_API_KEY: "$AI_API_KEY"
EOF

echo "✅ Secreto sellado exitosamente guardado en: $OUTPUT_FILE"
echo "💡 Este archivo SealedSecret es seguro para comitear en Git (GitOps)."
