#!/usr/bin/env bash
# Build the three images the demo runs and push them to the local registry
# (kind-registry, localhost:5001), without pulling crates or npm packages
# from the network beyond what is already cached on this machine:
#
#   localhost:5001/visdom/vp-server:main        orchestrator (vp-server + SPA), visdom-orchestrator main
#   localhost:5001/visdom/outbox-sidecar:main   the run pods' outbox sidecar, same commit
#   localhost:5001/visdom/runtime-demo:<tag>    the run image every agent and task uses
#
# Needs: ~/Projects/visdom-orchestrator-main (any commit; nothing is committed
# there, a detached worktree is used), the local images rust:1.98-slim-trixie,
# gcr.io/distroless/cc-debian13, postgres:17 (for trixie's glibc) and
# localhost:5001/visdom/runtime-agents-kit:flow-a-101 (Claude Code + Codex),
# gh access to VirtusLab/visdom-ai-tracing-cli (release asset), and a clone
# of Hobby Wizard (for its node_modules).
#
#   visdom/scripts/build-images.sh [server|runtime|all]   (default all)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC=${ORCHESTRATOR_SRC:-$HOME/Projects/visdom-orchestrator-main}
B=${VISDOM_BUILD_DIR:-$HOME/visdom-demo-build}
HW=${HOBBY_WIZARD_CLONE:-$HOME/visdom-demo-repos/hobby-wizard}
RUNTIME_TAG=${RUNTIME_TAG:-4}
RUST=rust:1.98-slim-trixie@sha256:4cd829461bd5c4d511c32e269da9cb8929223b666519d8004e35fc8d1d771ab7
DISTROLESS=gcr.io/distroless/cc-debian13@sha256:d74d144baa124dd9defd01d71872bb56c49d4441dba6153ccf790364f97e64b1
mkdir -p "$B"

server() {
  # A detached worktree keeps the product checkout untouched.
  [ -d "$B/orchestrator" ] || git -C "$SRC" worktree add --detach "$B/orchestrator" HEAD
  git -C "$B/orchestrator" checkout -q --detach "$(git -C "$SRC" rev-parse HEAD)"
  # 1. SPA bundle (rust-embed takes it at compile time), with main's node_modules.
  ln -sfn "$SRC/frontend/node_modules" "$B/orchestrator/frontend/node_modules"
  (cd "$B/orchestrator/frontend" && pnpm exec vite build >/dev/null)
  # 2. Linux binaries in the rust image, crates from the host's cargo registry (offline).
  #    utoipa-swagger-ui downloads Swagger UI in its build script; give it the cached zip.
  (cd "$B/orchestrator" && cargo fetch --locked >/dev/null)
  zip=$(find "$B/orchestrator/target" "$SRC/target" -path '*utoipa-swagger-ui*' -name 'v*.zip' 2>/dev/null | head -1 || true)
  [ -n "$zip" ] || { (cd "$B/orchestrator" && cargo build -q -p utoipa-swagger-ui); zip=$(find "$B/orchestrator/target" -path '*utoipa-swagger-ui*' -name 'v*.zip' | head -1); }
  mkdir -p "$B/swagger" "$B/out" && cp "$zip" "$B/swagger/swagger-ui.zip"
  docker volume create vp-target >/dev/null
  docker run --rm -v "$B/orchestrator:/src" -v "$HOME/.cargo/registry:/usr/local/cargo/registry" \
    -v vp-target:/target -v "$B/swagger:/swagger" -v "$B/out:/out" -w /src \
    -e CARGO_TARGET_DIR=/target -e CARGO_PROFILE_RELEASE_LTO=false -e CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 \
    -e CARGO_BUILD_JOBS=8 -e SWAGGER_UI_DOWNLOAD_URL=file:///swagger/swagger-ui.zip "$RUST" sh -ec '
      command -v cmake >/dev/null || { apt-get update -qq && apt-get install -y -qq --no-install-recommends pkg-config libssl-dev cmake >/dev/null; }
      cargo build --release --locked --offline --bin vp-server -p vp-server
      cargo build --release --locked --offline -p vp-outbox --bin vp-outbox-sidecar
      cp /target/release/vp-server /target/release/vp-outbox-sidecar /out/'
  # 3. Images: the binaries on distroless, plus the catalog like images/vp-server/Dockerfile.
  ctx=$(mktemp -d) && mkdir -p "$ctx/out" && cp "$B/out/vp-server" "$B/out/vp-outbox-sidecar" "$ctx/out/"
  cp -R "$B/orchestrator/catalog" "$ctx/"
  printf 'FROM %s\nCOPY out/vp-server /usr/local/bin/vp-server\nCOPY catalog/agents/ /var/lib/visdom/catalog/agents/\nCOPY catalog/flows/ /var/lib/visdom/catalog/flows/\nCOPY catalog/catalog.lock catalog/catalog.sig /var/lib/visdom/catalog/\nEXPOSE 8080\nENTRYPOINT ["/usr/local/bin/vp-server"]\n' "$DISTROLESS" > "$ctx/vp-server.Dockerfile"
  printf 'FROM %s\nCOPY out/vp-outbox-sidecar /usr/local/bin/vp-outbox-sidecar\nUSER 65532:65532\nENTRYPOINT ["/usr/local/bin/vp-outbox-sidecar"]\n' "$DISTROLESS" > "$ctx/outbox.Dockerfile"
  docker build -q -f "$ctx/vp-server.Dockerfile" -t localhost:5001/visdom/vp-server:main "$ctx" >/dev/null
  docker build -q -f "$ctx/outbox.Dockerfile" -t localhost:5001/visdom/outbox-sidecar:main "$ctx" >/dev/null
  docker push -q localhost:5001/visdom/vp-server:main && docker push -q localhost:5001/visdom/outbox-sidecar:main
  rm -rf "$ctx"
}

runtime() {
  ctx="$B/runtime" && mkdir -p "$ctx"
  # TraceVault CLI (Linux arm64 release asset).
  tv=tracevault-v0.28.3-aarch64-unknown-linux-gnu.tar.gz
  [ -f "$ctx/$tv" ] || gh release download v0.28.3 -R VirtusLab/visdom-ai-tracing-cli -p "$tv" -D "$ctx"
  # The runtime kit of orchestrator main (entrypoint + lib, contract 1).
  rm -rf "$ctx/kit" && mkdir -p "$ctx/kit" && cp "$SRC/runtime-kit/entrypoint.sh" "$ctx/kit/" && cp -R "$SRC/runtime-kit/lib" "$ctx/kit/lib"
  echo 1 > "$ctx/kit/lib/CONTRACT"
  # Hobby Wizard's dependencies for linux/arm64, installed on the host from its lockfile.
  if [ ! -d "$ctx/hw/node_modules" ]; then
    d=$(mktemp -d) && cp "$HW/package.json" "$HW/pnpm-lock.yaml" "$HW/pnpm-workspace.yaml" "$d/"
    jq 'del(.packageManager)' "$d/package.json" > "$d/p" && mv -f "$d/p" "$d/package.json"
    printf '\nsupportedArchitectures:\n  os: [linux]\n  cpu: [arm64]\n  libc: [glibc]\n' >> "$d/pnpm-workspace.yaml"
    (cd "$d" && pnpm install --frozen-lockfile --ignore-scripts >/dev/null)
    mkdir -p "$ctx/hw" && mv "$d/node_modules" "$ctx/hw/node_modules" && rm -rf "$d"
  fi
  cp "$HERE/../runtime/Dockerfile" "$HERE/../runtime/pnpm-shim.sh" "$HERE/../runtime/codex-wrapper.sh" "$ctx/"
  docker build -q -t "localhost:5001/visdom/runtime-demo:$RUNTIME_TAG" "$ctx" >/dev/null
  docker push -q "localhost:5001/visdom/runtime-demo:$RUNTIME_TAG"
}

case "${1:-all}" in
  server) server ;;
  runtime) runtime ;;
  all) server; runtime ;;
  *) echo "usage: $0 [server|runtime|all]" >&2; exit 2 ;;
esac
