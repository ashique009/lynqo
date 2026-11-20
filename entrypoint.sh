#!/usr/bin/env bash
set -e

echo "==> [LYNQO] Starting production application startup sequence..."

# 1. Run database migrations safely
echo "==> [LYNQO] Applying database migrations..."
python manage.py migrate --noinput

# 2. Start Daphne ASGI server for unified HTTP and WebSockets (WSS)
PORT="${PORT:-8000}"
echo "==> [LYNQO] Starting Daphne ASGI server on 0.0.0.0:${PORT}..."
exec daphne -b 0.0.0.0 -p "${PORT}" config.asgi:application
