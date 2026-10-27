#!/usr/bin/env python3
"""One hook for Claude Code and Codex (both speak the same JSON) that keeps agents honest
about the list: every message the user sends gets accounted for.

  SessionStart      show the agent what is still open, so it does not create duplicates
  UserPromptSubmit  remember what the user said this turn; remind the agent to record it
  PreToolUse        refuse direct writes to items/ and attachments/ (the CLI is the only writer)
  PostToolUse       note which code files this session touched and whether it used the CLI
  Stop              block once if the user's message went unaccounted for, or code changed
                    without the list being updated — answered by recording it, or by `skip`

Installed at user level (~/.claude/settings.json, ~/.codex/hooks.json), so it fires in every
session; it only acts inside a Mana Tracker project (see cli/project.py). Any internal error
lets the call through — a broken hook must never block work.
"""
import json
import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.realpath(__file__))), 'cli'))
from project import DIRNAME, find_project  # noqa: E402

STATE_DIR = os.path.join(tempfile.gettempdir(), 'mana-tracker-hook')
TRACK = 'mana-track'
SKILL = 'mana-tracker'
OPEN_LABEL = {'open': 'open', 'doing': 'doing', 'review': 'review'}
TRACK_WRITE = re.compile(r'mana-track[\'"]?\s+(new|point|image|start|review|drop|accept|unaccept|note|edit|merge|skip)\b')
PROTECTED = re.compile(re.escape(DIRNAME) + r'/(items|attachments)/')
# A shell command counts as a write only when a write verb points at the protected path;
# reading (cat, grep, `mana-track show`) is fine.
SHELL_WRITE_TO = re.compile(r'(>>?|\btee\b|\bsed\s+-i|\brm\b|\bmv\b|\bcp\b|\btruncate\b)[^|;&\n]*'
                            + re.escape(DIRNAME) + r'/(items|attachments)/')
SCRIPT_WRITE_TO = re.compile(re.escape(DIRNAME) + r'/(items|attachments)/[^\'"]*[\'"]\s*,\s*[\'"][wax]')
# File headers in a patch (Codex's apply_patch format).
PATCH_FILE = re.compile(r'^\*\*\* (?:Add|Update|Delete) File: (.+)$', re.M)

PROJECT = None


def scope_note():
    return (PROJECT.scope or 'Only bugs and requirements for the product itself').rstrip('.。 ')


def state_path(sid):
    return os.path.join(STATE_DIR, re.sub(r'[^\w.-]', '_', sid or 'unknown') + '.json')


def load_state(sid):
    try:
        with open(state_path(sid)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {'touched': []}


def save_state(sid, state):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(state_path(sid), 'w') as f:
        json.dump(state, f)


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False))


def context(event, text):
    emit({'hookSpecificOutput': {'hookEventName': event, 'additionalContext': text}})


def open_items():
    items_dir = os.path.join(PROJECT.dir, 'items')
    out = []
    for name in sorted(os.listdir(items_dir)) if os.path.isdir(items_dir) else []:
        if name.endswith('.json'):
            with open(os.path.join(items_dir, name)) as f:
                item = json.load(f)
            if 'merged_into' not in item and item['status'] in OPEN_LABEL:
                out.append(item)
    return out


def session_start():
    items = open_items()
    lines = [
        f'This project ({PROJECT.name}) keeps a requirement & bug list with `{TRACK}`; follow the `{SKILL}` skill. '
        f'Scope: {scope_note()}. Every bug or requirement the user raises gets an item (new items need --context '
        'the user can recall it by, and --tag from `mana-track tags`); a follow-up on the same thing is a '
        '`point` on that item, not a new one. When done, `review` with a plain note on how to check it. '
        'Only the user signs off: `accept` only when they said so, with their exact words in --quote. '
        'Never change priority.'
    ]
    pending = sorted((i for i in items if i['status'] in ('open', 'doing')), key=lambda i: i.get('priority', 'P1'))
    if pending:
        lines.append(f'Unfinished ({len(pending)}, first 25):')
        for i in pending[:25]:
            plats = '/'.join(i.get('platforms', []))
            lines.append(f'  #{i["id"]} [{i["status"]}] {i.get("priority", "P1")}' + (f' [{plats}]' if plats else '')
                         + f' {i["title"]}')
    review = sum(1 for i in items if i['status'] == 'review')
    if review:
        lines.append(f'{review} more waiting for the user to verify.')
    context('SessionStart', '\n'.join(lines))


def pre_tool(payload):
    tool = payload.get('tool_name', '')
    tool_input = payload.get('tool_input') or {}
    cwd = payload.get('cwd') or os.getcwd()
    if tool in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit'):
        target = os.path.realpath(os.path.join(cwd, tool_input.get('file_path') or tool_input.get('notebook_path') or ''))
        blocked = bool(PROTECTED.search(target + '/'))
    elif tool == 'apply_patch' or '*** Begin Patch' in json.dumps(tool_input):
        text = tool_input.get('input') or tool_input.get('patch') or json.dumps(tool_input)
        blocked = any(PROTECTED.search(f) for f in PATCH_FILE.findall(text.replace('\\n', '\n')))
    else:
        command = tool_input.get('command') or tool_input.get('cmd') or ''
        if isinstance(command, list):
            command = ' '.join(command)
        blocked = not command.lstrip().startswith('git ') and bool(
            SHELL_WRITE_TO.search(command) or SCRIPT_WRITE_TO.search(command))
    if blocked:
        emit({'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'deny',
            'permissionDecisionReason':
                f'Items and attachments change only through `{TRACK}`, never by editing the files. '
                'Sign-off is `mana-track accept --quote` (only when the user said so); priority is the user\'s, in the app.',
        }})


def touched_code_files(payload):
    tool = payload.get('tool_name', '')
    tool_input = payload.get('tool_input') or {}
    paths = []
    if tool in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit'):
        paths = [tool_input.get('file_path') or tool_input.get('notebook_path') or '']
    elif tool == 'apply_patch' or '*** Begin Patch' in json.dumps(tool_input):
        text = tool_input.get('input') or tool_input.get('patch') or json.dumps(tool_input)
        paths = PATCH_FILE.findall(text.replace('\\n', '\n'))
    cwd = payload.get('cwd') or os.getcwd()
    out = []
    for p in paths:
        if not p:
            continue
        full = os.path.realpath(os.path.join(cwd, p.strip()))
        inside = full.startswith(PROJECT.root + os.sep) and not PROJECT.excluded(full)
        # Docs, agent config and the list itself are not product code.
        if inside and not full.startswith(PROJECT.dir + os.sep) \
                and '/.agents/' not in full and '/.claude/' not in full and not full.endswith('.md'):
            out.append(os.path.relpath(full, PROJECT.root))
    return out


def post_tool(payload):
    sid = payload.get('session_id', '')
    state = load_state(sid)
    blob = json.dumps(payload.get('tool_input') or {}, ensure_ascii=False)
    if TRACK_WRITE.search(blob):
        state['touched'] = []
        state['prompt'] = ''
    else:
        for f in touched_code_files(payload):
            if f not in state['touched']:
                state['touched'].append(f)
    save_state(sid, state)


def stop(payload):
    if payload.get('stop_hook_active'):
        return
    sid = payload.get('session_id', '')
    state = load_state(sid)
    prompt = state.get('prompt') or ''
    if prompt:
        # Every turn answers for the user's message: it is on the list, or explicitly not.
        state['prompt'] = ''
        save_state(sid, state)
        emit({'decision': 'block', 'reason':
              f'The user said this turn: "{prompt}". `{TRACK}` has not been used this turn. '
              f'If it holds a bug / requirement, or a follow-up on an existing item, record it now '
              f'({scope_note()}; several messages about one thing are one item with several points; '
              'new items need --context and --tag; pasted images: --with-images). '
              f'If it does not, run `{TRACK} skip "reason"` once.'})
        return
    touched = state.get('touched') or []
    if not touched:
        return
    shown = ', '.join(touched[:5]) + (f' and {len(touched) - 5} more' if len(touched) > 5 else '')
    emit({'decision': 'block', 'reason':
          f'Code changed this session ({shown}) but the list was not updated. Update the item this work '
          'belongs to with `mana-track` (new problem: `new`; follow-up: `point`; done: `review --note '
          '"what changed, how to check"`). If the change answers no product request from the user '
          f'(tooling, docs, a drive-by refactor), run `{TRACK} skip "reason"` once.'})


def main():
    global PROJECT
    payload = json.load(sys.stdin)
    PROJECT = find_project(payload.get('cwd') or os.getcwd())
    if PROJECT is None:
        return
    event = payload.get('hook_event_name', '')
    if event == 'PreToolUse':
        pre_tool(payload)
    elif event == 'PostToolUse':
        post_tool(payload)
    elif event == 'Stop':
        stop(payload)
    elif event == 'SessionStart':
        session_start()
    elif event == 'UserPromptSubmit':
        sid = payload.get('session_id', '')
        state = load_state(sid)
        text = ' '.join((payload.get('prompt') or '').split())
        if text:
            # Several messages can arrive within one turn; keep them all for the Stop check.
            joined = (state.get('prompt') + ' / ' if state.get('prompt') else '') + text
            state['prompt'] = joined[:300]
            save_state(sid, state)
        context('UserPromptSubmit',
                f'If this is a bug / requirement for {PROJECT.name}, or a follow-up on an existing item, '
                f'record it with `{TRACK}` first (skill: `{SKILL}`).')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        pass
