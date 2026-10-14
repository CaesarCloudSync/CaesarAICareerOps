#!/usr/bin/env bash

# CaesarAICareerOps Root Launcher
# Delegates commands to local-stack/build_app.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/local-stack/build_app.sh" "$@"
