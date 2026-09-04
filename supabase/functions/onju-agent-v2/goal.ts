import { validExecution, type GoalExecution } from './goalExecution.ts'
const textFields = ['category','outcome','identity','deadline','baselineMetric','targetMetric','tinyStart','cue','environment','fallbackAction','recoveryRule','reviewCycle'] as const
export type GoalCard = Record<typeof textFields[number], string> & { execution?: GoalExecution; durationWeeks: number; weeklyActions: { title: string; frequencyPerWeek: number; durationMinutes: number; preferredDays: number[] }[] }
export type GoalChange = { label: string; before: string; after: string }
export type GoalDraft = { id: string; card: GoalCard; presentedMessageId: string; changes?: GoalChange[]; baseLabel?: string; related?: { card: GoalCard; changes: GoalChange[]; reason: string }; notes?: string[] }
export const emptyGoal: GoalCard = { category: '기타', outcome: '', identity: '', deadline: '', baselineMetric: '', targetMetric: '', tinyStart: '', cue: '', environment: '', fallbackAction: '', recoveryRule: '두 번 연속 놓치지 않기', reviewCycle: '매주 실행률 확인 · 4주마다 조정', durationWeeks: 0, weeklyActions: [] }
const actionProperties = {
  title: { type: 'string', minLength: 1, maxLength: 80, description:'실행할 구체적인 행동 하나. 또는/중 하나 같은 선택지와 시간·횟수를 넣지 않는다.' },
  frequencyPerWeek: { type: 'integer', minimum: 1, maximum: 7 },
  durationMinutes: { type: 'integer', minimum: 1, maximum: 240 },
  preferredDays: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
  completionCriterion: { type: 'string', minLength: 4, maxLength: 120 },
  minimumAction: { type: 'string', minLength: 4, maxLength: 120 },
  minimumMinutes: { type: 'integer', minimum: 1, maximum: 2 },
}

// The model proposes every action once. Persistence still uses GoalCard so old
// sessions remain readable, but derived review/fallback prose is owned by code.
export const goalSchema = {
  type: 'object', additionalProperties: false,
  required: ['category','outcome','identity','cue','environment','deadline','baselineMetric','targetMetric','durationWeeks','measurement','completionPercent','reviewEveryWeeks','actions'],
  properties: {
    category: { type: 'string', minLength: 1, maxLength: 40 },
    outcome: { type: 'string', minLength: 1, maxLength: 160 },
    identity: { type: 'string', maxLength: 120 },
    cue: { type: 'string', maxLength: 120 },
    environment: { type: 'string', maxLength: 120 },
    deadline: { type: 'string', maxLength: 40 },
    baselineMetric: { type: 'string', maxLength: 160 },
    targetMetric: { type: 'string', minLength: 1, maxLength: 200 },
    durationWeeks: { type: 'integer', minimum: 1, maximum: 104 },
    measurement: { type:'string', enum:['routine_completion','custom_outcome'] },
    completionPercent: { type:['integer','null'], minimum:1, maximum:100 },
    reviewEveryWeeks: { type:'integer', minimum:1, maximum:104 },
    actions: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', additionalProperties: false, required: Object.keys(actionProperties), properties: actionProperties } },
  },
}

export function goalSchemaForAreas(areas: string[]) {
  if(areas.length<2)return goalSchema
  return {...goalSchema,properties:{...goalSchema.properties,actions:{
    type:'object',additionalProperties:false,required:areas,
    description:'함께 요청한 각 분야를 빠짐없이 하나씩 작성한다. 각 칸은 그 분야의 구체적인 행동 하나다.',
    properties:Object.fromEntries(areas.map(area=>[area,{...goalSchema.properties.actions.items,description:`${area} 분야의 구체적 행동 하나. 다른 분야나 선택지를 넣지 않는다.`}])),
  }}}
}

export function requestedSingleSession(message: string): {frequency:number;minutes:number}|null {
  // Only an unambiguous single routine, not a cap, range, correction or a
  // request to split/combine multiple activities.
  if(requestedGoalAreas(message).length>1||/말고|대신|이하|이내|이상|미만|최대|최소|정도|쯤|약\s*\d|각각|분야별|나눠|분할|쪼개|합쳐|총\s*\d/.test(message))return null
  const pairs=[...message.matchAll(/(?:주|일주일에)\s*([1-7])\s*(?:회|번)\s*[,·]?\s*(\d{1,3})\s*분\s*씩/g)]
  if(pairs.length!==1||Number(pairs[0][2])<1||Number(pairs[0][2])>240)return null
  return {frequency:Number(pairs[0][1]),minutes:Number(pairs[0][2])}
}

export function goalSchemaForRequest(areas: string[], message: string) {
  const schema=goalSchemaForAreas(areas),session=requestedSingleSession(message)
  if(!session||areas.length>1)return schema
  return {...goalSchema,properties:{...goalSchema.properties,actions:{
    ...goalSchema.properties.actions,minItems:1,maxItems:1,
    description:'사용자가 정한 한 회의 단위를 유지한다. 세부 동작을 여러 회차로 나누지 않는다.',
    items:{...goalSchema.properties.actions.items,properties:{...actionProperties,
      frequencyPerWeek:{...actionProperties.frequencyPerWeek,enum:[session.frequency]},
      durationMinutes:{...actionProperties.durationMinutes,enum:[session.minutes]},
    }},
  }}}
}

export function goalSessionIssue(card: GoalCard, message: string): string|null {
  const session=requestedSingleSession(message)
  if(!session)return null
  const action=card.weeklyActions[0]
  return card.weeklyActions.length===1&&action.frequencyPerWeek===session.frequency&&action.durationMinutes===session.minutes?null:
    `preserve_single_session: 사용자가 정한 주 ${session.frequency}회·회당 ${session.minutes}분을 하나의 행동으로 유지하세요. 세부 동작은 완료 기준에 적고 회차를 나누거나 시간을 줄이지 마세요.`
}

export function materializeGoalDraft(value: unknown, areas: string[] = []): GoalCard | null {
  if(validGoalCard(value))return structuredClone(value)
  if(!value||typeof value!=='object')return null
  const input=value as Record<string,unknown>
  let actions=input.actions
  if(areas.length>1&&!Array.isArray(actions)&&actions&&typeof actions==='object'){
    const byArea=actions as Record<string,unknown>
    if(Object.keys(byArea).length!==areas.length||areas.some(area=>!Object.hasOwn(byArea,area)))return null
    actions=areas.map(area=>byArea[area])
  }
  if(typeof input.category!=='string'||!input.category.trim()||typeof input.outcome!=='string'||!input.outcome.trim()||
    typeof input.identity!=='string'||typeof input.cue!=='string'||typeof input.environment!=='string'||
    typeof input.deadline!=='string'||typeof input.baselineMetric!=='string'||typeof input.targetMetric!=='string'||!input.targetMetric.trim()||
    !Number.isInteger(input.durationWeeks)||Number(input.durationWeeks)<1||Number(input.durationWeeks)>104||
    !['routine_completion','custom_outcome'].includes(String(input.measurement))||
    !(input.completionPercent===null||Number.isInteger(input.completionPercent)&&Number(input.completionPercent)>=1&&Number(input.completionPercent)<=100)||
    input.measurement==='custom_outcome'&&input.completionPercent!==null||
    !Number.isInteger(input.reviewEveryWeeks)||Number(input.reviewEveryWeeks)<1||Number(input.reviewEveryWeeks)>104||
    !Array.isArray(actions)||!actions.length||actions.length>7)return null
  const parsed=actions.map(value=>{
    if(!value||typeof value!=='object')return null
    const action=value as Record<string,unknown>
    if(typeof action.title!=='string'||!action.title.trim()||!Number.isInteger(action.frequencyPerWeek)||Number(action.frequencyPerWeek)<1||Number(action.frequencyPerWeek)>7||
      !Number.isInteger(action.durationMinutes)||Number(action.durationMinutes)<1||Number(action.durationMinutes)>240||
      !Array.isArray(action.preferredDays)||action.preferredDays.some(day=>!Number.isInteger(day)||Number(day)<0||Number(day)>6)||
      typeof action.completionCriterion!=='string'||action.completionCriterion.trim().length<4||action.completionCriterion.length>120||
      typeof action.minimumAction!=='string'||action.minimumAction.trim().length<4||action.minimumAction.length>120||
      !Number.isInteger(action.minimumMinutes)||Number(action.minimumMinutes)<1||Number(action.minimumMinutes)>2)return null
    return action
  })
  if(parsed.some(action=>!action))return null
  const card:GoalCard={
    ...structuredClone(emptyGoal),category:input.category.trim(),outcome:input.outcome.trim(),deadline:input.deadline.trim(),
    identity:input.identity.trim(),cue:input.cue.trim(),environment:input.environment.trim(),
    baselineMetric:input.baselineMetric.trim(),targetMetric:input.targetMetric.trim(),durationWeeks:Number(input.durationWeeks),
    weeklyActions:parsed.map(action=>({title:String(action!.title).trim(),frequencyPerWeek:Number(action!.frequencyPerWeek),durationMinutes:Number(action!.durationMinutes),preferredDays:[...(action!.preferredDays as number[])]})),
    execution:{measurement:input.measurement as GoalExecution['measurement'],completionPercent:input.completionPercent as number|null,reviewEveryWeeks:Number(input.reviewEveryWeeks),actions:parsed.map(action=>({completionCriterion:String(action!.completionCriterion).trim(),minimumAction:String(action!.minimumAction).trim(),minimumMinutes:Number(action!.minimumMinutes)}))},
  }
  return validGoalCard(card)?card:null
}

export function validGoalCard(value: unknown): value is GoalCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  if(card.execution!==undefined && !validExecution(card.execution,Array.isArray(card.weeklyActions)?card.weeklyActions.length:0))return false
  return textFields.every(key => typeof card[key] === 'string') && Number.isInteger(card.durationWeeks) && Number(card.durationWeeks) >= 0 && Number(card.durationWeeks) <= 104 && Array.isArray(card.weeklyActions) && card.weeklyActions.length <= 7 && card.weeklyActions.every(value => {
    if (!value || typeof value !== 'object') return false
    const action = value as Record<string, unknown>
    return typeof action.title === 'string' && !!action.title.trim() && Number.isInteger(action.frequencyPerWeek) && Number(action.frequencyPerWeek) >= 1 && Number(action.frequencyPerWeek) <= 7 && Number.isInteger(action.durationMinutes) && Number(action.durationMinutes) >= 1 && Number(action.durationMinutes) <= 240 && Array.isArray(action.preferredDays) && action.preferredDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6)
  })
}

// Catch unambiguous count targets; do not pretend to validate arbitrary prose goals.
export function goalDraftIssue(card: GoalCard): string | null {
  for (const action of card.weeklyActions) {
    const minutes = action.title.match(/(\d+)\s*분/)
    if (minutes && Number(minutes[1]) !== action.durationMinutes) return 'action_title_duration_mismatch: 행동 이름에는 시간 수치를 넣지 말고 durationMinutes에만 표시하세요.'
    if (/매일|하루\s*\d+\s*(번|회)/.test(action.title) && action.frequencyPerWeek !== 7) return 'action_title_frequency_mismatch: 매일이라는 이름과 주간 횟수가 다릅니다. 행동 이름에 빈도를 넣지 마세요.'
  }
  for(const field of ['targetMetric','outcome'] as const){
    const count = card[field].match(/(\d+)\s*주\s*(?:간|동안)?\s*(?:총\s*)?(?:최소\s*)?(\d+)\s*회/)
    if(!count)continue
    if(Number(count[1])!==card.durationWeeks)return `count_period_mismatch:${field}: 문장의 기간과 durationWeeks를 맞추세요.`
    if(card.weeklyActions.length!==1&&!/총/.test(card[field]))continue
    const planned=card.durationWeeks*card.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek,0)
    const target=Number(count[2]),minimum=/최소|이상/.test(card[field])
    if(target>planned||(!minimum&&target!==planned))return `count_target_mismatch:${field}: 주간 횟수 × ${card.durationWeeks}주 = ${planned}회. 결과 기준을 일치시키거나 더 낮은 최소 달성 기준임을 명시하세요.`
  }
  return null
}

// New proposals must not contradict their structured frequency in the headline.
// Kept separate from revisions: existing prose is never silently rewritten.
export function initialGoalProseIssue(card: GoalCard): string | null {
  if(card.weeklyActions.some(action=>/또는|중\s*(?:하나|택)|\bor\b|\//i.test(action.title)))return 'goal_action_choice_ambiguous: 행동 이름을 선택지로 쓰지 말고 완료 기준과 같은 구체적인 행동 하나로 제안하세요.'
  if (/매일|하루\s*\d+\s*(?:번|회)/.test(card.outcome) && card.weeklyActions.some(a => a.frequencyPerWeek !== 7)) {
    return 'goal_prose_frequency_mismatch: 주간 행동은 매일이 아닙니다. outcome은 원하는 변화만 쓰고 실행 횟수는 weeklyActions에만 적으세요.'
  }
  const frequency = card.outcome.match(/(?:주당|매주|주)\s*(\d+)\s*(?:회|번)/)
  if (frequency) {
    const expected = Number(frequency[1])
    const individual = card.weeklyActions.length === 1 || /각각|각\s*분야|각\s*행동/.test(card.outcome)
    const mismatch = individual ? card.weeklyActions.some(a => a.frequencyPerWeek !== expected) : /총|합쳐|합계/.test(card.outcome) ? card.weeklyActions.reduce((sum,a) => sum+a.frequencyPerWeek,0) !== expected : true
    if (mismatch) return 'goal_prose_frequency_mismatch: 목표 문장의 각 행동/전체 횟수가 weeklyActions와 다르거나 모호합니다. outcome은 원하는 변화만 쓰고 실행 횟수는 weeklyActions에만 적으세요.'
  }
  return null
}

// Only recognize an explicit joined list, not incidental mentions such as
// "업무가 바빠서 건강 목표부터" or requests to choose/exclude a category.
export function requestedGoalAreas(message: string): string[] {
  if(/말고|빼고|제외|대신|중(?:에서)?\s*(?:하나|한\s*(?:분야|가지|파트))/.test(message))return []
  const lists=message.match(/(?:일(?:적인\s*부분)?|업무|건강|신앙)(?:\s*(?:,|·|와|과|및|그리고)\s*(?:일(?:적인\s*부분)?|업무|건강|신앙))+/g)??[]
  return [...new Set(lists.flatMap(list=>(list.match(/일(?:적인\s*부분)?|업무|건강|신앙/g)??[]).map(area=>area.startsWith('일')||area==='업무'?'일':area)))]
}

export function goalCoverageIssue(card: GoalCard, requested: string[]): string | null {
  const words:Record<string,RegExp>={일:/업무|할\s*일|직무|일정|회고|커리어|직장|프로젝트|작업|업적/,건강:/건강|운동|걷|산책|스트레칭|몸|체력|식사|수면|물\s*(?:마시|한)/,신앙:/신앙|기도|성경|묵상|말씀|예배|하나님/}
  const missing=requested.filter(area=>!card.weeklyActions.some((action,index)=>words[area]?.test([action.title,card.execution?.actions[index]?.completionCriterion,card.execution?.actions[index]?.minimumAction].join(' '))))
  return missing.length?`requested_goal_area_missing: 함께 요청한 ${missing.join('·')} 분야의 구체적 행동이 빠졌습니다. 전체 예산 안에서 각 요청 분야를 한 가지 이상 포함하세요.`:null
}

// Visible terms are rendered from the same immutable card that confirmation commits.
export function describeGoal(card: GoalCard) {
  return [
    `**목표**: ${card.outcome}`,
    ...(card.durationWeeks ? [`**기간**: ${card.durationWeeks}주${card.deadline ? ` · ${card.deadline}` : ''}`] : []),
    ...(card.targetMetric ? [`**결과 기준**: ${card.targetMetric}`] : []),
    ...card.weeklyActions.map(a => `**${a.title}**: 주 ${a.frequencyPerWeek}회 · ${a.durationMinutes}분${a.preferredDays.length && a.preferredDays.length < 7 ? ` · 희망 요일: ${a.preferredDays.map(d => ['월','화','수','목','금','토','일'][d]).join('·')}` : ''}`),
    ...(card.baselineMetric ? [`현재 기준: ${card.baselineMetric}`] : []),
    ...(['identity','cue','environment'] as const).flatMap((key, i) => card[key] ? [`${['지향하는 모습','실행 단서','환경'][i]}: ${card[key]}`] : []),
    ...(!card.execution&&card.tinyStart?[`작게 시작: ${card.tinyStart}`]:[]),
    ...(!card.execution&&card.fallbackAction?[`축소 실행: ${card.fallbackAction}`]:[]),
    ...(card.recoveryRule?[`복귀 규칙: ${card.recoveryRule}`]:[]),
    ...(card.reviewCycle?[`점검: ${card.reviewCycle}`]:[]),
  ]
}
