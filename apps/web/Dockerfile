# ==============================================================================
# Dockerfile para Aplicación Web Frontend (Nginx Alpine Ligero y Seguro)
# ==============================================================================
FROM nginx:1.27-alpine AS runner

LABEL maintainer="Grupo 3 - UTEC DevOps" \
      version="1.0.0" \
      description="Frontend Web Pokédex servido con Nginx y Proxy Inverso a la API"

# Actualizar paquetes base de Alpine para mitigar vulnerabilidades y CVEs del SO
RUN apk upgrade --no-cache

# Eliminar configuración por defecto de Nginx
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copiar configuración personalizada de Nginx
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copiar assets estáticos del frontend (HTML, CSS, JS)
COPY apps/web/public/ /usr/share/nginx/html/

# Instalar libcap para permitir enlazar puerto 80 como usuario no root 'nginx'
RUN apk add --no-cache libcap && \
    setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx && \
    apk del --no-cache libcap

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
    CMD wget --no-verbose --tries=1 --spider http://localhost/healthz || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
