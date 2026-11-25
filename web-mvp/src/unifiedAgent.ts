import { withAgentSession, sessionFailureMessage } from './agentSession'
import type { AiDayBounds, AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'
import type { UserRegionalContext } from './regionalContext'
import { loadRegionalContext } from './regionalContext'

type GoalChange = { label: string; before: string; after: string }
export type PendingGoalDraft = { id: string; card: GoalCard; presentedMessageId: string; changes?:GoalChange[]; baseLabel?:string; related?:{card:GoalCard;changes:GoalChange[];reason:string}; notes?:string[] }
export type DialogueView = {
  focus: 'rhythm' | 'schedule' | 'goals' | 'open'
  lastIntent: 'share_fact' | 'ask_question' | 'seek_advice' | 'correct' | 'decide' | 'decline' | 'social'
  lastMove: 'answer' | 'reflect' | 'suggest' | 'ask' | 'act_confirm' | 'transition'
  confidence: 'high' | 'medium' | 'low'
  expectsReply: boolean
  openThreads: string[]
  memory: {
    id: string
    kind: 'motivation' | 'constraint' | 'preference' | 'challenge' | 'context'
    note: string
    scope: 'long_term' | 'temporary'
    createdAt: string
    expiresAt: string | null
  }[]
}

export type DailyCheckInView = {
  id: string
  date: string
  completed: string[]
  missed: string[]
  energy: number | null
  blocker: string
  adjustment: string
  updatedAt: string
}

export type UnifiedAgentResult = {
  assistant_message: string
  assistant_message_id?: string
  suggestions: string[]
  needs_clarification: boolean
  response_id?: string
  diagnostics?: { model?: string; calls?: number; retries?: number; duplicate?: boolean }
  state: {
    stage: number
    blocks: AiScheduleBlock[]
    dayBounds: AiDayBounds[]
    goalCard: GoalCard
    goalDraft: PendingGoalDraft | null
    dialogue: DialogueView
    dailyCheckIns: DailyCheckInView[]
    regionalContext?: UserRegionalContext
  }
}

export type AgentStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'meta'; assistantMessageId?: string }
  | { type: 'delta'; text: string }

const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined

function failureMessage(code: string, locale = 'ko-KR') {
  const accessMessage = sessionFailureMessage(code, locale)
  if (accessMessage) return accessMessage
  if (!locale.startsWith('ko')) {
    if (code === 'openai_429') return 'The AI provider is busy. Your input is kept; wait briefly before retrying.'
    if (code === 'draft_changed') return 'The draft has changed. Reload to see the latest draft.'
    if (code === 'turn_changed') return 'This request has different content. Send it as a new message.'
    return 'Could not connect to Onju. Your input is kept; please try again later.'
  }
  if (code === 'openai_429') return '요청이 잠시 몰렸어요. 잠깐 쉬었다가 같은 내용으로 다시 시도해 주세요.'
  if (code === 'draft_changed') return '온주의 초안이 바뀌었어요. 새로고침한 뒤 최신 초안을 확인해 주세요.'
  if (code === 'session_changed') return '온주 대화가 다른 화면에서 바뀌었어요. 새로고침한 뒤 이어서 이야기해 주세요.'
  if (code === 'turn_changed') return '같은 요청의 내용이 달라졌어요. 새 메시지로 다시 보내 주세요.'
  return '온주에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export async function talkToOnju(
  sessionId:string,
  message:string,
  confirmation?:{draftId:string;includeRelated?:boolean},
  options:{turnId?:string;regionalContext?:UserRegionalContext;onEvent?:(event:AgentStreamEvent)=>void} = {},
) {
  const context = options.regionalContext ?? loadRegionalContext()
  const en = !context.locale.startsWith('ko')
  if(!url||!key)throw new Error(en ? 'The server connection is not configured.' : 'Supabase 환경변수가 연결되지 않았어요.')
  const response = await fetch(`${url}/functions/v1/onju-agent-v2`, {
    method: 'POST',
    headers: { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Accept:'text/event-stream', 'X-Onju-Stream':'1' },
    body: JSON.stringify(withAgentSession(sessionId, { message, confirmation, regionalContext: context, turnId: options.turnId ?? crypto.randomUUID() })),
    signal: AbortSignal.timeout(90000),
  })
  if (!response.ok) {
    const failure = await response.json().catch(() => null)
    throw Object.assign(new Error(failureMessage(failure?.error ?? '', context.locale)), { code: failure?.error ?? '' })
  }
  if (!response.body) throw new Error(failureMessage('', context.locale))
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let complete: UnifiedAgentResult | undefined
  let streamError = ''
  const consume = (block: string) => {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? ''
    const raw = block.match(/^data:\s*(.+)$/m)?.[1]
    if (!raw) return
    const data = JSON.parse(raw)
    if (event === 'status') options.onEvent?.({ type:'status', message:String(data.message ?? '') })
    else if (event === 'meta') options.onEvent?.({ type:'meta', assistantMessageId:data.assistant_message_id })
    else if (event === 'delta') options.onEvent?.({ type:'delta', text:String(data.text ?? '') })
    else if (event === 'complete') complete = data as UnifiedAgentResult
    else if (event === 'error') streamError = String(data.error ?? '')
  }
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      consume(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
    }
    if (done) break
  }
  if (buffer.trim()) consume(buffer)
  if (streamError) throw Object.assign(new Error(failureMessage(streamError, context.locale)), { code: streamError })
  if (!complete) throw new Error(failureMessage('', context.locale))
  return complete
}
