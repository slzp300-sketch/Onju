import { replaceScheduleBlock, scheduleOpenings, type ScheduleBlock } from './state.ts'

export type DayBound = { days: number[]; wake: string; bedtime: string; variable: boolean; deferred?: boolean }
const clock = /^([01]\d|2[0-3]):[0-5]\d$/
export const week = ['월', '화', '수', '목', '금', '토', '일']
export const dayLabel = (days: number[]) => days.length === 7 ? '매일' : days.join(',') === '0,1,2,3,4' ? '평일' : days.map(day => `${week[day]}요일`).join('·')
function validDays(days: unknown): days is number[] {
  return Array.isArray(days) && days.length > 0 && days.every(d => Number.isInteger(d) && d >= 0 && d < 7) && new Set(days).size === days.length
}

export function mergeRhythm(current: DayBound[], incoming: DayBound[]) {
  const byDay = new Map<number, DayBound>()
  for (const b of current) for (const day of b.days) byDay.set(day, { ...b, days: [day] })
  for (const raw of incoming) {
    const b = { ...raw, wake: raw.wake === '24:00' ? '00:00' : raw.wake, bedtime: raw.bedtime === '24:00' ? '00:00' : raw.bedtime }
    if (!validDays(b.days) || typeof b.wake !== 'string' || typeof b.bedtime !== 'string' ||
        (b.wake !== '' && !clock.test(b.wake)) || (b.bedtime !== '' && !clock.test(b.bedtime)) || typeof b.variable !== 'boolean' ||
        (b.deferred !== undefined && typeof b.deferred !== 'boolean') || (!b.wake && !b.bedtime && !b.deferred)) throw new Error('invalid_rhythm')
    for (const day of b.days) {
      const old = byDay.get(day)
      // Empty means unknown, not permission to erase an already known value.
      byDay.set(day, { ...b, days: [day], wake: b.wake || old?.wake || '', bedtime: b.bedtime || old?.bedtime || '', deferred: b.deferred ?? old?.deferred ?? false })
    }
  }
  const grouped = new Map<string, DayBound>()
  for (const [day, bound] of [...byDay].sort(([a], [b]) => a - b)) {
    const key = `${bound.wake}/${bound.bedtime}/${bound.variable}/${!!bound.deferred}`
    const previous = grouped.get(key)
    grouped.set(key, { ...bound, days: [...(previous?.days ?? []), day] })
  }
  return [...grouped.values()]
}

export function missingRhythm(bounds: DayBound[]) {
  // Continue a partially answered day before asking about entirely unknown days.
  const order = [...bounds.filter(b => !b.deferred && !!b.wake !== !!b.bedtime).flatMap(b => b.days), 0, 1, 2, 3, 4, 5, 6]
  for (const day of new Set(order)) {
    const bound = bounds.find(b => b.days.includes(day))
    if (bound?.deferred || (bound?.wake && bound?.bedtime)) continue
    return { day, field: bound?.wake ? 'bedtime' : bound?.bedtime ? 'wake' : 'both', question: `${week[day]}요일에는 보통 ${bound?.wake ? '몇 시에 잠드나요' : bound?.bedtime ? '몇 시에 일어나나요' : '몇 시에 일어나고 잠드나요'}?` }
  }
  return null
}

export function normalizeSchedule(block: ScheduleBlock): ScheduleBlock[] {
  if (!validDays(block?.days) || typeof block.title !== 'string' || !block.title.trim() || !clock.test(block.start) ||
      !(clock.test(block.end) || block.end === '24:00') || block.start === block.end || !['fixed', 'variable', 'recovery'].includes(block.kind)) throw new Error('invalid_schedule')
  const b = { ...block, days: [...block.days].sort(), title: block.title.trim().slice(0, 80) }
  if (b.start < b.end) return [b]
  return [
    { ...b, end: '24:00' },
    ...(b.end !== '00:00' ? [{ ...b, days: b.days.map(d => (d + 1) % 7).sort(), start: '00:00' }] : []),
  ]
}

export type ScheduleChange = { bounds: DayBound[]; blocks: ScheduleBlock[]; updates: { block_index: number; days: number[]; start: string; end: string }[] }
export function applySchedule(current: { day_bounds: DayBound[]; blocks: ScheduleBlock[] }, changes: ScheduleChange) {
  if (!Array.isArray(changes.bounds) || !Array.isArray(changes.blocks) || !Array.isArray(changes.updates) || changes.bounds.length + changes.blocks.length + changes.updates.length > 40) throw new Error('invalid_schedule_change')
  const day_bounds = mergeRhythm(current.day_bounds, changes.bounds)
  let blocks = [...current.blocks]
  // Reverse indices keep original references stable when a correction splits days.
  const indexes = changes.updates.map(u => u.block_index)
  if (new Set(indexes).size !== indexes.length) throw new Error('duplicate_update_index')
  for (const u of [...changes.updates].sort((a, b) => b.block_index - a.block_index)) blocks = replaceScheduleBlock(blocks, u.block_index, u.days, u.start, u.end)
  const added = changes.blocks.flatMap(normalizeSchedule)
  blocks = [...blocks, ...added].filter((b, i, all) => all.findIndex(x => x.title === b.title && x.start === b.start && x.end === b.end && x.days.join(',') === b.days.join(',')) === i)
  // Every item was validated before either result is committed: no partial success.
  return { day_bounds, blocks }
}

export function scheduleReceipt(before: { day_bounds: DayBound[]; blocks: ScheduleBlock[] }, after: { day_bounds: DayBound[]; blocks: ScheduleBlock[] }) {
  const changedBounds = after.day_bounds.filter(b => b.days.some(day => {
    const old = before.day_bounds.find(x => x.days.includes(day))
    return !old || old.wake !== b.wake || old.bedtime !== b.bedtime || old.variable !== b.variable || !!old.deferred !== !!b.deferred
  }))
  const changedBlocks = after.blocks.filter(b => !before.blocks.some(x => JSON.stringify(x) === JSON.stringify(b)))
  return [
    ...changedBounds.map(b => `**${dayLabel(b.days)}**: ${b.wake ? `${b.wake} 기상` : '기상 미정'} · ${b.bedtime ? `${b.bedtime} 취침` : '취침 미정'}${b.deferred ? ' (나중에 확인)' : b.variable ? ' (변동)' : ''}`),
    ...changedBlocks.map(b => `**${dayLabel(b.days)} ${b.title}**: ${b.start}–${b.end}`),
  ]
}

export function isDraftAcceptance(message: string) {
  // Only a complete, unqualified acceptance commits. Longer/conditional language
  // stays a conversation and can be confirmed with the versioned UI button.
  const text = message.trim().replace(/[.!。！]+$/u, '').replace(/\s+/g, '')
  if (/^(응|네|좋아|좋아요|확정해줘|그렇게해줘)$/.test(text)) return true
  return /^(?:(?:응|네|좋아|좋아요),?)?(?:(?:(?:이|그|네가제안한)?초안(?:으로|대로)?)(?:그대로)?|그대로|이대로|그렇게)(?:시작할게(?:요)?|시작하자|시작해줘|확정해줘|진행하자|진행해줘|반영해줘)$/.test(text)
}

export function deferredEvidence(text: string) {
  return /일정하지|불규칙|들쑥날쑥|그때그때|나중에|미정|모르겠|모르겠어|넘어가|건너뛰|아직 몰라/.test(text)
}

export function freeTimeSummary(bounds: DayBound[], blocks: ScheduleBlock[]) {
  const openings = scheduleOpenings(bounds, blocks).filter(day => day.slots.length && blocks.some(b => b.days.includes(day.day)))
  if (!openings.length) return ''
  const first = openings[0]
  const sameDays = openings.filter(day => JSON.stringify(day.slots) === JSON.stringify(first.slots)).map(day => day.day)
  const intervals = first.slots.slice(0, 2).map(slot => `**${slot.start}–${slot.end}**`).join(', ')
  return `등록된 일정 기준 ${dayLabel(sameDays)} ${intervals}${first.slots.length > 2 ? ' 등' : ''}이 비어 있어요. 휴식·이동은 더 확인할게요.`
}
