#!/usr/bin/env bash
# Sends a work order down the line: a snapshot of the repo into the cluster, then an Argo Workflow from the `factory` template.
#   scripts/order.sh hw-001 [kagent|replay] [attempt]
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/workshop.env
O=${1:?Name a work order, e.g. make order O=hw-001}
AGENT=${2:-${AGENT:-kagent}}
ATTEMPT=${3:-1}
[ -f "orders/$O.md" ] || { echo "no work order orders/$O.md"; ls orders; exit 1; }
scripts/send.sh >/dev/null
name=$(argo submit -n factory --from workflowtemplate/factory -p "order=$O" -p "agent=$AGENT" -p "attempt=$ATTEMPT" -p "variant=${REPLAY_VARIANT:-}" \
  --generate-name "factory-$O-" -o name)
echo "Run: $name (agent=$AGENT, attempt $ATTEMPT). The floor: https://${CODESPACE_NAME:-?}-$HALL_PORT.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}/workflows/factory/$name"
argo watch -n factory "$name" 2>/dev/null | tail -n 25 || true
status=$(argo get -n factory "$name" -o json | jq -r .status.phase)
echo "Result: $status. Fetch: make fetch"
[ "$status" = "Succeeded" ]
