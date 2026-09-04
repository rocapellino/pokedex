#!/usr/bin/env bash
# ==============================================================================
# Script de Despliegue Automatizado en Kubernetes (Bash / CI/CD / Multiplataforma)
# ==============================================================================
set -euo pipefail

BUILD_IMAGES=false
SEED_DATABASE=false

# Procesar argumentos
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build|-b)
      BUILD_IMAGES=true
      shift
      ;;
    --seed|-s)
      SEED_DATABASE=true
      shift
      ;;
    --help|-h)
      echo "Uso: $0 [--build|-b] [--seed|-s]"
      echo "  --build, -b  Construye imágenes Docker locales e invalida despliegues"
      echo "  --seed, -s   Ejecuta el Job de carga masiva de datos (1025 Pokémon)"
      exit 0
      ;;
    *)
      echo "Opción desconocida: $1"
      exit 1
      ;;
  esac
done

echo "============================================================"
echo "🚀 Iniciando despliegue de Pokémon App en Kubernetes..."
echo "============================================================"

# 0. Verificar conectividad con el clúster
echo "📡 Verificando conexión con el clúster de Kubernetes..."
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "❌ Error: No se puede conectar a ningún clúster de Kubernetes activo."
  echo "   Asegúrate de que Docker Desktop, Minikube o Kind estén activos."
  exit 1
fi
echo "✅ Clúster Kubernetes detectado y conectado."

# 1. Construcción de imágenes locales si se solicita
if [ "$BUILD_IMAGES" = true ]; then
  echo "🔨 Construyendo imágenes Docker locales..."
  docker build -t pokedex-server:latest -f Dockerfile .
  docker build -t pokedex-web:latest -f apps/web/Dockerfile .

  # Si estamos en Docker Desktop con containerd o Kind, importar imágenes
  NODE=$(docker ps --filter "name=desktop-control-plane" -q || true)
  if [ -n "$NODE" ]; then
    echo "📦 Importando imágenes al nodo Kubernetes (containerd)..."
    docker save pokedex-server:latest | docker exec -i desktop-control-plane ctr -n k8s.io images import - 2>/dev/null || true
    docker save pokedex-web:latest | docker exec -i desktop-control-plane ctr -n k8s.io images import - 2>/dev/null || true
  fi
  echo "✅ Imágenes construidas exitosamente."
fi

# 2. Aplicar recursos mediante Helm 3 Chart
echo "☸️ Desplegando plataforma con Helm 3 Chart (infra/helm/pokedex)..."
helm upgrade --install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --create-namespace

# Forzar reinicio de Pods si se reconstruyeron las imágenes
if [ "$BUILD_IMAGES" = true ]; then
  echo "🔄 Forzando recreación de Pods con las imágenes actualizadas..."
  kubectl rollout restart deployment/pokedex-api -n pokemon-app || true
  kubectl rollout restart deployment/pokedex-web -n pokemon-app || true
fi

# 3. Esperar estado de recursos
echo "⏳ Esperando inicialización de PostgreSQL StatefulSet..."
kubectl rollout status statefulset/pokedex-postgres -n pokemon-app --timeout=120s || true

echo "⏳ Esperando despliegue de servicios Web y API..."
kubectl rollout status deployment/pokedex-api -n pokemon-app --timeout=120s
kubectl rollout status deployment/pokedex-web -n pokemon-app --timeout=120s

# 4. Ejecutar Job de Siembra si se solicita
if [ "$SEED_DATABASE" = true ]; then
  echo "🌱 Ejecutando Job de verificación/siembra de catálogo..."
  kubectl delete job pokedex-db-seed -n pokemon-app --ignore-not-found
  helm template pokedex ./infra/helm/pokedex -s templates/seed-job.yaml | kubectl apply -n pokemon-app -f -
  kubectl wait --for=condition=complete --timeout=300s job/pokedex-db-seed -n pokemon-app || true
  echo "✅ Verificación de siembra completada."
fi

# 5. Mostrar estado final
echo "============================================================"
echo "📊 Estado de los Recursos en el Namespace 'pokemon-app':"
echo "============================================================"
kubectl get pods,svc,hpa,ingress -n pokemon-app

echo ""
echo "🎉 ¡Despliegue finalizado con éxito!"
echo "💡 Para monitorear el autoescalado en tiempo real ejecuta:"
echo "   kubectl get hpa -n pokemon-app -w"
