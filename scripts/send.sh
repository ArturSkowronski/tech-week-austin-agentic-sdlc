#!/usr/bin/env bash
# Puts a snapshot of your repo into the cluster: /work/repo in the depot. The whole git history goes along (the actual
# owners of the modules come from it, L3) and your working tree, committed on main under your name.
# No git server, no tokens. The line and the agent work on this copy; results come back with make fetch.
# The game's dependencies are not sent: /work/repo/system/node_modules links to /opt/hw/node_modules in the image.
set -euo pipefail
cd "$(dirname "$0")/.."
pod=$(kubectl get pod -n factory -l app=depot -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
[ -n "$pod" ] || { echo "no depot: make setup"; exit 1; }
who=$(git config user.name || echo "participant"); mail=$(git config user.email || echo "participant@workshop")
COPYFILE_DISABLE=1 tar --no-xattrs --exclude node_modules --exclude .sdlc --exclude __pycache__ --exclude .oracle \
  --exclude 'platform/line/cosign/cosign.key' -czf - . 2>/dev/null | kubectl exec -i -n factory "$pod" -- sh -c "
  rm -rf /work/repo && mkdir -p /work/repo /work/out && tar -xzf - -C /work/repo && cd /work/repo \
  && ln -s /opt/hw/node_modules system/node_modules \
  && git config user.name '$who' && git config user.email '$mail' \
  && git switch -q -C main && git add -A \
  && (git commit -qm 'snapshot: the working tree from the codespace' >/dev/null 2>&1 || true) \
  && git log --oneline -1"
