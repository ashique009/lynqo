#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "==> Upgrading pip and installing requirements..."
pip install --upgrade pip
pip install -r requirements.txt

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

echo "==> Running database migrations on Neon PostgreSQL..."
python manage.py migrate --noinput

echo "==> Build completed successfully!"
