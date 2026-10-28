#!/usr/bin/env bash
# Build release armv7 and UPGRADE it in place on a dev-mode Vega device.
#
# Not `vega run-app`: that one uninstalls first, and Vega's uninstall wipes
# the app's data directories (session, pairing, profile) every time. A plain
# `vpm install` of a newer build is an upgrade that keeps them. Build numbers
# must grow, so each run uses the current epoch second count.
#
# Usage (with the Vega CLI on PATH): scripts/deploy.sh <device-ip:port>
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
device="${1:?usage: scripts/deploy.sh <device-ip:port>}"
build_number="$(date +%s)"
pkg="$here/build/armv7-release/pileus-vega_armv7.vpkg"
remote="/tmp/pileus-vega_armv7.vpkg"

cd "$here"
"$(vega which vda | tail -1)" connect "${device%%:*}" >/dev/null
npx react-native build-vega --build-type Release --target armv7 --build-number "$build_number" \
  | grep -E "created:|ERROR" || true
test -f "$pkg"
vega device copy-to -d "$device" -s "$pkg" -o "$remote" >/dev/null
vega device run-cmd -d "$device" -c "vpm install $remote && rm -f $remote"
vega device launch-app -d "$device" -a com.lotho33.pileus.main
echo "installed build $build_number on $device"
