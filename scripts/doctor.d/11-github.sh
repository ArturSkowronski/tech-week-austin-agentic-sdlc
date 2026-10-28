# Finale: a fork on GitHub, gh and (after make github) the Secret and the poller in the cluster.
echo "GitHub (finale)"
if ! command -v gh >/dev/null; then fail "no gh: the codespace did not finish its setup (Codespaces: Rebuild Container)"
elif gh auth status >/dev/null 2>&1; then pass "gh logged in"
else fail "gh is not logged in: gh auth login (needed only in the finale)"; fi
origin=$(git remote get-url origin 2>/dev/null || true)
case "$origin" in
  *github.com*ArturSkowronski/tech-week-austin-agentic-sdlc*) fail "origin is the instructor's repo: fork it and git remote set-url origin <your fork>" ;;
  *github.com*) pass "origin: $origin" ;;
  *) fail "origin does not point at a fork on GitHub (see SETUP.md)" ;;
esac
if kubectl get secret factory-github -n factory >/dev/null 2>&1; then
  pass "Secret factory-github ($(kubectl get secret factory-github -n factory -o jsonpath='{.data.GH_REPO}' | base64 -d))"
  kubectl get cronworkflow factory-pull -n factory >/dev/null 2>&1 && pass "poller factory-pull" || fail "no poller: make github"
else
  pass "the fork is not connected to the cluster yet (make github in the finale)"
fi
kubectl get deploy workflow-controller -n argo -o jsonpath='{.spec.template.spec.containers[0].env}' 2>/dev/null | grep -q OTEL_EXPORTER_OTLP_ENDPOINT \
  && pass "Argo sends run traces to Jaeger" || fail "Argo without traces: make cluster (idempotent)"
