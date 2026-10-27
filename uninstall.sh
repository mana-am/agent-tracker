#!/bin/bash
# Same as `mana-track uninstall`: removes the hooks, the skill links and the CLI link.
# Lists in each project's .mana-tracker/ stay. Pass --app to delete the app too.
set -euo pipefail
exec python3 "$(cd "$(dirname "$0")" && pwd)/cli/mana-track" uninstall "$@"
