import type { GoalCard } from './goal.ts'
import { isKoreanAgentLocale } from './promptLanguage.ts'

export type GoalExecution = {
  measurement: 'routine_completion' | 'custom_outcome'
  completionPercent: number | null
  reviewEveryWeeks: number
  progressStrategy?: string
  actions: { completionCriterion: string; minimumAction: string; minimumMinutes: number; steps?: string[]; goalResult?: string }[]
}
const text = { type: 'string', minLength: 4, maxLength: 120 }
export const executionSchema = {
  type: 'object', additionalProperties: false,
  required: ['measurement','completionPercent','reviewEveryWeeks','actions'],
  properties: {
    measurement: { type:'string', enum:['routine_completion','custom_outcome'] },
    completionPercent: { type:['integer','null'], minimum:1, maximum:100 },
    reviewEveryWeeks: { type:'integer', minimum:1, maximum:104 },
    actions: { type:'array', minItems:1, maxItems:7, items: {
      type:'object', additionalProperties:false, required:['completionCriterion','minimumAction','minimumMinutes'],
      properties:{completionCriterion:text,minimumAction:text,minimumMinutes:{type:'integer',minimum:1,maximum:2}},
    } },
  },
}

export function validExecution(value: unknown, actionCount: number): value is GoalExecution {
  if(!value || typeof value !== 'object')return false
  const x=value as GoalExecution
  return ['routine_completion','custom_outcome'].includes(x.measurement) &&
    (x.completionPercent===null || Number.isInteger(x.completionPercent)&&x.completionPercent>=1&&x.completionPercent<=100) &&
    (x.measurement!=='custom_outcome'||x.completionPercent===null) &&
    Number.isInteger(x.reviewEveryWeeks)&&x.reviewEveryWeeks>=1&&x.reviewEveryWeeks<=104 &&
    (x.progressStrategy===undefined || typeof x.progressStrategy==='string'&&x.progressStrategy.length>=20&&x.progressStrategy.length<=240) &&
    Array.isArray(x.actions)&&x.actions.length===actionCount&&x.actions.every(a=>a&&
      typeof a.completionCriterion==='string'&&a.completionCriterion.trim().length>=4&&a.completionCriterion.length<=120&&
      typeof a.minimumAction==='string'&&a.minimumAction.trim().length>=4&&a.minimumAction.length<=120&&
      Number.isInteger(a.minimumMinutes)&&a.minimumMinutes>=1&&a.minimumMinutes<=2&&
      (a.steps===undefined&&a.goalResult===undefined || Array.isArray(a.steps)&&a.steps.length>=2&&a.steps.length<=3&&a.steps.every(s=>typeof s==='string'&&s.trim().length>=3&&s.length<=100)&&typeof a.goalResult==='string'&&a.goalResult.length>0&&a.goalResult.length<=160))
}

export function executionIssue(card: GoalCard): string | null {
  const x=card.execution
  if(!validExecution(x,card.weeklyActions.length))return 'execution_details_required: 모든 행동에 completionCriterion, minimumAction, minimumMinutes(1~2)를 하나씩 작성하고 실행률 측정 방식과 점검 간격을 지정하세요.'
  const issues:string[]=[]
  if(x.reviewEveryWeeks>card.durationWeeks)issues.push('review_after_trial: 점검 간격은 시험 기간 이내여야 합니다.')
  for(let i=0;i<x.actions.length;i++){
    const a=x.actions[i]
    const at=`actions[${i}]`
    if(a.minimumMinutes>card.weeklyActions[i].durationMinutes)issues.push(`${at}: minimum_longer_than_routine: 최소 실행은 기본 실행보다 길 수 없습니다.`)
    if(/후보|아무거나|가능한\s*만큼|조금이라도|적당히|최선을|중\s*(?:하나|택)|또는|\bor\b|\//i.test(a.minimumAction))issues.push(`${at}: minimum_must_be_specific: 후보/선택지가 아닌 해당 행동의 구체적인 작은 행동 하나를 적으세요.`)
    if(/^(?:행동|루틴|목표|실천)(?:을|를)?\s*(?:하기|실행|해\s*보기|시도)/.test(a.minimumAction))issues.push(`${at}: minimum_must_be_specific: 어떤 대상을 어떻게 하는지 적으세요.`)
    if(/\d+\s*(?:분|시간|초)/.test(a.completionCriterion))issues.push(`${at}: criterion_duration_is_derived: 완료 증거만 쓰세요. 기본 실행 시간은 별도 수치 필드와 다르거나 중복됩니다.`)
    if(/\d+\s*시간/.test(a.minimumAction) || [...a.minimumAction.matchAll(/(\d+)\s*분/g)].some(m=>Number(m[1])!==a.minimumMinutes) || [...a.minimumAction.matchAll(/(\d+)\s*초/g)].some(m=>Number(m[1])>a.minimumMinutes*60))issues.push(`${at}: minimum_time_mismatch: 최소 행동의 문장과 minimumMinutes가 일치해야 합니다.`)
  }
  if(x.measurement==='routine_completion'&&/%|퍼센트/.test(card.targetMetric)){
    const percentages=[...card.targetMetric.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트)/g)].map(m=>Number(m[1]))
    if(percentages.length!==1||percentages[0]!==x.completionPercent)issues.push('completion_percent_mismatch: 실행률 수치를 completionPercent와 일치시키세요. 분모와 필요 횟수는 서버가 계산합니다.')
  }
  return issues.length?issues.join('\n'):null
}

const durationPattern=/(\d+(?:\.\d+)?)\s*(시간|분|초)(?:\s*(?:동안|이상|씩|간))?/g
const asMinutes=(amount:number,unit:string)=>unit==='시간'?amount*60:unit==='초'?amount/60:amount

// The model sometimes repeats the already-structured duration in prose. Strip
// only an exactly matching value; conflicting values must still fail validation.
export function normalizeDerivedExecutionText(card: GoalCard): GoalCard {
  const next=structuredClone(card)
  if(!next.execution)return next
  // An omitted duplicate value is not a reason for another model call.
  // Conflicting non-null percentages still fail validation.
  const statedPercent=next.targetMetric.match(/^\s*(?:실행률|실천율|완료율)\s*(\d+)\s*%\s*$/)
  if(next.execution.measurement==='routine_completion'&&next.execution.completionPercent===null&&statedPercent&&Number(statedPercent[1])>=1&&Number(statedPercent[1])<=100)next.execution.completionPercent=Number(statedPercent[1])
  next.execution.actions.forEach((guide,index)=>{
    const action=next.weeklyActions[index]
    // Use an option only when the completion evidence already selects it.
    const options=action.title.split(/\s*(?:또는|\bor\b|\/)\s*/i).map(value=>value.trim())
    if(options.length>1&&options.every(value=>value.length>=2)){
      const selected=options.filter(option=>guide.completionCriterion.includes(option))
      if(selected.length===1)action.title=selected[0]
    }
    if(/[~～〜]|미만|이하|이내|전후|보다|까지|넘게|안에/.test(guide.completionCriterion))return
    const expected=next.weeklyActions[index].durationMinutes
    const matches=[...guide.completionCriterion.matchAll(durationPattern)]
    if(!matches.length||matches.some(match=>Math.abs(asMinutes(Number(match[1]),match[2])-expected)>0.0001))return
    guide.completionCriterion=guide.completionCriterion
      .replace(durationPattern,' ')
      .replace(/\s{2,}/g,' ')
      .replace(/^\s*(?:동안|이상|씩)\s*/,'')
      .trim()
  })
  return next
}

export function requestedCompletionPercent(messages: string[]): number | undefined {
  let percent:number|undefined
  for(const message of messages){
    if(!/실행률|실천율|완료율/.test(message))continue
    const values=[...message.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트)/g)].map(m=>Number(m[1]))
    if(values.length)percent=values.at(-1)
  }
  return percent
}

export function reviewText(card: GoalCard, locale = 'ko-KR'): string {
  const every=card.execution!.reviewEveryWeeks
  if(!isKoreanAgentLocale(locale))return `${every===1?'Review weekly':`Review every ${every} weeks`} · Full review at the end of the ${card.durationWeeks}-week trial`
  return `${every===1?'매주':`${every}주마다`} 실행 기록 점검 · ${card.durationWeeks}주 시험 종료 시 전체 점검`
}
export function completionText(card: GoalCard, locale = 'ko-KR'): string {
  const total=card.durationWeeks*card.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek,0)
  const percent=card.execution?.completionPercent
  if(percent == null)return ''
  return isKoreanAgentLocale(locale)
    ? `${card.durationWeeks}주간 계획한 기본 실행 ${total}회 중 ${Math.ceil(total*percent/100)}회 이상 완료 (${percent}% 기준·올림)`
    : `Complete at least ${Math.ceil(total*percent/100)} of ${total} planned full sessions over ${card.durationWeeks} weeks (${percent}% target, rounded up)`
}

// Only normalize a not-yet-approved proposal, or a separately approved related card.
export function synchronizeExecution(card: GoalCard, locale = 'ko-KR'): GoalCard {
  const next=structuredClone(card)
  if(!next.execution)return next
  next.reviewCycle=reviewText(next, locale)
  next.recoveryRule=isKoreanAgentLocale(locale)?'두 번 연속 놓치지 않기':'Never miss twice in a row'
  next.fallbackAction=next.execution.actions.map((a,i)=>`${next.weeklyActions[i].title}: ${a.minimumAction} (${a.minimumMinutes}${isKoreanAgentLocale(locale)?'분':' min'})`).join(' / ')
  if(next.execution.measurement==='routine_completion'&&next.execution.completionPercent!==null)next.targetMetric=completionText(next, locale)
  return next
}

export function executionSummary(card: GoalCard, locale = 'ko-KR'): string[] {
  if(!card.execution)return []
  const total=card.durationWeeks*card.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek,0)
  if(!isKoreanAgentLocale(locale))return [
    `${card.execution.measurement==='custom_outcome'?'Routine log (separate from the outcome goal)':'Tracking rule'}: completed full sessions ÷ ${total} planned full sessions. Count each session once.`,
    ...card.execution.actions.map((a,i)=>`${card.weeklyActions[i].title}: complete the planned ${card.weeklyActions[i].durationMinutes}-minute session + ${a.completionCriterion}`),
    'Log the minimum version separately to preserve continuity; do not count it as a completed full session.',
  ]
  return [
    `${card.execution.measurement==='custom_outcome'?'루틴 기록(성과 목표와 별개)':'기록 기준'}: 기본 실행을 마친 횟수 ÷ 계획한 기본 실행 ${total}회. 같은 회차는 한 번만 기록해요.`,
    ...card.execution.actions.map((a,i)=>`${card.weeklyActions[i].title}: 계획한 ${card.weeklyActions[i].durationMinutes}분 실행 + ${a.completionCriterion}`),
    '최소 실행은 연결을 이어간 기록으로 따로 남기고, 기본 실행 완료 횟수에는 넣지 않아요.',
  ]
}

export function initialGoalMessage(card: GoalCard, notes: string[] = [], locale = 'ko-KR'): string {
  if(!isKoreanAgentLocale(locale)){
    const lines=[
      'Here is a **draft to test together**. Nothing is confirmed yet.',
      `**Goal**\n\n${card.outcome}`,
      `**Trial period**\n\n${card.durationWeeks} weeks${card.deadline?` · ${card.deadline}`:''}`,
      card.execution?.progressStrategy ? `**How we will progress toward the goal**\n\n${card.execution.progressStrategy}` : '',
      `**Weekly actions**\n\n${card.weeklyActions.map(action=>`- **${action.title}**: ${action.frequencyPerWeek}×/week · ${action.durationMinutes} min${action.preferredDays.length&&action.preferredDays.length<7?` · ${action.preferredDays.map(day=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day]).join(' · ')}`:''}`).join('\n')}`,
      ...card.execution?.actions.flatMap((guide,index)=>guide.steps?.length ? [`**${card.weeklyActions[index].title} · Steps for each session**\n\nGoal contribution: ${guide.goalResult}\n\n${guide.steps.map((step,i)=>`${i+1}. ${step}`).join('\n')}`] : []) ?? [],
      card.baselineMetric?`Current baseline: ${card.baselineMetric}`:'',
      [card.identity&&`Identity: ${card.identity}`,card.cue&&`Cue: ${card.cue}`,card.environment&&`Environment: ${card.environment}`].filter(Boolean).map(line=>`- ${line}`).join('\n'),
      `**Completion criteria**\n\n- ${card.targetMetric}\n${card.execution?.actions.map((guide,index)=>`- **${card.weeklyActions[index].title}**: ${guide.completionCriterion}`).join('\n')??''}\n\nCount one full session when you complete the planned duration and its criterion. Count each session once.`,
      card.execution?`**Minimum version for busy days**\n\n${card.execution.actions.map((guide,index)=>`- **${card.weeklyActions[index].title}**: ${guide.minimumAction} · ${guide.minimumMinutes} min`).join('\n')}\n\nThe minimum version preserves continuity but does not count as a completed full session.`:'',
      card.reviewCycle?`**Review**\n\n${card.reviewCycle}`:'',
      ...notes.filter(Boolean).slice(0,2),
      '**Would you like to start with this draft? Tell me only what you want to change.**',
    ]
    return lines.filter(Boolean).join('\n\n')
  }
  const lines=[
    '함께 시험해 볼 **초안**이에요. 아직 확정하지 않았어요.',
    `**목표**\n\n${card.outcome}`,
    `**시험 기간**\n\n${card.durationWeeks}주${card.deadline?` · ${card.deadline}`:''}`,
    card.execution?.progressStrategy ? `**목표까지의 진행 방법**\n\n${card.execution.progressStrategy}` : '',
    `**주간 실행**\n\n${card.weeklyActions.map(action=>`- **${action.title}**: 주 ${action.frequencyPerWeek}회 · ${action.durationMinutes}분${action.preferredDays.length&&action.preferredDays.length<7?` · ${action.preferredDays.map(day=>['월','화','수','목','금','토','일'][day]).join('·')}`:''}`).join('\n')}`,
    ...card.execution?.actions.flatMap((guide,index)=>guide.steps?.length ? [`**${card.weeklyActions[index].title} · 실행하는 날의 순서**\n\n목표: ${guide.goalResult}\n\n${guide.steps.map((step,i)=>`${i+1}. ${step}`).join('\n')}`] : []) ?? [],
    card.baselineMetric?`현재 기준: ${card.baselineMetric}`:'',
    [card.identity&&`지향점: ${card.identity}`,card.cue&&`실행 단서: ${card.cue}`,card.environment&&`환경: ${card.environment}`].filter(Boolean).map(line=>`- ${line}`).join('\n'),
    `**완료 기준**\n\n- ${card.targetMetric}\n${card.execution?.actions.map((guide,index)=>`- **${card.weeklyActions[index].title}**: ${guide.completionCriterion}`).join('\n')??''}\n\n위의 기본 실행 시간을 채우고 이 기준을 마치면 한 회 완료로 기록해요. 같은 회차는 한 번만 세어요.`,
    card.execution?`**바쁜 날 최소 실행**\n\n${card.execution.actions.map((guide,index)=>`- **${card.weeklyActions[index].title}**: ${guide.minimumAction} · ${guide.minimumMinutes}분`).join('\n')}\n\n최소 실행은 흐름을 잇는 기록이며, 기본 실행 완료 횟수에는 넣지 않아요.`:'',
    card.reviewCycle?`**점검**\n\n${card.reviewCycle}`:'',
    ...notes.filter(Boolean).slice(0,2),
    '**이 초안으로 시작할까요? 바꾸고 싶은 부분만 말씀해 주세요.**',
  ]
  return lines.filter(Boolean).join('\n\n')
}
