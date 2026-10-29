#!/usr/bin/env bash
# Builds the factory's images and loads them into kind. No registry: the images live in your Docker and in the cluster.
#   factory-toolbox   the line's steps (node, pnpm and the game's dependencies, python, git, gitleaks, cosign)
#   factory-workshop  the MCP server for the agent (toolbox + mcp)
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/workshop.env
arch=$(uname -m); [ "$arch" = "x86_64" ] && arch=amd64; [ "$arch" = "aarch64" ] && arch=arm64
# Progress: every build step once, when it starts (BuildKit "#5 [2/7] RUN ...", the old builder "Step 2/7 : RUN ..."),
# with the time since the start. The full log stays in a file and is shown when a build fails.
t0=$(date +%s)
clock() { local s=$(( $(date +%s) - t0 )); printf '%d:%02d' $((s / 60)) $((s % 60)); }
build() {   # $1 the image, the rest: docker build arguments
  local image=$1 log; shift; log="${TMPDIR:-/tmp}/factory-build-$(printf %s "$image" | tr :/ --).log"
  echo "  [$(clock)] building $image (the first time a few minutes, then from the cache)"
  if ! docker build --progress=plain "$@" >"$log" 2>&1 < /dev/null \
      && ! { grep -q 'unknown flag: --progress' "$log" && docker build "$@" >"$log" 2>&1; }; then
    tail -20 "$log"; echo "Building $image failed (log: $log)"; exit 1
  fi &
  local pid=$! last="" line
  while kill -0 "$pid" 2>/dev/null; do
    line=$(grep -oE '^#[0-9]+ \[[^]]*[0-9]+/[0-9]+\] .*|^Step [0-9]+/[0-9]+ : .*' "$log" 2>/dev/null | tail -1 | cut -c1-110) || line=""
    [ -n "$line" ] && [ "$line" != "$last" ] && { echo "  [$(clock)]   $line"; last=$line; }
    sleep 2
  done
  wait "$pid"
}
build "factory-toolbox:$IMAGE_TAG" --build-arg TARGETARCH="$arch" -t "factory-toolbox:$IMAGE_TAG" -f platform/toolbox/Dockerfile .
build "factory-workshop:$IMAGE_TAG" --build-arg BASE="factory-toolbox:$IMAGE_TAG" -t "factory-workshop:$IMAGE_TAG" platform/workshop
echo "  [$(clock)] loading the images into the kind cluster (about a minute)"
out=$(kind load docker-image --name "$KIND_CLUSTER" "factory-toolbox:$IMAGE_TAG" "factory-workshop:$IMAGE_TAG" 2>&1) || { echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -v 'already present' | grep -v '^$' || true
echo "images in the cluster: factory-toolbox:$IMAGE_TAG factory-workshop:$IMAGE_TAG"
