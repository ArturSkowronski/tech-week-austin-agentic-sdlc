#!/usr/bin/env bash
# Checks that everything is ready. Green = you come to the workshop and do not lose 20 minutes.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/workshop.env
ok=0
pass() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✘\033[0m %s\n' "$*"; ok=1; }
ver() { "$1" "${@:2}" 2>&1 | head -12 | grep -oE 'v?[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1; }

echo "Local"
for t in git docker kind kubectl helm argo cosign python3 jq; do
  command -v "$t" >/dev/null && pass "$t $(ver "$t" version 2>&1 || ver "$t" --version 2>&1)" || fail "no $t (see SETUP.md)"
done
command -v node >/dev/null && node -v | grep -qE '^v(2[2-9]|[3-9][0-9])' && pass "node $(node -v)" || fail "node 22+ (needed for make test and make oracle)"
command -v pnpm >/dev/null && pass "pnpm $(pnpm -v 2>/dev/null)" || fail "no pnpm (corepack enable, or npm i -g pnpm)"
docker info >/dev/null 2>&1 && pass "docker runs" || fail "docker does not run"
python3 sdlc/context.py route --title "Left and right swap while the creature rides" --body "doctor" >/dev/null 2>&1 \
  && pass "the factory's brain (sdlc/) runs locally" || fail "python3 sdlc/context.py route does not run"

echo "Cluster $KIND_CLUSTER"
kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER" && pass "kind: the cluster exists" || { fail "no cluster: factory start"; exit 1; }
kubectl config use-context "kind-$KIND_CLUSTER" >/dev/null 2>&1
kubectl get crd workflows.argoproj.io >/dev/null 2>&1 && pass "Argo Workflows: CRD" || fail "no Argo CRD: make cluster"
kubectl get deploy -n argo workflow-controller -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -q 1 && pass "Argo Workflows: controller" || fail "Argo: the controller does not run"
kubectl get crd agents.kagent.dev >/dev/null 2>&1 && pass "kagent: CRD" || fail "no kagent CRD: make cluster"
kubectl get deploy -n kagent kagent-controller -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -q 1 && pass "kagent: controller" || fail "kagent: the controller does not run"
kubectl get crd mcpservers.kagent.dev >/dev/null 2>&1 && pass "kmcp: MCPServer CRD" || fail "no MCPServer CRD"
kubectl get modelconfig factory-model -n factory -o jsonpath='{.status.conditions[?(@.type=="Accepted")].status}' 2>/dev/null | grep -q True && pass "ModelConfig factory-model" || fail "ModelConfig factory-model is not accepted"
key=$(kubectl get secret factory-llm -n factory -o jsonpath='{.data.LLM_API_KEY}' 2>/dev/null | base64 -d)
model=$(kubectl get modelconfig factory-model -n factory -o jsonpath='{.spec.model}' 2>/dev/null)
if [ "$key" = "none" ] || [ -z "$key" ]; then pass "model key: none (replay mode; you get a key in the room: factory key)"; else pass "model key set (model: $model)"; fi
kubectl get agent probe -n factory -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q True && pass "agent probe ready" || fail "agent probe is not ready"
kubectl get deploy -n kyverno kyverno-admission-controller -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -q 1 && pass "Kyverno" || fail "Kyverno does not run"
kubectl get deploy -n factory jaeger -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -q 1 && pass "Jaeger" || fail "Jaeger does not run"
curl -fsS -m 5 "http://localhost:$KAGENT_API_PORT/api/a2a/factory/probe/.well-known/agent-card.json" >/dev/null 2>&1 \
  && pass "A2A of the probe agent answers (port $KAGENT_API_PORT)" || fail "A2A does not answer on port $KAGENT_API_PORT (kind.yaml, nodeports.yaml)"
for extra in scripts/doctor.d/*.sh; do [ -f "$extra" ] && . "$extra"; done

[ $ok -eq 0 ] && printf '\n\033[32mAll set. See you in Austin!\033[0m\n' || printf '\n\033[31mFix the red items. If you get stuck, reply to the setup email.\033[0m\n'
exit $ok
