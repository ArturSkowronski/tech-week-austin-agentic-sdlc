#!/usr/bin/env bash
# Tools the devcontainer features do not give: kind, argo, cosign (the same versions as the instructor's), pnpm for the
# game (system/), plus the workshop tools (factory, the autopilot prompts, /factory-autopilot in Claude Code).
set -euo pipefail
arch=$(dpkg --print-architecture)
KIND_VERSION=v0.33.0
ARGO_VERSION=v4.1.4
COSIGN_VERSION=v3.1.3
PNPM_VERSION=11.27.1   # the packageManager of system/package.json
tmp=$(mktemp -d)
curl -fsSL -o "$tmp/kind" "https://kind.sigs.k8s.io/dl/$KIND_VERSION/kind-linux-$arch"
curl -fsSL "https://github.com/argoproj/argo-workflows/releases/download/$ARGO_VERSION/argo-linux-$arch.gz" | gunzip > "$tmp/argo"
curl -fsSL -o "$tmp/cosign" "https://github.com/sigstore/cosign/releases/download/$COSIGN_VERSION/cosign-linux-$arch"
sudo install -m 0755 "$tmp/kind" "$tmp/argo" "$tmp/cosign" /usr/local/bin/
sudo apt-get update -qq && sudo apt-get install -y -qq jq gettext-base python3 rsync >/dev/null   # python3: factory and sdlc/ (standard library only); gettext-base: envsubst
rm -rf "$tmp"
# pnpm for the game's gate (make test, make oracle). Node 22 and pnpm (pinned to system/package.json) come from the
# devcontainer feature; this is the fallback.
command -v pnpm >/dev/null || npm install -g "pnpm@$PNPM_VERSION" >/dev/null 2>&1 || { corepack enable && corepack prepare "pnpm@$PNPM_VERSION" --activate; }
git config --global --add safe.directory '*'   # the workspace is mounted with another owner
bash lessons/tools/install.sh
sudo ln -sf "$HOME/.local/bin/factory" /usr/local/bin/factory   # visible in shells without .bashrc too (gh codespace ssh -- ...)
# The game's dependencies once, so the first make test does not wait for them. A network error does not stop the codespace.
(cd system && pnpm install --frozen-lockfile >/dev/null 2>&1) || echo "Note: pnpm install in system/ failed. make test runs it again."
# Claude Code with the native installer. A network error does not stop the codespace: factory autopilot says how to add it later.
if curl -fsSL https://claude.ai/install.sh | bash >/dev/null 2>&1; then
  sudo ln -sf "$HOME/.local/bin/claude" /usr/local/bin/claude
  echo "Claude Code $(claude --version 2>/dev/null | cut -d' ' -f1). Log in: factory login"
else
  echo "Note: Claude Code did not install. Later: curl -fsSL https://claude.ai/install.sh | bash"
fi
echo "Tools ready: kind $(kind version | cut -d' ' -f2), argo $ARGO_VERSION, cosign $COSIGN_VERSION, node $(node -v), pnpm $(pnpm -v), factory."
