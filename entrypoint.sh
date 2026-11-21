#!/usr/bin/env bash
set -e

echo "==> [LYNQO] Starting production application startup sequence..."

# 1. Run database migrations conditionally
if [ "$(echo "${RUN_MIGRATIONS:-false}" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
  echo "==> [LYNQO] RUN_MIGRATIONS is set to true. Applying database migrations..."
  python manage.py migrate --noinput
else
  echo "==> [LYNQO] Skipping database migrations (RUN_MIGRATIONS=${RUN_MIGRATIONS:-unset})..."
fi

# 2. Start Daphne ASGI server for unified HTTP and WebSockets (WSS)
PORT="${PORT:-8000}"
echo "==> [LYNQO] Starting Daphne ASGI server on 0.0.0.0:${PORT}..."
exec daphne -b 0.0.0.0 -p "${PORT}" config.asgi:application
