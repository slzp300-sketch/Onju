import { hasUserEvidence } from './state.ts'

export const dialogueFocuses = ['rhythm', 'schedule', 'goals', 'open'] as const
export const dialogueIntents = ['share_fact', 'ask_question', 'seek_advice', 'correct', 'decide', 'decline', 'social'] as const
export const dialogueMoves = ['answer', 'reflect', 'suggest', 'ask', 'act_confirm', 'transition'] as const
export const dialogueConfidences = ['high', 'medium', 'low'] as const
export const memoryKinds = ['motivation', 'constraint', 'preference', 'challenge', 'context'] as const
export const memoryScopes = ['long_term', 'temporary'] as const

export type DialogueFocus = typeof dialogueFocuses[number]
export type DialogueIntent = typeof dialogueIntents[number]
export type DialogueMove = typeof dialogueMoves[number]
export type DialogueConfidence = typeof dialogueConfidences[number]
export type MemoryKind = typeof memoryKinds[number]
export type MemoryScope = typeof memoryScopes[number]
export type MemoryFact = {
  id: string
  kind: MemoryKind
  note: string
  evidence: string
  scope: MemoryScope
  confidence: number
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  sourceMessageId: string
}
export type DialogueState = {
  version: 2
  focus: DialogueFocus
  lastIntent: DialogueIntent
  lastMove: DialogueMove
  confidence: DialogueConfidence
  expectsReply: boolean
  openThreads: string[]
  scheduleComplete: boolean
  memory: MemoryFact[]
}

type MemoryInput = { kind?: unknown; note?: unknown; evidence?: unknown; scope?: unknown; expires_in_days?: unknown }
export type DialogueUpdate = {
  focus?: unknown
  intent?: unknown
  move?: unknown
  confidence?: unknown
  expects_reply?: unknown
  open_threads?: unknown
  remember?: unknown
  forget?: unknown
}

const includes = <T extends readonly string[]>(values: T, value: unknown): value is T[number] => typeof value === 'string' && values.includes(value as T[number])
const clean = (value: unknown, max = 140) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
const normalized = (value: string) => value.replace(/[\p{P}\s]/gu, '').toLocaleLowerCase('ko-KR')
const iso = (value: unknown, fallback: string) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback

export function emptyDialogue(stage = 0): DialogueState {
  return {
    version: 2,
    focus: stage === 5 ? 'goals' : stage === 0 ? 'rhythm' : 'schedule',
    lastIntent: 'share_fact',
    lastMove: 'ask',
    confidence: 'low',
    expectsReply: true,
    openThreads: [],
    scheduleComplete: stage === 5,
    memory: [],
  }
}

export function loadDialogue(value: unknown, stage = 0, now = new Date().toISOString()): DialogueState {
  const fallback = emptyDialogue(stage)
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  const memory = Array.isArray(raw.memory) ? raw.memory.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const fact = item as Record<string, unknown>
    const kind = includes(memoryKinds, fact.kind) ? fact.kind : null
    const note = clean(fact.note)
    const evidence = clean(fact.evidence, 180)
    if (!kind || !note || !evidence) return []
    const scope = includes(memoryScopes, fact.scope) ? fact.scope : kind === 'context' ? 'temporary' : 'long_term'
    const createdAt = iso(fact.createdAt, now)
    const updatedAt = iso(fact.updatedAt, createdAt)
    const expiresAt = scope === 'temporary' ? iso(fact.expiresAt, new Date(Date.parse(updatedAt) + 14 * 864e5).toISOString()) : null
    if (expiresAt && Date.parse(expiresAt) <= Date.parse(now)) return []
    return [{
      id: typeof fact.id === 'string' && fact.id ? fact.id : crypto.randomUUID(), kind, note, evidence, scope,
      confidence: typeof fact.confidence === 'number' ? Math.max(0, Math.min(1, fact.confidence)) : 1,
      createdAt, updatedAt, expiresAt, sourceMessageId: typeof fact.sourceMessageId === 'string' ? fact.sourceMessageId : '',
    }]
  }).slice(-32) : []
  return {
    version: 2,
    focus: includes(dialogueFocuses, raw.focus) ? raw.focus : fallback.focus,
    lastIntent: includes(dialogueIntents, raw.lastIntent) ? raw.lastIntent : fallback.lastIntent,
    lastMove: includes(dialogueMoves, raw.lastMove) ? raw.lastMove : fallback.lastMove,
    confidence: includes(dialogueConfidences, raw.confidence) ? raw.confidence : fallback.confidence,
    expectsReply: typeof raw.expectsReply === 'boolean' ? raw.expectsReply : raw.lastMove === 'ask',
    openThreads: Array.isArray(raw.openThreads) ? raw.openThreads.map(value => clean(value, 80)).filter(Boolean).slice(0, 6) : [],
    scheduleComplete: typeof raw.scheduleComplete === 'boolean' ? raw.scheduleComplete : fallback.scheduleComplete,
    memory,
  }
}

export function applyDialogueUpdate(current: DialogueState, update: DialogueUpdate, userText: string, options: {
  now?: string
  userMessageId?: string
  allowedOpenThreads?: string[]
} = {}) {
  const now = options.now && !Number.isNaN(Date.parse(options.now)) ? new Date(options.now).toISOString() : new Date().toISOString()
  const next = loadDialogue(structuredClone(current), 0, now)
  if (includes(dialogueFocuses, update.focus)) next.focus = update.focus
  if (includes(dialogueIntents, update.intent)) next.lastIntent = update.intent
  if (includes(dialogueMoves, update.move)) next.lastMove = update.move
  if (includes(dialogueConfidences, update.confidence)) next.confidence = update.confidence
  if (typeof update.expects_reply === 'boolean') next.expectsReply = update.expects_reply
  const allowed = new Set((options.allowedOpenThreads ?? []).map(value => clean(value, 80)))
  if (Array.isArray(update.open_threads)) {
    next.openThreads = [...new Set(update.open_threads.map(value => clean(value, 80)).filter(value => value && (!allowed.size || allowed.has(value))))].slice(0, 6)
  }

  let ignored = 0
  const forget = Array.isArray(update.forget) ? update.forget as MemoryInput[] : []
  for (const item of forget.slice(0, 4)) {
    const note = clean(item?.note)
    const evidence = clean(item?.evidence, 180)
    if (!note || !hasUserEvidence(evidence, [userText])) { ignored += 1; continue }
    const key = normalized(note)
    const before = next.memory.length
    next.memory = next.memory.filter(fact => normalized(fact.note) !== key)
    if (before === next.memory.length) ignored += 1
  }

  const remembered: MemoryFact[] = []
  const remember = Array.isArray(update.remember) ? update.remember as MemoryInput[] : []
  for (const item of remember.slice(0, 4)) {
    const kind = includes(memoryKinds, item?.kind) ? item.kind : null
    const note = clean(item?.note)
    const evidence = clean(item?.evidence, 180)
    if (!kind || !note || !hasUserEvidence(evidence, [userText])) { ignored += 1; continue }
    const scope = includes(memoryScopes, item?.scope) ? item.scope : kind === 'context' ? 'temporary' : 'long_term'
    const days = Number.isInteger(item?.expires_in_days) ? Math.max(1, Math.min(30, Number(item.expires_in_days))) : 14
    const expiresAt = scope === 'temporary' ? new Date(Date.parse(now) + days * 864e5).toISOString() : null
    const duplicate = next.memory.find(fact => fact.kind === kind && normalized(fact.note) === normalized(note))
    if (duplicate) {
      duplicate.evidence = evidence
      duplicate.updatedAt = now
      duplicate.expiresAt = expiresAt
      duplicate.scope = scope
      duplicate.sourceMessageId = options.userMessageId ?? duplicate.sourceMessageId
      duplicate.confidence = 1
      remembered.push(duplicate)
      continue
    }
    const fact: MemoryFact = {
      id: crypto.randomUUID(), kind, note, evidence, scope, confidence: 1, createdAt: now, updatedAt: now, expiresAt,
      sourceMessageId: options.userMessageId ?? '',
    }
    next.memory.push(fact)
    remembered.push(fact)
  }
  next.memory = next.memory.slice(-32)
  return { state: next, remembered, ignored }
}

export function settleDialogueReply(state: DialogueState, question: unknown) {
  const expectsReply = typeof question === 'string' && question.trim().length > 0
  state.expectsReply = expectsReply
  if (expectsReply) state.lastMove = 'ask'
  else if (state.lastMove === 'ask') state.lastMove = 'answer'
}

export function forgetMemory(state: DialogueState, memoryId: string) {
  const next = structuredClone(state)
  next.memory = next.memory.filter(memory => memory.id !== memoryId)
  return next
}

export function publicDialogue(state: DialogueState) {
  return {
    focus: state.focus, lastIntent: state.lastIntent, lastMove: state.lastMove, confidence: state.confidence,
    expectsReply: state.expectsReply, openThreads: state.openThreads,
    memory: state.memory.map(({ id, kind, note, scope, createdAt, expiresAt }) => ({ id, kind, note, scope, createdAt, expiresAt })),
  }
}
