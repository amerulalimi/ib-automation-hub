# Run Celery worker (consumes tasks from Redis). Run from repo root or anywhere.
# Requires: Redis up, env vars in backend/.env or environment (see backend/config.py).
$ErrorActionPreference = "Stop"
$BackendDir = Split-Path -Parent $PSScriptRoot
Set-Location $BackendDir

python -m celery -A celery_app worker -l INFO
