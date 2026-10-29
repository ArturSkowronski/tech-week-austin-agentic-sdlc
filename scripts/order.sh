#!/usr/bin/env bash
# Sends a work order down the line: a snapshot of the repo into the cluster, then an Argo Workflow from the `factory` template.
#   scripts/order.sh hw-001 [kagent|replay] [attempt]
# While the run goes, every step is printed when it starts and when it ends, with the time since the start, so a run of
# a few minutes is never a silent terminal. Ctrl+C stops the watching, not the run (the floor keeps showing it).
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/workshop.env
O=${1:?Name a work order, e.g. make order O=hw-001}
AGENT=${2:-${AGENT:-kagent}}
ATTEMPT=${3:-1}
[ -f "orders/$O.md" ] || { echo "no work order orders/$O.md"; ls orders; exit 1; }
echo "Sending your working tree to the cluster (a snapshot for the line)..."
scripts/send.sh >/dev/null
name=$(argo submit -n factory --from workflowtemplate/factory -p "order=$O" -p "agent=$AGENT" -p "attempt=$ATTEMPT" -p "variant=${REPLAY_VARIANT:-}" \
  --generate-name "factory-$O-" -o name)
echo "Run: $name (agent=$AGENT, attempt $ATTEMPT). The floor: https://${CODESPACE_NAME:-?}-$HALL_PORT.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}/workflows/factory/$name"
case "$AGENT" in
  kagent) echo "A real agent: usually 2 to 5 minutes. Every step below as it starts and ends:" ;;
  *)      echo "A recorded change: usually 1 to 2 minutes. Every step below as it starts and ends:" ;;
esac

# The pods of the line are all called "run": the step's name is the template call above them (prepare, intake, builder...).
steps='.status.nodes as $n | ($n // {}) | to_entries | map(.value)
  | map(select(.type == "Pod" or .type == "Suspend")) | sort_by(.startedAt // "")
  | .[] | [.id, (if .displayName == "run" then ($n[.boundaryID].displayName // .displayName) else .displayName end), .phase] | @tsv'
t0=$(date +%s); seen=" "; quiet=0; asked=0; tries=0
while :; do
  json=$(kubectl get workflow -n factory "$name" -o json 2>/dev/null) || { sleep 3; continue; }
  now=$(( $(date +%s) - t0 )); clock=$(printf '%d:%02d' $((now / 60)) $((now % 60))); printed=0
  while IFS=$'\t' read -r id step phase; do
    [ -n "$id" ] || continue
    case "$seen" in *" $id:$phase "*) continue ;; esac
    # prepare starts every attempt: the second one is the rework after a failed gate (lesson 8).
    case "$seen" in *" $id:"*) ;; *) if [ "$step" = prepare ]; then
      tries=$((tries + 1)); if [ $tries -gt 1 ]; then echo "  [$clock] ↻ attempt $tries (rework)"; fi
    fi ;; esac
    seen="$seen$id:$phase "
    case "$phase" in
      Running)   echo "  [$clock] ▶ $step" ;;
      Succeeded) echo "  [$clock] ✔ $step" ;;
      Failed|Error) echo "  [$clock] ✘ $step (failed: open it on the floor for its log)" ;;
      *) continue ;;
    esac
    printed=1
    case "$step" in wait|human) [ "$phase" = Running ] && [ $asked = 0 ] && { asked=1
      echo "           ⏸ the line waits for a person. In a second terminal: make approve W=$name"; } ;; esac
  done < <(jq -r "$steps" <<<"$json")
  phase=$(jq -r '.status.phase // "Pending"' <<<"$json")
  case "$phase" in Pending|Running) ;; *) break ;; esac
  # Nothing new for a while (a model thinking, a build): say that it still works.
  if [ $printed = 1 ]; then quiet=$now; elif [ $((now - quiet)) -ge 20 ]; then echo "  [$clock] … still working"; quiet=$now; fi
  sleep 3
done
echo "Result: $phase. Fetch: make fetch"
[ "$phase" = "Succeeded" ]
