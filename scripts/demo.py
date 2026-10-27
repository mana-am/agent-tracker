#!/usr/bin/env python3
"""Build a demo project full of made-up items, for screenshots and for trying the app.

    python3 scripts/demo.py /tmp/mana-demo --lang en
    MANA_TRACKER_ROOT=/tmp/mana-demo MANA_TRACKER_LANG=en open -a "Mana Tracker"

Items are created through the real CLI; only the parts that need a live agent session (an
earlier conversation to jump back to, the user's sign-off) are filled into the JSON afterwards.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
CLI = os.path.join(REPO, 'cli', 'mana-track')

DATA = {
    'en': {
        'name': 'Pocket Notes',
        'platforms': ['iOS=ios', 'Web=web', 'Server=server'],
        'tags': [('Home', 'the home feed'), ('Editor', 'writing and editing notes'),
                 ('Settings', 'the settings screens'), ('Sync', 'accounts and syncing'),
                 ('Performance', 'slow, janky, hot, battery')],
        'items': [
            ('bug', 'Editor: keyboard covers the last line while typing', 'Editor', 'ios',
             ['when I type at the bottom of a long note the keyboard hides the line I am typing',
              'also the cursor jumps to the top after pasting'],
             'In the note editor (Home → open any note). Typing near the end of a long note, the keyboard '
             'hides the line being typed, so you type blind. Pasting also throws the cursor to the top.',
             'review', 'Typing at the end of a long note keeps the line above the keyboard; pasting keeps the '
             'cursor where it was. Not tried on an iPad.', 'notes-editor'),
            ('feature', 'Home: pin notes to the top of the feed', 'Home', 'ios',
             ['can we pin a few notes so they stay at the top of home?'],
             'On Home, the feed is sorted by last edit, so the shopping list keeps sinking. The user wants to pin '
             'a few notes above everything else. Decided: pinned notes keep their own order.',
             'doing', '', 'pinning'),
            ('bug', 'Settings → Appearance: switching theme flashes white', 'Settings', 'ios',
             ['switching to dark mode flashes the whole screen white for a moment'],
             'Settings → Appearance. Changing the theme flashes the screen white before the new theme shows.',
             'open', '', ''),
            ('feature', 'Web: share a note as a public read-only link', 'Sync', 'web',
             ['I want to send a note to a friend who does not have the app', 'the link should expire after a week'],
             'People without the app cannot read a note. The user wants a read-only web link; links expire '
             'after 7 days (decided).', 'accepted', 'Share → "Copy public link" opens a read-only page; links '
             'stop working after 7 days.', 'share-link'),
            ('bug', 'Home: scrolling the feed stutters with many images', 'Performance', 'ios',
             ['home feed is choppy when notes have photos', 'and the phone gets warm after a while'],
             'On Home, notes with photos make scrolling choppy, and a few minutes of scrolling warms the phone.',
             'review', 'Photos are decoded off the main thread and downsized to the card size. Scrolling a feed '
             'of 200 photo notes stays smooth on an iPhone 13. Not measured for heat.', 'feed-perf'),
            ('feature', 'Sync: notes edited offline merge instead of overwriting', 'Sync', 'server',
             ['I edited the same note on my phone on the plane and on my laptop, and the laptop version won',
              'can it keep both changes when they touch different paragraphs?'],
             'Editing one note on two devices while one is offline: the last sync overwrites the other copy. '
             'The user wants paragraph-level merging; a true conflict shows both versions (decided).',
             'doing', '', 'sync-merge'),
            ('bug', 'Web: the note list is empty after logging in until a refresh', 'Sync', 'web',
             ['logged in on the website and the list was blank, a refresh fixed it'],
             'On the website, right after logging in, the note list stays empty until the page is reloaded.',
             'open', '', ''),
        ],
        'skip': 'asked how to export the App Store screenshots — not a product request',
    },
    'zh': {
        'name': '口袋笔记',
        'platforms': ['iOS=ios', '网页=web', '服务器=server'],
        'tags': [('首页', '首页信息流'), ('编辑器', '写和改笔记'), ('设置', '设置里的各个页面'),
                 ('同步', '账号与同步'), ('性能问题', '卡、慢、发烫、耗电')],
        'items': [
            ('bug', '编辑器：打字时键盘挡住最后一行', '编辑器', 'ios',
             ['长笔记写到最下面的时候，键盘把正在打的那行挡住了', '还有粘贴之后光标会跳到最上面'],
             '在笔记编辑页（首页点开任意一条笔记）。长笔记写到末尾时，键盘挡住正在输入的那一行，只能盲打；粘贴后光标还会跳回顶部。',
             'review', '长笔记写到末尾时，正在打的那行始终在键盘上方；粘贴后光标留在原处。没在 iPad 上试过。', '笔记编辑'),
            ('feature', '首页：笔记可以置顶', '首页', 'ios',
             ['能不能把几条笔记固定在首页最上面？'],
             '首页按最后编辑时间排序，购物清单总是沉下去。用户想把几条笔记固定在最上面。已定：置顶的笔记之间保持自己的顺序。',
             'doing', '', '置顶'),
            ('bug', '设置 → 外观：切换主题时闪白', '设置', 'ios',
             ['切到深色模式的时候整个屏幕会先闪一下白'],
             '设置 → 外观。切换主题时，屏幕先闪白，再显示新主题。',
             'open', '', ''),
            ('feature', '网页：笔记分享成只读的公开链接', '同步', 'web',
             ['想把笔记发给没装 App 的朋友看', '链接一周后自动失效'],
             '没装 App 的人看不了笔记。用户要一个只读的网页链接；链接 7 天后失效（已定）。',
             'accepted', '分享 →「复制公开链接」打开只读页面；7 天后链接失效。', '分享链接'),
            ('bug', '首页：图片多的时候滑动卡顿', '性能问题', 'ios',
             ['笔记里有照片的时候首页滑起来一卡一卡的', '滑一会手机还会发烫'],
             '首页里带照片的笔记让滑动变卡，滑几分钟手机会发烫。',
             'review', '照片改到后台解码，并缩到卡片大小再显示。200 条带图笔记的首页在 iPhone 13 上滑动流畅。发烫没有测。', '首页卡顿'),
            ('feature', '同步：离线改的笔记合并，不再互相覆盖', '同步', 'server',
             ['我在飞机上用手机改了一条笔记，电脑上也改了，结果电脑上的把手机的覆盖了',
              '改的是不同段落的话，能不能两边都保留？'],
             '同一条笔记在两台设备上改、其中一台离线时，后同步的会覆盖另一边。用户要按段落合并；真正冲突时两版都留下（已定）。',
             'doing', '', '同步合并'),
            ('bug', '网页：登录后笔记列表是空的，刷新才出来', '同步', 'web',
             ['网页登录进去列表是空的，刷新一下才有'],
             '在网页版刚登录完，笔记列表一直是空的，要手动刷新页面才显示。',
             'open', '', ''),
        ],
        'skip': '问怎么导出 App Store 截图，不是产品需求',
    },
}


def run(args, cwd, env):
    out = subprocess.run([sys.executable, CLI, *args], cwd=cwd, env=env, capture_output=True, text=True)
    if out.returncode:
        sys.exit(f'mana-track {" ".join(args)} failed: {out.stderr or out.stdout}')
    return out.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--lang', choices=['en', 'zh'], default='en')
    ap.add_argument('--register', action='store_true', help='also list it in ~/.mana-tracker/projects.json')
    a = ap.parse_args()
    d = DATA[a.lang]
    root = os.path.realpath(a.root)
    shutil.rmtree(root, ignore_errors=True)
    for sub in ('ios', 'web', 'server'):
        os.makedirs(os.path.join(root, sub))
    env = {k: v for k, v in os.environ.items()
           if k not in ('CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CODEX_THREAD_ID', 'CODEX_SANDBOX', 'CMUX_WORKSPACE_ID')}
    if not a.register:
        env['HOME'] = os.path.join(root, '.home')  # keep the real registry clean
    init = ['init', '--name', d['name']]
    for p in d['platforms']:
        init += ['--platform', p]
    run(init, root, env)
    for name, desc in d['tags']:
        run(['tag-new', name, '--desc', desc], root, env)
    for n, (typ, title, tag, plat, points, ctx, status, note, ws) in enumerate(d['items'], 1):
        args = ['new', '--type', typ, '--title', title, '--tag', tag, '--context', ctx]
        for p in points:
            args += ['--point', p]
        run(args, os.path.join(root, plat), env)
        if status in ('doing', 'review', 'accepted'):
            run(['start', str(n)], root, env)
        if status in ('review', 'accepted'):
            run(['review', str(n), '--note', note], root, env)
        path = os.path.join(root, '.mana-tracker', 'items', f'{n:04d}.json')
        with open(path) as f:
            item = json.load(f)
        if status == 'accepted':
            for p in item['points']:
                p['status'] = 'accepted'
            item['status'] = 'accepted'
        if n == 1:
            # The screenshot the user "pasted" with their first message (made-up, like everything here).
            rel = 'attachments/0001/p1-demo-0.jpg'
            os.makedirs(os.path.join(root, '.mana-tracker', 'attachments', '0001'), exist_ok=True)
            shutil.copy(os.path.join(REPO, 'scripts', 'demo-assets', 'editor-keyboard.jpg'),
                        os.path.join(root, '.mana-tracker', rel))
            item['points'][0]['images'] = [rel]
        if ws:
            item['sessions'] = [{'agent': 'cc', 'id': f'demo-{n}', 'at': item['created_at'],
                                 'cwd': os.path.join(root, plat), 'workspace': {'id': f'demo-ws-{n}', 'title': ws}}]
        with open(path, 'w') as f:
            f.write(json.dumps(item, ensure_ascii=False, indent=2) + '\n')
    run(['skip', d['skip']], root, env)
    print(run(['list', '--all'], root, env))
    print(f'Demo project ready: {root}')


if __name__ == '__main__':
    main()
