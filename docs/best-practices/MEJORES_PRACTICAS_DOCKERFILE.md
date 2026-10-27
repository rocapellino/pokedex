# 🐳 Guía de Mejores Prácticas para Dockerfile (Arquitectura Node.js / TypeScript & Nginx)

Este documento establece las mejores prácticas y estándares DevSecOps implementados para la contenerización de la plataforma **Pokédex**, optimizando **seguridad**, **rendimiento**, **tamaño de imagen** y **mantenibilidad**.

---

## 📑 Tabla de Contenidos

1. [Arquitectura de Contenedores del Repositorio](#1-arquitectura-de-contenedores-del-repositorio)
2. [Estructura del `.dockerignore`](#2-estructura-del-dockerignore)
3. [Multi-Stage Builds y Optimización de Capas](#3-multi-stage-builds-y-optimización-de-capas)
4. [Seguridad en Runtime (Non-Root y Zero-Trust)](#4-seguridad-en-runtime-non-root-y-zero-trust)
5. [Mitigación Activa de Vulnerabilidades (CVEs en SO)](#5-mitigación-activa-de-vulnerabilidades-cves-en-so)
6. [Manejo de Señales y Healthchecks Nativos](#6-manejo-de-señales-y-healthchecks-nativos)
7. [Dockerfile de Referencia: Backend Node.js / TypeScript](#7-dockerfile-de-referencia-backend-nodejs--typescript)
8. [Dockerfile de Referencia: Frontend Web Nginx](#8-dockerfile-de-referencia-frontend-web-nginx)
9. [Comandos Clave de Verificación y Escaneo](#9-comandos-clave-de-verificación-y-escaneo)

---

## 1. Arquitectura de Contenedores del Repositorio

El proyecto utiliza dos contenedores especializados:

- **Backend API (`apps/backend/Dockerfile`)**: Runtime Node.js 24 Alpine con TypeScript compilado estáticamente con `esbuild` en formato ESM nativo (`apps/backend/dist/server.js`), ejecutando en modo unificado para endpoints REST, telemetría y agentes de IA.
- **Frontend Web (`apps/frontend/Dockerfile`)**: Servidor web Nginx 1.31 Alpine como reverse proxy inverso para la API (`/api/` y `/pokemons`) y servidor de assets estáticos (HTML5, CSS3, TypeScriptVanilla).

---

## 2. Estructura del `.dockerignore`

Es obligatorio contar con un archivo `.dockerignore` optimizado en la raíz del repositorio para excluir artefactos temporales, secretos y librerías locales del contexto de compilación del Docker daemon:

```text
# Control de versiones
.git/
.gitignore

# Dependencias y artefactos locales
node_modules/
dist/
coverage/

# Variables de entorno y secretos locales
.env
.env.*
!.env.example

# Configuración de IDEs y sistemas operativos
.vscode/
.idea/
.DS_Store
Thumbs.db
```

---

## 3. Multi-Stage Builds y Optimización de Capas

### 3.1. Separación de Builder y Runner

1. **Etapa `builder`**: Instala dependencias completas (`npm ci`), ejecuta linting (`tsc --noEmit`) y compila el bundle con `esbuild`.
2. **Etapa `runner`**: Solo contiene el binario compilado y las dependencias de producción (`npm ci --omit=dev`), reduciendo drásticamente la superficie de ataque y el tamaño final de la imagen.

### 3.2. Orden de Copia para Máximo Aprovechamiento de Caché

- Copiar primero `package.json` y `package-lock.json` antes de ejecutar `npm ci`.
- Copiar el código fuente (`server.ts`, `src/`) en capas posteriores para que los cambios de código no invaliden la caché de instalación de módulos.

---

## 4. Seguridad en Runtime (Non-Root y Zero-Trust)

### 4.1. Usuario sin Privilegios

- **Backend**: Utiliza el usuario sin privilegios por UID:GID numérico (`USER 1000:1000`, correspondiente a `node` en Alpine; en Kubernetes se refuerza con `runAsUser: 10001`).
- **Frontend**: Utiliza el usuario sin privilegios por UID:GID numérico (`USER 101:101`, correspondiente a `nginx` en Alpine) escuchando directamente en el puerto no privilegiado `8080` sin requerir permisos de `root` ni `libcap`.

### 4.2. Principio de Mínimo Privilegio en Kubernetes / Docker

- `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: true` (con volúmenes temporales `emptyDir` para `/tmp`, `/var/cache` y `/var/run`)
- `capabilities.drop: ["ALL"]`

---

## 5. Mitigación Activa de Vulnerabilidades (CVEs en SO)

Para garantizar un resultado limpio en auditorías de SCA y escaneos de **Trivy**:

- Fijar imágenes base con digest SHA-256 (`node:24-alpine@sha256:...`).
- Ejecutar `RUN apk upgrade --no-cache` en la etapa final de producción para actualizar parches de seguridad críticos de librerías base como `musl`, `zlib`, `nghttp2-libs` y `libxml2`.

---

## 6. Manejo de Señales y Healthchecks Nativos

Ambos contenedores implementan directivas `HEALTHCHECK` en formato JSON array (cumpliendo Hadolint `DL3025`) que no dependen de herramientas pesadas como `curl`:

- **Backend**: `CMD ["/bin/sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/healthz || exit 1"]`
- **Frontend**: `CMD ["/bin/sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1"]`

Permiten a Docker y Kubernetes orquestar reinicios automáticos y evitar enviar tráfico a pods degradados.

---

## 7. Dockerfile de Referencia: Backend Node.js / TypeScript

```dockerfile
# Etapa 1: Builder (Compilación con esbuild)
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/tsconfig.json ./apps/backend/
RUN npm ci --workspace=@pokedex/backend --ignore-scripts
COPY apps/backend/server.ts ./apps/backend/
COPY apps/backend/src/ ./apps/backend/src/
RUN npm run lint --workspace=@pokedex/backend && npm run build --workspace=@pokedex/backend

# Etapa 2: Runner (Entorno de Producción Seguro y Minimalista)
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS runner
ARG APP_VERSION=unknown
ARG GIT_SHA=unknown
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_PATH=/app/apps/backend/node_modules:/app/node_modules \
    APP_VERSION=$APP_VERSION \
    GIT_SHA=$GIT_SHA
RUN apk upgrade --no-cache
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
RUN npm ci --workspace=@pokedex/backend --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
              /root/.npm /opt/yarn* /usr/local/lib/node_modules/corepack
COPY --from=builder /app/apps/backend/dist ./dist
USER 1000:1000
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/bin/sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/healthz || exit 1"]
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## 8. Dockerfile de Referencia: Frontend Web Nginx

```dockerfile
# Etapa 1: Builder (Vite + Node 24 LTS — alineado con runtime de producción del backend)
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/frontend/package*.json ./apps/frontend/
RUN npm ci --workspace=@pokedex/frontend --ignore-scripts
COPY apps/frontend ./apps/frontend
RUN npm run build --workspace=@pokedex/frontend

# Etapa 2: Runner (Nginx 1.31-alpine — versión actual de producción)
FROM nginx:1.31-alpine@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417 AS runner
ARG APP_VERSION=unknown
ARG GIT_SHA=unknown
RUN apk upgrade --no-cache && \
    apk add --no-cache gettext && \
    rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*
ENV BACKOFFICE_ALLOWED_IP_1=10.42.0.1/32 \
    BACKOFFICE_ALLOWED_IP_2=192.168.1.50/32 \
    METRICS_ALLOWED_CIDR=10.42.0.0/24
COPY apps/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/frontend/dist/ /usr/share/nginx/html/
RUN envsubst '${BACKOFFICE_ALLOWED_IP_1} ${BACKOFFICE_ALLOWED_IP_2} ${METRICS_ALLOWED_CIDR}' \
        < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /etc/nginx/templates && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid
USER 101:101
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/bin/sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1"]
EXPOSE 8080
CMD ["/bin/sh", "-c", \
    "if [ -w /etc/nginx/conf.d ]; then \
      envsubst '${BACKOFFICE_ALLOWED_IP_1} ${BACKOFFICE_ALLOWED_IP_2} ${METRICS_ALLOWED_CIDR}' \
      < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf; \
    fi && nginx -g 'daemon off;'"]
```

---

## 9. Comandos Clave de Verificación y Escaneo

```bash
# Compilar backend y frontend
docker build -t pokedex-api:test -f apps/backend/Dockerfile .
docker build -t pokedex-web:test -f apps/frontend/Dockerfile .

# Escanear vulnerabilidades con Trivy (debe dar 0 hallazgos CRITICAL/HIGH)
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity CRITICAL,HIGH --exit-code 1 pokedex-api:test
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity CRITICAL,HIGH --exit-code 1 pokedex-web:test
```
