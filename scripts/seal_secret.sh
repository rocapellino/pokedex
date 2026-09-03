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

cat <<EOF | kubeseal --controller-namespace kube-system --controller-name sealed-secrets-controller --format yaml > "$OUTPUT_FILE"
apiVersion: v1
kind: Secret
metadata:
  name: $SECRET_NAME
  namespace: $NAMESPACE
type: Opaque
stringData:
  POSTGRES_USER: "postgres"
  POSTGRES_PASSWORD: "postgres_secure_password_k8s"
  MINIO_ROOT_USER: "minioadmin"
  MINIO_ROOT_PASSWORD: "minioadmin_secure_password"
EOF

echo "✅ Secreto sellado exitosamente guardado en: $OUTPUT_FILE"
echo "💡 Este archivo SealedSecret es seguro para comitear en Git (GitOps)."
