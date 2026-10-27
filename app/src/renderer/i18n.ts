// UI strings in Chinese and English. The language follows the system (zh* → Chinese, otherwise
// English); MANA_TRACKER_LANG=zh|en forces one.
import type { PointStatus } from '../shared/types'

const zh = {
  status: { open: '待处理', doing: '处理中', review: '待验收', accepted: '已通过', dropped: '不做了' } as Record<PointStatus, string>,
  type: { bug: 'Bug', feature: '需求' },
  typeAll: '全部',
  tags: '标签',
  clear: '清空',
  allPlatforms: '全部端',
  sort: { updated: '最近更新', created_desc: '最新提出', created_asc: '最早提出', priority: '优先级' },
  skips: (n: number) => `没记的 ${n}`,
  skipsHint: 'agent 判成「不是需求」、没有记进清单的那些轮，抽查有没有判错',
  skipsTitle: '判成「不是需求」的对话轮次',
  none: '还没有',
  close: '关闭',
  search: '搜索我的原话、cmux 工作区',
  empty: '这里没有条目',
  noProject: '还没有项目。在项目根目录运行 mana-track init，再回到这里。',
  justNow: '刚刚',
  minutes: (n: number) => `${n} 分钟前`,
  hours: (n: number) => `${n} 小时前`,
  days: (n: number) => `${n} 天前`,
  createdAt: '提出时间',
  updatedAt: '最近更新',
  conversation: (n: number) => `对话 ${n}`,
  openConversation: '打开对话',
  openIn: (where: string) => `打开对话：${where}`,
  priorityHint: '优先级：只有你能改',
  accept: '通过',
  unaccept: '取消通过',
  renameHint: '双击修改标题',
  noNote: '（没写说明）',
}

const en: typeof zh = {
  status: { open: 'Open', doing: 'Doing', review: 'Review', accepted: 'Accepted', dropped: 'Dropped' },
  type: { bug: 'Bug', feature: 'Feature' },
  typeAll: 'All',
  tags: 'Tags',
  clear: 'Clear',
  allPlatforms: 'Platforms',
  sort: { updated: 'Updated', created_desc: 'Newest', created_asc: 'Oldest', priority: 'Priority' },
  skips: (n: number) => `Skipped ${n}`,
  skipsHint: 'Turns the agent judged "not a requirement" — spot-check its calls',
  skipsTitle: 'Turns judged "not a requirement"',
  none: 'None yet',
  close: 'Close',
  search: 'Search your words, workspaces',
  empty: 'Nothing here',
  noProject: 'No project yet. Run mana-track init in a project root, then come back.',
  justNow: 'just now',
  minutes: (n: number) => `${n}m ago`,
  hours: (n: number) => `${n}h ago`,
  days: (n: number) => `${n}d ago`,
  createdAt: 'Created',
  updatedAt: 'Last updated',
  conversation: (n: number) => `Thread ${n}`,
  openConversation: 'Open conversation',
  openIn: (where: string) => `Open conversation: ${where}`,
  priorityHint: 'Priority — only you can change it',
  accept: 'Accept',
  unaccept: 'Un-accept',
  renameHint: 'Double-click to rename',
  noNote: '(no note)',
}

export let t = zh

export function setLang(lang: 'zh' | 'en') {
  t = lang === 'zh' ? zh : en
}
