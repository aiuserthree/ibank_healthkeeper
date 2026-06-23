#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/backend/.venv/bin/python" "$ROOT/scripts/setup-teams-reminder-test.py" "$@"
