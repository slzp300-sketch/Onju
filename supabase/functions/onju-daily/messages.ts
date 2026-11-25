export type DailyLocale = 'ko-KR' | 'en-US'
export type DailyCheckInType = 'morning' | 'closing'
export type DailyItemStatus = 'completed' | 'missed' | 'exception'
export type DailyDependencyKind = 'wake' | 'sleep' | 'schedule' | 'energy'
export type DailyTrialRecommendation = 'pending' | 'extend' | 'keep' | 'modify' | 'stop'

export type DailyStructureOptionCopy = {
  id: string
  title: string
  description: string
  tradeoff: string
  strategy: string
}

export function resolveDailyLocale(locale: string | undefined): DailyLocale {
  return locale?.toLowerCase().startsWith('ko') ? 'ko-KR' : 'en-US'
}

const ko = (locale: string | undefined) => resolveDailyLocale(locale) === 'ko-KR'

export function weekdayLabels(locale: string | undefined) {
  return ko(locale)
    ? ['월', '화', '수', '목', '금', '토', '일']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
}

export function checkInQuestion(
  locale: string | undefined,
  type: DailyCheckInType,
  step: number,
  itemTitle = '',
) {
  const title = itemTitle.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (ko(locale)) {
    const plan = title ? `“${title}”` : '오늘 계획'
    if (type === 'morning') {
      if (step === 0) return { question: '오늘 몸과 마음의 상태는 어떤가요? 숫자 대신 편한 말로 답해도 괜찮아요.', choices: ['좋아요', '보통이에요', '지쳐 있어요'] }
      if (step === 1) return { question: `오늘 계획은 ${plan}예요. 이대로 시작할 수 있을까요?`, choices: ['이대로 할게요', '작게 줄일게요', '오늘은 예외예요'] }
      return { question: '오늘 실행을 막을 수 있는 일정이나 변수가 있나요? 없다면 없다고 말해 주세요.', choices: [] }
    }
    if (step === 0) return { question: `${plan}은 어떻게 됐나요?`, choices: ['완료했어요', '하지 못했어요', '예외였어요'] }
    if (step === 1) return { question: '오늘 하루의 에너지는 어느 정도였나요? 편한 말이나 1~5로 알려주세요.', choices: ['좋았어요', '보통이었어요', '많이 지쳤어요'] }
    return { question: '계획과 달라진 이유나 내일 바꾸고 싶은 점이 있나요? 없다면 없다고 말해 주세요.', choices: [] }
  }

  const plan = title ? `“${title}”` : "today's plan"
  if (type === 'morning') {
    if (step === 0) return { question: 'How are your body and mind feeling today? You can answer in your own words instead of using a number.', choices: ['Feeling good', 'About average', 'Feeling drained'] }
    if (step === 1) return { question: `The plan for today is ${plan}. Does this still feel doable?`, choices: ["I'll keep it as is", "Let's make it smaller", "Today is an exception"] }
    return { question: 'Is there a schedule change or anything else that could get in the way today? If not, just say none.', choices: [] }
  }
  if (step === 0) return { question: `How did ${plan} go?`, choices: ['Completed', "Didn't complete", 'It was an exception'] }
  if (step === 1) return { question: 'How was your energy today? You can answer in your own words or from 1 to 5.', choices: ['Good', 'About average', 'Very drained'] }
  return { question: 'What got in the way, or what would you like to change tomorrow? If nothing, just say none.', choices: [] }
}

export function completionMessage(locale: string | undefined, type: DailyCheckInType, itemStatus: DailyItemStatus | null) {
  if (ko(locale)) {
    if (type === 'morning') return '아침 점검을 마쳤어요. 오늘 계획과 변수를 기억해 둘게요. 이제 가장 작은 시작부터 이어가면 됩니다.'
    if (itemStatus === 'missed') return '마감 점검을 마쳤어요. 오늘 못 한 일은 그대로 기록했고, 내일 몰아서 하도록 만들지 않을게요.'
    if (itemStatus === 'exception') return '마감 점검을 마쳤어요. 오늘은 미실행이 아니라 예외로 기록했어요.'
    return '마감 점검을 마쳤어요. 오늘 실행한 내용과 컨디션을 기록했어요.'
  }
  if (type === 'morning') return "Morning check-in complete. I'll keep today's plan and possible obstacles in mind. Start with the smallest workable step."
  if (itemStatus === 'missed') return "Closing check-in complete. I recorded what didn't happen without doubling tomorrow's workload."
  if (itemStatus === 'exception') return 'Closing check-in complete. I recorded today as an exception, not a missed attempt.'
  return 'Closing check-in complete. I recorded what you did and how your energy felt.'
}

export function missedStreakCopy(locale: string | undefined, title: string, strong: boolean, count: number) {
  return ko(locale)
    ? {
        title: `${title} · ${strong ? '강한 규칙 ' : ''}${count}회 연속 미실행`,
        detail: strong
          ? '강한 규칙은 오늘도 미실행으로 남기고 회수하지 않아요. 반복된 이유는 마감 점검에서 한 번 분명히 확인할게요.'
          : '의지 문제로 단정하지 않을게요. 시간 배치나 그 전에 필요한 조건이 무너졌는지 확인할 시점입니다.',
      }
    : {
        title: `${title} · ${strong ? 'key commitment missed ' : 'missed '}${count} times in a row`,
        detail: strong
          ? "I'll leave today's miss as recorded instead of trying to make it up. The closing check-in can help identify what keeps disrupting it."
          : "I won't treat this as a willpower problem. It's time to check whether the timing or a prerequisite is breaking down.",
      }
}

export function lowAdherenceCopy(locale: string | undefined, title: string, rate: number, outcomes: number, completed: number) {
  return ko(locale)
    ? {
        title: `${title} · 최근 이행률 ${rate}%`,
        detail: `${outcomes}번의 기록 중 ${completed}번 실행됐어요. 다음 주 계획을 바꾸기 전에 반복되는 방해 조건부터 확인해 볼게요.`,
      }
    : {
        title: `${title} · ${rate}% completion recently`,
        detail: `You completed ${completed} of ${outcomes} recorded attempts. Before changing next week's plan, let's identify the condition that keeps getting in the way.`,
      }
}

export function repeatedBlockerCopy(locale: string | undefined, text: string, count: number) {
  return ko(locale)
    ? {
        title: `같은 방해 요인이 ${count}번 반복됐어요`,
        detail: `“${text}”이 반복해서 기록됐습니다. 목표를 줄이기보다 이 조건을 피하거나 앞단계를 바꾸는 선택지를 먼저 만들게요.`,
      }
    : {
        title: `The same obstacle appeared ${count} times`,
        detail: `“${text}” has come up repeatedly. Before shrinking the goal, let's create an option that avoids this condition or changes the step before it.`,
      }
}

export function weeklyNoteCopy(
  locale: string | undefined,
  signalCount: number,
  hasAccountableRoutine: boolean,
  outcomeCount: number,
) {
  if (ko(locale)) {
    if (signalCount) return `최근 7일 기록에서 ${signalCount}개의 반복 신호를 찾았어요. 한 번의 실패가 아니라 누적된 기록만 근거로 삼았습니다.`
    if (!hasAccountableRoutine) return '관찰 항목은 빈도만 모으고 성공과 실패를 판단하지 않아요.'
    if (outcomeCount < 3) return `아직 판단하지 않아요. 실행 결과가 ${3 - outcomeCount}번 더 쌓이면 반복 여부를 확인할 수 있어요.`
    return '아직 구조를 바꿀 만큼 반복된 신호는 없어요. 지금 방식으로 기록을 이어가면 됩니다.'
  }
  if (signalCount) return `I found ${signalCount} recurring ${signalCount === 1 ? 'signal' : 'signals'} in the last 7 days. This is based on accumulated records, not a single miss.`
  if (!hasAccountableRoutine) return "Observation items track frequency only; they aren't judged as successes or failures."
  if (outcomeCount < 3) return `It's too early to judge. ${3 - outcomeCount} more recorded ${3 - outcomeCount === 1 ? 'outcome' : 'outcomes'} will show whether a pattern is forming.`
  return 'There is no repeated signal strong enough to change the structure yet. Keep recording with the current plan.'
}

const dependencyLabels: Record<DailyLocale, Record<DailyDependencyKind, string>> = {
  'ko-KR': {
    wake: '기상 직후 흐름',
    sleep: '수면과 저녁 마감',
    schedule: '일정과 시간 여유',
    energy: '체력과 집중력',
  },
  'en-US': {
    wake: 'the flow after waking',
    sleep: 'sleep and the evening wind-down',
    schedule: 'schedule and available margin',
    energy: 'energy and focus',
  },
}

export function dependencyLabel(locale: string | undefined, kind: DailyDependencyKind) {
  return dependencyLabels[resolveDailyLocale(locale)][kind]
}

export function structureDiagnosis(locale: string | undefined, title: string, label: string) {
  return ko(locale)
    ? `${title} 자체보다 먼저 흔들린 **${label}**을 확인할 필요가 있어요. 계획을 바로 바꾸지 않고 작은 구조 실험으로 검증할게요.`
    : `Before changing ${title} itself, we should examine **${label}**. Let's test one small structural change without replacing the plan yet.`
}

export function structureOptionCopies(locale: string | undefined, kind: DailyDependencyKind, title: string): DailyStructureOptionCopy[] {
  if (ko(locale)) {
    const minimum = {
      id: 'minimum-version',
      title: '최소 행동으로 낮추기',
      description: `${title}을 가장 작은 실행 단위로 시작해 흐름만 지켜요.`,
      tradeoff: '성취량은 줄지만 끊김 없이 실제 패턴을 확인할 수 있어요.',
      strategy: `${title}의 최소 행동만 14일간 실행`,
    }
    return {
      wake: [
        { id: 'first-stable-block', title: '첫 안정 시간대로 옮기기', description: '기상 직후가 아닌 준비를 마친 첫 빈 시간에 배치해요.', tradeoff: '아침의 상징성은 줄지만 늦잠의 영향을 덜 받아요.', strategy: `${title}을 준비 후 첫 안정 시간대에 실행` },
        { id: 'prepare-night-before', title: '전날 준비를 선행하기', description: '도구와 시작 지점을 전날 밤 눈에 보이게 준비해요.', tradeoff: '저녁에 2~5분이 들지만 아침 시작 마찰이 작아져요.', strategy: `${title} 준비물을 전날 밤 배치` },
        minimum,
      ],
      sleep: [
        { id: 'move-before-evening', title: '저녁보다 앞당기기', description: '피로가 누적되기 전 고정된 빈 시간으로 옮겨요.', tradeoff: '낮 일정 조정이 필요하지만 취침 지연의 영향을 피할 수 있어요.', strategy: `${title}을 저녁 이전 안정 시간대에 실행` },
        { id: 'closing-buffer', title: '저녁 마감 여유 만들기', description: '취침 전 일정 사이에 20분 완충 구간을 먼저 확보해요.', tradeoff: '다른 저녁 활동을 줄여야 하지만 루틴과 수면을 함께 보호해요.', strategy: `${title} 전 20분 마감 여유 확보` },
        minimum,
      ],
      schedule: [
        { id: 'anchor-to-fixed-event', title: '고정 일정에 붙이기', description: '출퇴근·식사처럼 이미 지키는 일정 직후에 연결해요.', tradeoff: '시간 선택은 줄지만 시작 시점을 기억하기 쉬워져요.', strategy: `${title}을 매일 지키는 고정 일정 직후 실행` },
        { id: 'reserve-buffer', title: '빈 시간보다 여유를 예약하기', description: '예상 소요시간에 15분을 더한 구간을 미리 비워요.', tradeoff: '달력 공간을 더 쓰지만 일정이 밀려도 실행 가능성이 높아요.', strategy: `${title}에 15분 완충 시간을 포함해 예약` },
        minimum,
      ],
      energy: [
        { id: 'move-to-energy-peak', title: '에너지 높은 시간으로 옮기기', description: '집중이 비교적 안정적인 시간대에 먼저 배치해요.', tradeoff: '다른 중요한 일과 자리를 조율해야 하지만 실행 품질이 높아져요.', strategy: `${title}을 에너지가 가장 높은 시간대에 실행` },
        { id: 'alternate-load', title: '강한 날과 가벼운 날 나누기', description: '매일 같은 양 대신 체력에 따라 두 가지 분량을 정해요.', tradeoff: '일별 성취량은 달라지지만 과부하로 중단될 가능성이 줄어요.', strategy: `${title}을 기본형과 회복형 두 단계로 운영` },
        minimum,
      ],
    }[kind]
  }

  const minimum = {
    id: 'minimum-version',
    title: 'Reduce it to the minimum version',
    description: `Start ${title} with the smallest meaningful action and protect the continuity.`,
    tradeoff: 'You will accomplish less per attempt, but you can observe the real pattern without breaking the chain.',
    strategy: `Do only the minimum version of ${title} for 14 days`,
  }
  return {
    wake: [
      { id: 'first-stable-block', title: 'Move it to the first stable block', description: 'Place it in the first open block after getting ready, instead of immediately after waking.', tradeoff: 'It feels less like a morning ritual, but late waking has less impact.', strategy: `Do ${title} in the first stable block after getting ready` },
      { id: 'prepare-night-before', title: 'Prepare the night before', description: 'Put the tools and starting point in view the night before.', tradeoff: 'It takes 2–5 minutes in the evening, but lowers the friction in the morning.', strategy: `Set up everything needed for ${title} the night before` },
      minimum,
    ],
    sleep: [
      { id: 'move-before-evening', title: 'Move it earlier', description: 'Place it in a stable block before fatigue builds up.', tradeoff: 'It may require adjusting daytime plans, but avoids delays caused by the evening wind-down.', strategy: `Do ${title} in a stable block before the evening` },
      { id: 'closing-buffer', title: 'Create an evening buffer', description: 'Reserve a 20-minute buffer before the final evening activities.', tradeoff: 'You may need to shorten another evening activity, but it protects both the routine and sleep.', strategy: `Reserve a 20-minute wind-down buffer before ${title}` },
      minimum,
    ],
    schedule: [
      { id: 'anchor-to-fixed-event', title: 'Anchor it to a fixed event', description: 'Attach it to something that already happens, such as commuting or a meal.', tradeoff: 'You have less choice of timing, but the starting cue becomes easier to remember.', strategy: `Do ${title} immediately after a fixed daily event` },
      { id: 'reserve-buffer', title: 'Reserve margin, not just free time', description: 'Block the expected duration plus an extra 15 minutes.', tradeoff: 'It uses more calendar space, but leaves room when earlier plans run late.', strategy: `Schedule ${title} with a 15-minute buffer` },
      minimum,
    ],
    energy: [
      { id: 'move-to-energy-peak', title: 'Move it to your energy peak', description: 'Place it where your focus is usually more stable.', tradeoff: 'It may compete with another important task, but the quality of the attempt should improve.', strategy: `Do ${title} during the most reliable high-energy block` },
      { id: 'alternate-load', title: 'Use full and recovery versions', description: 'Set two levels based on energy instead of forcing the same amount every day.', tradeoff: 'Daily output will vary, but overload is less likely to stop the routine.', strategy: `Run ${title} in full and recovery versions` },
      minimum,
    ],
  }[kind]
}

export function trialSummaryCopy(locale: string | undefined, input: {
  recommendation: DailyTrialRecommendation
  remainingDays: number
  outcomeCount: number
  completed: number
}) {
  const { recommendation, remainingDays, outcomeCount, completed } = input
  if (ko(locale)) {
    if (recommendation === 'pending') return `결정일까지 ${remainingDays}일 남았어요. 지금은 결과보다 기록을 모을 때예요.`
    if (recommendation === 'extend') return `판단에 필요한 실행 결과가 ${3 - outcomeCount}번 부족해요. 결론을 내리지 않고 7일만 더 관찰하는 편이 안전해요.`
    if (recommendation === 'keep') return `${outcomeCount}번의 실행 결과 중 ${completed}번 완료했어요. 현재 구조를 유지할 근거가 충분합니다.`
    if (recommendation === 'modify') return `${outcomeCount}번의 실행 결과 중 ${completed}번 완료했어요. 루틴은 유지하되 선행 구조를 바꿔 다시 시험하는 편이 좋아요.`
    if (outcomeCount < 3) return '한 차례 연장 후에도 기록이 충분히 생기지 않았어요. 현재 구조를 멈추고 일정 자체부터 다시 확인하는 편이 좋아요.'
    return `${outcomeCount}번의 실행 결과 중 ${completed}번 완료했어요. 현재 방식은 중단하고 다른 구조를 선택하는 편이 좋아요.`
  }
  if (recommendation === 'pending') return `${remainingDays} ${remainingDays === 1 ? 'day remains' : 'days remain'} before the decision point. For now, keep collecting records rather than judging the result.`
  if (recommendation === 'extend') return `${3 - outcomeCount} more recorded ${3 - outcomeCount === 1 ? 'outcome is' : 'outcomes are'} needed for a fair decision. Extend the observation by 7 days instead of deciding now.`
  if (recommendation === 'keep') return `You completed ${completed} of ${outcomeCount} recorded attempts. There is enough evidence to keep the current structure.`
  if (recommendation === 'modify') return `You completed ${completed} of ${outcomeCount} recorded attempts. Keep the routine, but test a different prerequisite structure.`
  if (outcomeCount < 3) return "There still isn't enough evidence after one extension. Stop this structure and review the schedule itself first."
  return `You completed ${completed} of ${outcomeCount} recorded attempts. Stop the current approach and choose a different structure.`
}

export function checkInAlreadyComplete(locale: string | undefined) {
  return ko(locale) ? '오늘 점검은 이미 마쳤어요.' : "Today's check-in is already complete."
}

export function answerRecorded(locale: string | undefined) {
  return ko(locale) ? '말씀하신 내용을 기록했어요.' : "I've recorded that."
}

export function strongRuleMissed(locale: string | undefined) {
  return ko(locale)
    ? '\n\n**강한 규칙 기록**\n오늘 미실행은 그대로 남겼어요. 내일 두 배로 메우는 방식은 사용하지 않습니다.'
    : "\n\n**Key commitment record**\nI left today's miss as recorded. I won't double tomorrow's workload to make up for it."
}

export function weeklySignalMessage(locale: string | undefined, title: string, detail: string) {
  const heading = ko(locale) ? '최근 7일 기록에서 확인된 신호' : 'Signal from the last 7 days'
  return `\n\n**${heading}**\n${title}\n\n${detail}`
}
