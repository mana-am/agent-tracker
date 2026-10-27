# Mana Tracker

[English](README.md) · **中文**

一份由 coding agent 替你维护的需求和 bug 清单。

你照常跟 Claude Code 或 Codex 说话：「保存按钮没反应」「顶栏也固定住」「还是不行」。agent 会把你提的每个
bug 和需求记下来，干活时随时更新，做完交回给你验。你在一个小小的 Mac 应用里看效果、点「通过」，也可以直接在
对话里说「#12 通过」。

![Mana Tracker](docs/images/board-zh.png)

## 为什么要它

整天和 coding agent 一起干活，需求会散落在几十个对话里。过一周，没人说得清哪些做完了、哪些验过了、哪些被悄悄
忘了。Mana Tracker 让 agent 对**你发的每一条消息**都有交代：

- **一条都不会漏。** 每一轮都有 hook 检查：你说的话要么记进了清单，要么 agent 说明了为什么不算需求
  （`skip "原因"`）。这些原因会列在应用里，供你抽查。
- **留的是你的原话。** 每一条都保存你当时怎么说的、贴的截图，以及一段写给「一周后的你」的背景。
- **通过是你签字。** agent 只能把做完的活交给你验收，通过只能由你来点。你在对话里说通过，命令行会拿你的原话
  去对话记录里核对。
- **一键回到那段对话。** 每一条都记得是哪个会话在处理它，应用能直接打开那个会话（装了
  cmux 就在 cmux 里打开，没装就开一个终端窗口）。

## 由哪几部分组成

```
你 ──说话──► Claude Code / Codex ──mana-track──► <项目>/.mana-tracker/items/*.json ◄──监听── Mana Tracker 应用 ◄── 你验收
                    ▲                                                                                │
                    └─────────────── hook：每一轮要么记下、要么说明不记 ─────────────── 回到对话 ─────┘
```

| 部分 | 作用 |
|---|---|
| `cli/mana-track` | 清单唯一的写入口。Python 3，没有依赖。 |
| `skills/mana-tracker` | 教 agent 什么时候记、一条消息怎么拆成几条几个点、标题和背景怎么写。 |
| `hooks/hook.py` | Claude Code / Codex 的 hook：开会话时列出没做完的条目；你的话没交代就拦下这一轮；不许直接改数据文件。 |
| `app/` | Mac 应用（Electron）：看清单、点通过、改优先级、跳回对话。 |

## 安装

需要：macOS、Python 3、Claude Code 或 Codex。编译应用还需要 Node 22+ 和 pnpm。

```bash
git clone https://github.com/mana-am/agent-tracker.git
cd agent-tracker
./install.sh --app      # 命令行 + skill + hook + 应用（不加 --app 就不装应用）
```

`install.sh` 会做这几件事：

- 把 `mana-track` 链接到 `~/.local/bin`；
- 把 skill 链接到 `~/.claude/skills` 和 `~/.agents/skills`；
- 把 hook 加进 `~/.claude/settings.json` 和 `~/.codex/hooks.json`，原文件先备份成 `.bak-mana-tracker`；
- 把应用编译好放进 `/Applications`。

重复运行也没关系。

**Codex：** 要先打开 hook 功能，在 `~/.codex/config.toml` 的 `[features]` 下面加一行 `hooks = true`。
第一次运行时 Codex 会让你确认是否信任新的 hook。

hook 装在用户级别，但只在你初始化过的项目里起作用，不影响别的工作。

## 使用教程

### 1. 初始化项目

在项目根目录运行：

```bash
mana-track init --name "口袋笔记" \
    --platform iOS=ios --platform 网页=web --platform 服务器=server,workers \
    --exclude playground
```

- `--platform 名字=目录[,目录]`（可选）：说明每个目录属于产品的哪一端。agent 在哪个目录干活，新条目就标哪一端，
  应用里可以按端筛选。
- `--exclude 目录`（可选）：这个目录下的会话不算，比如草稿区、生成的代码。
- `--scope "……"`（可选）：用一句话告诉 agent 什么算需求。默认是产品的 bug 和需求，不包括营销、查数据、给
  agent 用的工具。
- `--commit`：清单跟着代码一起进 git。默认只留在本机（写在 `.mana-tracker/.gitignore` 里）。

这一步会建好 `.mana-tracker/`，并把项目登记到应用里。之后随时可以改 `.mana-tracker/config.json`。

### 2. 照常干活

在项目里任何一个目录打开 Claude Code 或 Codex，正常说话：

> 长笔记写到最下面的时候，键盘把正在打的那行挡住了，还有粘贴之后光标会跳到最上面

agent 会建**一条、两个点**（同一个界面，会一起验），带上你的原话、一段背景和一个标签，然后开始干活：

```
#1 created: 编辑器：打字时键盘挡住最后一行
```

连着几条消息说的是同一件事，就合成一条的几个点；一句话里说了几件不相干的事，就拆成几条。完整规则和例子都在
skill 里。

### 3. 验收

agent 做完后，会附一段大白话说明交给你：改了什么、怎么验、哪些**没有**验证过。卡片变成「待验收」，程序坞图标上
的数字是等你验收的条数。

- **没问题** → 在应用里点「通过」，或者跟 agent 说「#1 通过」。
- **还不对** → 直接跟 agent 说（「横屏的时候还是挡住」）。你的话会变成一个新的点，原来那个点退回「处理中」。
- **不要了** → 跟 agent 说（「这个不做了」）。它会引用你的原话，把这些点标成「不做了」。

### 4. 应用里能做什么

- **状态胶囊**（可多选）：待处理 / 处理中 / 待验收 / 已通过 / 不做了。
- **P0 / P1 / P2**：优先级只有你能改，新条目一律是 P1。
- **标签、端、类型、排序**：这些筛选和搜索叠加生效。
- **搜索**：只搜你自己说过的话和工作区名，不搜 agent 写的总结。
- **对话**：展开能看到你提过的每一个点，连同截图和 agent 的说明。
- **打开对话**：跳回处理这一条的那个会话。
- **双击标题**可以改名，改过之后 agent 就不能再动这个标题。
- **没记的 N**：agent 判成「不是需求」的那些轮，带着它的理由。

### 5. 命令速查

这些命令是给 agent 用的，你一般用不到。

```bash
mana-track list [--all] [--status review doing]
mana-track show 12
mana-track new --type bug|feature --title "界面：现象" --point "用户原话" [--point …] \
    --tag 编辑器 --context "背景" [--platform iOS] [--with-images]
mana-track point 12 "追问" [--with-images]
mana-track start 12 [-p 2]
mana-track review 12 --note "改了什么、怎么验、哪些没验证" [--file 路径]
mana-track accept 12 --quote "用户原话"      # 会去对话记录里核对
mana-track drop 12 -p 3 --quote "用户原话"
mana-track merge 28 29 30            # 拆细了就合；旧编号自动转到新的
mana-track tags | tag-new | tag-merge | tag-drop
mana-track skip "这一轮为什么没有需求"
```

## 数据

所有东西都在 `<项目>/.mana-tracker/` 里：

```
config.json        名字、范围、端、排除的目录
items/0001.json    一条一个文件：标题、背景、各个点、会话、记录
attachments/       截图，按条目分文件夹
tags.json          这个项目的标签
skips.jsonl        每一次「不是需求」和它的理由
```

都是普通 JSON，加文件锁、原子写入，几个 agent 同时干活也不会写坏。应用监听这个文件夹，实时刷新。

## 已知限制

- 应用只支持 macOS。命令行和 hook 在有 Python 3 的地方都能跑，但挂截图、核对通过原话这两件事要读
  Claude Code 和 Codex 存在本机的对话记录。
- hook 只能保证 agent 每一轮都有交代，判不了 agent 判得对不对。所以才有「没记的」那张清单给你抽查。
- 「打开对话」要求那个 Claude Code / Codex 会话还在这台电脑上。

## 卸载

```bash
./uninstall.sh
```

会删掉命令行、skill 链接和 hook 配置。每个项目里 `.mana-tracker/` 中的清单和应用都会保留，不想要可以自己删。

## 许可证

[MIT](LICENSE)
