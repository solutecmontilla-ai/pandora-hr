# ── Etapa 1: compilar frontend ──────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.js compila a ../backend/public
RUN mkdir -p /build/backend && npm run build

# ── Etapa 2: backend ────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache tzdata wget
ENV TZ=America/Caracas NODE_ENV=production PORT=3002 STORAGE_PATH=/app/storage

WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /build/backend/public ./public

RUN mkdir -p /app/storage/logos /app/storage/membretes

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/api/health || exit 1
CMD ["node", "src/server.js"]
