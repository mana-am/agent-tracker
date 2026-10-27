#!/usr/bin/env python3
"""Add (or remove, with --uninstall) the Mana Tracker hook in Claude Code's and Codex's
user-level settings. Idempotent; the first run keeps a .bak-mana-tracker copy of each file."""
import json
import os
import shutil
import sys

HOOK = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'hook.py')
COMMAND = f'{sys.executable} {HOOK}'
TOOLS = 'Bash|Edit|Write|MultiEdit|NotebookEdit'
TARGETS = [
    # (settings file, event -> matcher or None)
    (os.path.expanduser('~/.claude/settings.json'),
     {'SessionStart': None, 'UserPromptSubmit': None, 'PreToolUse': TOOLS, 'PostToolUse': TOOLS, 'Stop': None}),
    (os.path.expanduser('~/.codex/hooks.json'),
     {'SessionStart': None, 'UserPromptSubmit': None, 'PreToolUse': None, 'PostToolUse': None, 'Stop': None}),
]


def ours(hook):
    return hook.get('command', '').endswith(HOOK)


def update(path, events, install):
    if not os.path.isdir(os.path.dirname(path)):
        return f'skipped {path} (not installed)'
    try:
        with open(path) as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}
    if os.path.exists(path) and not os.path.exists(path + '.bak-mana-tracker'):
        shutil.copy2(path, path + '.bak-mana-tracker')
    hooks = data.setdefault('hooks', {})
    for event, matcher in events.items():
        groups = []
        for g in hooks.get(event, []):
            kept = [h for h in g.get('hooks', []) if not ours(h)]
            if kept:
                groups.append(dict(g, hooks=kept))
        if install:
            group = {'hooks': [{'type': 'command', 'command': COMMAND, 'timeout': 10}]}
            if matcher:
                group['matcher'] = matcher
            groups.append(group)
        if groups:
            hooks[event] = groups
        else:
            hooks.pop(event, None)
    tmp = f'{path}.{os.getpid()}.tmp'
    with open(tmp, 'w') as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)
    return f'{"installed in" if install else "removed from"} {path}'


if __name__ == '__main__':
    install = '--uninstall' not in sys.argv
    for path, events in TARGETS:
        print(update(path, events, install))
