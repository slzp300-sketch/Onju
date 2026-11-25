export type DailyAdaptationDecisionMode = 'pending' | 'accepted' | 'modified' | 'dismissed'

export type DailyAdaptationMeasurement = {
  id: string
  sourceDate: string
  targetDate: string
  routineKey: string
  status: 'proposed' | 'applied' | 'dismissed'
  decisionMode: DailyAdaptationDecisionMode
  decisionReason: string
  strategy: string
  targetStatus: 'completed' | 'minimum' | 'missed' | 'exception' | null
}

export type DailyAdaptationMetrics = {
  periodStart: string
  periodEnd: string
  totalProposed: number
  pending: number
  decided: number
  applied: number
  modified: number
  dismissed: number
  evaluated: number
  awaitingOutcome: number
  continued: number
  completed: number
  acceptanceRate: number | null
  continuationRate: number | null
  completionRate: number | null
  recoveryApplied: number
  recovered: number
  recoveryRate: number | null
  averageRecoveryAttempts: number | null
  averageRecoveryDays: number | null
  sampleReady: boolean
  effectivenessReady: boolean
  verdict: 'collecting' | 'helping' | 'mixed' | 'needs_change'
  reasonBreakdown: Array<{ reason: string; label: string; count: number }>
  summary: string
}

const reasonLabels: Record<string, string> = {
  accepted: '제안이 현실적이었어요',
  needs_adjustment: '조금 바꿔야 맞았어요',
  already_planned: '이미 정한 방식이 있어요',
  not_realistic: '현실적으로 어려웠어요',
  wrong_cause: '원인 판단이 달랐어요',
  prefer_current: '기존 계획이 더 나았어요',
  other: '다른 이유',
}

const rate = (value: number, total: number) => total ? Math.round((value / total) * 100) : null

const average = (values: number[]) => values.length
  ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
  : null

const daysBetween = (from: string, to: string) => {
  const start = Date.parse(`${from}T12:00:00.000Z`)
  const end = Date.parse(`${to}T12:00:00.000Z`)
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? Math.round((end - start) / 86_400_000)
    : null
}

export function buildDailyAdaptationMetrics(
  rows: DailyAdaptationMeasurement[],
  periodStart: string,
  periodEnd: string,
): DailyAdaptationMetrics {
  const observations = rows
    .filter(row => row.sourceDate >= periodStart && row.sourceDate <= periodEnd)
    .sort((a, b) => a.sourceDate.localeCompare(b.sourceDate) || a.id.localeCompare(b.id))
  const appliedRows = observations.filter(row => row.status === 'applied')
  const evaluatedRows = appliedRows.filter(row => row.targetDate <= periodEnd)
  const dismissedRows = observations.filter(row => row.status === 'dismissed')
  const pending = observations.filter(row => row.status === 'proposed').length
  const modified = appliedRows.filter(row => row.decisionMode === 'modified').length
  const continuedRows = evaluatedRows.filter(row => row.targetStatus === 'completed' || row.targetStatus === 'minimum')
  const completed = evaluatedRows.filter(row => row.targetStatus === 'completed').length
  const recoveryRows = evaluatedRows.filter(row => row.strategy === 'recover_first')
  const recoveredRows = recoveryRows.filter(row => row.targetStatus === 'completed')
  const decided = appliedRows.length + dismissedRows.length
  const continuationRate = rate(continuedRows.length, evaluatedRows.length)
  const sampleReady = decided >= 3
  const effectivenessReady = evaluatedRows.length >= 3

  const recoveryAttempts: number[] = []
  const attemptsByRoutine = new Map<string, number>()
  for (const row of recoveryRows) {
    const attempts = (attemptsByRoutine.get(row.routineKey) ?? 0) + 1
    if (row.targetStatus === 'completed') {
      recoveryAttempts.push(attempts)
      attemptsByRoutine.set(row.routineKey, 0)
    } else {
      attemptsByRoutine.set(row.routineKey, attempts)
    }
  }
  const recoveryDays = recoveredRows.flatMap(row => {
    const days = daysBetween(row.sourceDate, row.targetDate)
    return days === null ? [] : [days]
  })

  const reasonCounts = new Map<string, number>()
  for (const row of observations) {
    const reason = row.decisionReason.trim()
    if (!reason || reason === 'accepted') continue
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
  }
  const reasonBreakdown = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, label: reasonLabels[reason] ?? reasonLabels.other, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'))

  const verdict = !effectivenessReady
    ? 'collecting' as const
    : (continuationRate ?? 0) >= 70
      ? 'helping' as const
      : (continuationRate ?? 0) >= 40
        ? 'mixed' as const
        : 'needs_change' as const
  const summary = !sampleReady
    ? `선택 기록 ${decided}/3 · 아직 효과를 단정하지 않고 더 관찰해요.`
    : !effectivenessReady
      ? `제안 선택은 ${decided}번 확인했지만, 확인 가능한 적용 결과가 ${evaluatedRows.length}/3이라 판단을 보류해요.`
      : verdict === 'helping'
        ? `결과를 확인한 ${evaluatedRows.length}번 중 ${continuedRows.length}번이 다음 실행으로 이어졌어요.`
        : verdict === 'mixed'
          ? `결과를 확인한 ${evaluatedRows.length}번 중 ${continuedRows.length}번이 이어졌어요. 어떤 조건에서 달랐는지 회고에서 확인해요.`
          : `결과를 확인한 ${evaluatedRows.length}번 중 ${continuedRows.length}번만 이어졌어요. 다음 주에는 같은 방식을 반복하지 않아요.`

  return {
    periodStart,
    periodEnd,
    totalProposed: observations.length,
    pending,
    decided,
    applied: appliedRows.length,
    modified,
    dismissed: dismissedRows.length,
    evaluated: evaluatedRows.length,
    awaitingOutcome: appliedRows.length - evaluatedRows.length,
    continued: continuedRows.length,
    completed,
    acceptanceRate: rate(appliedRows.length, decided),
    continuationRate,
    completionRate: rate(completed, evaluatedRows.length),
    recoveryApplied: recoveryRows.length,
    recovered: recoveredRows.length,
    recoveryRate: rate(recoveredRows.length, recoveryRows.length),
    averageRecoveryAttempts: average(recoveryAttempts),
    averageRecoveryDays: average(recoveryDays),
    sampleReady,
    effectivenessReady,
    verdict,
    reasonBreakdown,
    summary,
  }
}
