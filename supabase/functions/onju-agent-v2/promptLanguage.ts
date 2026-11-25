export type AgentExpressionLocale = 'ko-KR' | 'en-US'

export function resolveAgentExpressionLocale(locale: string): AgentExpressionLocale {
  return locale.toLowerCase().startsWith('ko') ? 'ko-KR' : 'en-US'
}

export function isKoreanAgentLocale(locale: string) {
  return resolveAgentExpressionLocale(locale) === 'ko-KR'
}

const expressionPacks: Record<AgentExpressionLocale, string> = {
  'ko-KR': `한국어 표현 규칙:
- 사용자에게 보이는 paragraphs, bullets, question, choices와 목표 초안의 설명 문구는 자연스러운 한국어로 작성한다.
- 따뜻하고 간결한 해요체를 사용한다. 보고서 문체(~함, ~예정), 번역투, 과도한 존댓말, 기계적인 감사 문구를 피한다.
- 사용자의 말을 간접 인용하지 말고 의미에 직접 반응한다. 예: “세 분야를 함께 챙기고 싶은 거군요.”
- 질문은 question 필드에만 한 개 두고, paragraphs나 bullets에서 같은 질문을 반복하지 않는다.
- 문단은 한 가지 의미씩 1~3개로 나누고 핵심 수치나 개념만 **굵게** 표시한다.
- 고유명사, 사용자가 직접 쓴 표현과 수치는 사용자의 뜻 없이 번역하거나 바꾸지 않는다.`,
  'en-US': `English expression rules:
- Write every user-visible paragraph, bullet, question, choice, and goal-draft explanation in natural English. Never expose Korean UI copy or internal Korean field labels.
- Use warm, concise conversational English. Avoid report-like wording, literal translation, canned acknowledgements, and repeatedly opening with the same template.
- Respond directly to the user's meaning instead of narrating what they said. Example: “It sounds like you want to make progress in all three areas.”
- Put at most one question in the question field. Do not repeat that question in paragraphs or bullets.
- Use 1–3 short paragraphs with one idea each. Bold only the numbers or concepts that genuinely need emphasis.
- Preserve proper nouns, the user's own wording, and numbers unless the user asks for a translation or correction.`,
}

export function agentExpressionRules(locale: string) {
  return expressionPacks[resolveAgentExpressionLocale(locale)]
}

/**
 * User-visible copy used when deterministic validation must replace the model's
 * answer. Keeping it beside the expression pack prevents fallback paths from
 * leaking Korean into an English conversation.
 */
export function agentFallbackCopy(locale: string) {
  const korean = isKoreanAgentLocale(locale)
  return korean ? {
    relatedDraftPending: '관련 조건을 바꿀지도 확인이 필요해요. 아직 확정하지 않았어요.',
    goalConfirmed: '좋아요. 확인하신 초안 그대로 확정했어요.',
    goalConfirmedNext: '**이제 생활 리듬에 맞춰 주간 계획을 만들 수 있어요.**',
    defaultStartNote: '가볍게 시험해 볼 시작안이에요. 실행량은 함께 조절할 수 있어요.',
    informedStartNote: '말씀하신 실행 가능 시간을 기준으로 초안을 잡았어요.',
    noCapacityNote: '현재 등록된 일정에는 여유가 없어, 실행 전에 시간을 비우거나 일정을 조정해야 해요.',
    periodNote: (label: string, weeks: number) => `정한 기간은 ${label}이며, 주간 실행안은 약 ${weeks}주로 환산했어요.`,
    scheduleDraftPrefix: '일정 변경은 아직 반영하지 못했어요. 목표 초안은 별도로 정리했어요.',
    partialScheduleSaved: '확인된 내용만 일정에 반영했어요. 나머지는 아직 저장하지 못했어요.',
    noScheduleSaved: '일정에는 아직 반영하지 못했어요.',
    retryScheduleQuestion: '반영하지 못한 일정의 시작 시간과 종료 시간을 다시 말해 주실래요?',
    firstSchedulePurpose: '목표와 루틴을 생활에 맞추기 위해, 알려주신 시간을 먼저 일정에 반영했어요.',
    scheduleDoneQuestion: '이 밖에 비워둬야 할 시간이 있나요?',
    scheduleDoneChoices: ['일정은 여기까지예요', '추가할 일정이 있어요'],
    rhythmSavedFirst: '목표와 루틴을 무리 없이 잡으려고, 먼저 생활 시간을 정리하고 있어요. 알려주신 내용을 일정에 반영했어요.',
    scheduleSaved: '알려주신 내용을 일정에 반영했어요.',
    continueTogether: '좋아요. 이어서 함께 정리해 볼게요.',
    fixedScheduleQuestion: '평일에 이동이나 근무처럼 정해진 일정은 몇 시부터 몇 시까지인가요?',
    partialSavedSummary: '아래 내용만 반영했어요. 나머지 일정은 아직 반영하지 못했어요.',
    noSavedSummary: '생활 시간은 아직 반영하지 못했어요.',
    retryUnappliedQuestion: '반영하지 못한 일정의 시작·종료 시간을 다시 확인해 주실래요?',
    rhythmRetryQuestion: '기상·취침 시간을 평일 기준으로 다시 알려주실래요?',
    savedRhythmSummary: '알려주신 생활 시간을 일정에 반영했어요.',
    rhythmPurpose: '무리 없는 목표와 루틴을 정하려고 생활 시간을 먼저 알아보고 있어요.',
    noConfirmedGoal: '아직 목표를 확정하지 않았어요.',
    preservedGoal: '기존 확정 목표는 바꾸지 않았어요.',
    draftValidationFailed: '초안의 실행량과 완료 기준을 아직 맞추지 못했어요.',
    firstActionQuestion: '가장 먼저 시작할 행동 한 가지만 알려주실래요?',
  } : {
    relatedDraftPending: 'I need to check whether the related terms should change too. Nothing has been confirmed yet.',
    goalConfirmed: 'Done — I confirmed the draft exactly as you approved it.',
    goalConfirmedNext: '**We can now shape the weekly plan around your real-life rhythm.**',
    defaultStartNote: 'This is a light starting point to test. We can adjust the workload together.',
    informedStartNote: 'I based this draft on the time you said you can realistically use.',
    noCapacityNote: 'There is no open capacity in the schedule entered so far, so we need to free or rearrange time before starting.',
    periodNote: (label: string, weeks: number) => `Your chosen period is ${label}; the weekly plan uses an approximate ${weeks}-week conversion.`,
    scheduleDraftPrefix: 'I could not save the schedule change yet. I prepared the goal draft separately.',
    partialScheduleSaved: 'I saved only the details I could verify. The rest has not been saved yet.',
    noScheduleSaved: 'I have not saved anything to your schedule yet.',
    retryScheduleQuestion: 'Could you give me the start and end times for the schedule item that was not saved?',
    firstSchedulePurpose: 'I saved the times you shared first so we can fit your goals and routines into your actual life.',
    scheduleDoneQuestion: 'Is there any other time we should keep open?',
    scheduleDoneChoices: ["That's all for my schedule", 'I have another schedule item'],
    rhythmSavedFirst: 'I am mapping your daily rhythm first so the goals and routines stay realistic. I saved what you shared.',
    scheduleSaved: 'I saved the schedule details you shared.',
    continueTogether: "Got it. Let's keep working through it together.",
    fixedScheduleQuestion: 'What hours are fixed on weekdays, such as commuting or work?',
    partialSavedSummary: 'I saved the items below, but the rest of the schedule was not saved yet.',
    noSavedSummary: 'I have not saved the schedule yet.',
    retryUnappliedQuestion: 'Could you confirm the start and end times for the schedule item that was not saved?',
    rhythmRetryQuestion: 'Could you tell me your usual weekday wake-up and bedtime again?',
    savedRhythmSummary: 'I saved the daily rhythm you shared.',
    rhythmPurpose: 'I am learning your daily rhythm first so we can build goals and routines that are realistic.',
    noConfirmedGoal: 'You have not confirmed a goal yet.',
    preservedGoal: 'Your confirmed goal has not been changed.',
    draftValidationFailed: 'I could not align the draft workload and completion criteria yet.',
    firstActionQuestion: 'What is the first action you would like to start with?',
  }
}
