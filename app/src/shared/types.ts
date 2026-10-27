// Mirrors the JSON that cli/mana-track writes. Change both together.
export type PointStatus = 'open' | 'doing' | 'review' | 'accepted' | 'dropped'
export type ItemType = 'bug' | 'feature'
export type Priority = 'P0' | 'P1' | 'P2'

export interface Point {
  id: number
  text: string
  status: PointStatus
  note: string
  images: string[]
  created_at: string
  updated_at: string
}

export interface LogEntry {
  at: string
  by: string
  text: string
}

export interface Session {
  agent: string
  id: string
  at: string
  /** where the agent ran; used to resume the conversation when cmux is not around */
  cwd?: string
  workspace?: { id: string; title: string }
}

export interface Item {
  id: number
  type: ItemType
  /** unset = P1; only the user changes it, in this app */
  priority?: Priority
  /** from the project's tags.json, set by the agent */
  tags?: string[]
  /** from the project's config.json platforms */
  platforms?: string[]
  /** the user renamed it here: agents can no longer change the title */
  title_locked?: boolean
  title: string
  /** background written for the user to recall the item by */
  context?: string
  /** The user's own remark, written in the app; agents read it (mana-track show) but never write it */
  remark?: string
  status: PointStatus
  created_at: string
  updated_at: string
  created_by: string
  points: Point[]
  files: string[]
  sessions: Session[]
  log: LogEntry[]
}

export interface ProjectInfo {
  root: string
  name: string
}

export interface AppInfo {
  /** <project>/.mana-tracker — image paths in items are relative to it */
  dataDir: string
  root: string
  name: string
  platforms: string[]
  projects: ProjectInfo[]
  lang: 'zh' | 'en'
  hasCmux: boolean
}

export interface Workspaces {
  titles: Record<string, string>
  sessionWorkspace: Record<string, string>
  running: string[]
}
