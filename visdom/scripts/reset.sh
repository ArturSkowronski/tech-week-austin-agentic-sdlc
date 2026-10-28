#!/usr/bin/env bash
# Reset the Visdom demo to a clean run history: delete the orchestrator's
# namespace (vp-server, Gitea, the workspace and every run pod) and its
# database. Keycloak, Control Plane (project, secrets) and AI Tracing stay.
# Afterwards run visdom/scripts/up.sh to recreate everything.
set -euo pipefail
CTX=kind-visdom-local
k() { kubectl --context "$CTX" "$@"; }
read -r -p "Delete namespace visdom-orchestrator and database orchestrator on $CTX? [y/N] " ok
[ "$ok" = y ] || exit 1
k delete namespace visdom-orchestrator --wait=true
k -n visdom exec postgres-0 -- psql -U visdom -d postgres -c "DROP DATABASE IF EXISTS orchestrator WITH (FORCE)"
k delete clusterrolebinding,clusterrole vp-server-visdom-orchestrator-cluster-status --ignore-not-found
rm -f ~/.config/visdom-local/gitea-token ~/.config/visdom-local/visdom-demo-state.json
echo "reset done; run visdom/scripts/up.sh"
