# ==============================================================================
# Dockerfile Multi-Stage: Pokédex Backend API Service (Node.js 22 LTS)
# ==============================================================================
# Definición canónica y SSOT para el backend (docker-compose, CI/CD, Helm y Kubernetes).
# Compila con TypeScript y ejecuta sobre Alpine con usuario no privilegiado (node).
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

# VER-002/OCI-001: los metadatos OCI de version y revision se inyectan desde CI
# como build-args. El `version="2.0.0"` generico anterior era ficticio y no
# coincidia con la release real, lo que rompia la trazabilidad de los artefactos.
ARG APP_VERSION=unknown
ARG GIT_SHA=unknown

LABEL maintainer="Rodrigo Capellino" \
      org.opencontainers.image.title="pokedex-api" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      description="Pokédex Backend Native Node.js & TypeScript Service con Google AI Studio" \
      org.opencontainers.image.description="Pokédex Backend Native Node.js & TypeScript Service" \
      org.opencontainers.image.source="https://github.com/rocapellino/pokedex" \
      org.opencontainers.image.vendor="Rodrigo Capellino" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_PATH=/app/apps/backend/node_modules:/app/node_modules

# VER-002: APP_VERSION y GIT_SHA son metadatos conceptualmente distintos
# (versión semántica de la release vs. commit exacto que la compila).
# CI los inyecta como build-args independientes; en builds locales sin
# argumentos ambos degradan explícitamente a "unknown".
# Los ARG se declaran arriba, antes del bloque LABEL, para que las etiquetas OCI
# puedan expandirlos.
ENV APP_VERSION=$APP_VERSION \
    GIT_SHA=$GIT_SHA

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

# Usar usuario sin privilegios por UID:GID numérico (Hadolint DL3066)
USER 1000:1000

# Healthcheck nativo consultando el endpoint /healthz (Hadolint DL3025)
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/bin/sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/healthz || exit 1"]

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
