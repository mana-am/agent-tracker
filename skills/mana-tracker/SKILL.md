---
name: mana-tracker
description: "Keep the user's requirement & bug list with the `mana-track` CLI: set it up for a project when asked ('set up / init the tracker', '初始化 tracker'), take it off a project or the machine ('remove / uninstall the tracker', '卸载 tracker'), record every product bug or requirement the user raises, keep each item's status current, and hand finished work back for the user to verify in the Mana Tracker app. Use WHENEVER, inside a project that has a `.mana-tracker/` directory, the user reports a problem (it's slow / wrong / broken / flickers / why does…), asks for a change or feature (change X to Y / add / remove / can we…), follows up on an earlier one (still broken / also / no, it should… / never mind), or when you are about to start or finish product code changes. Covers how to split one message that holds several problems, when a follow-up is a new point on an old item, which messages are not points at all, tags, platforms and status rules. Only the user signs items off and sets priority. SKIP whatever the project's scope line excludes (shown at session start)."
---

# The requirement & bug list

The user raises problems and requests; keeping the list is your job — creating items, splitting
them sensibly, moving their status. The user reviews in the Mana Tracker app (macOS), where they
only do a few things: accept an item, jump back into your conversation, set priority, rename a
title, write a **remark** on an item, and mark cards while they review (marks live in the app
only; you never see them). Everything else — "still wrong", "drop it", new details — they say to
you in the conversation. A remark shows in `mana-track show` as "user remark": read it before
working on an item, it may hold instructions for you. It is the user's; no command changes it.
The app reads `<project>/.mana-tracker/items/` live.

The command is `mana-track` (on PATH). Never edit files under `.mana-tracker/items/` or
`attachments/` directly; the hook refuses it.

**Language:** write titles, points, context and notes in the language the user writes in.

## Setting up, changing, removing

**"Set up the tracker here" / 「初始化 tracker」.** Do it yourself — the user should not have to work
out the flags. Then tell them what you chose.

1. **Find the root.** Usually the repository root (or the directory the user names). If
   `mana-track init` says it is already inside another project, tell the user rather than forcing.
2. **Read the layout** before deciding: the top-level directories, the README, and the build
   manifests (`package.json`, `*.xcodeproj` / `Package.swift`, `build.gradle`, `go.mod`, `pyproject.toml`…).
3. **Decide the settings:**
   - `--name`: the product's name as users know it (from the README / app config), not the folder name.
   - `--platform NAME=DIR[,DIR]`: one per part of the product a user would name — iOS app, Android
     app, web app, admin console, server. Put the directories of one part together
     (`Server=server,workers`). Skip libraries, tooling, docs. Name them in the user's language.
     A single-app repo needs no platforms.
   - `--exclude DIR`: places where sessions do non-product work — scratch / playground,
     generated or vendored code, examples, sandboxes where agents build other things.
   - `--scope "…"`: one line saying what counts and what doesn't, in the user's language, e.g.
     "Bugs and requirements for Pocket Notes on any platform. Not: marketing, data lookups, tooling."
   - `--commit` only if the user wants the list versioned with the code; by default it stays local.
4. **Run** `mana-track init …` from the root.
5. **Seed 5–10 broad tags** with `tag-new`: the product's main areas as a user would name them
   (read the navigation / routes / tab definitions — Home, Editor, Settings, Account…), plus one or
   two kinds (Performance, Localisation). In the user's language.
6. **Report in plain words:** name, platforms with their directories, what is excluded, the scope
   line, the tags; that the list stays on this machine; that the Mana Tracker app now lists it;
   and that they can say "change the tracker settings" any time. It applies from the next
   message on, in every session under that directory.

Only stop to ask when the repository is genuinely ambiguous (several unrelated products in one repo).

**"Change the tracker settings".** Run `init` again with just the flags that change — it keeps the
rest (`--platform` / `--exclude` replace the whole list, so pass all of them). Report the result.

**"Stop using the tracker in this project".** `mana-track remove` — unregisters it and moves the
list aside as `.mana-tracker.removed-<date>` (rename it back and run `init` to restore). Delete the
list for good (`remove --delete-data`) only when the user explicitly asks to delete it, and confirm
first: it cannot be undone.

**"Uninstall the tracker" / 「卸载 tracker」.** `mana-track uninstall` removes the hooks, the skill and
the CLI from this machine — for **every** project, so say that. Lists stay in each project. Add
`--app` only if they also want the Mana Tracker app deleted.

## The data

One item = one bug or one requirement, i.e. something the user would **verify as one thing**.
An item holds **points**: the user's first description plus their follow-ups on the same thing.
Each point moves and is verified on its own:

```
open → doing → review → accepted   (accepted = the user's sign-off)
          ↑       │
          └───────┘  user says it's still wrong: their words become a new point (point),
                     and the old point goes back with start -p N
dropped              the user withdrew it themselves (drop --quote)
```

The item's status is derived from its points; you never set it.

## Every turn

1. **When the user writes, decide whether it contains a bug or requirement** (see "Splitting"
   below). If so, check `mana-track list` for an existing item it continues — the session start
   already listed the unfinished ones.
2. **Record first, then work.** New problem: `new`. Follow-up on the same thing: `point`.
   Before changing code: `start <id>`.
3. **When done, hand it over:** `review <id> [-p N…] --note "…"`. The note is for the user:
   - plain words about the behaviour ("the bottom bar no longer bounces twice when opening someone
     else's post"), not the implementation ("removed the second spring in TabBarOverlay");
   - how to check it: where to go, what to do, what to look for;
   - what you did **not** verify: "not built", "not tried on a device", "needs a server deploy";
   - `--file` the changed files (relative to the project root).
4. **Investigated but changed nothing:** leave the point open and `note <id> "finding"`.
5. **The user says a point in review is still wrong:** add their words as a new point
   (`point`, with `--with-images` if they pasted one), and take the old point back with
   `start <id> -p <old point>`. Review them together when fixed.
6. **You changed code that answers no product request** (tooling, docs, a drive-by refactor):
   run `skip "reason"` once. Otherwise the hook stops you at the end of the turn.
7. **The message is not a bug or requirement at all:** `skip "reason"` once. The reasons are
   kept, and the user audits them in the app.

## Splitting: one message → how many items, how many points

People chain several things in one breath ("and", "also", "then"), ask questions that are really
bug reports, and follow up on the same thing over several messages. Ask three questions.

**1. Is it in scope?** The project's scope line (shown at session start, set in
`.mana-tracker/config.json`) says what counts. A requirement touching several platforms is one
item with several `--platform`s.

**2. Is this sentence a point?** A point has substance: a symptom, a requirement, a correction, a
decision. These are **not** points:
- pushing or approving: "go ahead", "great, optimise it", "continue", "ok" — just `start` or keep working;
- "do 1, 4 and 5" referring to a list you wrote — record what 1, 4 and 5 *say*, not "do 1, 4, 5";
- pure questions or asks for explanation ("why is it designed like this?", "what else could we improve?") — record only what the user picks from your answer;
- "is this still happening?" — check first; record it if it is broken or they ask for a fix.

A "why" question that describes something wrong *is* a bug: "why does tapping my credits open
the paywall? it should open the credits page" — record it.

**3. One item or several?** The test: **would the user verify these as one thing?**
- **Several changes on one screen / one feature → one item, several points.** Each point is verified on its own, so nothing is lost. When unsure, **merge rather than split** — users find over-split lists noisy.
- **Unrelated problems on different screens → separate items**, even from one sentence.
- **Several consecutive messages about one thing → one item, several points.** People hit send mid-thought and add a line or two; you may receive several at once (queued or typed while you were working). Read them together before deciding.
- **A follow-up goes on the original item**, never a new one: "still slow", "no, it should…", "make it 10 minutes", "do the same on the follow button". A previously accepted item that broke again ("it's back") also gets a `point`, which reopens it.
- One point = one checkable change. Don't shred a sentence; a message that only refines the same change is one point.

### Examples

| The user says | Record |
|---|---|
| Two messages: "the switch on the Notifications settings page looks different from every other page" / "and toggling it stutters" | **1 item** (Settings → Notifications switch), **2 points**: style mismatch / stutter |
| "the card should have rounded corners, and padding, and drop the handle at the top left" | **1 item** (that card's style), **3 points** |
| "switching models shouldn't close the sheet; tapping a locked model should open the paywall; model descriptions need two lines" | **1 item** (model picker), **3 points** |
| "add the magnifier carousel to the Pro plan cards… and to the tipping page's list too" | **2 items**: two screens, verified separately |
| "changelogs should support @mentions; posts should have a visibility setting" | **2 items**: two independent features |
| "great, add it, and also add the newest model" | "add it" is not a point; "also add the newest model" is a new point on the existing item |
| (an item about a character limit exists) "change it to count only what the user typed, and make it 15" | **1 new point** on that item |
| "undo back to 1 and 2, keep the card at its old size" | `drop --quote "…"` the affected points; keep the rest |
| "opening a post takes seconds — can the server prepare it earlier?" | **1 item**, `--platform iOS --platform Server` |
| "what else is missing?" / a business discussion | nothing; `skip` |

## Writing it

- **Title:** short (≈ 45 characters in CJK, ≈ 80 in English), shaped **"Screen: symptom / want"**. Before the colon, a place the user can find in the product (Home, Post page, Settings → Notifications) — never "some list" or "somewhere". Use the user's own wording, not your analysis. The title alone should bring the thing back to mind.
  - good: "Post page: bottom bar bounces twice after collapsing when opening someone else's post"
  - bad: "Fix animation issue", "Post page bar jank", "some numbers in a list don't animate" (which list?)
  - A title the user renamed in the app is locked; don't try to change it.
  - **When you add a point, check the title still covers the item.** If the new point is another change on the same screen (an item about "waveform progress bar" gains "move the play button to the top right"), pass `--title` on that same `point` so the title names both, and update the context too. A follow-up on the original thing ("still slow", "make it 15") leaves the title alone.
  - **A point on an accepted item must come with a new title.** It reopens the item, and the title has to show why it is back, e.g. the old title plus the new symptom. `point` refuses without a changed `--title`, unless the user locked the title.
- **Context (`--context`, required on `new`):** written for the user a week later, when they no longer remember what they meant. 3–5 plain sentences:
  - **where** in the product, and how to get there ("Home → tap any post → the row of buttons at the bottom");
  - **what was happening**: what they were doing and saw; if they pasted an image, say what it shows;
  - **why it matters**: the effect of the problem, or what they want instead;
  - **what is decided**: choices they made, options they rejected, related item numbers.

  No class or file names — those go in `--note` and `--file`. When decisions change later, pass `--context` again on `point` / `start` / `review` / `edit` with the **full updated** text (it replaces the old one).
- **Type:** something broken or not as expected is `bug`; new or changed behaviour is `feature`.
- **Platform (`--platform`, repeatable):** defaults to the platform whose directory your session runs in (from the config). Name it when the session sits outside them, and name several when the change spans them. Projects without platforms skip this.
- **Tags (`--tag`, required on `new`):** fewer is better. Run `mana-track tags` and **use existing ones only** — usually one "where" tag, plus at most one broad kind (performance, localisation…). Words that fit almost every item (animation, loading state) are not tags. `tag-new` should be rare; in a fresh project, create a handful of broad "where" tags first.
- **Priority:** P0 / P1 / P2 is the user's, set in the app; the CLI has no option for it and everything starts at P1. If the user says "this is urgent", record it and mention they can raise the priority in the app.
- **Point text:** the user's own words, minus pleasantries. If "this" / "there" would be unclear later, add a bracketed note — never invent.
- **Images the user pasted must be attached:** `--with-images` on `new` / `point` attaches every image from their latest message that had any (including ones sent mid-turn). For an older message or a single image: `image <id> -p <N> [--back N | --ref <Claude Code [Image #N]>]`. Also say in words what the image shows.
- Sessions are recorded for you: each command remembers this conversation (and its cmux workspace, if any), so the app can jump back into it.
- Splitting one message into several items: one `new` each; `--point` repeats for several points.

## Commands

```bash
mana-track tags                          # existing tags, counts, what each covers
mana-track list                          # unfinished; --all includes accepted/dropped; --status review doing
mana-track show 12                       # everything: points, notes, image paths (you can read the images)
mana-track new --type bug --tag "Post page" --title "Post page: bottom bar bounces twice when opening someone else's post" \
    --point "opening a post, the tab bar collapses and then bounces, and the bounce stutters" \
    --context "On the post page (Home → tap any post). Opening someone else's post, the bottom bar collapses and bounces once more, which looks janky. The expand-and-bounce on your own posts was a deliberate choice and is out of scope."
mana-track point 12 "still stutters, worse the second time"
mana-track point 12 "the spacing here is off" --with-images
mana-track point 12 "it's back, and it flickers on return" --title "…old title…, flickers again on return"   # required on an accepted item
mana-track image 12 -p 1 --ref 4         # attach Claude Code's [Image #4] to point 1
mana-track start 12 [-p 2]               # default: all open points; -p also takes a review point back
mana-track review 12 -p 1 -p 2 --note "Opening someone else's post, the bar collapses once and no longer bounces. Not built." --file app/TabBar.swift
mana-track note 12 "trace: time goes to the layout pass, cause not attributable yet"
mana-track drop 12 -p 3 --quote "forget that one"          # only when the user withdrew it
mana-track accept 12 --quote "#12 looks good, accept it"   # only when the user said so; checked against the transcript
mana-track unaccept 12 --quote "un-accept #12, it broke"   # the user took it back; returns to review
mana-track edit 12 --title "…" | --context "full updated context" | -p 2 --text "…"
mana-track merge 28 29 30 --title "…" --context "…"        # fold over-split items; old ids redirect
mana-track skip "only changed the build script"

mana-track init --name "Pocket Notes" --platform iOS=ios --platform Web=web --exclude playground
mana-track remove [--delete-data]          # this project only
mana-track uninstall [--app]               # the whole machine
```

## Don't

- Don't accept on your own judgement ("I fixed it, so it passes"). Only when the user **clearly says this item passes** ("accept", "looks good, pass #12", "通过") run `accept`, with their words copied verbatim from one of their last three messages into `--quote`; the CLI checks and refuses otherwise. If it's unclear which item, or it was just a passing "ok", ask which one. If they didn't say it, don't.
- Don't touch priority; only the user sets it, in the app.
- Don't split one thing into several items, or stuff unrelated things into one. When unsure, see question 3; if you find over-split items, `merge` them.
- Don't wait until the work is done to record it. Record first, so follow-ups have a home.
- Don't `review` a point you didn't change, and don't claim in `--note` what you didn't do.
