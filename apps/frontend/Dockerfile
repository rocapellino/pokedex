# ==============================================================================
# Dockerfile para Aplicación Web Frontend (Multi-Stage Build con Vite y Nginx)
# ==============================================================================
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

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
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS runner

LABEL maintainer="Grupo 3 - UTEC DevOps" \
      version="1.0.0" \
      description="Frontend Web Pokédex servido con Nginx y Proxy Inverso a la API"

# Actualizar paquetes base de Alpine para mitigar vulnerabilidades y CVEs del SO
RUN apk upgrade --no-cache

# Instalar gettext (provee envsubst) para sustitución de variables en nginx.conf.template
# envsubst ya está incluido en nginx:alpine vía libintl, pero gettext lo expone como binario
RUN apk add --no-cache gettext

# Eliminar configuración por defecto de Nginx
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

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
