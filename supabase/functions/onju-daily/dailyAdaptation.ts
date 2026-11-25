import type { ItemStatus } from './state.ts'
import { withOnjuOperatingPolicy } from '../_shared/onjuOperatingPolicy.ts'

export const DAILY_ADAPTATION_STRATEGIES = ['keep', 'lower_minimum', 'prepare', 'recover_first'] as const
export type DailyAdaptationStrategy = typeof DAILY_ADAPTATION_STRATEGIES[number]
export type DailyAdaptationCause = 'time_conflict' | 'difficulty' | 'energy' | 'unexpected' | 'priority_change' | 'no_issue' | 'other'

export type DailyAdaptationItem = {
  id: string
  sourcePlanItemId: string
  routineKey: string
  title: string
  dayIndex: number
  planningStyle: 'repeat' | 'progression'
  sequenceIndex: number
  minimumAction: string
  completionEvidence: string
  inputArtifact: string
  grade: string
}

export type DailyAdaptationLog = {
  routineItemId: string
  status: ItemStatus
  evidenceText: string
}

export const dailyAdaptationInstructions = withOnjuOperatingPolicy('daily_adaptation', `당신은 온주라는 한국어 AI 실행 비서다. 오늘의 실제 실행 결과와 사용자가 말한 사정을 보고, 다음 실행에서 바꿀 한 가지만 제안한다.

고정 문구나 일반적인 응원을 쓰지 말고 사용자가 말한 원인과 해당 실행을 구체적으로 짚는다. 실패를 의지 문제로 단정하지 않는다. 오늘 못한 양을 내일 두 배로 보충시키지 않는다. 사용자가 승인하기 전에는 계획이 바뀌었다고 말하지 않는다.

progression 실행이 미완료라면 앞 단계 결과 없이 다음 단계로 넘어가지 않도록 recover_first를 우선 검토한다. 반복 루틴은 에너지가 낮으면 lower_minimum, 시작 마찰이 문제면 prepare, 변경 근거가 약하면 keep을 사용한다. source_plan_item_id와 target_plan_item_id는 제공된 후보의 값을 정확히 사용한다. next_action은 내일 또는 다음 예정일에 바로 할 수 있는 한 문장 행동으로 쓴다.`)

export type DailyAdaptationTarget = {
  sourcePlanItemId: string
  routineKey: string
  title: string
  targetDate: string
  planningStyle: 'repeat' | 'progression'
  sequenceIndex: number
  minimumAction: string
  completionEvidence: string
  inputArtifact: string
}

export type DailyAdaptationRecommendation = {
  acknowledgement: string
  causeCategory: DailyAdaptationCause
  causeSummary: string
  strategy: DailyAdaptationStrategy
  title: string
  nextAction: string
  rationale: string
  minimumAction: string
}

type ProviderResponse = { output?: Array<{ type?: string; name?: string; arguments?: string }> }

const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').slice(0, max)
  : ''
const isCause = (value: unknown): value is DailyAdaptationCause => ['time_conflict', 'difficulty', 'energy', 'unexpected', 'priority_change', 'no_issue', 'other'].includes(String(value))
const isStrategy = (value: unknown): value is DailyAdaptationStrategy => DAILY_ADAPTATION_STRATEGIES.includes(value as DailyAdaptationStrategy)
const isActionableReflection = (value: string) => {
  const compact = value.toLocaleLowerCase('ko').replace(/[.,!?~。！？]/g, '').replace(/\s+/g, '')
  return Boolean(compact) && !/^(?:없어|없어요|없습니다|없음|괜찮아|괜찮아요|그대로|모르겠어|모르겠어요)$/.test(compact)
}

export function dailyAdaptationEvidenceSignature(input: {
  sourceDate: string
  items: DailyAdaptationItem[]
  logs: DailyAdaptationLog[]
  energy: number | null
  blocker: string
  adjustment: string
}) {
  const itemById = new Map(input.items.map(item => [item.id, item]))
  const items = [...input.items]
    .sort((a, b) => a.sourcePlanItemId.localeCompare(b.sourcePlanItemId))
    .map(item => [item.sourcePlanItemId, item.routineKey, item.planningStyle, item.sequenceIndex, clean(item.minimumAction, 240), clean(item.completionEvidence, 160), clean(item.inputArtifact, 160), item.grade].join(':'))
    .join('|')
  const logs = [...input.logs]
    .sort((a, b) => a.routineItemId.localeCompare(b.routineItemId))
    .map(log => {
      const item = itemById.get(log.routineItemId)
      return [item?.sourcePlanItemId ?? log.routineItemId, log.status, clean(log.evidenceText, 500)].join(':')
    })
    .join('|')
  return [input.sourceDate, items, logs, input.energy ?? '-', clean(input.blocker, 300), clean(input.adjustment, 500)].join('::').slice(0, 2000)
}

export function needsDailyAdaptation(input: {
  items: DailyAdaptationItem[]
  logs: DailyAdaptationLog[]
  energy: number | null
  blocker: string
  adjustment: string
}) {
  const gradeById = new Map(input.items.map(item => [item.id, item.grade]))
  const hasInterruptedItem = input.logs.some(log => ['missed', 'minimum'].includes(log.status) && gradeById.get(log.routineItemId) !== 'observation')
  return hasInterruptedItem && (input.logs.some(log => log.status === 'missed') || input.energy === null || input.energy > 2 || isActionableReflection(input.adjustment || input.blocker))
}

function primarySource(items: DailyAdaptationItem[], logs: DailyAdaptationLog[]) {
  const candidates = logs
    .filter(log => log.status === 'missed' || log.status === 'minimum')
    .map(log => ({ log, item: items.find(item => item.id === log.routineItemId) }))
    .filter((entry): entry is { log: DailyAdaptationLog; item: DailyAdaptationItem } => Boolean(entry.item && entry.item.grade !== 'observation'))
    .sort((a, b) => Number(b.item.planningStyle === 'progression') - Number(a.item.planningStyle === 'progression') || Number(b.log.status === 'missed') - Number(a.log.status === 'missed'))
  return candidates[0] ?? null
}

export function fallbackDailyAdaptation(input: {
  items: DailyAdaptationItem[]
  logs: DailyAdaptationLog[]
  targets: DailyAdaptationTarget[]
  energy: number | null
  blocker: string
  adjustment: string
}) {
  const source = primarySource(input.items, input.logs)
  if (!source) return null
  const target = input.targets.find(item => item.routineKey === source.item.routineKey) ?? input.targets[0]
  if (!target) return null
  const lowEnergy = input.energy !== null && input.energy <= 2
  const progression = source.item.planningStyle === 'progression'
  const strategy: DailyAdaptationStrategy = progression ? 'recover_first' : lowEnergy ? 'lower_minimum' : 'prepare'
  const minimum = source.item.minimumAction || target.minimumAction || `${source.item.title}을 2분만 시작하기`
  const nextAction = progression
    ? `${minimum}부터 시작해 빠진 결과를 먼저 남기기`
    : strategy === 'lower_minimum'
      ? minimum
      : `${target.title}을 시작할 도구와 첫 화면을 미리 준비하기`
  return {
    sourcePlanItemId: source.item.sourcePlanItemId,
    target,
    recommendation: {
      acknowledgement: clean(input.adjustment || input.blocker, 220) || `${source.item.title}의 실행이 계획대로 이어지지 않았어요.`,
      causeCategory: lowEnergy ? 'energy' as const : /회의|야근|약속|일정|시간|이동/u.test(`${input.blocker} ${input.adjustment}`) ? 'time_conflict' as const : 'other' as const,
      causeSummary: clean(input.blocker || input.adjustment, 180) || '오늘 실행 기록에서 확인된 방해 조건',
      strategy,
      title: progression ? '빠진 결과부터 이어가기' : lowEnergy ? '내일은 최소 행동으로 연결하기' : '시작 준비를 먼저 끝내기',
      nextAction,
      rationale: progression
        ? '앞 단계 결과 없이 다음 단계로 넘어가지 않도록 실행 순서를 보호합니다.'
        : '하루 실패를 만회하려고 양을 늘리지 않고, 다시 시작할 가능성만 높입니다.',
      minimumAction: minimum,
    },
  }
}

export async function runDailyAdaptationTurn(input: {
  sourceDate: string
  items: DailyAdaptationItem[]
  logs: DailyAdaptationLog[]
  targets: DailyAdaptationTarget[]
  energy: number | null
  blocker: string
  adjustment: string
  weeklySignals: unknown[]
  model: string
  request: (body: Record<string, unknown>) => Promise<ProviderResponse>
}) {
  if (!needsDailyAdaptation(input)) return null
  const source = primarySource(input.items, input.logs)
  if (!source || !input.targets.length) return null
  const response = await input.request({
    model: input.model,
    store: false,
    instructions: dailyAdaptationInstructions,
    input: JSON.stringify({
      source_date: input.sourceDate,
      today_items: input.items,
      today_results: input.logs,
      energy: input.energy,
      blocker: clean(input.blocker, 300),
      user_adjustment: clean(input.adjustment, 500),
      next_candidates: input.targets,
      recent_weekly_signals: input.weeklySignals,
    }),
    tools: [{
      type: 'function',
      name: 'submit_daily_adaptation',
      description: '오늘의 근거에서 다음 실행에 적용할 한 가지 조정안을 제출한다.',
      strict: true,
      parameters: {
        type: 'object', additionalProperties: false,
        required: ['should_propose', 'source_plan_item_id', 'target_plan_item_id', 'acknowledgement', 'cause_category', 'cause_summary', 'strategy', 'title', 'next_action', 'rationale', 'minimum_action'],
        properties: {
          should_propose: { type: 'boolean' },
          source_plan_item_id: { type: 'string', maxLength: 120 },
          target_plan_item_id: { type: 'string', maxLength: 120 },
          acknowledgement: { type: 'string', maxLength: 220 },
          cause_category: { type: 'string', enum: ['time_conflict', 'difficulty', 'energy', 'unexpected', 'priority_change', 'no_issue', 'other'] },
          cause_summary: { type: 'string', maxLength: 180 },
          strategy: { type: 'string', enum: DAILY_ADAPTATION_STRATEGIES },
          title: { type: 'string', maxLength: 120 },
          next_action: { type: 'string', maxLength: 240 },
          rationale: { type: 'string', maxLength: 240 },
          minimum_action: { type: 'string', maxLength: 160 },
        },
      },
    }],
    tool_choice: { type: 'function', name: 'submit_daily_adaptation' },
    max_output_tokens: 700,
  })
  const call = response.output?.find(item => item.type === 'function_call' && item.name === 'submit_daily_adaptation')
  if (!call?.arguments) throw new Error('daily_adaptation_no_decision')
  const raw = JSON.parse(call.arguments) as Record<string, unknown>
  if (raw.should_propose !== true) return null
  const allowedSource = input.items.find(item => item.sourcePlanItemId === clean(raw.source_plan_item_id, 120))
  const target = input.targets.find(item => item.sourcePlanItemId === clean(raw.target_plan_item_id, 120))
  if (!allowedSource || !target || !input.logs.some(log => log.routineItemId === allowedSource.id && ['missed', 'minimum'].includes(log.status))) {
    throw new Error('daily_adaptation_invalid_target')
  }
  const recommendation: DailyAdaptationRecommendation = {
    acknowledgement: clean(raw.acknowledgement, 220),
    causeCategory: isCause(raw.cause_category) ? raw.cause_category : 'other',
    causeSummary: clean(raw.cause_summary, 180),
    strategy: isStrategy(raw.strategy) ? raw.strategy : 'keep',
    title: clean(raw.title, 120),
    nextAction: clean(raw.next_action, 240),
    rationale: clean(raw.rationale, 240),
    minimumAction: clean(raw.minimum_action, 160),
  }
  if (!recommendation.acknowledgement || !recommendation.causeSummary || !recommendation.title || !recommendation.nextAction || !recommendation.rationale) {
    throw new Error('daily_adaptation_invalid_copy')
  }
  if (allowedSource.planningStyle === 'progression' && recommendation.strategy !== 'recover_first') {
    recommendation.strategy = 'recover_first'
    recommendation.rationale = '앞 단계 결과 없이 다음 단계로 넘어가지 않도록 실행 순서를 보호합니다.'
  }
  return { sourcePlanItemId: allowedSource.sourcePlanItemId, target, recommendation }
}
