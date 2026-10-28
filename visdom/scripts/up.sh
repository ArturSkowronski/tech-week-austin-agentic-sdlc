#!/usr/bin/env bash
# Bring the Visdom demo up on the kind cluster visdom-local, from stopped or cold.
# Idempotent: run it again to converge. Needs the images from build-images.sh in
# the local registry (localhost:5001) and the OpenAI key in
# ~/.config/visdom-local/openai-api-key (read, never printed).
#
#   visdom/scripts/up.sh            # cluster + Visdom + Gitea + project config
#   visdom/scripts/up.sh --no-provision
set -euo pipefail
cd "$(dirname "$0")/.."
CTX=kind-visdom-local
k() { kubectl --context "$CTX" "$@"; }
step() { printf '\n== %s\n' "$*"; }
KC=http://keycloak.visdom.localtest.me:18080/realms/visdom-local
TV=http://ai-tracing.visdom.localtest.me:18080

step "containers: kind node and registry"
for c in kind-registry visdom-local-control-plane; do
  [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = true ] || docker start "$c" >/dev/null
done
until k get --raw /readyz >/dev/null 2>&1; do sleep 3; done
echo "API server ready"

step "free memory: the unrelated outboard prototype goes to 0 replicas"
k get ns outboard >/dev/null 2>&1 && k -n outboard scale deploy --all --replicas=0 >/dev/null || true

step "base services (Keycloak, Postgres, Control Plane, AI Tracing)"
k -n visdom rollout status statefulset/postgres --timeout=300s
k -n visdom rollout status deploy/keycloak --timeout=600s

step "Keycloak realm: the *.localhost browser hosts"
k -n visdom get cm keycloak-realm -o json | jq -r '.data["visdom-local-realm.json"]' > /tmp/visdom-realm.json
python3 scripts/realm-patch.py < /tmp/visdom-realm.json > /tmp/visdom-realm.patched.json
if ! cmp -s <(jq -S . /tmp/visdom-realm.json) <(jq -S . /tmp/visdom-realm.patched.json); then
  k -n visdom create configmap keycloak-realm --from-file=visdom-local-realm.json=/tmp/visdom-realm.patched.json \
    --dry-run=client -o yaml | k apply -f - >/dev/null
  k -n visdom rollout restart deploy/keycloak >/dev/null   # dev-file DB: the realm is re-imported on start
  k -n visdom rollout status deploy/keycloak --timeout=600s
fi
until curl -sf "$KC/.well-known/openid-configuration" >/dev/null; do sleep 3; done

step "Control Plane and AI Tracing: *.localhost hosts, suite links, orchestrator sync"
for ing in control-plane ai-tracing; do
  k -n visdom get ingress "$ing" -o json | jq --arg h "$ing.localhost" \
    'if ([.spec.rules[].host]|index($h)) then . else .spec.rules += [(.spec.rules[0] | .host=$h)] end
     | del(.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.generation,.metadata.managedFields,.status)' \
    | k apply -f - >/dev/null
done
k -n visdom set env deploy/control-plane \
  CP_SUITE_CONTROL_PLANE_URL=http://control-plane.localhost:18080 \
  CP_SUITE_TRACING_URL=http://ai-tracing.localhost:18080 \
  CP_SUITE_ORCHESTRATOR_URL=http://orchestrator.localhost:18080 \
  CP_ORCHESTRATOR_API_URL=http://vp-server.visdom-orchestrator.svc:8080 >/dev/null
k -n visdom set env deploy/ai-tracing \
  CORS_ORIGIN=http://ai-tracing.visdom.localtest.me:18080,http://ai-tracing.localhost:18080,http://control-plane.localhost:18080,http://orchestrator.localhost:18080 \
  AI_TRACING_SUITE_CONTROL_PLANE_URL=http://control-plane.localhost:18080 >/dev/null
k -n visdom rollout status deploy/control-plane --timeout=300s
k -n visdom rollout status deploy/ai-tracing --timeout=600s
# Both crash-loop until Keycloak answers after a cold start; wait until they serve.
until curl -sf http://control-plane.visdom.localtest.me:18080/readyz >/dev/null; do sleep 5; done
until curl -sf "$TV/health" >/dev/null; do sleep 5; done

step "orchestrator database"
k -n visdom exec postgres-0 -- psql -U visdom -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='orchestrator'" | grep -q 1 \
  || k -n visdom exec postgres-0 -- psql -U visdom -d postgres -c "CREATE DATABASE orchestrator" >/dev/null
k -n visdom exec postgres-0 -- psql -U visdom -d postgres -c \
  "DO \$\$BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='visdom_app') THEN CREATE ROLE visdom_app NOLOGIN; END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='visdom_retention') THEN CREATE ROLE visdom_retention NOLOGIN; END IF;
   END\$\$;" >/dev/null

step "orchestrator namespace and secrets"
k get ns visdom-orchestrator >/dev/null 2>&1 || k create ns visdom-orchestrator >/dev/null
if ! k -n visdom-orchestrator get secret vp-server-keys >/dev/null 2>&1; then
  k -n visdom-orchestrator create secret generic vp-server-keys \
    --from-literal=VP_POD_TOKEN_SIGNING_KEY_HEX="$(openssl rand -hex 32)" \
    --from-literal=VP_AUDIT_SEAL_KEY_V1="$(openssl rand -base64 32)" >/dev/null
  echo "generated vp-server-keys"
fi
if ! k -n visdom-orchestrator get secret vp-server-secret >/dev/null 2>&1; then
  # TraceVault ingest key: an AI Tracing API key owned by the dev user.
  until curl -sf "$TV/health" >/dev/null; do sleep 3; done
  tv_token=$(curl -sf -X POST "$KC/protocol/openid-connect/token" -d grant_type=password \
    -d client_id=visdom-ai-tracing -d username=dev -d password=devlocal -d scope=openid | jq -r .access_token)
  ingest=$(curl -sf -X POST "$TV/api/v1/api-keys" -H "Authorization: Bearer $tv_token" \
    -H 'Content-Type: application/json' -d '{"name":"visdom-orchestrator ingest"}' | jq -r .key)
  [ -n "$ingest" ] && [ "$ingest" != null ] || { echo "could not create the AI Tracing API key" >&2; exit 1; }
  # The M2M secret is the local realm's fixed dev value (visdom-auth realm-import).
  k -n visdom-orchestrator create secret generic vp-server-secret \
    --from-literal=VP_DATABASE_URL="postgres://visdom:visdom-local@postgres.visdom.svc:5432/orchestrator" \
    --from-literal=VP_M2M_CLIENT_SECRET="devlocal-orchestrator-m2m" \
    --from-literal=VP_TRACING_INGEST_KEY="$ingest" >/dev/null
  echo "generated vp-server-secret"
fi

step "orchestrator and Gitea"
k apply -f cluster/orchestrator.yaml >/dev/null
k apply -f cluster/gitea.yaml >/dev/null
k -n visdom-orchestrator rollout status deploy/vp-server --timeout=600s
k -n visdom-orchestrator rollout status deploy/gitea --timeout=300s

if [ "${1:-}" != --no-provision ]; then
  step "Gitea: admin, Hobby Wizard repository, issue"
  scripts/gitea-seed.sh
  step "Visdom project Hobby Wizard: containers, secrets, agents, flows"
  python3 -I scripts/provision.py
fi

step "ready"
cat <<EOF
Visdom (orchestrator)  http://orchestrator.localhost:18080
Control Plane          http://control-plane.localhost:18080
AI Tracing (TraceVault) http://ai-tracing.localhost:18080
Gitea (Hobby Wizard)   http://git.localhost:18080/visdom/hobby-wizard
Login: dev / devlocal (Keycloak realm visdom-local)
EOF
