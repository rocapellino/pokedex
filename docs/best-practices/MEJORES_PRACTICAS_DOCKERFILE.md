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
- **Backend API (`Dockerfile`)**: Runtime Node.js 22 Alpine con TypeScript compilado estáticamente con `esbuild` en formato CommonJS (`dist/server.cjs`), ejecutando en modo unificado para endpoints REST, telemetría y agentes de IA.
- **Frontend Web (`apps/web/Dockerfile`)**: Servidor web Nginx 1.27 Alpine como reverse proxy inverso para la API (`/api/` y `/pokemons`) y servidor de assets estáticos (HTML5, CSS3, JS Vanilla).

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
- **Backend**: Utiliza el usuario predeterminado de Alpine `node` (`USER node`, UID 1000).
- **Frontend**: Utiliza el usuario `nginx` (`USER nginx`, UID 101) asignando capacidades mínimas (`setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx`) para enlazar el puerto 80 sin requerir permisos de `root`.

### 4.2. Principio de Mínimo Privilegio en Kubernetes / Docker
- `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: true` (con volúmenes temporales `emptyDir` para `/tmp`, `/var/cache` y `/var/run`)
- `capabilities.drop: ["ALL"]`

---

## 5. Mitigación Activa de Vulnerabilidades (CVEs en SO)

Para garantizar un resultado limpio en auditorías de SCA y escaneos de **Trivy**:
- Fijar imágenes base con digest SHA-256 (`node:22-alpine@sha256:...`).
- Ejecutar `RUN apk upgrade --no-cache` en la etapa final de producción para actualizar parches de seguridad críticos de librerías base como `musl`, `zlib`, `nghttp2-libs` y `libxml2`.

---

## 6. Manejo de Señales y Healthchecks Nativos

Ambos contenedores implementan directivas `HEALTHCHECK` que no dependen de herramientas pesadas como `curl`:
- **Backend**: `CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/healthz || exit 1`
- **Frontend**: `CMD wget --no-verbose --tries=1 --spider http://localhost/healthz || exit 1`

Permiten a Docker y Kubernetes orquestar reinicios automáticos y evitar enviar tráfico a pods degradados.

---

## 7. Dockerfile de Referencia: Backend Node.js / TypeScript

```dockerfile
# Etapa 1: Builder
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY server.ts ./
COPY src/ ./src/
COPY apps/web/public/ ./apps/web/public/
RUN npm run lint && npm run build

# Etapa 2: Runner
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN apk upgrade --no-cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web/public ./apps/web/public
USER node
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/healthz || exit 1
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

---

## 8. Dockerfile de Referencia: Frontend Web Nginx

```dockerfile
FROM nginx:1.27-alpine AS runner
RUN apk upgrade --no-cache
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/public/ /usr/share/nginx/html/
RUN apk add --no-cache libcap && \
    setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx && \
    apk del --no-cache libcap
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid
USER nginx
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/healthz || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 9. Comandos Clave de Verificación y Escaneo

```bash
# Compilar backend y frontend
docker build -t pokedex-server:test -f Dockerfile .
docker build -t pokedex-web:test -f apps/web/Dockerfile .

# Escanear vulnerabilidades con Trivy (debe dar 0 hallazgos CRITICAL/HIGH)
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity CRITICAL,HIGH --exit-code 1 pokedex-server:test
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity CRITICAL,HIGH --exit-code 1 pokedex-web:test
```
