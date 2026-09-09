# ==============================================================================
# Dockerfile Multi-Stage: Pokédex Backend API Service (Node.js 22 LTS)
# ==============================================================================

# ------------------------------------------------------------------------------
# Etapa 1: Builder (Compilación con esbuild)
# ------------------------------------------------------------------------------
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

# Copiar manifiestos de dependencias
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/tsconfig.json ./apps/backend/

# Instalar dependencias para compilación
RUN npm ci --workspace=@pokedex/backend --ignore-scripts

# Copiar código fuente
COPY apps/backend/server.ts ./apps/backend/
COPY apps/backend/src/ ./apps/backend/src/

# Verificación de tipos y build de producción
RUN npm run lint --workspace=@pokedex/backend && npm run build --workspace=@pokedex/backend

# ------------------------------------------------------------------------------
# Etapa 2: Runner (Entorno de Producción Seguro y Minimalista)
# ------------------------------------------------------------------------------
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner

LABEL maintainer="Rodrigo Capellino" \
      version="2.0.0" \
      description="Pokédex Backend Native Node.js & TypeScript Service con Google AI Studio"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA \
    APP_VERSION=$GIT_SHA

# Actualizar librerías del sistema para mitigar CVEs en OpenSSL y paquetes base
RUN apk upgrade --no-cache

# Copiar manifiestos e instalar únicamente dependencias de producción
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
RUN npm ci --workspace=@pokedex/backend --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm /opt/yarn* /usr/local/lib/node_modules/corepack

# Copiar artefactos compilados
COPY --from=builder /app/apps/backend/dist ./dist

# Usar usuario sin privilegios 'node' por seguridad
USER node

# Healthcheck nativo consultando el endpoint /healthz
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/healthz || exit 1

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
