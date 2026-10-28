# Shared by the finale's targets: GH_REPO (the fork) and GH_TOKEN. Source: env, then the Secret in the cluster, then gh.
# Usage: . scripts/github-env.sh
if [ -z "${GH_REPO:-}" ]; then
  GH_REPO=$(kubectl get secret factory-github -n factory -o jsonpath='{.data.GH_REPO}' 2>/dev/null | base64 -d)
fi
if [ -z "${GH_TOKEN:-}" ]; then
  GH_TOKEN=$(kubectl get secret factory-github -n factory -o jsonpath='{.data.GH_TOKEN}' 2>/dev/null | base64 -d)
  [ -n "$GH_TOKEN" ] || GH_TOKEN=$(gh auth token 2>/dev/null)
fi
[ -n "${GH_REPO:-}" ] && [ -n "${GH_TOKEN:-}" ] || { echo "First: make github"; return 1 2>/dev/null || exit 1; }
export GH_REPO GH_TOKEN
