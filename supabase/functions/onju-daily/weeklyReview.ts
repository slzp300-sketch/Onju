import type { DailyAdaptationMetrics } from './dailyAdaptationMetrics.ts'
import { withOnjuOperatingPolicy } from '../_shared/onjuOperatingPolicy.ts'

export type WeeklyReviewStrategy = 'keep' | 'reduce_frequency' | 'reschedule' | 'lower_minimum'
export type WeeklyReviewCause = 'time_conflict' | 'difficulty' | 'energy' | 'unexpected' | 'priority_change' | 'no_issue' | 'other'

export type WeeklyReviewRecommendation = {
  causeCategory: WeeklyReviewCause
  causeSummary: string
  strategy: WeeklyReviewStrategy
  routineKey: string
  rationale: string
  minimumAction: string
  fromDayIndex: number
  toDayIndex: number
  preferredTime: string
}

export type WeeklyReviewDecision = {
  status: 'active' | 'ready'
  assistantMessage: string
  choices: string[]
  recommendation: WeeklyReviewRecommendation
}

export const weeklyReviewInstructions = withOnjuOperatingPolicy('weekly_review', `당신은 온주라는 한국어 AI 일정 비서다. 사용자의 주간 실행 기록과 실제 사정을 함께 해석한다.

고정 설문처럼 모든 단계를 밟지 말고, 현재 답변만으로 조정 방향을 정할 수 있으면 바로 ready를 선택한다. 정보가 모호해서 계획이 달라질 때만 질문 하나를 더 한다. 사용자의 표현을 먼저 구체적으로 짚고, 실패를 의지나 성격 문제로 단정하지 않는다.

다음 주 전략은 현재 유지, 주간 횟수 1회 감축, 실행 요일·시간 이동, 최소 실행 축소 중 하나만 선택한다. 실행량을 자동으로 늘리지 않는다. routine_key는 제공된 값 중 하나만 그대로 사용한다. 요일은 월요일 0부터 일요일 6이다. 이동 날짜가 불명확하면 -1, 시간이 불명확하면 빈 문자열을 사용한다. 최소 실행 축소를 제안한다면 실제로 바로 할 수 있는 짧고 구체적인 행동을 적는다. 저장하거나 확정했다고 말하지 않는다. weekly_evidence.isFirstPlanWeek=true이면 이번 기록을 최초 기준점으로 보고, 사용자의 실제 사정을 한 번 확인한 즉시 다음 주 보정안을 ready로 제안한다. 사용자가 원인을 명확히 답했는데 첫 주 질문을 반복하지 않는다.

하루 조정 효과는 adaptationMetrics를 기준으로 해석한다. decided 또는 applied가 3건 미만이면 효과를 단정하지 않는다. 사용자가 수정하거나 거절한 이유를 무시하지 말고, continuationRate가 40% 미만인 조정 방식은 같은 조건으로 반복하지 않는다. 조정 효과가 낮거나 혼합되어 있다면 숫자만으로 자동 변경하지 말고 실제 사정과 어떤 제안이 맞지 않았는지 한 번에 하나만 확인한다.

답변은 한국어로 짧고 자연스럽게 작성한다. acknowledgement에는 사용자의 말을 다시 길게 복사하지 말고 핵심 사정과 계획에 미치는 영향을 짚는다. follow_up일 때 question은 하나만 쓰고 선택지는 필요할 때만 최대 3개 제공한다.`)

type WeeklyRoutine = {
  routineKey: string
  title: string
  scheduled: number
  outcomeCount: number
  adherenceRate: number | null
  continuityRate: number | null
}

export type WeeklyReviewInsights = {
  startDate: string
  endDate: string
  scheduled: number
  completed: number
  minimum: number
  missed: number
  exception: number
  unrecorded: number
  outcomeCount: number
  adherenceRate: number | null
  continuityRate: number | null
  coverageRate: number | null
  isFirstPlanWeek?: boolean
  routines: WeeklyRoutine[]
  signals: Array<{ type: string; title: string; detail: string; routineTitle: string | null }>
  adaptations?: Array<{
    id: string
    sourceDate: string
    targetDate: string
    status: string
    strategy: string
    causeSummary: string
    nextAction: string
    targetStatus: string | null
    decisionMode?: string
    decisionReason?: string
    proposedAction?: string
  }>
  adaptationSummary?: { proposed: number; applied: number; dismissed: number; continued: number }
  adaptationMetrics?: DailyAdaptationMetrics
}

type ProviderResponse = {
  output?: Array<{ type?: string; name?: string; arguments?: string }>
}

type ReviewMessage = { role: 'assistant' | 'user'; text: string }
type ReviewContext = {
  weekly: WeeklyReviewInsights
  plan: unknown[]
  goalCard: unknown
  dayBounds: unknown[]
  blocks: unknown[]
  previousCalibration?: unknown
}

const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').slice(0, max)
  : ''
const validStrategy = (value: unknown): value is WeeklyReviewStrategy => ['keep', 'reduce_frequency', 'reschedule', 'lower_minimum'].includes(String(value))
const validCause = (value: unknown): value is WeeklyReviewCause => ['time_conflict', 'difficulty', 'energy', 'unexpected', 'priority_change', 'no_issue', 'other'].includes(String(value))
const validDay = (value: unknown) => Number.isInteger(value) && Number(value) >= -1 && Number(value) <= 6 ? Number(value) : -1
const validClock = (value: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? '')) ? String(value) : ''

export function weeklyReviewEvidenceSignature(weekly: WeeklyReviewInsights) {
  const routines = [...(weekly.routines ?? [])]
    .sort((a, b) => a.routineKey.localeCompare(b.routineKey, 'ko'))
    .map(routine => [routine.routineKey, routine.scheduled, routine.outcomeCount, routine.adherenceRate ?? '-', routine.continuityRate ?? '-'].join(':'))
    .join('|')
  const adaptations = [...(weekly.adaptations ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [item.id, item.status, item.decisionMode ?? '-', item.decisionReason ?? '-', item.strategy, item.targetStatus ?? '-'].join(':'))
    .join('|')
  const metrics = weekly.adaptationMetrics
    ? [weekly.adaptationMetrics.decided, weekly.adaptationMetrics.applied, weekly.adaptationMetrics.modified, weekly.adaptationMetrics.continued, weekly.adaptationMetrics.recovered, weekly.adaptationMetrics.verdict].join(':')
    : ''
  return [weekly.startDate, weekly.endDate, weekly.scheduled, weekly.completed, weekly.minimum, weekly.missed, weekly.exception, weekly.unrecorded, routines, adaptations, metrics].join('::').slice(0, 2000)
}

function weakestRoutine(weekly: WeeklyReviewInsights) {
  return [...(weekly.routines ?? [])]
    .filter(routine => routine.outcomeCount > 0)
    .sort((a, b) => (a.continuityRate ?? 101) - (b.continuityRate ?? 101) || b.outcomeCount - a.outcomeCount)[0]
    ?? weekly.routines?.[0]
}

export function firstWeekCalibrationGuide(weekly: WeeklyReviewInsights) {
  if (!weekly.isFirstPlanWeek) return null
  const continuity = weekly.continuityRate ?? 0
  const direction: WeeklyReviewStrategy = continuity < 50 ? 'reduce_frequency' : 'keep'
  return {
    direction,
    message: continuity < 50
      ? '첫 주 실제 기록상 계획 강도를 낮출 가능성이 커요. 원인을 확인한 뒤 다음 주 횟수나 시간 중 한 가지만 줄여 제안할게요.'
      : '첫 주 실제 기록을 기준점으로 삼아 현재 강도를 유지할지, 한 가지 조건만 조정할지 제안할게요.',
  }
}

export function weeklyReviewOpening(weekly: WeeklyReviewInsights) {
  const weakest = weakestRoutine(weekly)
  const metric = weekly.adherenceRate === null
    ? '완전 실행률은 아직 계산 전이에요.'
    : `완전 실행률은 **${weekly.adherenceRate}%**, 최소 실행을 포함한 연속성은 **${weekly.continuityRate ?? 0}%**였어요.`
  const signal = weekly.signals?.[0]
  const focus = signal
    ? `\n\n**기록에서 눈에 띈 부분**\n${signal.title}\n\n${signal.detail}`
    : weakest
      ? `\n\n**먼저 살펴볼 루틴**\n${weakest.title}은 ${weakest.outcomeCount}번 기록에서 연속성 ${weakest.continuityRate ?? 0}%였어요.`
      : ''
  const adaptation = weekly.adaptationMetrics?.totalProposed
    ? `\n\n**이번 주 하루 조정 효과**\n${weekly.adaptationMetrics.summary}${weekly.adaptationMetrics.recoveryApplied ? ` 회복 조정 ${weekly.adaptationMetrics.recoveryApplied}번 중 완전 실행은 ${weekly.adaptationMetrics.recovered}번이었어요.` : ''}`
    : weekly.adaptationSummary?.applied
      ? `\n\n**이번 주에 시험한 하루 조정**\n${weekly.adaptationSummary.applied}번 적용했고, 그중 ${weekly.adaptationSummary.continued}번은 다음 실행을 완료하거나 최소 행동으로 이어갔어요.`
      : ''
  const firstWeek = firstWeekCalibrationGuide(weekly)
  const calibration = firstWeek ? `\n\n**첫 주 기준점**\n${firstWeek.message}` : ''
  return {
    message: `이번 주 기록을 먼저 숫자로 정리했어요. ${metric}${focus}${adaptation}${calibration}\n\n**숫자만으로는 알 수 없는 실제 사정이 있었나요? 가장 크게 영향을 준 한 가지부터 말씀해 주세요.**`,
    choices: signal?.type === 'repeated_blocker'
      ? ['시간이 겹쳤어요', '체력·집중력이 부족했어요', '예상 밖 일정이 있었어요']
      : ['시간이 부족했어요', '시작하기가 너무 어려웠어요', '큰 방해는 없었어요'],
  }
}

function normalizeRecommendation(raw: Record<string, unknown>, weekly: WeeklyReviewInsights): WeeklyReviewRecommendation {
  const weakest = weakestRoutine(weekly)
  const requestedKey = clean(raw.routine_key, 180)
  const routineKey = weekly.routines?.some(routine => routine.routineKey === requestedKey)
    ? requestedKey
    : weakest?.routineKey ?? ''
  return {
    causeCategory: validCause(raw.cause_category) ? raw.cause_category : 'other',
    causeSummary: clean(raw.cause_summary, 180) || '사용자가 설명한 이번 주의 실제 사정',
    strategy: validStrategy(raw.strategy) ? raw.strategy : 'keep',
    routineKey,
    rationale: clean(raw.rationale, 240) || '이번 주 기록과 사용자의 설명을 함께 반영한 제안입니다.',
    minimumAction: clean(raw.minimum_action, 120),
    fromDayIndex: validDay(raw.from_day_index),
    toDayIndex: validDay(raw.to_day_index),
    preferredTime: validClock(raw.preferred_time),
  }
}

const strategyLabel = (strategy: WeeklyReviewStrategy) => strategy === 'reduce_frequency'
  ? '횟수를 한 단계 줄여 흐름부터 회복하기'
  : strategy === 'reschedule'
    ? '실행이 막히는 요일이나 시간대 옮기기'
    : strategy === 'lower_minimum'
      ? '바쁜 날의 최소 실행을 더 작게 만들기'
      : '현재 계획을 유지하며 한 주 더 관찰하기'

export async function runWeeklyReviewTurn(input: {
  answer: string
  messages: ReviewMessage[]
  context: ReviewContext
  model: string
  request: (body: Record<string, unknown>) => Promise<ProviderResponse>
}): Promise<WeeklyReviewDecision> {
  const response = await input.request({
    model: input.model,
    store: false,
    instructions: weeklyReviewInstructions,
    input: JSON.stringify({
      weekly_evidence: input.context.weekly,
      current_plan: input.context.plan,
      confirmed_goal: input.context.goalCard,
      day_bounds: input.context.dayBounds,
      fixed_schedule: input.context.blocks,
      previous_adjustment_result: input.context.previousCalibration ?? null,
      daily_adjustments: input.context.weekly.adaptations ?? [],
      daily_adjustment_metrics: input.context.weekly.adaptationMetrics ?? null,
      recent_review_dialogue: input.messages.slice(-8),
      latest_user_answer: clean(input.answer, 800),
    }),
    tools: [{
      type: 'function',
      name: 'submit_weekly_review',
      description: '이번 주의 실제 원인과 다음 주의 한 가지 조정 방향을 제출한다.',
      strict: true,
      parameters: {
        type: 'object', additionalProperties: false,
        required: ['status', 'acknowledgement', 'cause_category', 'cause_summary', 'strategy', 'routine_key', 'rationale', 'question', 'choices', 'minimum_action', 'from_day_index', 'to_day_index', 'preferred_time'],
        properties: {
          status: { type: 'string', enum: ['follow_up', 'ready'] },
          acknowledgement: { type: 'string', maxLength: 300 },
          cause_category: { type: 'string', enum: ['time_conflict', 'difficulty', 'energy', 'unexpected', 'priority_change', 'no_issue', 'other'] },
          cause_summary: { type: 'string', maxLength: 180 },
          strategy: { type: 'string', enum: ['keep', 'reduce_frequency', 'reschedule', 'lower_minimum'] },
          routine_key: { type: 'string', maxLength: 180 },
          rationale: { type: 'string', maxLength: 240 },
          question: { type: 'string', maxLength: 180 },
          choices: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 60 } },
          minimum_action: { type: 'string', maxLength: 120 },
          from_day_index: { type: 'integer', minimum: -1, maximum: 6 },
          to_day_index: { type: 'integer', minimum: -1, maximum: 6 },
          preferred_time: { type: 'string', maxLength: 5 },
        },
      },
    }],
    tool_choice: { type: 'function', name: 'submit_weekly_review' },
    max_output_tokens: 900,
  })
  const call = response.output?.find(item => item.type === 'function_call' && item.name === 'submit_weekly_review')
  if (!call?.arguments) throw new Error('weekly_review_no_decision')
  const raw = JSON.parse(call.arguments) as Record<string, unknown>
  const recommendation = normalizeRecommendation(raw, input.context.weekly)
  const acknowledgement = clean(raw.acknowledgement, 300) || '말씀하신 사정을 이번 주 기록과 함께 봤어요.'
  const previous = input.context.previousCalibration && typeof input.context.previousCalibration === 'object'
    ? input.context.previousCalibration as Record<string, unknown>
    : null
  const repeatsDeclinedStrategy = previous?.verdict === 'declined'
    && previous.strategy === recommendation.strategy
    && recommendation.strategy !== 'keep'
    && !/(그래도|다시|한\s*주\s*더|같은\s*방식)/.test(input.answer)
  if (repeatsDeclinedStrategy) {
    return {
      status: 'active',
      assistantMessage: `${acknowledgement}\n\n**지난번에는 같은 조정 뒤 실행 흐름이 나빠졌어요.**\n그 방식을 그대로 반복하지 않고 다른 한 가지를 바꿔보는 게 좋겠습니다. 다른 방식을 볼까요, 현재 계획을 유지할까요?`,
      choices: ['다른 방식 검토', '현재 계획 유지', '그래도 한 주 더'],
      recommendation,
    }
  }
  const ready = raw.status === 'ready'
  const question = clean(raw.question, 180)
  const choices = Array.isArray(raw.choices) ? [...new Set(raw.choices.map(item => clean(item, 60)).filter(Boolean))].slice(0, 3) : []
  if (!ready) {
    const followUp = question || '다음 주 계획을 바꾼다면 가장 먼저 덜어내거나 옮기고 싶은 부분은 무엇인가요?'
    return {
      status: 'active',
      assistantMessage: `${acknowledgement}\n\n**한 가지만 더 확인할게요.**\n${followUp}`,
      choices,
      recommendation,
    }
  }
  return {
    status: 'ready',
    assistantMessage: `${acknowledgement}\n\n**온주의 다음 주 제안**\n${strategyLabel(recommendation.strategy)}\n\n${recommendation.rationale}\n\n아래 조정안을 확인해 주세요. 승인하기 전에는 현재 계획을 바꾸지 않습니다.`,
    choices: [],
    recommendation,
  }
}
