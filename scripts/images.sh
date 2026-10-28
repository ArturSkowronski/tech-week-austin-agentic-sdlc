#!/usr/bin/env bash
# Builds the factory's images and loads them into kind. No registry: the images live in your Docker and in the cluster.
#   factory-toolbox   the line's steps (node, pnpm and the game's dependencies, python, git, gitleaks, cosign)
#   factory-workshop  the MCP server for the agent (toolbox + mcp)
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/workshop.env
arch=$(uname -m); [ "$arch" = "x86_64" ] && arch=amd64; [ "$arch" = "aarch64" ] && arch=arm64
docker build -q --build-arg TARGETARCH="$arch" -t "factory-toolbox:$IMAGE_TAG" -f platform/toolbox/Dockerfile . >/dev/null
docker build -q --build-arg BASE="factory-toolbox:$IMAGE_TAG" -t "factory-workshop:$IMAGE_TAG" platform/workshop >/dev/null
out=$(kind load docker-image --name "$KIND_CLUSTER" "factory-toolbox:$IMAGE_TAG" "factory-workshop:$IMAGE_TAG" 2>&1) || { echo "$out"; exit 1; }
printf '%s\n' "$out" | grep -v 'already present' | grep -v '^$' || true
echo "images in the cluster: factory-toolbox:$IMAGE_TAG factory-workshop:$IMAGE_TAG"
