export type PlanningStyle = 'repeat' | 'progression'

const repeatAction = /(운동|산책|걷기|걷다|달리기|러닝|독서|읽기|기도|묵상|예배|스트레칭|명상|호흡|물\s*마시|일기|복약|약\s*먹|수면|취침|기상|식사|영어\s*(?:단어|회화))/i
const progressionAction = /(프로젝트|검증|조사|분석|기획|제작|개발|구축|출시|완성|마무리|준비|수익화|사업|창업|고객|판매|제안|포트폴리오|보고서|논문|자격증|시험|지원서|이직|취업|라운드)/i

export function deterministicPlanningStyle(title: unknown): PlanningStyle | null {
  const text = typeof title === 'string' ? title.trim() : ''
  if (!text) return null
  const repeat = repeatAction.test(text)
  const progression = progressionAction.test(text)
  if (repeat && !progression) return 'repeat'
  if (progression && !repeat) return 'progression'
  return null
}

export function normalizeProposedPlanningStyle(title: unknown, proposed: unknown): PlanningStyle | undefined {
  return deterministicPlanningStyle(title)
    ?? (proposed === 'repeat' || proposed === 'progression' ? proposed : undefined)
}

export function containsProgressionSignal(value: unknown) {
  return typeof value === 'string' && progressionAction.test(value)
}
