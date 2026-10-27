#!/bin/bash
# Removes the CLI link, the skill links and the hook entries. Your lists (.mana-tracker/ in each
# project) and the app are left alone; delete those yourself if you want them gone.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
[ -L "$HOME/.local/bin/mana-track" ] && unlink "$HOME/.local/bin/mana-track"
for dir in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  [ -L "$dir/mana-tracker" ] && unlink "$dir/mana-tracker"
done
python3 "$REPO/hooks/install_hooks.py" --uninstall
echo "Uninstalled. Lists in each project's .mana-tracker/ are untouched."
