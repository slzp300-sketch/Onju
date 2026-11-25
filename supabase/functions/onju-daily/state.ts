export const CHECK_TYPES = ['morning', 'closing'] as const
export type CheckInType = typeof CHECK_TYPES[number]
export type ItemStatus = 'completed' | 'minimum' | 'missed' | 'exception'

export type CheckInRoutine = {
  id: string
  title: string
  minimumAction?: string
  planningStyle?: 'repeat' | 'progression'
  completionEvidence?: string
  inputArtifact?: string
  adaptiveAction?: string
}

export type CheckInProgress = {
  checkType: CheckInType
  step: number
  status: 'active' | 'completed'
  collected: Record<string, unknown>
  pendingQuestion: string
  choices: string[]
}

const clean = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
const isEnglish = (locale = 'ko-KR') => locale.toLocaleLowerCase().startsWith('en')

function normalizeRoutines(value: CheckInRoutine[] | string = ''): CheckInRoutine[] {
  if (typeof value === 'string') return value ? [{ id: 'legacy-item', title: clean(value, 80) }] : []
  return value.slice(0, 28).flatMap(item => {
    const id = clean(item?.id, 120)
    const title = clean(item?.title, 80)
    return id && title ? [{
      id,
      title,
      minimumAction: clean(item.minimumAction, 160),
      planningStyle: item.planningStyle === 'progression' ? 'progression' : 'repeat',
      completionEvidence: clean(item.completionEvidence, 160),
      inputArtifact: clean(item.inputArtifact, 160),
      adaptiveAction: clean(item.adaptiveAction, 240),
    }] : []
  })
}

export function isCheckInType(value: unknown): value is CheckInType {
  return typeof value === 'string' && CHECK_TYPES.includes(value as CheckInType)
}

export function inferEnergy(answer: string): number | null {
  const numeric = answer.match(/(?:^|\D)([1-5])(?:점|\s*\/\s*5|\D|$)/)?.[1]
  if (numeric) return Number(numeric)
  if (/최상|아주\s*좋|활기|충전/.test(answer)) return 5
  if (/좋아|좋아요|괜찮|가벼워/.test(answer)) return 4
  if (/보통|그저|무난/.test(answer)) return 3
  if (/지쳐|피곤|무거워|별로/.test(answer)) return 2
  if (/최악|너무\s*힘|아파|바닥/.test(answer)) return 1
  const normalized = answer.toLocaleLowerCase('en')
  if (/not (?:feeling )?(?:good|great|fine)|drained|tired|fatigued|low energy/.test(normalized)) return 2
  if (/excellent|energized|fully charged|great/.test(normalized)) return 5
  if (/good|fine|pretty well|light/.test(normalized)) return 4
  if (/okay|ok|average|so-so|normal/.test(normalized)) return 3
  if (/drained|tired|fatigued|low energy|not great/.test(normalized)) return 2
  if (/awful|terrible|exhausted|very hard|sick/.test(normalized)) return 1
  return null
}

export function inferItemStatus(answer: string): ItemStatus | null {
  if (/예외|쉬는\s*날|계획에\s*없|미리\s*뺀/.test(answer)) return 'exception'
  if (/최소(?:만|로|\s*행동)?|작게만|조금만|축소해서|2분만|한\s*페이지만/.test(answer)) return 'minimum'
  if (/못\s*했|하지\s*못|실패|미완료|안\s*했|놓쳤/.test(answer)) return 'missed'
  if (/완료|했어|했어요|끝냈|지켰|마쳤|성공/.test(answer)) return 'completed'
  const normalized = answer.toLocaleLowerCase('en')
  if (/exception|planned rest|rest day|not scheduled/.test(normalized)) return 'exception'
  if (/minimum|smallest version|reduced version|just two minutes/.test(normalized)) return 'minimum'
  if (/did not|didn't|could not|couldn't|missed|failed|not complete/.test(normalized)) return 'missed'
  if (/completed|finished|done|did it|succeeded/.test(normalized)) return 'completed'
  return null
}

export function questionFor(type: CheckInType, step: number, routineInput: CheckInRoutine[] | string = '', locale = 'ko-KR') {
  const routines = normalizeRoutines(routineInput)
  const english = isEnglish(locale)
  if (type === 'morning') {
    if (english) {
      if (step === 0) return { question: 'How are your body and mind feeling today? You can answer naturally instead of using a number.', choices: ['Feeling good', 'About average', 'Feeling drained'] }
      if (step === 1) {
        const plan = routines.length ? routines.map(item => `• ${item.adaptiveAction || item.title}`).join('\n') : '• There are no routines scheduled for today.'
        return { question: `Let’s check today’s plan together.\n\n${plan}\n\nCan you start with this plan?`, choices: ['I’ll follow this plan', 'I’ll make it smaller', 'Today is an exception'] }
      }
      return { question: 'Is there any schedule change or other factor that could get in the way today? If not, just say none.', choices: [] }
    }
    if (step === 0) return { question: '오늘 몸과 마음의 상태는 어떤가요? 숫자 대신 편한 말로 답해도 괜찮아요.', choices: ['좋아요', '보통이에요', '지쳐 있어요'] }
    if (step === 1) {
      const plan = routines.length ? routines.map(item => `• ${item.adaptiveAction || item.title}`).join('\n') : '• 오늘 배치된 루틴은 없어요.'
      return { question: `오늘 계획을 함께 확인할게요.\n\n${plan}\n\n이대로 시작할 수 있을까요?`, choices: ['이대로 할게요', '작게 줄일게요', '오늘은 예외예요'] }
    }
    return { question: '오늘 실행을 막을 수 있는 일정이나 변수가 있나요? 없다면 없다고 말해 주세요.', choices: [] }
  }
  if (step < routines.length) {
    const routine = routines[step]
    if (english) {
      const choices = ['Completed it']
      if (routine.minimumAction) choices.push('Did the minimum')
      choices.push('Did not complete it', 'It was an exception')
      const input = routine.planningStyle === 'progression' && routine.inputArtifact ? `\nStarting material: ${routine.inputArtifact}` : ''
      const evidence = routine.planningStyle === 'progression' && routine.completionEvidence ? `\nIf completed, also share the result you left behind: ${routine.completionEvidence}` : ''
      const minimum = routine.minimumAction ? `\nMinimum action for a busy day: ${routine.minimumAction}` : ''
      return { question: `How did **${routine.title}** go?${input}${evidence}${minimum}`, choices }
    }
    const choices = ['완료했어요']
    if (routine.minimumAction) choices.push('최소만 했어요')
    choices.push('하지 못했어요', '예외였어요')
    const input = routine.planningStyle === 'progression' && routine.inputArtifact ? `\n시작 재료: ${routine.inputArtifact}` : ''
    const evidence = routine.planningStyle === 'progression' && routine.completionEvidence ? `\n완료라면 남긴 결과를 함께 말해 주세요: ${routine.completionEvidence}` : ''
    const minimum = routine.minimumAction ? `\n바쁜 날 최소 행동: ${routine.minimumAction}` : ''
    return { question: `**${routine.title}**은 어떻게 됐나요?${input}${evidence}${minimum}`, choices }
  }
  if (step === routines.length) return english
    ? { question: 'How was your energy today? Answer naturally or use a number from 1 to 5.', choices: ['Felt good', 'About average', 'Very drained'] }
    : { question: '오늘 하루의 에너지는 어느 정도였나요? 편한 말이나 1~5로 알려주세요.', choices: ['좋았어요', '보통이었어요', '많이 지쳤어요'] }
  return english
    ? { question: 'Why did today differ from the plan, or what would you like to change tomorrow? If nothing, just say none.', choices: [] }
    : { question: '계획과 달라진 이유나 내일 바꾸고 싶은 점이 있나요? 없다면 없다고 말해 주세요.', choices: [] }
}

function frozenRoutines(current: CheckInProgress, fallback: CheckInRoutine[] | string) {
  const ids = Array.isArray(current.collected.routineIds) ? current.collected.routineIds : []
  const titles = Array.isArray(current.collected.routineTitles) ? current.collected.routineTitles : []
  const minimums = Array.isArray(current.collected.routineMinimumActions) ? current.collected.routineMinimumActions : []
  const stored = ids.flatMap((id, index) => {
    const safeId = clean(id, 120)
    const title = clean(titles[index], 80)
    const styles = Array.isArray(current.collected.routinePlanningStyles) ? current.collected.routinePlanningStyles : []
    const completionEvidence = Array.isArray(current.collected.routineCompletionEvidence) ? current.collected.routineCompletionEvidence : []
    const inputArtifacts = Array.isArray(current.collected.routineInputArtifacts) ? current.collected.routineInputArtifacts : []
    const adaptiveActions = Array.isArray(current.collected.routineAdaptiveActions) ? current.collected.routineAdaptiveActions : []
    return safeId && title ? [{
      id: safeId,
      title,
      minimumAction: clean(minimums[index], 160),
      planningStyle: styles[index] === 'progression' ? 'progression' : 'repeat',
      completionEvidence: clean(completionEvidence[index], 160),
      inputArtifact: clean(inputArtifacts[index], 160),
      adaptiveAction: clean(adaptiveActions[index], 240),
    }] : []
  })
  return stored.length ? stored : normalizeRoutines(fallback)
}

export function startCheckIn(type: CheckInType, routineInput: CheckInRoutine[] | string = '', locale = 'ko-KR'): CheckInProgress {
  const routines = normalizeRoutines(routineInput)
  const next = questionFor(type, 0, routines, locale)
  return {
    checkType: type,
    step: 0,
    status: 'active',
    collected: Array.isArray(routineInput) ? {
      routineIds: routines.map(item => item.id),
      routineTitles: routines.map(item => item.title),
      routineMinimumActions: routines.map(item => item.minimumAction ?? ''),
      routinePlanningStyles: routines.map(item => item.planningStyle ?? 'repeat'),
      routineCompletionEvidence: routines.map(item => item.completionEvidence ?? ''),
      routineInputArtifacts: routines.map(item => item.inputArtifact ?? ''),
      routineAdaptiveActions: routines.map(item => item.adaptiveAction ?? ''),
      itemStatuses: {},
      itemEvidence: {},
    } : {},
    pendingQuestion: next.question,
    choices: next.choices,
  }
}

export function advanceCheckIn(current: CheckInProgress, answerValue: unknown, routineInput: CheckInRoutine[] | string = '', locale = 'ko-KR') {
  if (current.status !== 'active') throw new Error('checkin_already_completed')
  const answer = clean(answerValue)
  if (!answer) throw new Error('answer_required')
  const routines = frozenRoutines(current, routineInput)

  if (current.checkType === 'morning') {
    const keys = ['condition', 'plan', 'obstacle']
    if (current.step < 0 || current.step >= keys.length) throw new Error('invalid_checkin_step')
    const collected = { ...current.collected, [keys[current.step]]: answer }
    const nextStep = current.step + 1
    if (nextStep >= keys.length) {
      return { progress: { ...current, step: keys.length, status: 'completed' as const, collected, pendingQuestion: '', choices: [] }, energy: inferEnergy(clean(collected.condition)), itemStatus: null, itemUpdate: null }
    }
    const next = questionFor('morning', nextStep, routines, locale)
    return { progress: { ...current, step: nextStep, collected, pendingQuestion: next.question, choices: next.choices }, energy: inferEnergy(clean(collected.condition)), itemStatus: null, itemUpdate: null }
  }

  if (current.step < 0 || current.step > routines.length + 1) throw new Error('invalid_checkin_step')
  let collected = { ...current.collected }
  let itemUpdate: { routineId: string; status: ItemStatus; evidence: string } | null = null
  if (current.step < routines.length) {
    const routine = routines[current.step]
    const pendingEvidenceId = clean(current.collected.pendingEvidenceRoutineId, 120)
    const itemStatus = pendingEvidenceId === routine.id ? 'completed' : inferItemStatus(answer)
    if (!itemStatus) {
      const pending = questionFor('closing', current.step, routines, locale)
      const guidance = isEnglish(locale)
        ? 'Please choose completed, minimum, not completed, or exception.'
        : '완료·최소 실행·미실행·예외 중 하나로 알려주세요.'
      return { progress: { ...current, pendingQuestion: `${pending.question}\n\n${guidance}`, choices: pending.choices }, energy: null, itemStatus: null, itemUpdate: null }
    }
    if (itemStatus === 'completed' && routine.planningStyle === 'progression' && !pendingEvidenceId) {
      const compact = answer.toLocaleLowerCase(isEnglish(locale) ? 'en' : 'ko').replace(/[\s.,!?~。！？]/g, '')
      if (/^(?:완료|완료했어|완료했어요|했어|했어요|끝냈어|끝냈어요|마쳤어|마쳤어요|성공|completed|completedit|finished|done|didit|succeeded)$/.test(compact)) {
        return {
          progress: {
            ...current,
            collected: { ...current.collected, pendingEvidenceRoutineId: routine.id },
            pendingQuestion: isEnglish(locale)
              ? `I’ll record it as completed. **Please share the actual result in one line.**\n\nCompletion evidence: ${routine.completionEvidence || 'A result that can be checked at the next step'}`
              : `완료로 기록할게요. **실제로 남긴 결과를 한 줄만 알려주세요.**\n\n완료 기준: ${routine.completionEvidence || '다음 단계에서 확인할 수 있는 결과물'}`,
            choices: [],
          },
          energy: null,
          itemStatus: null,
          itemUpdate: null,
        }
      }
    }
    const statuses = current.collected.itemStatuses && typeof current.collected.itemStatuses === 'object' ? current.collected.itemStatuses as Record<string, ItemStatus> : {}
    const evidence = current.collected.itemEvidence && typeof current.collected.itemEvidence === 'object' ? current.collected.itemEvidence as Record<string, string> : {}
    const rest = { ...collected }
    delete rest.pendingEvidenceRoutineId
    collected = { ...rest, itemStatuses: { ...statuses, [routine.id]: itemStatus }, itemEvidence: { ...evidence, [routine.id]: answer } }
    itemUpdate = { routineId: routine.id, status: itemStatus, evidence: answer }
  } else if (current.step === routines.length) {
    collected = { ...collected, condition: answer }
  } else {
    collected = { ...collected, reflection: answer }
  }

  const nextStep = current.step + 1
  const totalSteps = routines.length + 2
  const statuses = Object.values(collected.itemStatuses && typeof collected.itemStatuses === 'object' ? collected.itemStatuses : {}) as ItemStatus[]
  if (nextStep >= totalSteps) {
    return { progress: { ...current, step: totalSteps, status: 'completed' as const, collected, pendingQuestion: '', choices: [] }, energy: inferEnergy(clean(collected.condition)), itemStatus: statuses.at(-1) ?? null, itemUpdate }
  }
  const next = questionFor('closing', nextStep, routines, locale)
  return { progress: { ...current, step: nextStep, collected, pendingQuestion: next.question, choices: next.choices }, energy: inferEnergy(clean(collected.condition)), itemStatus: statuses.at(-1) ?? null, itemUpdate }
}

export function completionMessage(type: CheckInType, statuses: ItemStatus[] | ItemStatus | null, locale = 'ko-KR') {
  if (isEnglish(locale)) {
    if (type === 'morning') return 'Morning check-in complete. I’ll remember today’s plan and possible obstacles. Start with the smallest next action.'
    const values = Array.isArray(statuses) ? statuses : statuses ? [statuses] : []
    if (values.includes('missed')) return 'Closing check-in complete. I recorded what was missed without doubling tomorrow’s load.'
    if (values.includes('minimum')) return 'Closing check-in complete. I recorded the minimum action separately from full completion, and you kept the flow going.'
    if (values.includes('exception')) return 'Closing check-in complete. I recorded today’s exception separately from a missed action.'
    return 'Closing check-in complete. I recorded what you completed and how your energy felt today.'
  }
  if (type === 'morning') return '아침 점검을 마쳤어요. 오늘 계획과 변수를 기억해 둘게요. 이제 가장 작은 시작부터 이어가면 됩니다.'
  const values = Array.isArray(statuses) ? statuses : statuses ? [statuses] : []
  if (values.includes('missed')) return '마감 점검을 마쳤어요. 오늘 못 한 일은 그대로 기록했고, 내일 몰아서 하도록 만들지 않을게요.'
  if (values.includes('minimum')) return '마감 점검을 마쳤어요. 최소 행동은 완전 실행과 구분해 기록했고, 오늘의 흐름은 이어졌어요.'
  if (values.includes('exception')) return '마감 점검을 마쳤어요. 오늘의 예외도 미실행과 구분해 기록했어요.'
  return '마감 점검을 마쳤어요. 오늘 실행한 내용과 컨디션을 기록했어요.'
}
