import type { GoalCard } from './goal.ts'

export type GoalBrief = {
  period: { label: string; weeks: number } | null
  areas: string[]
  objectives: { area: string; result: string }[]
  areaCount?: number
}
export const emptyBrief = (): GoalBrief => ({ period: null, areas: [], objectives: [] })
export function parseGoalPeriod(label: string): GoalBrief['period'] {
  const match = label.trim().match(/^(\d+|한|두|세|네|여섯|열두|one|two|three|four|five|six|twelve)\s*(주|개월|달|년|weeks?|months?|years?)$/i)
  if (!match) return null
  const numbers: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 여섯: 6, 열두: 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12 }
  const amount = numbers[match[1].toLowerCase()] ?? Number(match[1])
  const unit = match[2].toLowerCase()
  const weeks = unit === '주' || unit.startsWith('week') ? amount : Math.round(amount * (unit === '년' || unit.startsWith('year') ? 52 : 52 / 12))
  return weeks >= 1 && weeks <= 104 ? { label: label.trim(), weeks } : null
}
// A field name or generic aspiration is not an observable end result.
function concreteResult(result: string) {
  return /(?:\d+(?:\.\d+)?|한|두|세|네)\s*(?:(?:권|회|개(?!월)|쪽|페이지|점|명|원|만원|%|kg|킬로|km|분|시간|편|건|장)|(?:books?|times?|sessions?|pages?|points?|people|users?|dollars?|usd|minutes?|hours?|articles?|projects?|rounds?|miles?)\b)|완료|완성|제출|출시|게시|합격|취득|발표|개설|\b(?:complete|finish|submit|launch|publish|pass|earn|present|open|ship)(?:ed|ing|es|s)?\b/i.test(result)
}
export function loadGoalBrief(value: unknown): GoalBrief {
  if (!value || typeof value !== 'object') return emptyBrief()
  const x = value as GoalBrief
  if (!Array.isArray(x.areas) || x.areas.length > 7 || !x.areas.every(a => typeof a === 'string' && a.length > 0 && a.length <= 30) ||
    !Array.isArray(x.objectives) || x.objectives.length > 7 || !x.objectives.every(o => o && typeof o.area === 'string' && x.areas.includes(o.area) && typeof o.result === 'string' && o.result.length <= 160 && concreteResult(o.result))) return emptyBrief()
  const period = x.period && typeof x.period.label === 'string' ? parseGoalPeriod(x.period.label) : null
  return { period, areas: [...new Set(x.areas)], objectives: structuredClone(x.objectives), ...(Number.isInteger(x.areaCount) && x.areaCount! >= 1 && x.areaCount! <= 7 ? {areaCount:x.areaCount} : {}) }
}
export function updateGoalBrief(current: GoalBrief, input: unknown, userText: string, priorUserTexts: string[] = []): GoalBrief {
  const x = input as { period: string | null; areas: string[]; objectives: { area: string; result: string }[] }
  if (!x || !Array.isArray(x.areas) || !Array.isArray(x.objectives) || x.areas.length > 7 || x.objectives.length > 7) throw Error('invalid_goal_brief')
  const next = structuredClone(current)
  // Remember an explicitly stated scope even before the user names the areas.
  // This guards completeness; it does not select the next question or invent names.
  const counts = [...userText.matchAll(/(?<!\d)([1-7]|한|두|세|네|다섯|여섯|일곱|one|two|three|four|five|six|seven)\s*(?:(?:가지|개)?\s*분야|areas?|categories?|domains?)/gi)]
  if (counts.length === 1 && !/\?|까요|추천|말고|아니|제외|\b(?:recommend|suggest|which|what\s+about)\b/i.test(userText)) {
    const count = counts[0][1].toLowerCase()
    next.areaCount = ({한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,one:1,two:2,three:3,four:4,five:5,six:6,seven:7} as Record<string,number>)[count] ?? Number(count)
  }
  if (x.period !== null && x.period !== next.period?.label) {
    if (typeof x.period !== 'string' || !userText.includes(x.period)) throw Error('period_requires_exact_user_evidence')
    if (/\?|까요|어때|좋을까|아니|말고|말아|미정|모르|추천|\b(?:recommend|suggest|not\s+sure|maybe|what\s+about)\b/i.test(userText) && !/(?:말고|아니라)\s*[^\n]*$/.test(userText.split(x.period)[0])) throw Error('period_not_decided: 기간 후보를 확정하지 말고 선택을 도와주세요.')
    const period = parseGoalPeriod(x.period)
    if (!period) throw Error('period_needs_weeks_or_months: 기간을 몇 주 또는 몇 개월로 확인하세요.')
    next.period = period
  }
  for (const area of x.areas) {
    if (next.areas.includes(area)) continue
    if (typeof area !== 'string' || !area.trim() || area.length > 30 || ![...priorUserTexts,userText].some(source=>source.includes(area))) throw Error('area_requires_exact_user_evidence')
    if (!next.areas.includes(area)) next.areas.push(area)
  }
  for (const objective of x.objectives) {
    if (objective && next.objectives.some(o=>o.area===objective.area&&o.result===objective.result)) continue
    if (!objective || !next.areas.includes(objective.area) || typeof objective.result !== 'string' || objective.result.length > 160 ||
      !userText.includes(objective.result) || !concreteResult(objective.result)) throw Error('result_requires_concrete_user_evidence: 분야나 막연한 바람이 아닌 사용자가 말한 수치 또는 확인 가능한 완성물을 확인하세요.')
    if (/목표.*(?:모르|미정)|추천해|예를\s*들|가령|\b(?:recommend|suggest|for\s+example|not\s+sure\s+what)\b/i.test(userText)) throw Error('result_not_decided: 예시나 추천 요청을 사용자의 목표로 확정하지 마세요.')
    if (/\?|까요|어때|좋을까/.test(userText) || /^(?:은|는|이|가|을|를)?\s*(?:말고|아니|싫)/.test(userText.slice(userText.indexOf(objective.result) + objective.result.length).trim())) throw Error('result_not_decided')
    next.objectives = [...next.objectives.filter(o => o.area !== objective.area), { area: objective.area, result: objective.result.trim() }]
  }
  if (next.areas.length > 7) throw Error('too_many_goal_areas')
  return next
}
export function missingGoalBrief(brief: GoalBrief) {
  if (!brief.period) return 'period'
  if (brief.areaCount && brief.areas.length < brief.areaCount) return 'areas'
  if (!brief.areas.length || brief.areas.some(area => !brief.objectives.some(o => o.area === area))) return 'result'
  return null
}
// Only a bounded failure fallback. Normal dialogue is written by the model.
export function goalBriefFallback(brief: GoalBrief, locale = 'ko-KR') {
  const korean = locale.toLowerCase().startsWith('ko')
  const period = brief.period
  const area = brief.areas.find(a => !brief.objectives.some(o => o.area === a))
  if (!period) return {
    summary: korean
      ? '분야만으로 루틴을 정하지 않고, **기간 → 그동안 이루고 싶은 목표 → 하루 실행 방법** 순서로 함께 만들게요.'
      : "I won't build a routine from the topic alone. We'll connect **time frame → outcome → daily action** before drafting the plan.",
    details: brief.objectives.map(o => `**${o.area}**: ${o.result}`),
    question: korean ? '먼저 얼마 동안 이 목표를 위해 진행하고 싶으세요?' : 'How long would you like to work toward this goal?',
    choices: korean ? ['1개월', '3개월', '6개월'] : ['1 month', '3 months', '6 months'],
  }
  return {
    summary: korean
      ? `정리한 **${period.label}** 계획은 그대로 기억하고 있어요. 아직 루틴 초안은 만들지 않았어요.`
      : `I have the **${period.label}** time frame. I haven't drafted the routine yet.`,
    details: brief.objectives.map(o => `**${o.area}**: ${o.result}`),
    question: korean
      ? brief.areaCount && brief.areas.length < brief.areaCount ? `${brief.areaCount}가지 분야 중 ${brief.areas.length ? '아직 말하지 않은 분야는' : '생각하신 분야들은'} 무엇인가요?` : area ? `${area} 분야에서 ${period.label} 뒤 어떤 결과를 이루고 싶으세요?` : `${period.label} 뒤 가장 달라졌으면 하는 것은 무엇인가요?`
      : brief.areaCount && brief.areas.length < brief.areaCount ? `What ${brief.areas.length ? 'other ' : ''}${brief.areaCount === 1 ? 'area' : 'areas'} do you want to include?` : area ? `What result would you like to reach in ${area} after ${period.label}?` : `What would you most like to be different after ${period.label}?`,
    choices: [],
  }
}
export function goalBriefIssue(card: GoalCard, brief: GoalBrief): string | null {
  if (missingGoalBrief(brief)) return 'goal_brief_incomplete: 기간과 각 분야의 구체적 목표를 먼저 확인하세요. 루틴 초안은 아직 만들지 마세요.'
  if (card.durationWeeks !== brief.period!.weeks) return `preserve_goal_period: 사용자가 정한 ${brief.period!.label}의 주간 계획 환산값 ${brief.period!.weeks}주를 유지하세요.`
  const metric = card.targetMetric.replace(/\s/g, '')
  if (brief.objectives.some(o => !metric.includes(o.result.replace(/\s/g, '')))) return 'preserve_goal_results: targetMetric에 각 분야의 사용자가 말한 result 원문을 보존하세요. 임의의 실행률로 바꾸지 마세요.'
  // Legacy cards remain readable; new structured guides must point to the agreed results.
  if (card.execution?.actions.some(a => a.steps && !brief.objectives.some(o => o.result === a.goalResult))) return 'daily_guide_must_link_agreed_result'
  return null
}
