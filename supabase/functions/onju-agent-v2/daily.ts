import { hasUserEvidence } from './state.ts'

export type DailyCheckIn = {
  id: string
  date: string
  completed: string[]
  missed: string[]
  energy: number | null
  blocker: string
  adjustment: string
  updatedAt: string
}

type EvidenceItem = { action?: unknown; evidence?: unknown }
type DailyInput = {
  completed?: unknown
  missed?: unknown
  energy?: unknown
  blocker?: unknown
  blocker_evidence?: unknown
  adjustment?: unknown
}

const clean = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
const readItems = (value: unknown, userText: string) => Array.isArray(value) ? (value as EvidenceItem[]).flatMap(item => {
  const action = clean(item?.action, 100)
  const evidence = clean(item?.evidence, 180)
  return action && hasUserEvidence(evidence, [userText]) ? [action] : []
}).slice(0, 8) : []

export function loadDailyCheckIns(value: unknown): DailyCheckIn[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : ''
    if (!date) return []
    return [{
      id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(), date,
      completed: Array.isArray(raw.completed) ? raw.completed.map(value => clean(value, 100)).filter(Boolean).slice(0, 8) : [],
      missed: Array.isArray(raw.missed) ? raw.missed.map(value => clean(value, 100)).filter(Boolean).slice(0, 8) : [],
      energy: typeof raw.energy === 'number' ? Math.max(1, Math.min(5, Math.round(raw.energy))) : null,
      blocker: clean(raw.blocker), adjustment: clean(raw.adjustment),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    }]
  }).slice(-14)
}

export function applyDailyCheckIn(current: DailyCheckIn[], input: DailyInput, userText: string, date: string, now: string) {
  const completed = readItems(input.completed, userText)
  const missed = readItems(input.missed, userText)
  const blockerEvidence = clean(input.blocker_evidence, 180)
  const blocker = blockerEvidence && hasUserEvidence(blockerEvidence, [userText]) ? clean(input.blocker) : ''
  const energy = typeof input.energy === 'number' && input.energy >= 1 && input.energy <= 5 ? Math.round(input.energy) : null
  const adjustment = clean(input.adjustment)
  if (!completed.length && !missed.length && energy === null && !blocker) throw new Error('checkin_requires_user_evidence')
  const next = structuredClone(current)
  const existing = next.find(item => item.date === date)
  const record: DailyCheckIn = existing ?? { id: crypto.randomUUID(), date, completed: [], missed: [], energy: null, blocker: '', adjustment: '', updatedAt: now }
  record.completed = [...new Set([...record.completed, ...completed])].filter(action => !missed.includes(action)).slice(-8)
  record.missed = [...new Set([...record.missed, ...missed])].filter(action => !completed.includes(action)).slice(-8)
  if (energy !== null) record.energy = energy
  if (blocker) record.blocker = blocker
  if (adjustment) record.adjustment = adjustment
  record.updatedAt = now
  if (!existing) next.push(record)
  return { checkIns: next.slice(-14), record }
}
