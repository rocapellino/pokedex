# ==============================================================================
# Dockerfile para Aplicación Web Frontend (Multi-Stage Build con Vite y Nginx)
# ==============================================================================
FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS builder

WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
RUN npm ci --ignore-scripts

COPY apps/frontend ./apps/frontend
RUN npm run build --workspace=@pokedex/frontend

# ==============================================================================
# Etapa de Ejecución (Nginx Alpine Ligero y Seguro)
# ==============================================================================
FROM nginx:1.31-alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3 AS runner

LABEL maintainer="Grupo 3 - UTEC DevOps" \
      version="1.0.0" \
      description="Frontend Web Pokédex servido con Nginx y Proxy Inverso a la API"

# Actualizar paquetes base de Alpine e instalar utilidades requeridas en una sola capa
# hadolint ignore=DL3018
RUN apk upgrade --no-cache && \
    apk add --no-cache gettext && \
    rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copiar la plantilla de configuración de Nginx (IPs configurables por variable de entorno)
COPY apps/frontend/nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copiar build optimizado del frontend generado por Vite
COPY --from=builder /app/apps/frontend/dist/ /usr/share/nginx/html/

# Ajustar permisos para usuario no privilegiado de Nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Usar usuario sin privilegios 'nginx'
USER nginx

# Healthcheck interno de Nginx
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

EXPOSE 8080

# Variables de entorno con valores por defecto (sobreescribir en docker-compose o Helm values)
ENV BACKOFFICE_ALLOWED_IP_1=10.42.0.1/32 \
    BACKOFFICE_ALLOWED_IP_2=192.168.1.50/32 \
    METRICS_ALLOWED_CIDR=10.42.0.0/24

CMD ["/bin/sh", "-c", \
    "envsubst '${BACKOFFICE_ALLOWED_IP_1} ${BACKOFFICE_ALLOWED_IP_2} ${METRICS_ALLOWED_CIDR}' \
    < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf \
    && nginx -g 'daemon off;'"]
