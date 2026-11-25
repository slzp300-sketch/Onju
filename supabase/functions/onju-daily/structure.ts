import { addCalendarDays, routineIdentity, type WeeklySignal } from './insights.ts'

export const DEPENDENCY_KINDS = ['wake', 'sleep', 'schedule', 'energy'] as const
export type DependencyKind = typeof DEPENDENCY_KINDS[number]
export type StructureRoutine = { key: string; title: string; start: string; dependencyKinds: DependencyKind[] }
export type ActiveRuleTrial = { routineKey: string; status: 'active' | 'completed' | 'cancelled' }
export type StructureOption = { id: string; title: string; description: string; tradeoff: string; strategy: string }
export type StructureProposal = { routineKey: string; routineTitle: string; signalType: 'missed_streak' | 'low_adherence'; dependencyKind: DependencyKind; dependencyLabel: string; evidence: string; diagnosis: string; trialUntil: string; options: StructureOption[] }

export function isDependencyKind(value: unknown): value is DependencyKind {
  return typeof value === 'string' && DEPENDENCY_KINDS.includes(value as DependencyKind)
}

const dependencyLabels: Record<DependencyKind, string> = { wake: '기상 직후 흐름', sleep: '수면과 저녁 마감', schedule: '일정과 시간 여유', energy: '체력과 집중력' }
const englishDependencyLabels: Record<DependencyKind, string> = { wake: 'the flow after waking', sleep: 'sleep and evening shutdown', schedule: 'schedule and time margin', energy: 'energy and focus' }

function inferDependency(routine: StructureRoutine, blockers: string[]): DependencyKind {
  if (routine.dependencyKinds.length) return routine.dependencyKinds[0]
  const context = `${routine.title} ${blockers.join(' ')}`.toLocaleLowerCase('ko')
  if (/(잠|수면|취침|늦게 자|야근|밤|sleep|bedtime|late night|night shift)/u.test(context)) return 'sleep'
  if (/(기상|일어나|늦잠|알람|아침|wake|waking|overslept|alarm|morning)/u.test(context)) return 'wake'
  if (/(피곤|체력|집중|컨디션|에너지|아프|tired|fatigue|focus|energy|sick)/u.test(context)) return 'energy'
  if (/(회의|출근|퇴근|이동|약속|일정|시간|업무|meeting|commute|appointment|schedule|time|work)/u.test(context)) return 'schedule'
  if (routine.start && routine.start < '10:00') return 'wake'
  if (routine.start && routine.start >= '20:00') return 'sleep'
  return 'schedule'
}

export function structureOptionsFor(kind: DependencyKind, title: string, locale = 'ko-KR'): StructureOption[] {
  if (locale.toLocaleLowerCase().startsWith('en')) {
    const minimum = { id: 'minimum-version', title: 'Lower it to the minimum action', description: `Start ${title} with its smallest executable version and protect continuity.`, tradeoff: 'The amount achieved is smaller, but you can observe the real pattern without breaking the chain.', strategy: `Do only the minimum action for ${title} for 14 days` }
    const options: Record<DependencyKind, StructureOption[]> = {
      wake: [
        { id: 'first-stable-block', title: 'Move it to the first stable time block', description: 'Place it in the first open block after getting ready instead of immediately after waking.', tradeoff: 'It loses some morning symbolism, but oversleeping has less impact.', strategy: `Do ${title} in the first stable block after getting ready` },
        { id: 'prepare-night-before', title: 'Prepare the night before', description: 'Put the tools and starting point in sight the night before.', tradeoff: 'It takes two to five minutes in the evening, but morning friction becomes smaller.', strategy: `Set out everything needed for ${title} the night before` }, minimum,
      ],
      sleep: [
        { id: 'move-before-evening', title: 'Move it earlier than the evening', description: 'Place it in a stable open block before fatigue accumulates.', tradeoff: 'Daytime plans may need adjustment, but bedtime delays have less impact.', strategy: `Do ${title} in a stable block before the evening` },
        { id: 'closing-buffer', title: 'Create an evening shutdown buffer', description: 'Protect a 20-minute buffer between the routine and bedtime.', tradeoff: 'Another evening activity may need to shrink, but both the routine and sleep are protected.', strategy: `Reserve a 20-minute shutdown buffer before ${title}` }, minimum,
      ],
      schedule: [
        { id: 'anchor-to-fixed-event', title: 'Attach it to a fixed event', description: 'Link it immediately after a reliable event such as commuting or a meal.', tradeoff: 'There is less freedom to choose the time, but the starting cue becomes easier to remember.', strategy: `Do ${title} immediately after a reliable fixed event` },
        { id: 'reserve-buffer', title: 'Reserve margin, not just empty time', description: 'Block the expected duration plus 15 minutes in advance.', tradeoff: 'It uses more calendar space, but remains executable when the day runs late.', strategy: `Reserve ${title} with an extra 15-minute buffer` }, minimum,
      ],
      energy: [
        { id: 'move-to-energy-peak', title: 'Move it to your energy peak', description: 'Place it when focus tends to be most stable.', tradeoff: 'It may compete with another important task, but execution quality improves.', strategy: `Do ${title} during the highest-energy time block` },
        { id: 'alternate-load', title: 'Separate full and recovery days', description: 'Use two workload levels based on energy instead of requiring the same amount every day.', tradeoff: 'Daily output varies, but overload is less likely to end the routine.', strategy: `Run ${title} in standard and recovery versions` }, minimum,
      ],
    }
    return options[kind]
  }
  const minimum = { id: 'minimum-version', title: '최소 행동으로 낮추기', description: `${title}을 가장 작은 실행 단위로 시작해 흐름만 지켜요.`, tradeoff: '성취량은 줄지만 끊김 없이 실제 패턴을 확인할 수 있어요.', strategy: `${title}의 최소 행동만 14일간 실행` }
  const options: Record<DependencyKind, StructureOption[]> = {
    wake: [
      { id: 'first-stable-block', title: '첫 안정 시간대로 옮기기', description: '기상 직후가 아닌 준비를 마친 첫 빈 시간에 배치해요.', tradeoff: '아침의 상징성은 줄지만 늦잠의 영향을 덜 받아요.', strategy: `${title}을 준비 후 첫 안정 시간대에 실행` },
      { id: 'prepare-night-before', title: '전날 준비를 선행하기', description: '도구와 시작 지점을 전날 밤 눈에 보이게 준비해요.', tradeoff: '저녁에 2~5분이 들지만 아침 시작 마찰이 작아져요.', strategy: `${title} 준비물을 전날 밤 배치` }, minimum,
    ],
    sleep: [
      { id: 'move-before-evening', title: '저녁보다 앞당기기', description: '피로가 누적되기 전 고정된 빈 시간으로 옮겨요.', tradeoff: '낮 일정 조정이 필요하지만 취침 지연의 영향을 피할 수 있어요.', strategy: `${title}을 저녁 이전 안정 시간대에 실행` },
      { id: 'closing-buffer', title: '저녁 마감 여유 만들기', description: '취침 전 일정 사이에 20분 완충 구간을 먼저 확보해요.', tradeoff: '다른 저녁 활동을 줄여야 하지만 루틴과 수면을 함께 보호해요.', strategy: `${title} 전 20분 마감 여유 확보` }, minimum,
    ],
    schedule: [
      { id: 'anchor-to-fixed-event', title: '고정 일정에 붙이기', description: '출퇴근·식사처럼 이미 지키는 일정 직후에 연결해요.', tradeoff: '시간 선택은 줄지만 시작 시점을 기억하기 쉬워져요.', strategy: `${title}을 매일 지키는 고정 일정 직후 실행` },
      { id: 'reserve-buffer', title: '빈 시간보다 여유를 예약하기', description: '예상 소요시간에 15분을 더한 구간을 미리 비워요.', tradeoff: '달력 공간을 더 쓰지만 일정이 밀려도 실행 가능성이 높아요.', strategy: `${title}에 15분 완충 시간을 포함해 예약` }, minimum,
    ],
    energy: [
      { id: 'move-to-energy-peak', title: '에너지 높은 시간으로 옮기기', description: '집중이 비교적 안정적인 시간대에 먼저 배치해요.', tradeoff: '다른 중요한 일과 자리를 조율해야 하지만 실행 품질이 높아져요.', strategy: `${title}을 에너지가 가장 높은 시간대에 실행` },
      { id: 'alternate-load', title: '강한 날과 가벼운 날 나누기', description: '매일 같은 양 대신 체력에 따라 두 가지 분량을 정해요.', tradeoff: '일별 성취량은 달라지지만 과부하로 중단될 가능성이 줄어요.', strategy: `${title}을 기본형과 회복형 두 단계로 운영` }, minimum,
    ],
  }
  return options[kind]
}

export function buildStructureProposal(today: string, signals: WeeklySignal[], routines: StructureRoutine[], blockers: string[], activeTrials: ActiveRuleTrial[], locale = 'ko-KR'): StructureProposal | null {
  const signal = signals.find(item => item.routineTitle && item.type !== 'repeated_blocker')
  if (!signal?.routineTitle || signal.type === 'repeated_blocker') return null
  const signalKey = routineIdentity(signal.routineTitle)
  const routine = routines.find(item => item.key === signalKey || routineIdentity(item.title) === signalKey)
  if (!routine || activeTrials.some(trial => trial.status === 'active' && trial.routineKey === routine.key)) return null
  const dependencyKind = inferDependency(routine, blockers)
  const english = locale.toLocaleLowerCase().startsWith('en')
  const labels = english ? englishDependencyLabels : dependencyLabels
  return { routineKey: routine.key, routineTitle: routine.title, signalType: signal.type, dependencyKind, dependencyLabel: labels[dependencyKind], evidence: signal.title, diagnosis: english ? `Before changing ${routine.title}, we need to examine **${labels[dependencyKind]}**, which appears to break first. We’ll test it with a small structural experiment instead of changing the plan immediately.` : `${routine.title} 자체보다 먼저 흔들린 **${labels[dependencyKind]}**을 확인할 필요가 있어요. 계획을 바로 바꾸지 않고 작은 구조 실험으로 검증할게요.`, trialUntil: addCalendarDays(today, 14), options: structureOptionsFor(dependencyKind, routine.title, locale) }
}

export function findStructureOption(proposal: StructureProposal | null, optionId: unknown) {
  if (!proposal || typeof optionId !== 'string') return null
  return proposal.options.find(option => option.id === optionId) ?? null
}
