#!/usr/bin/env bash
# Takes the line's results out of the cluster (/work/out) into .sdlc/out/<order>/attempt-N/: patch, description, reports, ledger.
set -euo pipefail
cd "$(dirname "$0")/.."
pod=$(kubectl get pod -n factory -l app=depot -o jsonpath='{.items[0].metadata.name}')
mkdir -p .sdlc/out
kubectl exec -n factory "$pod" -- tar -czf - -C /work out 2>/dev/null | tar -xzf - -C .sdlc
echo "Results in .sdlc/out/:"; find .sdlc/out -type f | sort | sed 's/^/  /'
