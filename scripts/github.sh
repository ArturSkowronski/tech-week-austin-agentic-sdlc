#!/usr/bin/env bash
# Finale: connect the factory to your fork on GitHub.
#   1. the fork: issues, Actions, auto-merge, the factory's labels, main protection (required checks), the cosign key on main
#   2. the Secret factory-github in the cluster (token and repo) for the line's steps that talk to GitHub
#   3. the CronWorkflow factory-pull: every two minutes it takes the oldest issue labelled `factory` or `planted`
# Repo: GH_REPO or origin. Token: GH_TOKEN or `gh auth token` (the repo scope is enough).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${GH_REPO:-}" ]; then
  url=$(git remote get-url origin 2>/dev/null || true)
  GH_REPO=$(printf '%s' "$url" | sed -nE 's#^(https://github\.com/|git@github\.com:)([^/]+/[^/.]+)(\.git)?$#\2#p')
fi
[ -n "${GH_REPO:-}" ] || { echo "I do not know your fork. Point origin at the fork or pass it: make github GH_REPO=login/tech-week-austin-agentic-sdlc"; exit 1; }
# The codespace's integration token (ghu_) cannot change repo settings: treat it as no token.
case "${GH_TOKEN:-}" in ghu_*) GH_TOKEN="" ;; esac
if [ -z "${GH_TOKEN:-}" ]; then
  command -v gh >/dev/null || { echo "No GH_TOKEN and no gh. Log in: gh auth login, or pass GH_TOKEN (fine-grained: contents, issues, pull requests, administration)"; exit 1; }
  if [ "${CODESPACES:-}" = true ]; then
    # In a codespace gh takes the codespace's GITHUB_TOKEN by default. It is an integration token: it pushes code and opens
    # issues, but cannot change repo settings (HTTP 403 "Resource not accessible by integration"). We take your gh login.
    GH_TOKEN=$(env -u GITHUB_TOKEN -u GH_TOKEN gh auth token 2>/dev/null || true)
    if [ -z "$GH_TOKEN" ]; then
      cat <<'MSG'
In Codespaces make github needs your gh login, not the codespace's token (that one cannot change repo settings).
Log in once in this terminal (you type the code from the terminal at github.com/login/device):

  env -u GITHUB_TOKEN gh auth login -h github.com -s repo,workflow

Then again: make github
MSG
      exit 1
    fi
  else
    GH_TOKEN=$(gh auth token)
  fi
fi
export GH_REPO GH_TOKEN
echo "Fork: https://github.com/$GH_REPO"
python3 sdlc/github.py fork
kubectl create secret generic factory-github -n factory --from-literal=GH_TOKEN="$GH_TOKEN" --from-literal=GH_REPO="$GH_REPO" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl apply -f platform/github/pull.yaml >/dev/null
echo "Cluster: the Secret factory-github and the CronWorkflow factory-pull are ready."
echo "A work order: make issue O=hw-001 (or raise the ticket from the game: label planted). The factory takes it within two minutes; right now: make pull"
