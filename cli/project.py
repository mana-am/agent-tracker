"""Locate the Mana Tracker project a directory belongs to, and read its config.

A project is any directory holding `.mana-tracker/config.json` (created by `mana-track init`).
Sessions opened anywhere below it belong to it, except under the config's `exclude` paths.
Shared by the CLI and the hook, so both always agree on what is in scope.
"""
import json
import os

DIRNAME = '.mana-tracker'
HOME = os.path.expanduser('~/.mana-tracker')
REGISTRY = os.path.join(HOME, 'projects.json')  # every initialised project; the app reads it


class Project:
    def __init__(self, root):
        self.root = os.path.realpath(root)
        self.dir = os.path.join(self.root, DIRNAME)
        try:
            with open(os.path.join(self.dir, 'config.json')) as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            cfg = {}
        self.config = cfg
        self.name = cfg.get('name') or os.path.basename(self.root)
        # One line telling the agent what counts as a product bug / requirement here.
        self.scope = cfg.get('scope') or ''
        # [{"name": "iOS", "dirs": ["ios"]}, ...] — optional; the session's directory picks the default.
        self.platforms = cfg.get('platforms') or []
        self.exclude = [os.path.join(self.root, e) for e in cfg.get('exclude', [])]

    def excluded(self, path):
        path = os.path.realpath(path)
        return any(path == e or path.startswith(e + os.sep) for e in self.exclude)

    def platform_for(self, path):
        """The platform whose directory contains `path` (longest match wins), or None."""
        rel = os.path.relpath(os.path.realpath(path), self.root)
        best, best_len = None, -1
        for p in self.platforms:
            for d in p.get('dirs', []):
                d = d.rstrip('/')
                if (rel == d or rel.startswith(d + os.sep)) and len(d) > best_len:
                    best, best_len = p['name'], len(d)
        return best


def find_project(path=None):
    """The project containing `path` (default: cwd), or None when out of scope.

    MANA_TRACKER_ROOT overrides the lookup (useful for scripts and tests)."""
    start = os.path.realpath(path or os.getcwd())
    env = os.environ.get('MANA_TRACKER_ROOT')
    if env:
        candidates = [os.path.realpath(env)]
    else:
        candidates, d = [], start
        while True:
            candidates.append(d)
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
    for d in candidates:
        if os.path.isfile(os.path.join(d, DIRNAME, 'config.json')):
            project = Project(d)
            return None if project.excluded(start) else project
    return None


def _read_registry():
    try:
        with open(REGISTRY) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {'projects': []}


def _write_registry(data):
    os.makedirs(HOME, exist_ok=True)
    tmp = f'{REGISTRY}.{os.getpid()}.tmp'
    with open(tmp, 'w') as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, REGISTRY)


def unregister(root):
    data = _read_registry()
    root = os.path.realpath(root)
    data['projects'] = [p for p in data['projects'] if p.get('root') != root]
    _write_registry(data)


def register(root):
    data = _read_registry()
    root = os.path.realpath(root)
    if not any(p.get('root') == root for p in data['projects']):
        data['projects'].append({'root': root})
    _write_registry(data)
