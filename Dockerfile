# ============================================================================
# LYNQO Multi-Stage Production Dockerfile for Coolify VPS Deployment
# Architecture:
# Stage 1: Builds Vite React Single Page Application (SPA)
# Stage 2: Production Daphne ASGI Server (HTTP + WSS WebSockets)
# ============================================================================

# Stage 1: Frontend Build
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Runtime
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    MEDIA_ROOT=/app/media

WORKDIR /app

# Install runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    ffmpeg \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    apt-get purge -y --auto-remove build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy backend application code
COPY . /app

# Copy built frontend assets from builder stage
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Ensure media and static directories exist
RUN mkdir -p /app/media /app/staticfiles /app/media/chat_images /app/media/chat_thumbnails /app/media/voice_messages

# Collect static files into STATIC_ROOT
RUN python manage.py collectstatic --noinput

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/api/health/ || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
