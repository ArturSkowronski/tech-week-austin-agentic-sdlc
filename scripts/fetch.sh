#!/usr/bin/env bash
# Takes the line's results out of the cluster (/work/out) into .sdlc/out/<order>/attempt-N/: patch, description, reports, ledger.
set -euo pipefail
cd "$(dirname "$0")/.."
pod=$(kubectl get pod -n factory -l app=depot -o jsonpath='{.items[0].metadata.name}')
mkdir -p .sdlc/out
kubectl exec -n factory "$pod" -- tar -czf - -C /work out 2>/dev/null | tar -xzf - -C .sdlc
# The reports link Jaeger and the floor on the cluster's localhost ports: the browser needs the codespace's forwarded
# address. Only the .md reports: the ledger is signed, and a changed byte would break its signature.
if [ -n "${CODESPACE_NAME:-}" ]; then
  . scripts/workshop.env; d=${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}
  find .sdlc/out -name '*.md' -exec sed -i "s#http://localhost:$JAEGER_PORT#https://$CODESPACE_NAME-$JAEGER_PORT.$d#g; s#http://localhost:$HALL_PORT#https://$CODESPACE_NAME-$HALL_PORT.$d#g" {} +
fi
echo "Results in .sdlc/out/:"; find .sdlc/out -type f | sort | sed 's/^/  /'
