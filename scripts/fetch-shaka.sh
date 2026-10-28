#!/usr/bin/env bash
# Builds Amazon's patched Shaka Player for Vega into src/vendor/shaka/.
#
# HLS on Vega needs MSE + this Shaka build (URL mode only plays plain
# MP4/MP3). The package's polyfills are "AMAZON PROPRIETARY", so the folder
# is gitignored and regenerated here instead of committed.
#
# The build needs git, Python 3, Java 21 and Node 18+; it runs in a
# throwaway eclipse-temurin container (no named volumes).
set -euo pipefail

version="4.16.13-r1.2"
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl -fsSL "https://amzndevresources.com/vega/media-player/shaka-rel-v${version}-devices_scope.tar.gz" \
  | tar -xz -C "$work" 2>/dev/null
find "$work" -name '._*' -delete

docker run --rm -v "$work/shaka-rel:/work:Z" -w /work/scripts eclipse-temurin:21-jdk bash -c '
  set -e
  apt-get update -qq >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git python3 xz-utils curl >/dev/null
  curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz | tar -xJ -C /opt
  export PATH=/opt/node-v22.11.0-linux-x64/bin:$PATH
  git config --global user.email build@local && git config --global user.name build
  bash setup.sh
  chown -R '"$(id -u):$(id -g)"' /work'

out="$here/src/vendor/shaka"
rm -rf "$out" && mkdir -p "$out/polyfills"
cp "$work/shaka-rel/scripts/shaka-player/dist/shaka-player.compiled.js" "$out/"
cp "$work/shaka-rel/src/polyfills/"*.ts "$out/polyfills/"
echo "Shaka $version in $out"
