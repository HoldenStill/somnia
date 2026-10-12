# ========================================================
# Somnia (OpenRouter Batch Manager) Multi-stage Dockerfile
# ========================================================

# Stage 1: Build Frontend SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Runner
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime utilities (curl for healthcheck, gosu for safe PUID/PGID dropping)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/app/data \
    IN_DOCKER=1 \
    PORT=8000 \
    PUID=1000 \
    PGID=1000

# Install Backend Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy Backend application code
COPY backend/ /app/backend/

# Copy compiled frontend from Stage 1 into /app/static
COPY --from=frontend-builder /build/dist /app/static

# Setup entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Setup non-root somnia user & persistent directory with standard PUID/PGID (1000:1000)
RUN mkdir -p /app/data /app/data/results /app/data/logs && \
    groupadd -g 1000 somnia 2>/dev/null || true && \
    useradd -u 1000 -g 1000 -d /app -s /bin/sh somnia 2>/dev/null || true && \
    chown -R 1000:1000 /app

VOLUME ["/app/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
