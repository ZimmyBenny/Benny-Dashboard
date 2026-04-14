#!/bin/bash
# Kompiliert das Swift EventKit CLI Binary cal-tool
# Aufruf: bash backend/src/scripts/build-cal-tool.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Kompiliere cal-tool.swift..."
swiftc -O -o "$SCRIPT_DIR/cal-tool" "$SCRIPT_DIR/cal-tool.swift" \
  -framework EventKit -framework Foundation

echo "cal-tool compiled successfully"
echo "Binary: $SCRIPT_DIR/cal-tool"
