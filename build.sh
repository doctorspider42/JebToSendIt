#!/usr/bin/env bash
# JebToSendIt — build macOS (Node.js 26; signing setup: docs/releases.md)
# Windows: użyj build.ps1
set -euo pipefail
cd "$(dirname "$0")"

echo "==> JebToSendIt :: build"

if [ ! -d node_modules ]; then
  echo "==> npm ci..."
  npm ci
fi

echo "==> Generuję ikonę..."
npm run prepare:build

case "$(uname -s)" in
  Darwin) echo "==> electron-builder (mac)";  npm run build:mac ;;
  Linux)  echo "==> electron-builder (linux)"; npm run build -- --linux AppImage ;;
  *)      echo "Nieznana platforma — użyj build.ps1 na Windows"; exit 1 ;;
esac

echo "==> GOTOWE. Pliki w dist/"
ls -la dist/ || true
