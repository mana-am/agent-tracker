// Mana Tracker main process: reads a project's .mana-tracker/items, watches it, and performs
// the user's own actions (accept, priority, rename), plus jumping back into the agent's
// conversation — in cmux when it is installed, otherwise in a new Terminal window.
import { execFile } from 'node:child_process'
import { existsSync, FSWatcher, mkdirSync, readdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { deriveStatus } from './shared/status'
import type { AppInfo, Item, Point, Priority, ProjectInfo, Workspaces } from './shared/types'

const HOME = join(homedir(), '.mana-tracker')
const REGISTRY = join(HOME, 'projects.json') // written by `mana-track init`
const PREFS = join(HOME, 'app.json') // which project the app showed last
const CMUX = '/Applications/cmux.app/Contents/Resources/bin/cmux'
const DIRNAME = '.mana-tracker'

let win: BrowserWindow | null = null
let root = ''
let watchers: FSWatcher[] = []

const dataDir = () => join(root, DIRNAME)
const itemsDir = () => join(dataDir(), 'items')

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmp, file)
}

function config(dir = root) {
  return readJson<{ name?: string; platforms?: { name: string }[] }>(join(dir, DIRNAME, 'config.json'), {})
}

function projects(): ProjectInfo[] {
  const env = process.env.MANA_TRACKER_ROOT
  const roots = env ? [env] : readJson<{ projects: { root: string }[] }>(REGISTRY, { projects: [] }).projects.map((p) => p.root)
  return roots
    .filter((r) => existsSync(join(r, DIRNAME, 'config.json')))
    .map((r) => ({ root: r, name: config(r).name || basename(r) }))
}

function pickInitialProject() {
  const all = projects()
  const last = readJson<{ root?: string }>(PREFS, {}).root
  root = all.find((p) => p.root === last)?.root ?? all[0]?.root ?? ''
}

function lang(): 'zh' | 'en' {
  const forced = process.env.MANA_TRACKER_LANG
  if (forced === 'zh' || forced === 'en') return forced
  return app.getPreferredSystemLanguages().some((l) => l.startsWith('zh')) ? 'zh' : 'en'
}

function info(): AppInfo {
  const cfg = config()
  return {
    dataDir: dataDir(),
    root,
    name: cfg.name || basename(root),
    platforms: (cfg.platforms ?? []).map((p) => p.name),
    projects: projects(),
    lang: lang(),
    hasCmux: existsSync(CMUX),
  }
}

function now() {
  const d = new Date()
  const off = -d.getTimezoneOffset()
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19)
  return `${local}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`
}

function itemPath(id: number) {
  return join(itemsDir(), `${String(id).padStart(4, '0')}.json`)
}

function readAll(): Item[] {
  if (!root || !existsSync(itemsDir())) return []
  const out: Item[] = []
  for (const name of readdirSync(itemsDir())) {
    if (!name.endsWith('.json')) continue
    try {
      const item = JSON.parse(readFileSync(join(itemsDir(), name), 'utf8'))
      // `mana-track merge` leaves a redirect ({ merged_into, point_map }); it is not an item.
      if (!item.merged_into) out.push(item)
    } catch {
      // Caught mid atomic-replace; the next watch event reads it again.
    }
  }
  return out.sort((a, b) => b.id - a.id)
}

function readSkips() {
  try {
    return readFileSync(join(dataDir(), 'skips.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

function mutate(id: number, fn: (item: Item, at: string) => void) {
  const file = itemPath(id)
  const item: Item = JSON.parse(readFileSync(file, 'utf8'))
  const at = now()
  fn(item, at)
  item.status = deriveStatus(item)
  item.updated_at = at
  writeJson(file, item)
  pushItems()
}

function log(item: Item, at: string, text: string) {
  item.log.push({ at, by: 'user', text })
}

function point(item: Item, pid: number): Point {
  const p = item.points.find((x) => x.id === pid)
  if (!p) throw new Error(`#${item.id} has no point ${pid}`)
  return p
}

function pushItems() {
  const items = readAll()
  win?.webContents.send('items', items)
  const waiting = items.filter((i) => i.status === 'review').length
  app.dock?.setBadge(waiting ? String(waiting) : '')
}

function watchProject() {
  watchers.forEach((w) => w.close())
  watchers = []
  if (!root) return
  mkdirSync(itemsDir(), { recursive: true })
  let timer: NodeJS.Timeout | null = null
  watchers.push(
    watch(itemsDir(), () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(pushItems, 120)
    }),
    watch(dataDir(), (_e, name) => {
      if (name === 'skips.jsonl') win?.webContents.send('skips', readSkips())
    }),
  )
}

// ---------- cmux ----------

function runCmux(args: string[]): Promise<string> {
  if (!existsSync(CMUX)) return Promise.resolve('')
  return new Promise((done) =>
    execFile(CMUX, args, { timeout: 5000, maxBuffer: 64 * 1024 * 1024 }, (_err, out) => done(out ?? '')),
  )
}

// Live cmux state: workspace titles (they get renamed) and which workspace each agent session
// belongs to. Items also carry the title captured when the agent wrote them, which is what
// shows once a workspace is closed.
async function readWorkspaces(): Promise<Workspaces> {
  const titles: Record<string, string> = {}
  const sessionWorkspace: Record<string, string> = {}
  const running: string[] = []
  try {
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      const o = node as Record<string, unknown>
      if (typeof o.ref === 'string' && o.ref.startsWith('workspace:') && typeof o.id === 'string') {
        titles[o.id] = String(o.title ?? '')
      }
      Object.values(o).forEach(walk)
    }
    walk(JSON.parse(await runCmux(['tree', '--all', '--json'])))
    const sessions = JSON.parse(await runCmux(['sessions', '--all', '--json'])).sessions ?? []
    for (const s of sessions) {
      if (s.session_id && s.workspace_id) sessionWorkspace[s.session_id] = s.workspace_id
      if (s.session_id && s.agent_lifecycle === 'running') running.push(s.session_id)
    }
  } catch {
    // cmux missing or not running: the titles stored in the items are shown instead.
  }
  return { titles, sessionWorkspace, running }
}

async function pushWorkspaces() {
  win?.webContents.send('workspaces', await readWorkspaces())
}

const quote = (a: string) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)

// Jump back into the conversation behind an item. With cmux: the workspace that still holds
// it — the one cmux's session list names, else the one recorded on the item (that list often
// lacks a session that was resumed, while its workspace is still open) — and only when neither
// is open, a new workspace resuming it with its original launcher. Without cmux: a Terminal
// window resuming it in the directory the agent ran in.
ipcMain.handle(
  'openSession',
  async (_e, sessionId: string, agent: string, title: string, storedWsId?: string, cwd?: string) => {
    const resume = (launch: string[]) =>
      agent === 'codex'
        ? [...(launch.length ? launch : ['codex']), 'resume', sessionId]
        : [...(launch.length ? launch : ['claude']), '--resume', sessionId]
    if (!existsSync(CMUX)) {
      const command = `cd ${quote(cwd || root)} && ${resume([]).map(quote).join(' ')}`
      const script = `tell application "Terminal" to do script ${JSON.stringify(command)}\ntell application "Terminal" to activate`
      execFile('/usr/bin/osascript', ['-e', script])
      return
    }
    const { titles, sessionWorkspace } = await readWorkspaces()
    const wsId = [sessionWorkspace[sessionId], storedWsId].find((id) => id && id in titles)
    if (wsId) {
      await runCmux(['select-workspace', '--workspace', wsId])
    } else {
      let record: { cwd?: string; launch_arguments?: string[] } = {}
      try {
        const all = JSON.parse(await runCmux(['sessions', '--all', '--json'])).sessions ?? []
        record = all.find((s: { session_id?: string }) => s.session_id === sessionId) ?? {}
      } catch {}
      const launch = (record.launch_arguments ?? []).filter(
        (a, i, xs) =>
          !['--resume', '-r', '--session-id', '--continue', '-c'].includes(a) &&
          !['--resume', '-r', '--session-id'].includes(xs[i - 1]),
      )
      await runCmux([
        'new-workspace',
        '--name', title,
        '--cwd', record.cwd ?? cwd ?? root,
        '--command', resume(launch).map(quote).join(' '),
      ])
    }
    execFile('/usr/bin/open', ['-a', 'cmux'])
  },
)

// ---------- the user's actions ----------

ipcMain.handle('info', () => info())
ipcMain.handle('items', () => readAll())
ipcMain.handle('skips', () => readSkips())
ipcMain.handle('workspaces', () => readWorkspaces())

ipcMain.handle('selectProject', (_e, next: string) => {
  if (!projects().some((p) => p.root === next)) return info()
  root = next
  mkdirSync(HOME, { recursive: true })
  writeJson(PREFS, { root })
  watchProject()
  pushItems()
  win?.webContents.send('skips', readSkips())
  return info()
})

ipcMain.handle('setTitle', (_e, id: number, title: string) =>
  mutate(id, (item, at) => {
    item.title = title
    item.title_locked = true
    log(item, at, `renamed: ${title}`)
  }),
)

ipcMain.handle('setPriority', (_e, id: number, priority: Priority) =>
  mutate(id, (item, at) => {
    item.priority = priority
    log(item, at, `priority -> ${priority}`)
  }),
)

ipcMain.handle('accept', (_e, id: number, pids: number[]) =>
  mutate(id, (item, at) => {
    for (const pid of pids) {
      const p = point(item, pid)
      p.status = 'accepted'
      p.updated_at = at
    }
    log(item, at, `point(s) ${pids.join(', ')} accepted`)
  }),
)

ipcMain.handle('undo', (_e, id: number, pid: number) =>
  mutate(id, (item, at) => {
    const p = point(item, pid)
    if (p.status !== 'accepted') return
    p.status = 'review'
    p.updated_at = at
    log(item, at, `point ${pid} un-accepted`)
  }),
)

function createWindow() {
  if (win) {
    win.show()
    return
  }
  win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 600,
    title: 'Mana Tracker',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1d1d20',
    webPreferences: { preload: join(__dirname, 'preload.js'), sandbox: false },
  })
  void win.loadFile(join(__dirname, 'index.html'))
  win.on('closed', () => (win = null))
  win.on('focus', () => {
    // A project set up with `mana-track init` while the app was open shows up on return.
    if (!root) {
      pickInitialProject()
      watchProject()
      pushItems()
    }
    win?.webContents.send('info', info())
    void pushWorkspaces()
  })
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark' // the design is dark-only
  pickInitialProject()
  createWindow()
  watchProject()
  pushItems()
  setInterval(() => void pushWorkspaces(), 15_000)
  app.on('activate', createWindow)
})

app.on('window-all-closed', () => app.quit())
