#!/usr/bin/env bash
# The factory's key pair for signing the ledger (Sigstore cosign, an offline key: a room without Wi-Fi does not block the lesson).
# The private key goes into a Secret in the cluster (the line's `ledger` step), the public one stays in the repo for verification.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=platform/line/cosign
mkdir -p "$dir"
if [ ! -f "$dir/cosign.key" ]; then
  (cd "$dir" && COSIGN_PASSWORD="" cosign generate-key-pair >/dev/null 2>&1)
  echo "a new key pair: $dir/cosign.key (private, outside git) and $dir/cosign.pub"
fi
kubectl create secret generic factory-cosign -n factory --from-file=cosign.key="$dir/cosign.key" \
  --from-literal=COSIGN_PASSWORD="" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
echo "Secret factory-cosign ready. Verify: cosign verify-blob --key $dir/cosign.pub --bundle <file>.sigstore.json <file>"
