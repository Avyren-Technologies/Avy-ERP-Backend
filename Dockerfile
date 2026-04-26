# ============================================
# Avy ERP Backend - Production Dockerfile
# Multi-stage build for minimal image size
# ============================================

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy dependency files first (leverages Docker layer cache)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY scripts/merge-prisma.js ./scripts/merge-prisma.js

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Merge prisma/modules → schema.prisma, then generate client (matches package.json db:* flow)
RUN node scripts/merge-prisma.js && npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src/

# Build TypeScript
RUN npm run build

# ---------- Stage 2: Production ----------
FROM node:20-alpine AS production

WORKDIR /app

# Install OpenSSL (required by Prisma at runtime) and dumb-init for PID 1
RUN apk add --no-cache openssl dumb-init

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy dependency files
COPY package.json package-lock.json ./
COPY --chown=appuser:appgroup prisma ./prisma/
COPY --chown=appuser:appgroup scripts/merge-prisma.js ./scripts/merge-prisma.js

# Install production dependencies only
RUN npm ci --omit=dev

# Merge modular schema → schema.prisma, then generate client (runtime deploy.sh also merges before prisma CLI)
RUN node scripts/merge-prisma.js && npx prisma generate

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist
# Keep source for runtime seed script imports (prisma/seed.ts imports src constants)
COPY --chown=appuser:appgroup src ./src

# Create necessary directories with proper ownership
RUN mkdir -p logs uploads && \
    chown -R appuser:appgroup logs uploads prisma scripts

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE 3000

# Health check (127.0.0.1 — app listens on 0.0.0.0 only; localhost → ::1 breaks the probe)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Use dumb-init to handle PID 1 and signal forwarding (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]

# Start the application
# rootDir is ./src → compiled entry is dist/app/server.js (not dist/src/...)
CMD ["node", "dist/app/server.js"]
