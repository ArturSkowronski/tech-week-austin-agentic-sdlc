#!/bin/sh
# Demo workaround (see visdom/README.md, known bugs): vp-entrypoint installs the
# TraceVault Codex hooks with `tracevault init --global --agent codex`, which
# writes $HOME/.codex/hooks.json, then runs codex with CODEX_HOME=/work/.codex,
# where there are no hooks, so the session is never traced. Carry them over.
if [ -n "${CODEX_HOME:-}" ] && [ "$CODEX_HOME" != "$HOME/.codex" ] && [ -f "$HOME/.codex/hooks.json" ]; then
  mkdir -p "$CODEX_HOME"
  [ -f "$CODEX_HOME/hooks.json" ] || cp "$HOME/.codex/hooks.json" "$CODEX_HOME/hooks.json"
  [ -f "$CODEX_HOME/AGENTS.md" ] || { [ -f "$HOME/.codex/AGENTS.md" ] && cp "$HOME/.codex/AGENTS.md" "$CODEX_HOME/AGENTS.md"; }
fi
# Codex 0.160 also skips hooks in `codex exec` until hook trust is granted
# interactively, which a pod never does; the hooks are the image's own.
if [ "${1:-}" = exec ] && [ -f "${CODEX_HOME:-$HOME/.codex}/hooks.json" ]; then
  shift
  exec node /usr/local/lib/node_modules/@openai/codex/bin/codex.js exec --dangerously-bypass-hook-trust "$@"
fi
exec node /usr/local/lib/node_modules/@openai/codex/bin/codex.js "$@"
