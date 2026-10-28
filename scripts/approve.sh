#!/usr/bin/env bash
# A human's approval: make approve W=<run> [WHO=login]. Records who approved and resumes the line.
set -euo pipefail
cd "$(dirname "$0")/.."
W=${1:?Name the run, e.g. make approve W=factory-startle-abcde (argo list -n factory)}
WHO=${2:-${WHO:-$(git config user.name || echo "$USER")}}
argo node set -n factory "$W" --output-parameter "who=$WHO" --node-field-selector "templateName=wait" >/dev/null
argo resume -n factory "$W" >/dev/null
echo "Approved by: $WHO. The line moves on: argo watch -n factory $W"
