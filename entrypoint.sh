#!/bin/sh
set -e

# Default to 1000 if not specified
PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Ensure /app/data directory exists
mkdir -p /app/data/results /app/data/logs

# Fix permissions for the mapped volume if running as root
if [ "$(id -u)" = "0" ]; then
    # Ensure somnia group exists with PGID
    if ! getent group somnia >/dev/null 2>&1; then
        groupadd -g "$PGID" somnia 2>/dev/null || groupmod -g "$PGID" $(getent group "$PGID" | cut -d: -f1) 2>/dev/null || true
    fi

    # Ensure somnia user exists with PUID
    if ! id -u somnia >/dev/null 2>&1; then
        useradd -u "$PUID" -g "$PGID" -d /app -s /bin/sh somnia 2>/dev/null || usermod -u "$PUID" $(getent passwd "$PUID" | cut -d: -f1) 2>/dev/null || true
    fi

    chown -R "$PUID:$PGID" /app/data 2>/dev/null || true
    chmod -R 775 /app/data 2>/dev/null || true

    # Drop root privileges and execute uvicorn
    if command -v gosu >/dev/null 2>&1; then
        exec gosu "$PUID:$PGID" python -m uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
    elif command -v su-exec >/dev/null 2>&1; then
        exec su-exec "$PUID:$PGID" python -m uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
    fi
fi

# Fallback: run directly as current user
exec python -m uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
