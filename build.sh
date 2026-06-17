#!/usr/bin/env bash
# JebToSendIt — build (przygotowane pod przyszły port na macOS/Linux)
# Windows: użyj build.ps1
set -euo pipefail
cd "$(dirname "$0")"

echo "==> JebToSendIt :: build"

if [ ! -d node_modules ]; then
  echo "==> npm install..."
  npm install
fi

echo "==> Generuję ikonę..."
node tools/gen-icon.js

case "$(uname -s)" in
  Darwin) echo "==> electron-builder (mac)";  npx electron-builder --mac ;;
  Linux)  echo "==> electron-builder (linux)"; npx electron-builder --linux AppImage ;;
  *)      echo "Nieznana platforma — użyj build.ps1 na Windows"; exit 1 ;;
esac

echo "==> GOTOWE. Pliki w dist/"
ls -la dist/ || true
