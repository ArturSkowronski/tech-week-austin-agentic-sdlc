#!/usr/bin/env bash
# Seed the local Gitea: user `visdom` (admin, used by the agents), repository
# visdom/hobby-wizard mirrored from a local clone of
# VirtusLab/visdom-sandbox-hobby-wizard (main only; nothing is ever pushed back
# to GitHub), the label `planted` and the HW-001 issue. Idempotent.
#
# Credentials stay outside the repo, in ~/.config/visdom-local/:
#   gitea-password  the visdom user's password (browser login)
#   gitea-token     its API token (becomes the Visdom project secret GITEA_TOKEN)
set -euo pipefail
CTX=kind-visdom-local
k() { kubectl --context "$CTX" "$@"; }
CONF=~/.config/visdom-local
SRC=${HOBBY_WIZARD_CLONE:-$HOME/visdom-demo-repos/hobby-wizard}
G=http://git.visdom.localtest.me:18080
mkdir -p "$CONF" && chmod 700 "$CONF"

if [ ! -d "$SRC/.git" ]; then
  mkdir -p "$(dirname "$SRC")"
  gh repo clone VirtusLab/visdom-sandbox-hobby-wizard "$SRC" -- -q
fi

gitea() { k -n visdom-orchestrator exec deploy/gitea -- gitea --config /etc/gitea/app.ini "$@"; }
[ -s "$CONF/gitea-password" ] || (openssl rand -hex 12 > "$CONF/gitea-password"; chmod 600 "$CONF/gitea-password")
if ! gitea admin user list 2>/dev/null | awk '{print $2}' | grep -qx visdom; then
  gitea admin user create --username visdom --email visdom@visdom.local --admin \
    --password "$(cat "$CONF/gitea-password")" --must-change-password=false >/dev/null
  echo "created Gitea user visdom"
fi
if [ ! -s "$CONF/gitea-token" ] || ! curl -sf "$G/api/v1/user" -H "Authorization: token $(cat "$CONF/gitea-token")" >/dev/null; then
  gitea admin user generate-access-token --username visdom --token-name "visdom-agents-$(date +%s)" \
    --scopes all --raw > "$CONF/gitea-token"
  chmod 600 "$CONF/gitea-token"
  echo "issued a Gitea token"
fi
TOKEN=$(cat "$CONF/gitea-token")
api() { curl -sf -H "Authorization: token $TOKEN" -H 'Content-Type: application/json' "$@"; }

if ! api "$G/api/v1/repos/visdom/hobby-wizard" >/dev/null; then
  api -X POST "$G/api/v1/user/repos" -d '{"name":"hobby-wizard","description":"Local mirror of VirtusLab/visdom-sandbox-hobby-wizard for the Visdom workshop demo","default_branch":"main","private":false}' >/dev/null
  git -C "$SRC" fetch -q origin main
  git -C "$SRC" -c http.extraHeader="Authorization: token $TOKEN" \
    push -q "$G/visdom/hobby-wizard.git" "refs/remotes/origin/main:refs/heads/main"
  echo "mirrored hobby-wizard main into Gitea"
fi

label_id=$(api "$G/api/v1/repos/visdom/hobby-wizard/labels" | jq -r '.[] | select(.name=="planted") | .id')
if [ -z "$label_id" ]; then
  label_id=$(api -X POST "$G/api/v1/repos/visdom/hobby-wizard/labels" \
    -d '{"name":"planted","color":"#7c3aed","description":"A planted bug from bugs/manifest.json"}' | jq -r .id)
fi

if [ "$(api "$G/api/v1/repos/visdom/hobby-wizard/issues?state=all&type=issues" | jq length)" = 0 ]; then
  # The ticket the game raises for HW-001 (see bugs/manifest.json): symptom, steps, expected, logs. No file named.
  body=$(jq -n '"**Symptom.** Left and right feel swapped.\n\n**Clue.** input handling\n\n**Steps**\n1. Walk through the bush; the creature jumps on.\n2. Hold right.\n\n**Expected.** The wizard walks right.\n\n**Evidence from the waterfall of logs**\n```\n[input] left/right mapping: INVERTED\n[input] axis sign flipped while carrying\n[bug] hides in: input handling\n```\n\nRaised from the game (room: forest-glade)."')
  api -X POST "$G/api/v1/repos/visdom/hobby-wizard/issues" \
    -d "$(jq -n --argjson b "$body" --argjson l "$label_id" '{title:"Left and right swap while the creature rides", body:$b, labels:[$l]}')" >/dev/null
  echo "opened issue #1 (HW-001)"
fi
if [ "$(api "$G/api/v1/repos/visdom/hobby-wizard/issues?state=all&type=issues" | jq length)" = 1 ]; then
  # Issue #2 for lesson 4: a symptom without an expected behaviour, so intake has to ask.
  api -X POST "$G/api/v1/repos/visdom/hobby-wizard/issues" \
    -d "$(jq -n '{title:"The wizard feels wrong near the waterfall", body:"Something is off when I play near the waterfall in the glade. It just does not feel right.\n\nRaised from the game (room: forest-glade)."}')" >/dev/null
  echo "opened issue #2 (vague, for the intake lesson)"
fi
echo "Gitea: http://git.localhost:18080/visdom/hobby-wizard (user visdom, password in $CONF/gitea-password)"
