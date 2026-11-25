export type ConversationSummary = {
  version: 1
  throughMessageId: string
  userSignals: string[]
  assistantCommitments: string[]
}

type Message = { id: string; role: string; text: string }

const clean = (value: unknown, max = 180) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
const uniqueTail = (values: string[], limit: number) => {
  const seen = new Set<string>()
  return values.reverse().filter(value => {
    const key = value.replace(/[\p{P}\s]/gu, '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit).reverse()
}

export function loadConversationSummary(value: unknown): ConversationSummary | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.throughMessageId !== 'string') return null
  return {
    version: 1,
    throughMessageId: raw.throughMessageId,
    userSignals: Array.isArray(raw.userSignals) ? raw.userSignals.map(value => clean(value)).filter(Boolean).slice(-12) : [],
    assistantCommitments: Array.isArray(raw.assistantCommitments) ? raw.assistantCommitments.map(value => clean(value)).filter(Boolean).slice(-8) : [],
  }
}

export function compactConversation(messages: Message[], previous: ConversationSummary | null = null): ConversationSummary | null {
  if (messages.length <= 20) return previous
  const older = messages.slice(0, -16)
  if (!older.length) return previous
  const priorUsers = previous?.userSignals ?? []
  const priorAssistants = previous?.assistantCommitments ?? []
  const userSignals = older.filter(message => message.role === 'user').map(message => clean(message.text))
  const assistantCommitments = older.filter(message => message.role === 'assistant' && /반영|저장|확정|제안|다시 확인|함께 정리/.test(message.text)).map(message => clean(message.text))
  return {
    version: 1,
    throughMessageId: older.at(-1)?.id ?? previous?.throughMessageId ?? '',
    userSignals: uniqueTail([...priorUsers, ...userSignals], 12),
    assistantCommitments: uniqueTail([...priorAssistants, ...assistantCommitments], 8),
  }
}

export function publicConversationSummary(summary: ConversationSummary | null) {
  return summary ? { userSignals: summary.userSignals, assistantCommitments: summary.assistantCommitments } : null
}
