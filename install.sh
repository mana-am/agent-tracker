#!/bin/bash
# Mana Tracker installer (macOS). Safe to re-run.
#   ./install.sh          CLI + skill + hooks
#   ./install.sh --app    also build the app and copy it to /Applications
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
BIN="$HOME/.local/bin"

command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

# 1. CLI on PATH
mkdir -p "$BIN"
chmod +x "$REPO/cli/mana-track" "$REPO/hooks/hook.py"
ln -sfn "$REPO/cli/mana-track" "$BIN/mana-track"
echo "CLI: $BIN/mana-track"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "  note: add $BIN to your PATH (e.g. in ~/.zshrc)";; esac

# 2. Skill for both agents: Claude Code reads ~/.claude/skills, Codex reads ~/.agents/skills
for dir in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$dir"
  if [ -e "$dir/mana-tracker" ] && [ ! -L "$dir/mana-tracker" ]; then
    echo "  skipped $dir/mana-tracker (a real directory is already there)"
  else
    ln -sfn "$REPO/skills/mana-tracker" "$dir/mana-tracker"
    echo "Skill: $dir/mana-tracker"
  fi
done

# 3. Hooks (user level; they only act inside projects set up with `mana-track init`)
python3 "$REPO/hooks/install_hooks.py"
if [ -f "$HOME/.codex/config.toml" ] && ! grep -Eq '^\s*hooks\s*=\s*true' "$HOME/.codex/config.toml"; then
  echo "  Codex: turn hooks on — add 'hooks = true' under [features] in ~/.codex/config.toml"
fi

# 4. App (optional)
if [ "${1:-}" = "--app" ]; then
  command -v pnpm >/dev/null || { echo "pnpm is required to build the app (npm i -g pnpm)"; exit 1; }
  (cd "$REPO/app" && pnpm install && pnpm dist)
  APP="$REPO/app/release/mac-$(uname -m | sed 's/x86_64/x64/')/Mana Tracker.app"
  test -d "$APP" || { echo "build failed: $APP missing"; exit 1; }
  /bin/rm -rf "/Applications/Mana Tracker.app"
  /bin/cp -R "$APP" /Applications/
  codesign --force --deep -s - "/Applications/Mana Tracker.app" 2>/dev/null || true
  echo "App: /Applications/Mana Tracker.app"
fi

echo
echo "Next: cd into a project and run  mana-track init"
