#!/usr/bin/env bash
# Installs the participant's tools outside the repo, so that switching lessons does not remove them:
#   ~/.local/bin/factory                        the CLI (factory lesson|map|check|solve|autopilot)
#   ~/.local/share/factory/autopilot/*.md       the autopilot prompts, one per lesson
#   ~/.claude/commands/factory-autopilot.md     the Claude Code command: /factory-autopilot N
#   ~/.local/share/factory/sdlc/a2a.py          the A2A client from main (factory ask)
#   ~/.local/share/factory/completion.bash      Tab completion for factory, loaded from ~/.bashrc and ~/.zshrc
set -euo pipefail
src=$(cd "$(dirname "$0")" && pwd)
bin=${FACTORY_BIN:-$HOME/.local/bin}
data=${FACTORY_DATA:-$HOME/.local/share/factory}
mkdir -p "$bin" "$data/autopilot" "$HOME/.claude/commands"
install -m 0755 "$src/factory" "$bin/factory"
cp "$src"/autopilot/*.md "$data/autopilot/"
cp "$src/claude-autopilot.md" "$HOME/.claude/commands/factory-autopilot.md"
# Solutions that cannot be taken straight from the next lesson's tag (lesson 9), and the key script from main.
rm -rf "$data/solutions"; [ -d "$src/solutions" ] && cp -R "$src/solutions" "$data/solutions"
[ -f "$src/../../scripts/key.sh" ] && cp "$src/../../scripts/key.sh" "$data/key.sh"
# The A2A client from main (factory ask, factory check 1): the lesson tags carry an older one.
mkdir -p "$data/sdlc"; for f in a2a.py tracing.py lib.py; do [ -f "$src/../../sdlc/$f" ] && cp "$src/../../sdlc/$f" "$data/sdlc/"; done
# The game's config from main ("Raise ticket on GitHub" on the fork): factory lesson puts it on the old tags.
mkdir -p "$data/system"; [ -f "$src/../../system/vite.config.ts" ] && cp "$src/../../system/vite.config.ts" "$data/system/"
# The welcome lives outside the repo too: lesson tags are older than .devcontainer, so after factory lesson N the file may be gone.
[ -f "$src/../../.devcontainer/welcome.txt" ] && cp "$src/../../.devcontainer/welcome.txt" "$data/welcome.txt"
# Tab completion: factory <Tab>, factory lesson <Tab>, factory ask <Tab>. A new terminal picks it up.
cp "$src/completion.bash" "$data/completion.bash"
[ -f "$HOME/.bashrc" ] && ! grep -q 'factory: completion' "$HOME/.bashrc" \
  && printf '\n[ -f "%s" ] && . "%s"  # factory: completion\n' "$data/completion.bash" "$data/completion.bash" >> "$HOME/.bashrc"
[ -f "$HOME/.zshrc" ] && ! grep -q 'factory: completion' "$HOME/.zshrc" \
  && printf '\n[ -f "%s" ] && { (( $+functions[compdef] )) || { autoload -U compinit && compinit -u; }; autoload -U +X bashcompinit && bashcompinit && . "%s"; }  # factory: completion\n' "$data/completion.bash" "$data/completion.bash" >> "$HOME/.zshrc"
case ":$PATH:" in
  *":$bin:"*) ;;
  *) for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
       [ -f "$rc" ] && ! grep -q 'factory: PATH' "$rc" && printf '\nexport PATH="%s:$PATH"  # factory: PATH\n' "$bin" >> "$rc"
     done
     echo "Added $bin to PATH in ~/.bashrc and ~/.zshrc. Open a new terminal or: export PATH=\"$bin:\$PATH\"" ;;
esac
echo "Installed: factory ($bin), $(ls "$data/autopilot" | wc -l | tr -d ' ') autopilot prompts, the /factory-autopilot command in Claude Code."
