# Celery Beat: dispatches periodic tasks (scan_pending_scheduled, process_telethon_signal_stream).
# Run alongside the worker in a second terminal.
$ErrorActionPreference = "Stop"
$BackendDir = Split-Path -Parent $PSScriptRoot
Set-Location $BackendDir

python -m celery -A celery_app beat -l INFO
