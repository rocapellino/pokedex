# ==============================================================================
# ETAPA 1: Builder (Compilación e instalación de dependencias en prefijo aislado)
# ==============================================================================
FROM python:3.13-slim AS builder

# Configurar variables de entorno para pip y optimización de Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Instalar dependencias del sistema requeridas para compilar extensiones C (PostgreSQL libpq)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Copiar manifiesto de dependencias primero para aprovechar la caché de capas
COPY requirements.txt .

# Instalar dependencias en /install
RUN pip install --prefix=/install --no-warn-script-location -r requirements.txt

# ==============================================================================
# ETAPA 2: Runner (Imagen final ligera y segura para producción)
# ==============================================================================
FROM python:3.13-slim AS runner

# Metadatos del contenedor
LABEL maintainer="Grupo 3 - UTEC DevOps" \
      version="1.1.0" \
      description="API REST Pokémon FastAPI Containerizada con mejores prácticas"

# Variables de entorno de runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000 \
    PYTHONPATH=/app \
    HOME=/home/appuser \
    ENVIRONMENT=production

WORKDIR /app

# Instalar runtime nativo libpq5 y certificados raíz
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Crear usuario y grupo sin privilegios con directorio home asignado
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup --home /home/appuser --shell /bin/false appuser

# Copiar dependencias instaladas desde la etapa builder
COPY --from=builder /install /usr/local

# Copiar el código de la aplicación
COPY --chown=appuser:appgroup app.py .
COPY --chown=appuser:appgroup apps/ ./apps/

# Monitoreo de salud del contenedor
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/healthz')" || exit 1

# Exponer el puerto de la aplicación
EXPOSE 5000

# Cambiar a usuario no-root
USER appuser

# Comando de inicio usando servidor ASGI de alto rendimiento Uvicorn
CMD ["uvicorn", "apps.api.src.app:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "4", "--access-log"]
