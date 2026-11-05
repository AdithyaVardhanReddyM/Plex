#!/bin/sh
# Build Plex for Mac (Debug) and relaunch it.
#   ./scripts/run.sh          build + launch
#   ./scripts/run.sh --build  build only
set -e
cd "$(dirname "$0")/.."

xcodegen generate --quiet
xcodebuild -project PlexMac.xcodeproj -scheme PlexMac -configuration Debug \
  -derivedDataPath build/DerivedData -quiet build

[ "$1" = "--build" ] && exit 0

APP="build/DerivedData/Build/Products/Debug/Plex.app"
pkill -x Plex 2>/dev/null && sleep 0.5 || true
open "$APP"
echo "Plex is running ($APP)"
