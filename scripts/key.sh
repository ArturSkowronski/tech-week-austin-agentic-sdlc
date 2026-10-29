#!/usr/bin/env bash
# factory key: the model key for the factory's agents (Secret factory-llm + ModelConfig) and a restart of the agents.
# The key: the LLM_API_KEY variable or typed (invisibly) after the prompt. Never pass it as an argument: it would stay in the shell history.
# The kind of key picks the API: sk-ant-… is the Claude API (Anthropic), sk-or-… is OpenRouter, other sk-… (sk-proj-…,
# sk-svcacct-…) is OpenAI. LLM_BASE_URL and LLM_MODEL set by hand win.
set -euo pipefail
cd "${FACTORY_REPO:-$(dirname "$0")/..}"   # factory key runs the copy from the tools, inside the repo directory
your_url=${LLM_BASE_URL:-}; your_model=${LLM_MODEL:-}
. scripts/workshop.env

k=${LLM_API_KEY:-}
if [ -z "$k" ]; then
  read -rsp "Model key (paste and press Enter, it will not be shown): " k; echo
fi
k=$(printf '%s' "$k" | tr -d '[:space:]')
[ -n "$k" ] || { echo "Empty key. Nothing changed."; exit 1; }

case "$k" in
  sk-ant-*) kind="Claude API (Anthropic)"; url=https://api.anthropic.com/v1; model=claude-sonnet-5 ;;
  sk-or-*)  kind="OpenRouter";             url=https://openrouter.ai/api/v1;  model=anthropic/claude-sonnet-5 ;;
  sk-*)     kind="OpenAI";                 url=https://api.openai.com/v1;     model=gpt-5.4 ;;
  *)        kind="an OpenAI-compatible API"; url=$LLM_BASE_URL;               model=$LLM_MODEL ;;
esac
LLM_BASE_URL=${your_url:-$url}; LLM_MODEL=${your_model:-$model}
echo "Key: $kind, $LLM_BASE_URL, model $LLM_MODEL"

# One short request before the key reaches the cluster: a bad key or model shows here, not in an agent's log.
if [ "${KEY_SKIP_TEST:-0}" != 1 ]; then
  LLM_API_KEY="$k" LLM_BASE_URL="$LLM_BASE_URL" LLM_MODEL="$LLM_MODEL" python3 - <<'PY' || { echo "Key not saved. To force it without the test: KEY_SKIP_TEST=1 factory key"; exit 1; }
import json, os, sys, urllib.request, urllib.error
def ask(limit):
    # OpenAI's gpt-5 family and the o-series reject max_tokens (HTTP 400): they want max_completion_tokens.
    req = urllib.request.Request(os.environ["LLM_BASE_URL"].rstrip("/") + "/chat/completions",
        data=json.dumps({"model": os.environ["LLM_MODEL"], limit: 20,
                         "messages": [{"role": "user", "content": "Answer: ok"}]}).encode(),
        headers={"Authorization": "Bearer " + os.environ["LLM_API_KEY"], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        json.load(r)
try:
    try:
        ask("max_tokens")
    except urllib.error.HTTPError as e:
        e.body = e.read()   # reading consumes the body: keep it for the message below
        if e.code != 400 or b"max_completion_tokens" not in e.body:
            raise
        ask("max_completion_tokens")
    print("Model test: it answers.")
except urllib.error.HTTPError as e:
    body = getattr(e, "body", None) or e.read()
    body = body[:300].decode(errors="replace")
    why = {401: "key rejected (wrong or revoked)", 403: "no access to this model",
           404: "unknown model or API address", 429: "rate limit or no credit on the account"}.get(e.code, "API error")
    print(f"Model test: HTTP {e.code}, {why}.\n  {body}"); sys.exit(1)
except Exception as e:
    print(f"Model test: no connection to {os.environ['LLM_BASE_URL']}: {e}"); sys.exit(1)
PY
fi

# Server-side apply: the Secret was created without kubectl's last-applied annotation, and a client-side apply warns.
kubectl create secret generic factory-llm -n factory --from-literal=LLM_API_KEY="$k" --dry-run=client -o yaml | kubectl apply --server-side --force-conflicts -f - >/dev/null
LLM_MODEL="$LLM_MODEL" LLM_BASE_URL="$LLM_BASE_URL" envsubst < platform/kagent/modelconfig.yaml | kubectl apply --server-side --force-conflicts -f - >/dev/null
# factory start and factory lesson put the default ModelConfig back (cluster.sh): factory remembers the API and the model.
[ -n "${FACTORY_MODEL_ENV:-}" ] && printf 'LLM_BASE_URL=%s\nLLM_MODEL=%s\n' "$LLM_BASE_URL" "$LLM_MODEL" > "$FACTORY_MODEL_ENV"
# The agents read the key when their pod starts: a restart, and we wait for it, so the next question gets the new key.
kubectl rollout restart deploy -n factory -l app=kagent >/dev/null 2>&1 || true
echo "Saved. Restarting the agents with the new key (up to two minutes)..."
for d in $(kubectl get deploy -n factory -l app=kagent -o name 2>/dev/null); do
  kubectl rollout status -n factory "$d" --timeout=180s >/dev/null 2>&1 || echo "  $d is not up yet: factory doctor shows it"
done
echo "Done. Check: factory ask probe \"Introduce yourself\" (or factory doctor)"
