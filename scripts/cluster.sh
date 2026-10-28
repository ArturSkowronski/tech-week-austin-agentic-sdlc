#!/usr/bin/env bash
# Builds the factory cluster from scratch or adds the missing parts. Idempotent: you can run it many times.
#   kind (cluster) → Argo Workflows (the line) → kagent (agents) → Kyverno (policy) → Jaeger (traces)
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/workshop.env

KAGENT_VERSION=0.10.1
ARGO_VERSION=v4.1.4
KYVERNO_CHART=3.9.1

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "kind: cluster $KIND_CLUSTER"
if ! kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER"; then
  envsubst < platform/kind.yaml > "${TMPDIR:-/tmp}/factory-kind.yaml"
  kind create cluster --config "${TMPDIR:-/tmp}/factory-kind.yaml" --wait 120s
else
  echo "the cluster is already there"
fi
kubectl config use-context "kind-$KIND_CLUSTER" >/dev/null
kubectl create namespace factory --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl create namespace argo --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl create namespace kagent --dry-run=client -o yaml | kubectl apply -f - >/dev/null

step "Argo Workflows $ARGO_VERSION (the line)"
# Argo's CRDs carry annotations > 256 KiB, so apply has to be server-side. No artifact repository: results go to the /work disk.
kubectl apply --server-side --force-conflicts -n argo \
  -f "https://github.com/argoproj/argo-workflows/releases/download/$ARGO_VERSION/install.yaml" >/dev/null
JAEGER_PORT=$JAEGER_PORT envsubst '${JAEGER_PORT}' < platform/argo/controller-configmap.yaml | kubectl apply --server-side --force-conflicts -f - >/dev/null
# The floor without a login and over HTTP: it is a cluster in your codespace, behind its private ports.
kubectl patch deploy argo-server -n argo --type=json -p '[
  {"op":"replace","path":"/spec/template/spec/containers/0/args","value":["server","--auth-mode=server","--secure=false"]},
  {"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/scheme","value":"HTTP"}]' >/dev/null
# The trace of a run (lesson 10): the controller opens a trace for every run and gives the steps TRACEPARENT.
kubectl set env deploy/workflow-controller -n argo OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger.factory.svc:4317 \
  OTEL_EXPORTER_OTLP_INSECURE=true OTEL_SERVICE_NAME=argo-workflows >/dev/null

step "kagent $KAGENT_VERSION (agents)"
# The Secret with the key must exist before the agents start; without a key it holds "none" and the line works in replay mode.
kubectl get secret factory-llm -n factory >/dev/null 2>&1 || \
  kubectl create secret generic factory-llm -n factory --from-literal=LLM_API_KEY=none >/dev/null
kubectl get secret kagent-openai -n kagent >/dev/null 2>&1 || \
  kubectl create secret generic kagent-openai -n kagent --from-literal=OPENAI_API_KEY=none >/dev/null
CHART_CRDS=${KAGENT_CHART_CRDS:-oci://ghcr.io/kagent-dev/kagent/helm/kagent-crds}
CHART=${KAGENT_CHART:-oci://ghcr.io/kagent-dev/kagent/helm/kagent}
# The kagent charts are public on ghcr.io. A stale Docker login to ghcr.io (which Helm
# finds by itself) turns an anonymous pull into "403: denied". So the charts are pulled anonymously: an empty registry
# config whose credential helper always answers "not found". No login is used or changed.
anon=$(mktemp -d)
printf '{"auths":{},"credsStore":"factory-none"}\n' > "$anon/config.json"
printf '#!/bin/sh\necho "credentials not found in native keychain"\nexit 1\n' > "$anon/docker-credential-factory-none"
chmod +x "$anon/docker-credential-factory-none"
anonymous() { PATH="$anon:$PATH" DOCKER_CONFIG=$anon HELM_REGISTRY_CONFIG=$anon/config.json "$@"; }
anonymous helm upgrade --install kagent-crds "$CHART_CRDS" --version "$KAGENT_VERSION" -n kagent >/dev/null
anonymous helm upgrade --install kagent "$CHART" --version "$KAGENT_VERSION" -n kagent -f platform/kagent/values.yaml >/dev/null
rm -rf "$anon"
LLM_MODEL="$LLM_MODEL" LLM_BASE_URL="$LLM_BASE_URL" envsubst < platform/kagent/modelconfig.yaml | kubectl apply -f - >/dev/null
kubectl apply -f platform/kagent/agent-probe.yaml >/dev/null
# The workshop (lesson 2) and the rest come with make setup, because they need images built locally.

step "Kyverno $KYVERNO_CHART (policy, admission only)"
helm repo add kyverno https://kyverno.github.io/kyverno/ >/dev/null 2>&1 || true
helm repo update kyverno >/dev/null 2>&1
helm upgrade --install kyverno kyverno/kyverno --version "$KYVERNO_CHART" -n kyverno --create-namespace \
  --set admissionController.replicas=1 --set backgroundController.enabled=false \
  --set cleanupController.enabled=false --set reportsController.enabled=false >/dev/null

step "Jaeger (OpenTelemetry traces)"
kubectl apply -f platform/otel/jaeger.yaml >/dev/null
kubectl apply -f platform/nodeports.yaml >/dev/null

step "Waiting for the pods"
kubectl rollout status -n argo deploy/argo-server --timeout=180s >/dev/null
kubectl rollout status -n kagent deploy/kagent-controller --timeout=300s >/dev/null
kubectl rollout status -n kagent deploy/kagent-ui --timeout=180s >/dev/null
kubectl rollout status -n kyverno deploy/kyverno-admission-controller --timeout=180s >/dev/null
kubectl rollout status -n factory deploy/jaeger --timeout=180s >/dev/null
kubectl wait --for=condition=Ready agent/probe -n factory --timeout=180s >/dev/null

cat <<MSG

The cluster is up. In the browser: the PORTS tab (the floor $HALL_PORT, kagent $KAGENT_UI_PORT, Jaeger $JAEGER_PORT),
or the links from: factory urls
Check: factory doctor
MSG
