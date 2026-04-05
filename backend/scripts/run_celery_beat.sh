#!/usr/bin/env bash
# Periodic scheduler; run in a second terminal next to the worker.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python -m celery -A celery_app beat -l INFO
