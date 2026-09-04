export type ScheduleBlock = { days: number[]; title: string; start: string; end: string; kind: 'fixed' | 'variable' | 'recovery' }

export function hasUserEvidence(evidence: unknown, userMessages: string[]) {
  if (typeof evidence !== 'string') return false
  const normalize = (text: string) => text.replace(/[\p{P}\s]/gu, '')
  const quote = normalize(evidence)
  return quote.length > 1 && userMessages.some(message => normalize(message).includes(quote))
}

// A global schedule completion skips optional schedule sections, not missing sleep facts.
export function isScheduleComplete(message: string): boolean {
  const text = message.trim().replace(/[.!。！]+$/u, '').replace(/\s+/g, '')
  return /^(?:응|네|좋아|이제)?(?:더이상|더)?(?:설명할|말할|추가할|알려줄)?일정(?:에대해(?:설명할|말할)(?:게|것이))?(?:은|는|이|도)?(?:더|더이상)?(?:없어|없어요|없습니다|없다|없는것같아|없는것같아요)$/u.test(text)
    || /^(?:일정(?:은|는)?)(?:이게전부(?:야|예요|입니다)?|여기까지(?:야|예요|입니다)?|다말했어(?:요)?)$/u.test(text)
    || /^(?:이제)?목표(?:를|로|부터|이야기로|대화로|설정으로)?(?:정하자|세우자|넘어가자|넘어가줘|넘어가주세요)$/u.test(text)
}

// Only an entire, unambiguous completion utterance can close a stage.
export function isExplicitCompletion(message: string): boolean {
  const text = message.trim().replace(/[.!。！]+$/u, '').trim()
  return /^(?:(?:이 단계는|고정 일정은|반복 일정도|매주 일정은|보호할 회복 시간은|이번 주 일정도|다른 일정은)\s*)?(?:이게 전부(?:예요|야)?|없어(?:요)?|없습니다|충분해요)(?:\s*[·,]\s*|\s+)?(?:다음으로)?$/u.test(text)
    || /^(?:다음으로|다음 단계로|이 단계는 충분해요 · 다음으로|넘어가자|넘어가 주세요)$/u.test(text)
}

export function replaceScheduleBlock(blocks: ScheduleBlock[], index: number, days: number[], start: string, end: string): ScheduleBlock[] {
  const target = blocks[index]
  const time = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!Number.isInteger(index) || !target || !days.length || days.some(d => !Number.isInteger(d) || !target.days.includes(d))) throw new Error('invalid_target')
  if (!time.test(start) || !(time.test(end) || end === '24:00') || start >= end) throw new Error('invalid_time')
  const selected = [...new Set(days)].sort()
  const unchanged = target.days.filter(d => !selected.includes(d))
  return blocks.flatMap((block, i) => i !== index ? [block] : [
    ...(unchanged.length ? [{ ...target, days: unchanged }] : []),
    { ...target, days: selected, start, end },
  ])
}

export function replayConversation(messages: { role: string; text: string }[], message: string) {
  return [
    ...messages.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').slice(-100).map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: message },
  ]
}

export function formatReply(value: unknown, savedDetails: string[] = []): { text: string; choices: string[] } {
  if (!value || typeof value !== 'object') throw new Error('invalid_reply')
  const { summary, details, question, choices } = value as Record<string, unknown>
  const line = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !v.includes('\n')
  if (!line(summary, 240) || !summary.trim() || !line(question, 160) || (question.match(/[?？]/g)?.length ?? 0) > 1 ||
    !Array.isArray(details) || details.length > 4 || !details.every(v => line(v, 180) && v.trim()) ||
    !Array.isArray(choices) || choices.length === 1 || choices.length > 3 || !choices.every(v => line(v, 60) && v.trim())) throw new Error('reply_needs_short_sections_and_one_question')
  const questionText = question.trim().replace(/\*\*/g, '')
  return {
    text: [summary.trim(), details.length || savedDetails.length ? [...details, ...savedDetails].map(v => `- ${v.trim()}`).join('\n') : '', questionText ? `**${questionText}**` : ''].filter(Boolean).join('\n\n'),
    choices: [...new Set(choices.map(v => v.trim()))],
  }
}

export function scheduleOpenings(bounds: { days: number[]; wake: string; bedtime: string; variable: boolean }[], blocks: ScheduleBlock[]) {
  const minutes = (time: string) => { const [h,m] = time.split(':').map(Number); return h * 60 + m }
  const clock = (time: number) => `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`
  return Array.from({ length: 7 }, (_, day) => {
    const bound = bounds.find(b => b.days.includes(day))
    if (!bound || bound.variable || !bound.wake || !bound.bedtime) return { day, status: '미정 또는 변동', slots: [] }
    const wake = minutes(bound.wake), bedtime = minutes(bound.bedtime)
    if (wake === bedtime) return { day, status: '생활 리듬 확인 필요', slots: [] }
    const end = bedtime <= wake ? 1440 : bedtime
    let cursor = wake
    const slots: { start: string; end: string }[] = []
    const busy = blocks.filter(b => b.days.includes(day)).map(b => [Math.max(wake, minutes(b.start)), Math.min(end, minutes(b.end))]).filter(([a,b]) => a < b).sort((a,b) => a[0] - b[0])
    for (const [start, finish] of busy) {
      if (start > cursor) slots.push({ start: clock(cursor), end: clock(start) })
      cursor = Math.max(cursor, finish)
    }
    if (cursor < end) slots.push({ start: clock(cursor), end: clock(end) })
    return { day, status: '등록된 일정 기준', slots }
  })
}
