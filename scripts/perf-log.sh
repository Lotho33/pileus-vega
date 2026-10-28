#!/usr/bin/env bash
# Streams the app's profiling summaries (src/core/perf.ts) from a device:
# one block every 15 s while the app is used, lines tagged [pileus/perf].
# Usage (with the Vega CLI on PATH): scripts/perf-log.sh <device-ip:port>
set -euo pipefail
device="${1:?usage: scripts/perf-log.sh <device-ip:port>}"
vega device start-log-stream -d "$device" | grep --line-buffered -F '[pileus/perf]'
