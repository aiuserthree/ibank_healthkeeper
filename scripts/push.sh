#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${1:-main}"

echo "==> Push $BRANCH → ibank-ax + origin"
git push ibank-ax "$BRANCH"
git push origin "$BRANCH"
echo "Done."
