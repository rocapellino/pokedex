#!/usr/bin/env bash
# ==============================================================================
# Script de Despliegue Automatizado en Kubernetes (Bash)
# ==============================================================================
set -euo pipefail

echo "🚀 Iniciando despliegue de Pokémon App en Kubernetes..."

# 1. Aplicar manifiestos con Kustomize
echo "☸️ Aplicando manifiestos declarativos en el clúster..."
kubectl apply -k infra/k8s/

# 2. Esperar estado de recursos
echo "⏳ Esperando inicialización de PostgreSQL StatefulSet..."
kubectl rollout status statefulset/postgres -n pokemon-app --timeout=120s

echo "⏳ Esperando despliegue de servicios Web y API..."
kubectl rollout status deployment/pokemon-api -n pokemon-app --timeout=120s
kubectl rollout status deployment/pokemon-web -n pokemon-app --timeout=120s

# 3. Mostrar estado
echo "📊 Estado de los Recursos en el Namespace 'pokemon-app':"
kubectl get pods,svc,hpa,ingress -n pokemon-app

echo "🎉 Despliegue finalizado con éxito!"
echo "💡 Para monitorear el autoescalado en tiempo real ejecuta:"
echo "   kubectl get hpa -n pokemon-app -w"
