# ==============================================================================
# Dockerfile Multi-Stage: Pokédex Node.js & TypeScript Full-Stack Service
# ==============================================================================

# ------------------------------------------------------------------------------
# Etapa 1: Builder (Compilación y Empaquetado TypeScript con esbuild)
# ------------------------------------------------------------------------------
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS builder

WORKDIR /app

# Copiar manifiestos de dependencias
COPY package.json package-lock.json tsconfig.json ./

# Instalar dependencias completas para compilación y verificación de tipos
RUN npm ci

# Copiar código fuente y assets
COPY server.ts ./
COPY src/ ./src/
COPY apps/web/public/ ./apps/web/public/

# Verificación de tipos y build de producción
RUN npm run lint && npm run build

# ------------------------------------------------------------------------------
# Etapa 2: Runner (Entorno de Producción Seguro y Minimalista)
# ------------------------------------------------------------------------------
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS runner

LABEL maintainer="Rodrigo Capellino" \
      version="2.0.0" \
      description="Pokédex Full-Stack Native Node.js & TypeScript Service con Google AI Studio"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Actualizar librerías del sistema para mitigar CVEs en OpenSSL y paquetes base
RUN apk upgrade --no-cache

# Copiar manifiestos e instalar únicamente dependencias de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm /opt/yarn* /usr/local/lib/node_modules/corepack

# Copiar artefactos compilados y assets estáticos del frontend
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web/public ./apps/web/public

# Usar usuario sin privilegios 'node' por seguridad
USER node

# Healthcheck nativo consultando el endpoint /healthz
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/healthz || exit 1

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
