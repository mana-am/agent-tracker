import type { Item, PointStatus } from './types'

// An item shows the status of its point that most needs a hand. cli/mana-track has the same
// rule (PRECEDENCE).
const PRECEDENCE: PointStatus[] = ['doing', 'open', 'review', 'accepted']

export function deriveStatus(item: Item): PointStatus {
  const live: PointStatus[] = item.points.map((p) => p.status).filter((s) => s !== 'dropped')
  if (live.length === 0) return 'dropped'
  return PRECEDENCE.find((s) => live.includes(s)) ?? 'open'
}
