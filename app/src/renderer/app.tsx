// The user's side of the list: accept, jump back into the agent's conversation, set priority,
// rename. Everything else ("still wrong", "drop it", new points) is said in the conversation and
// written by the agent through cli/mana-track.
import { ArrowUpRight, Bug, Check, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, Tag, Lightbulb, MessageSquareOff, Search, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppInfo, Item, Point, PointStatus, Priority, Workspaces } from '../shared/types'
import { api } from './api'
import { setLang, t } from './i18n'

// Status filter chips along the top (multi-select; none selected = all); below, a two-column
// waterfall of cards that always show everything (no modal, no drawer).
const STATUSES: PointStatus[] = ['open', 'doing', 'review', 'accepted', 'dropped']

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return t.justNow
  if (s < 3600) return t.minutes(Math.floor(s / 60))
  if (s < 86400) return t.hours(Math.floor(s / 3600))
  if (s < 86400 * 7) return t.days(Math.floor(s / 86400))
  return iso.slice(5, 10)
}
const stamp = (iso: string) => iso.slice(5, 16).replace('T', ' ')

type Zoom = (srcs: string[], index: number) => void

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// Search reaches only what the user can recognise as theirs: their own words (every point) and
// the cmux workspace titles the item's conversations belong to (live title and the one stored).
// Agent-written text (title, context, notes, tags) is left out on purpose: you search for what
// you said, and the filters above still apply.
function haystack(i: Item, ws: Workspaces) {
  const titles = i.sessions.flatMap((s) => {
    const id = s.workspace?.id ?? ws.sessionWorkspace[s.id]
    return [s.workspace?.title ?? '', (id && ws.titles[id]) || '']
  })
  return norm([...i.points.map((p) => p.text), ...titles].join(' '))
}

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2']
const platforms = (i: Item) => i.platforms ?? []
const prio = (i: Item): Priority => i.priority ?? 'P1'
type SortKey = 'updated' | 'created_desc' | 'created_asc' | 'priority'
const SORTS: Record<SortKey, (a: Item, b: Item) => number> = {
  updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
  created_desc: (a, b) => b.created_at.localeCompare(a.created_at),
  created_asc: (a, b) => a.created_at.localeCompare(b.created_at),
  priority: (a, b) => prio(a).localeCompare(prio(b)) || b.updated_at.localeCompare(a.updated_at),
}
type Skip = { at: string; agent: string; session: string; reason: string; workspace: string }

function workspaceTitle(item: Item, ws: Workspaces) {
  for (const s of [...item.sessions].reverse()) {
    const id = s.workspace?.id ?? ws.sessionWorkspace[s.id]
    const title = (id && ws.titles[id]) || s.workspace?.title
    if (title) return title
  }
  return ''
}

function App() {
  const [items, setItems] = useState<Item[]>([])
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [ws, setWs] = useState<Workspaces>({ titles: {}, sessionWorkspace: {}, running: [] })
  const [typeFilter, setTypeFilter] = useState<'all' | Item['type']>('all')
  const [statuses, setStatuses] = useState<PointStatus[]>(['open', 'doing', 'review'])
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [platformFilter, setPlatformFilter] = useState('')
  const [showTags, setShowTags] = useState(false)
  const [sort, setSort] = useState<SortKey>('updated')
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState<{ srcs: string[]; index: number } | null>(null)
  const [skips, setSkips] = useState<Skip[]>([])
  const [showSkips, setShowSkips] = useState(false)

  useEffect(() => {
    const applyInfo = (i: AppInfo) => {
      setLang(i.lang)
      setInfo(i)
    }
    void api.invoke<AppInfo>('info').then(applyInfo)
    const off0 = api.on('info', (p) => applyInfo(p as AppInfo))
    void api.invoke<Item[]>('items').then(setItems)
    void api.invoke<Workspaces>('workspaces').then(setWs)
    const off1 = api.on('items', (p) => setItems(p as Item[]))
    const off2 = api.on('workspaces', (p) => setWs(p as Workspaces))
    void api.invoke<Skip[]>('skips').then(setSkips)
    const off3 = api.on('skips', (p) => setSkips(p as Skip[]))
    return () => {
      off0()
      off1()
      off2()
      off3()
    }
  }, [])

  // Search stacks with the filters (no Accepted chip lit → no accepted results); each status
  // chip counts the matches, so light it to see them. Whitespace and case are ignored.
  const q = norm(query)
  const visible = useMemo(() => {
    return items
      .filter((i) => !q || (q.match(/^#?\d+$/) ? String(i.id) === q.replace('#', '') : haystack(i, ws).includes(q)))
      .filter((i) => typeFilter === 'all' || i.type === typeFilter)
      .filter((i) => !priorities.length || priorities.includes(prio(i)))
      .filter((i) => !tagFilter.length || tagFilter.some((tag) => i.tags?.includes(tag)))
      .filter((i) => !platformFilter || platforms(i).includes(platformFilter))
      .sort(SORTS[sort])
  }, [items, ws, typeFilter, q, priorities, tagFilter, platformFilter, sort])
  const tagCounts = useMemo(() => {
    const c = new Map<string, number>()
    for (const i of items) for (const tag of i.tags ?? []) c.set(tag, (c.get(tag) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  const counts = useMemo(() => {
    const c: Partial<Record<PointStatus, number>> = {}
    for (const i of visible) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [visible])
  const cards = statuses.length ? visible.filter((i) => statuses.includes(i.status)) : visible
  const mixed = statuses.length !== 1
  // Two-column waterfall: each card goes to the shorter column, by an estimate of its height.
  const masonry = useMemo(() => {
    const cols: Item[][] = [[], []]
    const heights = [0, 0]
    for (const i of cards) {
      // title row + meta row + first message + up to 3 lines of context + footer
      const h = 140 + (i.tags?.length ? 24 : 0) + Math.min(i.points[0]?.text.length ?? 0, 200) * 0.55 + Math.min(i.context?.length ?? 0, 120) * 0.5
      const k = heights[0] <= heights[1] ? 0 : 1
      cols[k].push(i)
      heights[k] += h
    }
    return cols
  }, [cards])
  const toggleStatus = (s: PointStatus) =>
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  const onZoom: Zoom = useCallback((srcs, index) => setZoom({ srcs, index }), [])
  const imgUrl = (rel: string) => (info ? encodeURI(`file://${info.dataDir}/${rel}`) : '')
  const switchProject = (root: string) => {
    setPlatformFilter('')
    setTagFilter([])
    void api.invoke<AppInfo>('selectProject', root).then((i) => {
      setLang(i.lang)
      setInfo(i)
    })
  }

  if (!info) return null
  return (
    <div className="app">
      {/* One row: status · other filters · search. On a narrow window the middle group scrolls
          sideways, so the search box is never pushed out. */}
      <header className="toolbar">
        <div className="status-filter">
          {STATUSES.map((st) => (
            <button
              key={st}
              className={`status-chip s-${st} ${statuses.includes(st) ? 'on' : ''}`}
              onClick={() => toggleStatus(st)}
            >
              <span className={`legend-dot s-${st}`} />
              {t.status[st]}
              <span className="status-count">{counts[st] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="filters">
          {info.projects.length > 1 && (
            <label className="project-select" title={info.root}>
              <FolderOpen size={13} />
              <select className="sort-select" value={info.root} onChange={(e) => switchProject(e.target.value)}>
                {info.projects.map((p) => (
                  <option key={p.root} value={p.root}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="prio-filter">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                className={`prio-chip pr-${p} ${priorities.includes(p) ? 'on' : ''}`}
                onClick={() => setPriorities((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="tag-filter">
            <button className={`btn plain ${tagFilter.length ? 'toggled' : ''}`} onClick={() => setShowTags((v) => !v)}>
              <Tag size={13} />
              {tagFilter.length ? tagFilter.join(', ') : t.tags}
            </button>
            {showTags && (
              <div className="tag-pop" onMouseLeave={() => setShowTags(false)}>
                {tagCounts.map(([tag, n]) => (
                  <button
                    key={tag}
                    className={`tag-chip ${tagFilter.includes(tag) ? 'on' : ''}`}
                    onClick={() => setTagFilter((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]))}
                  >
                    {tag}
                    <span>{n}</span>
                  </button>
                ))}
                {tagFilter.length > 0 && (
                  <button className="link" onClick={() => setTagFilter([])}>
                    {t.clear}
                  </button>
                )}
              </div>
            )}
          </div>
          {info.platforms.length > 1 && (
            <select className="sort-select" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
              <option value="">{t.allPlatforms}</option>
              {info.platforms.map((pl) => (
                <option key={pl} value={pl}>
                  {pl}
                </option>
              ))}
            </select>
          )}
          <div className="seg">
            {(['all', 'bug', 'feature'] as const).map((ty) => (
              <button key={ty} className={typeFilter === ty ? 'on' : ''} onClick={() => setTypeFilter(ty)}>
                {ty === 'all' ? t.typeAll : t.type[ty]}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {t.sort[k]}
              </option>
            ))}
          </select>
          <button className={`btn plain ${showSkips ? 'toggled' : ''}`} onClick={() => setShowSkips((v) => !v)} title={t.skipsHint}>
            <MessageSquareOff size={13} />
            {t.skips(skips.length)}
          </button>
        </div>
        <label className="search">
          <Search size={13} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label={t.clear}>
              <X size={12} />
            </button>
          )}
        </label>
      </header>

      <div className="masonry">
        {masonry.map((col, n) => (
          <div key={n} className="masonry-col">
            {col.map((i) => (
              <Card
                key={i.id}
                item={i}
                ws={ws}
                imgUrl={imgUrl}
                showStatus={mixed}
                byCreated={sort === 'created_desc' || sort === 'created_asc'}
                onZoom={onZoom}
              />
            ))}
          </div>
        ))}
        {!cards.length && <div className="empty big">{info.root ? t.empty : t.noProject}</div>}
      </div>

      {showSkips && (
        <div className="skips">
          <div className="skips-head">
            <span>{t.skipsTitle}</span>
            <button className="btn plain small" onClick={() => setShowSkips(false)} aria-label={t.close}>
              <X size={13} />
            </button>
          </div>
          <ol className="skips-list">
            {[...skips].reverse().map((k, n) => (
              <li key={n}>
                <div className="skip-meta">
                  {stamp(k.at)} · {k.workspace || `${k.agent} · ${k.session.slice(0, 8)}`}
                </div>
                <div className="skip-reason">{k.reason}</div>
              </li>
            ))}
            {!skips.length && <li className="empty">{t.none}</li>}
          </ol>
        </div>
      )}

      {zoom && <Lightbox {...zoom} onClose={() => setZoom(null)} onIndex={(index) => setZoom({ ...zoom, index })} />}
    </div>
  )
}

// Every card shows everything at once (no drawer, no modal): title, where it lives, the user's
// first words, the context, and one footer row — the thread toggle, the jump back into the
// conversation, priority, and the one action that is due (accept, or un-accept once accepted).
function Card(props: {
  item: Item
  ws: Workspaces
  imgUrl: (rel: string) => string
  showStatus: boolean
  byCreated: boolean
  onZoom: Zoom
}) {
  const { item: i, ws } = props
  // The thread (every point) starts collapsed; the first message always shows under the title.
  const [showLog, setShowLog] = useState(false)
  const reviewIds = i.points.filter((p) => p.status === 'review').map((p) => p.id)
  // One button per card: accepted → un-accept; otherwise accept every point not yet accepted
  // (whatever its state).
  const pendingIds = i.points.filter((p) => p.status !== 'accepted' && p.status !== 'dropped').map((p) => p.id)
  const acceptedIds = i.points.filter((p) => p.status === 'accepted').map((p) => p.id)
  const groups = new Map<number, Group>()
  i.points.forEach((p, n) => {
    if (p.status !== 'review') return
    const prev = i.points[n - 1]
    const run = prev && prev.status === 'review' && prev.note && prev.note === p.note ? groups.get(prev.id)!.ids : []
    run.push(p.id)
    groups.set(p.id, { ids: run, last: true })
    if (prev && run.length > 1) groups.set(prev.id, { ids: run, last: false })
  })
  // The most recent conversation is the one worth jumping back into.
  const session = i.sessions[i.sessions.length - 1]
  const wsTitle = workspaceTitle(i, ws)

  return (
    <article className={`card t-${i.type}`}>
      <div className="card-head">
        <span className={`type-icon t-${i.type}`} title={t.type[i.type]}>
          {i.type === 'bug' ? <Bug size={13} /> : <Lightbulb size={13} />}
        </span>
        <EditableTitle item={i} />
        <span className="card-when">
          {props.showStatus && <span className={`card-status s-${i.status}`}>{t.status[i.status]}</span>}
          <span title={props.byCreated ? t.createdAt : t.updatedAt}>{ago(props.byCreated ? i.created_at : i.updated_at)}</span>
        </span>
      </div>
      <div className="card-meta">
        <span className="card-id">#{i.id}</span>
        <span className={`prio-badge pr-${prio(i)}`}>{prio(i)}</span>
        {platforms(i).map((pl) => (
          <span key={pl} className="chip end">
            {pl}
          </span>
        ))}
        {(i.tags ?? []).map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>
      {i.points[0] && <div className="card-quote">{i.points[0].text}</div>}
      {i.context && <div className={`card-context ${showLog ? 'full' : ''}`}>{i.context}</div>}
      {showLog && (
        <ol className="timeline">
          {i.points.map((p) => (
            <PointRow key={p.id} item={i} point={p} group={groups.get(p.id) ?? null} imgUrl={props.imgUrl} onZoom={props.onZoom} />
          ))}
        </ol>
      )}
      <div className="card-foot">
        <button className="log-toggle" onClick={() => setShowLog((v) => !v)}>
          {showLog ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {t.conversation(i.points.length)}
          <span className="point-dots">
            {i.points.slice(0, 12).map((p) => (
              <i key={p.id} className={`s-${p.status}`} />
            ))}
          </span>
        </button>
        {session && (
          <button
            className="cmux-link"
            title={wsTitle ? t.openIn(wsTitle) : t.openConversation}
            onClick={() => {
              const wsId = session.workspace?.id ?? ws.sessionWorkspace[session.id]
              const title = (wsId && ws.titles[wsId]) || session.workspace?.title || i.title
              void api.invoke('openSession', session.id, session.agent, title, session.workspace?.id, session.cwd)
            }}
          >
            <ArrowUpRight size={13} />
            <span className="cmux-title">{wsTitle || t.openConversation}</span>
          </button>
        )}
        <span className="spacer" />
        <div className="prio-seg" title={t.priorityHint}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              className={`pr-${p} ${prio(i) === p ? 'on' : ''}`}
              onClick={() => prio(i) !== p && void api.invoke('setPriority', i.id, p)}
            >
              {p}
            </button>
          ))}
        </div>
        {i.status === 'accepted' ? (
          <button className="btn plain" onClick={() => acceptedIds.forEach((pid) => void api.invoke('undo', i.id, pid))}>
            <Undo2 size={13} />
            {t.unaccept}
          </button>
        ) : (
          pendingIds.length > 0 && (
            <button
              className={`btn ${reviewIds.length ? 'primary' : 'soft'}`}
              onClick={() => void api.invoke('accept', i.id, pendingIds)}
            >
              <Check size={13} />
              {t.accept}
            </button>
          )
        )}
      </div>
    </article>
  )
}

// Double-click the title to edit it; Enter saves, Esc cancels. A title the user edited is locked
// against agent edits (the CLI refuses --title on it).
function EditableTitle({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.title)
  const save = () => {
    const t = value.trim()
    setEditing(false)
    if (t && t !== item.title) void api.invoke('setTitle', item.id, t)
  }
  if (editing) {
    return (
      <input
        className="card-title title-input"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setValue(item.title)
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <span
      className="card-title"
      title={t.renameHint}
      onDoubleClick={() => {
        setValue(item.title)
        setEditing(true)
      }}
    >
      {item.title}
    </span>
  )
}

function Lightbox(props: { srcs: string[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const { srcs, index, onClose, onIndex } = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') onClose()
      if (e.key === 'ArrowRight' && index < srcs.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [srcs, index, onClose, onIndex])
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={srcs[index]} onClick={(e) => e.stopPropagation()} />
      {srcs.length > 1 && (
        <div className="lightbox-nav" onClick={(e) => e.stopPropagation()}>
          <button disabled={index === 0} onClick={() => onIndex(index - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span>
            {index + 1} / {srcs.length}
          </span>
          <button disabled={index === srcs.length - 1} onClick={() => onIndex(index + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function Thumbs({ srcs, onZoom }: { srcs: string[]; onZoom: Zoom }) {
  if (!srcs.length) return null
  return (
    <div className="thumbs">
      {srcs.map((s, i) => (
        <div key={s} className="thumb">
          <img src={s} onClick={() => onZoom(srcs, i)} loading="lazy" />
        </div>
      ))}
    </div>
  )
}

function Marker({ point }: { point: Point }) {
  return (
    <span className={`marker m-${point.status}`}>
      {point.status === 'accepted' ? <Check size={12} strokeWidth={3} /> : point.id}
    </span>
  )
}

// Review points submitted together share one note: it shows once, on the last point of the run.
// There are no per-point buttons — the card has one accept / un-accept.
type Group = { ids: number[]; last: boolean }

function PointRow(props: { item: Item; point: Point; group: Group | null; imgUrl: (rel: string) => string; onZoom: Zoom }) {
  const { item, point: p, group, imgUrl } = props
  const grouped = !!group && group.ids.length > 1
  return (
    <li className={`point p-${p.status}`}>
      <Marker point={p} />
      <div className="point-body">
        <div className="point-text">{p.text}</div>
        <Thumbs srcs={p.images.map(imgUrl)} onZoom={props.onZoom} />
        <div className="point-meta">
          <span>{stamp(p.created_at)}</span>
        </div>

        {p.status === 'review' && (!grouped || group!.last) && (
          <div className="panel review">
            <div className="panel-text">{p.note || t.noNote}</div>
          </div>
        )}
        {p.status !== 'review' && p.note && p.status !== 'open' && (
          <div className="panel quiet">
            <div className="panel-text">{p.note}</div>
          </div>
        )}
      </div>
    </li>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
