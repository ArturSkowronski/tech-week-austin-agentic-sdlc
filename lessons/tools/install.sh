#!/usr/bin/env bash
# Installs the participant's tools outside the repo, so that switching lessons does not remove them:
#   ~/.local/bin/factory                        the CLI (factory lesson|map|check|solve|autopilot)
#   ~/.local/share/factory/autopilot/*.md       the autopilot prompts, one per lesson
#   ~/.claude/commands/factory-autopilot.md     the Claude Code command: /factory-autopilot N
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
# The welcome lives outside the repo too: lesson tags are older than .devcontainer, so after factory lesson N the file may be gone.
[ -f "$src/../../.devcontainer/welcome.txt" ] && cp "$src/../../.devcontainer/welcome.txt" "$data/welcome.txt"
case ":$PATH:" in
  *":$bin:"*) ;;
  *) for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
       [ -f "$rc" ] && ! grep -q 'factory: PATH' "$rc" && printf '\nexport PATH="%s:$PATH"  # factory: PATH\n' "$bin" >> "$rc"
     done
     echo "Added $bin to PATH in ~/.bashrc and ~/.zshrc. Open a new terminal or: export PATH=\"$bin:\$PATH\"" ;;
esac
echo "Installed: factory ($bin), $(ls "$data/autopilot" | wc -l | tr -d ' ') autopilot prompts, the /factory-autopilot command in Claude Code."
