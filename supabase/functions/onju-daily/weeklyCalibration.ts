export type WeeklyCalibrationMetrics = {
  scheduled: number
  outcomeCount: number
  adherenceRate: number | null
  continuityRate: number | null
  coverageRate: number | null
  unrecorded: number
}

export type WeeklyCalibration = {
  ready: boolean
  verdict: 'waiting' | 'insufficient' | 'improved' | 'stable' | 'declined'
  baseline: WeeklyCalibrationMetrics
  outcome: WeeklyCalibrationMetrics
  adherenceDelta: number | null
  continuityDelta: number | null
  summary: string
  tuningNote: string
}

const daysBetween = (from: string, to: string) => {
  const start = new Date(`${from}T12:00:00.000Z`).getTime()
  const end = new Date(`${to}T12:00:00.000Z`).getTime()
  return Math.round((end - start) / 86_400_000)
}
const delta = (before: number | null, after: number | null) => before === null || after === null ? null : after - before

export function buildWeeklyCalibration(input: {
  today: string
  nextWeekEnd: string
  baseline: WeeklyCalibrationMetrics
  outcome: WeeklyCalibrationMetrics
}): WeeklyCalibration {
  const adherenceDelta = delta(input.baseline.adherenceRate, input.outcome.adherenceRate)
  const continuityDelta = delta(input.baseline.continuityRate, input.outcome.continuityRate)
  const periodFinished = input.today > input.nextWeekEnd || (input.today === input.nextWeekEnd && input.outcome.scheduled > 0 && input.outcome.unrecorded === 0)
  const common = { baseline: input.baseline, outcome: input.outcome, adherenceDelta, continuityDelta }
  if (!periodFinished) {
    const remaining = Math.max(0, daysBetween(input.today, input.nextWeekEnd))
    return {
      ...common,
      ready: false,
      verdict: 'waiting',
      summary: remaining ? `조정한 계획을 검증하기까지 ${remaining}일 남았어요.` : '이번 주 기록이 마무리되면 조정 효과를 확인할게요.',
      tuningNote: '지금은 중간 수치로 규칙을 바꾸지 않습니다.',
    }
  }
  if (input.outcome.outcomeCount < 3 || (input.outcome.coverageRate ?? 0) < 60) {
    return {
      ...common,
      ready: true,
      verdict: 'insufficient',
      summary: '다음 주 기록이 충분하지 않아 이번 조정의 효과를 단정하지 않았어요.',
      tuningNote: '같은 조정을 반복 추천하지 않고, 다음 회고에서 기록이 빠진 이유부터 확인합니다.',
    }
  }
  const bestDelta = Math.max(adherenceDelta ?? -100, continuityDelta ?? -100)
  const worstDelta = Math.min(adherenceDelta ?? 100, continuityDelta ?? 100)
  const verdict = bestDelta >= 10 && worstDelta >= -5 ? 'improved' : worstDelta <= -10 ? 'declined' : 'stable'
  return {
    ...common,
    ready: true,
    verdict,
    summary: verdict === 'improved'
      ? '조정 후 실행 흐름이 좋아졌어요. 이번 변화는 다음 계획에도 유지할 근거가 있습니다.'
      : verdict === 'declined'
        ? '조정 후 실행 흐름이 나빠졌어요. 같은 방식을 반복하지 않고 원인을 다시 확인해야 합니다.'
        : '조정 전후 차이가 크지 않았어요. 한 번 더 관찰하거나 다른 한 가지 조건만 바꾸는 편이 안전합니다.',
    tuningNote: verdict === 'improved'
      ? '다음 회고에서는 이 전략을 유효한 선택지로 우선 고려합니다.'
      : verdict === 'declined'
        ? '다음 회고에서는 같은 전략을 기본 추천에서 제외하고 사용자에게 재확인합니다.'
        : '다음에는 여러 요소를 동시에 바꾸지 않고 시간대나 최소 실행 중 하나만 시험합니다.',
  }
}
