# ==============================================================================
# Dockerfile para Aplicación Web Frontend (Multi-Stage Build con Vite y Nginx)
# ==============================================================================
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS builder

WORKDIR /app
COPY package*.json ./
COPY packages/contracts/package*.json ./packages/contracts/
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages/contracts ./packages/contracts
RUN npm ci --workspace=@pokedex/frontend --ignore-scripts

COPY apps/frontend ./apps/frontend
RUN npm run build --workspace=@pokedex/frontend

# ==============================================================================
# Etapa de Ejecución (Nginx Alpine Ligero y Seguro)
# ==============================================================================
FROM nginx:1.31-alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606 AS runner

# OCI-001: los metadatos de version y revision se inyectan desde CI como
# build-args. El `version="1.0.0"` generico anterior era ficticio y no
# coincidia con la release real, rompiendo la trazabilidad del artefacto.
ARG APP_VERSION=unknown
ARG GIT_SHA=unknown

LABEL maintainer="Rodrigo Capellino" \
      org.opencontainers.image.title="pokedex-web" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      description="Frontend Web Pokédex servido con Nginx y Proxy Inverso a la API" \
      org.opencontainers.image.description="Frontend Web Pokédex servido con Nginx y Proxy Inverso a la API" \
      org.opencontainers.image.source="https://github.com/rocapellino/pokedex" \
      org.opencontainers.image.vendor="Rodrigo Capellino" \
      org.opencontainers.image.licenses="MIT"

# Actualizar paquetes base de Alpine e instalar utilidades requeridas en una sola capa
# hadolint ignore=DL3018
RUN apk upgrade --no-cache && \
    apk add --no-cache gettext && \
    rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Variables de entorno con valores por defecto (sobreescribir en docker-compose o Helm values)
ENV BACKOFFICE_ALLOWED_IP_1=10.42.0.1/32 \
    BACKOFFICE_ALLOWED_IP_2=192.168.1.50/32 \
    METRICS_ALLOWED_CIDR=10.42.0.0/24

# Copiar la plantilla de configuración de Nginx (IPs configurables por variable de entorno)
COPY apps/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

# Copiar build optimizado del frontend generado por Vite
COPY --from=builder /app/apps/frontend/dist/ /usr/share/nginx/html/

# Pre-renderizar configuración por defecto y ajustar permisos para usuario no privilegiado de Nginx
# hadolint ignore=SC2016
RUN envsubst '${BACKOFFICE_ALLOWED_IP_1} ${BACKOFFICE_ALLOWED_IP_2} ${METRICS_ALLOWED_CIDR}' \
        < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /etc/nginx/templates && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Usar usuario sin privilegios por UID:GID numérico (Hadolint DL3066)
USER 101:101

# Healthcheck interno de Nginx (Hadolint DL3025)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/bin/sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1"]

EXPOSE 8080

CMD ["/bin/sh", "-c", \
    "if [ -w /etc/nginx/conf.d ]; then \
      envsubst '${BACKOFFICE_ALLOWED_IP_1} ${BACKOFFICE_ALLOWED_IP_2} ${METRICS_ALLOWED_CIDR}' \
      < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf; \
    fi && nginx -g 'daemon off;'"]
