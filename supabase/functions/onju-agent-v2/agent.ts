import { emptyGoal, goalSchema, goalSchemaForRequest, goalSessionIssue, materializeGoalDraft, validGoalCard, describeGoal, goalDraftIssue, initialGoalProseIssue, requestedGoalAreas, goalCoverageIssue, type GoalCard, type GoalDraft } from './goal.ts'
import { formatReply, isScheduleComplete, replayConversation, scheduleOpenings, type ScheduleBlock } from './state.ts'
import { applySchedule, deferredEvidence, isDraftAcceptance, missingRhythm, scheduleReceipt, freeTimeSummary, week, type DayBound, type ScheduleChange } from './policy.ts'
import { conversationPrompt } from './prompt.ts'
import { draftChoices, draftMessage, goalEditSchema, relatedApproval, reviseGoal, weeklyMinutes, type GoalEdit } from './goalRevision.ts'
import { effortIssue, effortPolicy } from './goalEffort.ts'
import { executionIssue, initialGoalMessage, normalizeDerivedExecutionText, requestedCompletionPercent, synchronizeExecution } from './goalExecution.ts'

export type Message = { id: string; role: string; text: string }
export type AgentContext = { version: 3; draft: GoalDraft | null }
export type AgentState = { stage: number; messages: Message[]; blocks: ScheduleBlock[]; day_bounds: DayBound[]; goal_card: GoalCard; agent_v2_context: AgentContext }
type Usage = { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } }
export type Event = { tool: string; at: string; args?: unknown; result?: unknown; model?: string; usage?: Usage }
type ProviderResponse = { id: string; model: string; usage: Usage; output: { type: string; name?: string; call_id?: string; arguments?: string }[] }
export type ModelRequest = Record<string, unknown>
type Dependencies = { request: (body: ModelRequest) => Promise<ProviderResponse>; now: string; model?: string }
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
// Ask the model for weekday names; conversion to app indices belongs to code.
const days = { type: 'array', items: { type: 'string', enum: week }, description: '평일은 월,화,수,목,금. 주말은 토,일.' }
const str = { type: 'string' }
const tool = (name: string, description: string, parameters: unknown) => ({ type: 'function', name, description, strict: true, parameters })
const responseTool=(schema:unknown)=>tool('respond', '최종 답변. 새 초안은 goal_draft에 한 번만 작성한다. 서버가 검증한 조건으로 답변과 승인 선택지를 표시한다. 기존 목표 수정은 revise_goal을 사용한다. 제안이 없으면 null.', object({
  focus: { type: 'string', enum: ['rhythm', 'schedule', 'goals'] }, goal_outcome: str,
  goal_draft: { anyOf: [schema, { type: 'null' }] },
  summary: { type: 'string', maxLength: 240 }, details: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 180 } },
  question: { type: 'string', maxLength: 160 }, choices: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 60 } },
}))
const tools = [
  tool('apply_schedule', '사용자에게 확인된 시간만 일괄 저장한다. 기상/취침 중 모르는 값은 빈 문자열. deferred는 사용자가 미루거나 불규칙하다고 명시한 요일만 true. 자정 초과 일정은 시작 요일+종료 시간 그대로 전달하면 서버가 다음 날로 나눈다. 기존 일정 정정은 updates를 사용한다.', object({
    bounds: { type: 'array', items: object({ days, wake: str, bedtime: str, variable: { type: 'boolean' }, deferred: { type: 'boolean' } }) },
    blocks: { type: 'array', items: object({ days, title: str, start: str, end: str, kind: { type: 'string', enum: ['fixed', 'variable', 'recovery'] } }) },
    updates: { type: 'array', items: object({ block_index: { type: 'integer', minimum: 0 }, days, start: str, end: str }) },
  })),
  responseTool(goalSchema),
  tool('revise_goal', '기존 초안/확정 목표에서 사용자가 요청한 항목만 변경한 초안을 표시한다. 바뀌지 않는 값은 보내지 않는다. evidence는 현재 사용자 발언의 원문 일부. 주간 행동의 actionIndex는 0부터, 목표 전체 필드는 -1. 연관된 결과 기준이나 기간은 임의로 보내지 않는다. 서버가 불일치를 발견하면 별도로 확인한다.', object({ edits:goalEditSchema })),
]

export function loadState(data: Partial<AgentState> | null | undefined): AgentState {
  const context = data?.agent_v2_context
  return {
    stage: Math.max(0, Math.min(5, data?.stage ?? 0)), messages: data?.messages ?? [], blocks: data?.blocks ?? [], day_bounds: data?.day_bounds ?? [],
    goal_card: validGoalCard(data?.goal_card) ? structuredClone(data.goal_card) : structuredClone(emptyGoal),
    agent_v2_context: { version: 3, draft: context?.draft?.id && validGoalCard(context.draft.card) ? structuredClone(context.draft) : null },
  }
}

export async function runAgentTurn(initial: AgentState, message: string, deps: Dependencies, confirmation?: { draftId: string; includeRelated?: boolean }) {
  const state = structuredClone(initial), events: Event[] = []
  const log = (tool: string, result: unknown, args?: unknown) => events.push({ tool, at: new Date().toISOString(), result, args })
  const userText = message.trim().slice(0, 2000)
  const requestedAreas=requestedGoalAreas(userText)
  const assistantId = crypto.randomUUID()
  let final = '', suggestions: string[] = [], responseId = ''
  let scheduleFailure = false
  const pending = state.agent_v2_context.draft
  const base = /확정한|확정된/.test(userText) && state.goal_card.weeklyActions.length ? state.goal_card : pending?.card ?? (state.goal_card.weeklyActions.length ? state.goal_card : null)
  const baseLabel = base === state.goal_card ? '확정 목표' : '직전 초안'
  const last = state.messages.at(-1)
  const acceptRelated = userText === relatedApproval
  if (confirmation && (!pending || confirmation.draftId !== pending.id || (!isDraftAcceptance(userText) && !acceptRelated) || (!!confirmation.includeRelated !== acceptRelated))) throw new Error('draft_changed')
  if (pending && (isDraftAcceptance(userText)||acceptRelated) && (confirmation?.draftId === pending.id || (last?.role === 'assistant' && last.id === pending.presentedMessageId))) {
    if(pending.related&&!acceptRelated){
      final='관련 조건을 바꿀지도 확인이 필요해요. 아직 확정하지 않았어요.\n\n'+draftMessage(pending)
      suggestions=draftChoices(pending)
      pending.presentedMessageId=assistantId
    } else {
    if(acceptRelated&&!pending.related)throw Error('draft_changed')
    state.goal_card = structuredClone(acceptRelated ? pending.related!.card : pending.card)
    state.agent_v2_context.draft = null
    state.stage = 5
    final = ['좋아요. 확인하신 초안 그대로 확정했어요.', describeGoal(state.goal_card).map(line => `- ${line}`).join('\n'), '**이제 시간 지도에 맞춰 주간 계획을 만들 수 있어요.**'].join('\n\n')
    log('confirm_goal', { ok: true, draftId: pending.id })
    }
  }
  // Refusal never silently overwrites the confirmed goal; the model may offer a new draft.
  if (pending && /취소|거절|확정하지|아직.*말고/.test(userText)) state.agent_v2_context.draft = null
  const conversation: unknown[] = replayConversation(state.messages, userText)
  const labels = ['생활 리듬', '일정', '일정', '일정', '일정', '목표']
  if (state.stage > 0 && isScheduleComplete(userText)) state.stage = 5
  for (let turn = 0; !final && turn < 5; turn++) {
    const missing = missingRhythm(state.day_bounds)
    const effort=effortPolicy([...state.messages.filter(m=>m.role==='user').map(m=>m.text),userText],state.day_bounds,state.blocks)
    const out = await deps.request({
      model: deps.model ?? 'gpt-4.1-2025-04-14', store: false,
      instructions: conversationPrompt({ now: deps.now, phase: labels[state.stage], facts: {
        dayBounds: state.day_bounds, blocks: state.blocks.map((b, block_index) => ({ ...b, block_index })), goalCard: state.goal_card,
        pendingDraft: state.agent_v2_context.draft, revisionBase:base, revisionBaseLabel:baseLabel, effortPolicy:effort, requestedGoalAreas:requestedAreas, missingRhythm: missing,
      }, openings: scheduleOpenings(state.day_bounds, state.blocks) }),
      input: conversation, tools:base?tools:tools.filter(t=>t.name!=='revise_goal').map(t=>t.name==='respond'?responseTool(goalSchemaForRequest(requestedAreas,userText)):t), tool_choice: 'required', parallel_tool_calls: false,
    })
    responseId = out.id
    events.push({ tool: 'model_usage', at: new Date().toISOString(), model: out.model, usage: out.usage })
    const calls = out.output.filter(o => o.type === 'function_call')
    if (!calls.length) throw new Error('no_final_text')
    const outputs = []
    for (const call of calls) {
      let args: Record<string, unknown> = {}, result: Record<string, unknown>
      try {
        args = JSON.parse(call.arguments ?? '{}')
        if (call.name === 'apply_schedule') {
          const raw = args as unknown as ScheduleChange
          const convert = <T extends { days: number[] }>(items: T[]) => items.map(item => ({ ...item, days: item.days.map(day => typeof day === 'string' ? week.indexOf(day) : day) }))
          const changes = { bounds: convert(raw.bounds), blocks: convert(raw.blocks), updates: convert(raw.updates) }
          if (changes.bounds?.some(b => b.deferred) && !deferredEvidence(state.messages.filter(m => m.role === 'user').map(m => m.text).concat(userText).join('\n'))) throw new Error('defer_requires_user_request')
          // Prevent a correction being appended under a second copy of its title.
          if (/(수정|변경|바꿔|정정)/.test(userText) && changes.blocks?.some(b => state.blocks.some(old => old.title === b.title && old.days.some(d => b.days.includes(d))))) throw new Error('use_updates_for_correction')
          const next = applySchedule(state, changes)
          state.blocks = next.blocks; state.day_bounds = next.day_bounds
          scheduleFailure = false
          if (state.stage === 0 && !missingRhythm(state.day_bounds)) state.stage = 1
          result = { ok: true, saved: scheduleReceipt(initial, state), missingRhythm: missingRhythm(state.day_bounds), openings: scheduleOpenings(state.day_bounds, state.blocks) }
        } else if (call.name === 'revise_goal') {
          if(!base)throw Error('no_goal_to_revise')
          const revision=reviseGoal(base,args.edits as GoalEdit[],userText)
          if(/가볍|부담|줄여|줄이/.test(userText)&&!/기간|결과|기준/.test(userText)&&weeklyMinutes(revision.card)>=weeklyMinutes(base))throw Error('lighter_revision_must_reduce_weekly_load')
          const proposal:GoalDraft={id:crypto.randomUUID(),presentedMessageId:assistantId,...revision,baseLabel,notes:[effort.note]}
          state.agent_v2_context.draft=proposal;state.stage=5
          final=draftMessage(proposal);suggestions=draftChoices(proposal)
          result={ok:true,goalConfirmed:false}
        } else if (call.name === 'respond') {
          const focus = args.focus
          if (focus === 'goals') state.stage = 5
          else if (focus === 'schedule' && state.stage === 0 && !missingRhythm(state.day_bounds)) state.stage = 1
          if (typeof args.goal_outcome === 'string' && args.goal_outcome.trim() && !state.goal_card.outcome && state.stage === 5) state.goal_card.outcome = args.goal_outcome.trim().slice(0, 200)
          const receipt = scheduleReceipt(initial, state)
          const draftInput = args.goal_draft
          if (draftInput !== null && draftInput !== undefined) {
            if(base)throw Error('use_revise_goal: 기존 계획은 전체 재작성하지 말고 edits로 요청된 항목만 바꾸세요. 추가·삭제 등 지원하지 않는 변경은 질문으로 확인하세요.')
            const materialized=materializeGoalDraft(draftInput,requestedAreas)
            if (!materialized || !materialized.outcome || !materialized.durationWeeks || !materialized.weeklyActions.length || !materialized.targetMetric) throw new Error('draft_needs_outcome_trial_period_result_and_actions')
            let draft:GoalCard=materialized
            // An unsolicited calendar date is not a fact. Keep the trial duration,
            // and only preserve an exact deadline explicitly supplied by the user.
            if(draft.deadline&&!state.messages.filter(m=>m.role==='user').map(m=>m.text).concat(userText).some(text=>text.includes(draft.deadline)))draft.deadline=''
            draft=normalizeDerivedExecutionText(draft)
            const detailsIssue=executionIssue(draft)
            // Structural validation already succeeded. Derive legacy fields even
            // when prose needs repair; the compact schema has no fallbackAction.
            const normalizedDraft=synchronizeExecution(draft)
            // Required named slots are stronger coverage evidence than keyword
            // guesses: "우선순위" and "감사 기록" can be valid activities too.
            const namedAreas=requestedAreas.length>1&&typeof draftInput==='object'&&draftInput!==null&&'actions' in draftInput&&!Array.isArray(draftInput.actions)
            const issues=[goalDraftIssue(draft),goalSessionIssue(draft,userText),initialGoalProseIssue(draft),namedAreas?null:goalCoverageIssue(draft,requestedAreas),detailsIssue,effortIssue(normalizedDraft,effort)].filter(Boolean)
            if(issues.length)throw Error(issues.join('\n'))
            const requestedPercent=requestedCompletionPercent([...state.messages.filter(m=>m.role==='user').map(m=>m.text),userText])
            if(requestedPercent!==undefined && (draft.execution?.measurement!=='routine_completion'||draft.execution.completionPercent!==requestedPercent))throw Error('preserve_requested_completion_percent: 사용자가 명시한 실행률 기준을 바꾸지 마세요.')
            draft=synchronizeExecution(draft)
            const proposal: GoalDraft = { id: crypto.randomUUID(), card: structuredClone(draft), presentedMessageId: assistantId,notes:[effort.defaultStart?'가볍게 시험해 볼 시작안이에요. 실행량은 함께 조절할 수 있어요.': '말씀하신 실행 가능 시간을 기준으로 초안을 잡았어요.',effort.note,...(effort.weekly===0?['현재 등록된 일정에는 여유가 없어, 실행 전에 시간을 비우거나 일정을 조정해야 해요.']:[])] }
            state.agent_v2_context.draft = proposal
            state.stage = 5
            // Do not let free-form text hide or contradict the exact terms to be approved.
            final = initialGoalMessage(draft,proposal.notes)
            if (scheduleFailure) final = '일정 변경은 아직 반영하지 못했어요. 목표 초안은 별도로 정리했어요.\n\n' + final
            suggestions = draftChoices(proposal)
          } else {
            const unanswered = state.stage === 0 ? missingRhythm(state.day_bounds) : null
            if (unanswered) { args.question = unanswered.question; args.choices = [] }
            else if (state.stage !== 5 && /기상|취침|일어나|잠드/.test(String(args.question))) {
              args.question = '이 밖에 비워둬야 할 시간이 있나요?'; args.choices = ['일정은 여기까지예요', '추가할 일정이 있어요']
            }
            // The receipt is derived from actual validated state, not a model claim.
            if (receipt.length) {
              args.summary = '알려주신 내용을 시간 지도에 반영했어요.'
              const free = state.stage !== 0 && state.blocks.length && JSON.stringify(initial.blocks) !== JSON.stringify(state.blocks) ? freeTimeSummary(state.day_bounds, state.blocks) : ''
              args.details = [...receipt.slice(0, 3), ...(free ? [free] : receipt.slice(3, 4))]
            } else if (String(args.question)) {
              args.summary = String(args.summary).split(/(?<=[.!?。！？])\s*/).filter(s => !/[?？]|알려\s*주세요|말씀해\s*주세요/.test(s)).join(' ').trim() || '좋아요. 이어서 함께 정리해 볼게요.'
            }
            if (scheduleFailure) {
              args.summary = receipt.length ? '아래 내용만 반영했어요. 나머지 일정은 아직 반영하지 못했어요.' : '시간 지도에 아직 반영하지 못했어요.'
              args.details = receipt.slice(0, 4)
              args.question = '반영하지 못한 일정의 시작·종료 시간을 다시 확인해 주실래요?'
              args.choices = []
            }
            const shownReceipt = (args.details as string[]).filter(line => receipt.includes(line))
            const overflow = receipt.filter(line => !shownReceipt.includes(line))
            const reply = formatReply(args, overflow)
            final = reply.text
            suggestions = reply.choices
          }
          result = { ok: true, stage: state.stage, goalConfirmed: false }
        } else throw new Error('unknown_tool')
      } catch (error) {
        if (call.name === 'apply_schedule') scheduleFailure = true
        result = { ok: false, error: error instanceof Error ? error.message : 'validation_failed', instruction: '저장되지 않았다. 잘못된 항목을 수정하고 다시 실행하라. 성공했다고 말하지 말라.' }
      }
      log(call.name ?? 'unknown', result, args)
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) })
      if (final) break
    }
    if (!final) conversation.push(...out.output, ...outputs)
  }
  if (!final) {
    final='초안의 실행량과 완료 기준을 아직 맞추지 못했어요. 기존 확정 목표는 바꾸지 않았어요.\n\n**가장 먼저 시작할 행동 한 가지만 알려주실래요?**'
    suggestions=[]
    log('draft_validation_exhausted',{ok:false})
  }
  state.messages = [...state.messages, { id: crypto.randomUUID(), role: 'user', text: userText }, { id: assistantId, role: 'assistant', text: final }].slice(-100)
  return { state, events, assistant_message: final, suggestions, response_id: responseId, needs_clarification: state.stage === 0 && !!missingRhythm(state.day_bounds) }
}
