#!/usr/bin/env bash
# Run Celery worker from backend/ (imports celery_app + celery_tasks).
set -euo pipefail
cd "$(dirname "$0")/.."
exec python -m celery -A celery_app worker -l INFO
