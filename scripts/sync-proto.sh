#!/usr/bin/env bash
# Copies the .proto files from the main Pileus repository (the single source
# of the contract with Mycelium) and regenerates src/gen.
# Usage: scripts/sync-proto.sh <path to a pileus checkout>
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:?usage: scripts/sync-proto.sh <path to a pileus checkout>}/proto"
cp "$src"/*.proto "$here/proto/"
cd "$here" && npm run gen:proto
