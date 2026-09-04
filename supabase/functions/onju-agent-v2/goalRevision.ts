import { goalDraftIssue, validGoalCard, type GoalCard, type GoalChange, type GoalDraft } from './goal.ts'
import { executionIssue, synchronizeExecution } from './goalExecution.ts'

const fields = ['durationWeeks','targetMetric','deadline','outcome','category','identity','baselineMetric','tinyStart','cue','environment','fallbackAction','recoveryRule','reviewCycle','frequencyPerWeek','durationMinutes','preferredDays','title','reviewEveryWeeks','completionPercent','minimumAction','minimumMinutes','completionCriterion'] as const
type Field = typeof fields[number]
export type GoalEdit = { field: Field; actionIndex: number; text: string | null; number: number | null; days: number[] | null; evidence: string }
const actionFields = new Set<Field>(['frequencyPerWeek','durationMinutes','preferredDays','title'])
const guideFields = new Set<Field>(['minimumAction','minimumMinutes','completionCriterion'])
const labels: Record<Field, string> = {durationWeeks:'기간',targetMetric:'결과 기준',deadline:'종료일',outcome:'목표',category:'분야',identity:'지향하는 모습',baselineMetric:'현재 기준',tinyStart:'작게 시작',cue:'실행 단서',environment:'환경',fallbackAction:'바쁜 날 최소 실행',recoveryRule:'복귀 규칙',reviewCycle:'점검',frequencyPerWeek:'횟수',durationMinutes:'시간',preferredDays:'희망 요일',title:'행동 이름',reviewEveryWeeks:'점검 간격',completionPercent:'실행률 기준',minimumAction:'최소 행동',minimumMinutes:'최소 실행 시간',completionCriterion:'완료 기준'}
const evidencePatterns: Record<Field, RegExp> = {
  durationWeeks:/기간|개월|\d+\s*주(?:로|동안|간|만|짜리)/, targetMetric:/결과|달성|기준|목표\s*(?:수치|횟수|량)|총\s*\d+\s*회/,
  deadline:/종료|마감|기한|날짜|까지/, outcome:/목표|방향/, category:/분야|카테고리/, identity:/정체성|사람|모습/,
  baselineMetric:/현재|기준선|지금/, tinyStart:/시작|가볍|부담|최소|작게/, cue:/단서|직후|다음|후에/, environment:/환경|장소|준비/,
  fallbackAction:/최소|바쁜|바쁠|대체|가볍|부담/, recoveryRule:/복귀|놓치|실패|다시/, reviewCycle:/점검|검토|리뷰/,
  frequencyPerWeek:/횟수|빈도|주\s*\d+\s*회|\d+\s*번|매일|가볍|부담|줄여|줄이/,
  durationMinutes:/분|시간|가볍|부담|짧게|길게/, preferredDays:/요일|월요일|화요일|수요일|목요일|금요일|토요일|일요일|평일|주말/,
  title:/이름|행동|대신/,
  reviewEveryWeeks:/점검|리뷰|검토/,completionPercent:/실행률|실천율|완료율|달성률|성공률|%|퍼센트/,
  minimumAction:/최소|바쁜|바쁠|대체/,minimumMinutes:/최소|바쁜|바쁠|대체/,completionCriterion:/완료|마친|기준/,
}
const normalized = (s: string) => s.replace(/\s+/g,'').normalize('NFKC')
export function normalizeGoalNumbers(text: string) {
  const numbers:Record<string,number>={한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10,스물:20,서른:30,일:1,이:2,삼:3,사:4,오:5,육:6,칠:7,팔:8,구:9,십:10,이십:20,삼십:30}
  return text.replace(/일주일에|한\s*주에/g,'주 ').replace(/(다섯|여섯|일곱|여덟|아홉|스물|서른|이십|삼십|한|두|세|네|열|일|이|삼|사|오|육|칠|팔|구|십)\s*(주|회|번|분)/g,(_m,n,unit)=>`${numbers[n]}${unit}`)
}
export const goalEditSchema = { type:'array', minItems:1, maxItems:20, items:{type:'object',additionalProperties:false,required:['field','actionIndex','text','number','days','evidence'],properties:{
  field:{type:'string',enum:fields}, actionIndex:{type:'integer',minimum:-1,maximum:6}, text:{type:['string','null']}, number:{type:['integer','null']}, days:{anyOf:[{type:'array',items:{type:'integer',minimum:0,maximum:6}},{type:'null'}]}, evidence:{type:'string',minLength:1,maxLength:300},
}} }
function valueText(field: Field, value: unknown): string {
  if(field==='frequencyPerWeek')return `주 ${value}회`
  if(field==='durationMinutes')return `${value}분`
  if(field==='durationWeeks')return `${value}주`
  if(field==='reviewEveryWeeks')return `${value}주마다`
  if(field==='completionPercent')return `${value}%`
  if(field==='minimumMinutes')return `${value}분`
  if(field==='preferredDays')return (value as number[]).map(d=>['월','화','수','목','금','토','일'][d]).join('·')||'미정'
  return String(value||'미정')
}

export function reviseGoal(base: GoalCard, edits: GoalEdit[], message: string) {
  if(!Array.isArray(edits)||!edits.length||edits.length>20)throw Error('goal_edits_required')
  const card=structuredClone(base),changes:GoalChange[]=[],seen=new Set<string>()
  const namedActions=base.weeklyActions.flatMap((a,i)=>a.title.split(/[\s·:]+/).some(token=>token.length>=2&&!/\d/.test(token)&&!['하기','정리','기록','실천','시도'].includes(token)&&message.includes(token))?[i]:[])
  for(const edit of edits){
    if(!fields.includes(edit.field)||!edit.evidence?.trim()||!normalized(message).includes(normalized(edit.evidence)))throw Error('goal_edit_requires_exact_user_evidence')
    const numericEvidence=normalizeGoalNumbers(edit.evidence)
    if(!evidencePatterns[edit.field].test(numericEvidence))throw Error(`unrequested_goal_field:${edit.field}: 요청하지 않은 조건은 그대로 두세요.`)
    // A specific "횟수만" / "시간만" request cannot authorize related fields.
    if(/횟수만/.test(message)&&edit.field!=='frequencyPerWeek')throw Error('only_frequency_requested')
    if(/시간만/.test(message)&&!(/최소/.test(message)?edit.field==='minimumMinutes':edit.field==='durationMinutes'))throw Error('only_duration_requested')
    const guide=guideFields.has(edit.field)
    const action=actionFields.has(edit.field)||guide
    if((guide||edit.field==='reviewEveryWeeks'||edit.field==='completionPercent')&&!card.execution)throw Error('legacy_execution_details_missing: 기존 목표에는 구조화된 실행 기준이 없습니다. 전체 조건을 새로 제안한다고 단정하지 말고 설명하세요.')
    if(card.execution&&['reviewCycle','fallbackAction'].includes(edit.field))throw Error('use_structured_execution_edit: reviewEveryWeeks 또는 minimumAction/minimumMinutes를 사용하세요.')
    if(edit.field==='completionPercent'&&card.execution?.measurement!=='routine_completion')throw Error('custom_outcome_is_not_completion_rate')
    if(action ? !Number.isInteger(edit.actionIndex)||!card.weeklyActions[edit.actionIndex] : edit.actionIndex!==-1)throw Error('invalid_goal_action_index')
    if(action&&base.weeklyActions.length>1&&(namedActions.length?!namedActions.includes(edit.actionIndex):!/전체|모두|가볍|부담|모든|각각/.test(message)))throw Error('goal_action_not_requested: 변경할 행동을 명확히 확인하세요.')
    const key=`${edit.actionIndex}:${edit.field}`
    if(seen.has(key))throw Error('duplicate_goal_edit')
    seen.add(key)
    const numeric=['durationWeeks','frequencyPerWeek','durationMinutes','reviewEveryWeeks','completionPercent','minimumMinutes'].includes(edit.field)
    if(numeric ? edit.number===null||edit.text!==null||edit.days!==null : edit.field==='preferredDays' ? !Array.isArray(edit.days)||edit.number!==null||edit.text!==null : typeof edit.text!=='string'||edit.number!==null||edit.days!==null)throw Error('invalid_goal_edit_value')
    const object=(guide ? card.execution!.actions[edit.actionIndex] : action ? card.weeklyActions[edit.actionIndex] : ['reviewEveryWeeks','completionPercent'].includes(edit.field) ? card.execution : card) as unknown as Record<string,unknown>
    const before=object[edit.field],after=numeric?edit.number:edit.field==='preferredDays'?edit.days:edit.text
    if(numeric){
      const values=[...numericEvidence.matchAll(['durationWeeks','reviewEveryWeeks'].includes(edit.field)?/(\d+)\s*주/g:edit.field==='completionPercent'?/(\d+)\s*(?:%|퍼센트)/g:edit.field==='frequencyPerWeek'?/(\d+)\s*(?:회|번)/g:/(\d+)\s*분/g)].map(m=>Number(m[1]))
      if(values.length&&!values.includes(Number(after)))throw Error('goal_number_not_in_user_request')
      if(values.length>1&&/말고|아니라|대신|에서|→/.test(numericEvidence)&&Number(after)!==values.at(-1))throw Error('goal_number_uses_rejected_value')
      if(!values.length&&(!/가볍|부담|줄여|줄이|짧게|절반/.test(edit.evidence)||Number(after)>=Number(before)))throw Error('goal_number_needs_clear_request')
    }
    if(JSON.stringify(before)===JSON.stringify(after))continue
    const prefix=action?`${base.weeklyActions[edit.actionIndex].title} `:''
    changes.push({label:prefix+labels[edit.field],before:valueText(edit.field,before),after:valueText(edit.field,after)})
    object[edit.field]=after
  }
  if(!validGoalCard(card)||!card.durationWeeks||!card.outcome||!card.targetMetric)throw Error('invalid_revised_goal')
  if(!changes.length)throw Error('goal_edit_has_no_changes')
  // Clear count/title dependencies are proposed separately, never silently patched.
  let relatedCard=structuredClone(card)
  const relatedChanges:GoalChange[]=[]
  if(relatedCard.execution){
    if(relatedCard.execution.reviewEveryWeeks>relatedCard.durationWeeks){
      relatedChanges.push({label:'점검 간격',before:`${relatedCard.execution.reviewEveryWeeks}주마다`,after:`${relatedCard.durationWeeks}주마다`})
      relatedCard.execution.reviewEveryWeeks=relatedCard.durationWeeks
    }
    relatedCard=synchronizeExecution(relatedCard)
    const issue=executionIssue(relatedCard)
    if(issue)throw Error(issue)
    for(const field of ['targetMetric','reviewCycle','fallbackAction'] as const){
      if(card[field]!==relatedCard[field])relatedChanges.push({label:labels[field],before:card[field],after:relatedCard[field]})
    }
    if(edits.some(e=>e.field==='targetMetric')&&card.targetMetric!==relatedCard.targetMetric)throw Error('use_completionPercent: 실행률 목표는 completionPercent로 바꾸세요. 분모는 서버가 계산합니다.')
  }
  for(let attempt=0;attempt<6;attempt++){
    const issue=goalDraftIssue(relatedCard)
    if(!issue)break
    if(issue.startsWith('count_target_mismatch')||issue.startsWith('count_period_mismatch')){
      const field=issue.includes(':outcome:')?'outcome':'targetMetric'
      const total=relatedCard.durationWeeks*relatedCard.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek,0)
      const before=relatedCard[field]
      relatedCard[field]=issue.startsWith('count_period_mismatch')?before.replace(/\d+(\s*주)/,(_match,suffix)=>`${relatedCard.durationWeeks}${suffix}`):before.replace(/(\d+\s*주\s*(?:간|동안)?\s*(?:총\s*)?(?:최소\s*)?)\d+(\s*회)/,(_match,prefix,suffix)=>`${prefix}${total}${suffix}`)
      const existing=relatedChanges.find(c=>c.label===labels[field])
      if(existing)existing.after=relatedCard[field]
      else relatedChanges.push({label:labels[field],before,after:relatedCard[field]})
    }else if(issue.startsWith('action_title_')){
      relatedCard.weeklyActions.forEach((a,i)=>{
        const before=a.title
        const duration=a.title.match(/(\d+)\s*분/)
        if(duration&&Number(duration[1])!==a.durationMinutes)a.title=a.title.replace(/\d+\s*분/,`${a.durationMinutes}분`)
        if(a.frequencyPerWeek!==7)a.title=a.title.replace(/매일|하루\s*\d+\s*(?:번|회)/g,'').trim()
        if(before!==a.title)relatedChanges.push({label:`행동 ${i+1} 이름`,before,after:a.title})
      })
    }else throw Error(issue)
  }
  if(goalDraftIssue(relatedCard))throw Error('related_goal_conditions_need_clarification')
  // A single action can have an exact time/frequency repeated in its headline.
  // Keep the user's requested card unchanged; synchronize only the related offer.
  if(relatedCard.weeklyActions.length===1){
    const a=relatedCard.weeklyActions[0],before=relatedCard.outcome
    relatedCard.outcome=before
      .replace(/(?:매주|주당|일주일에|주)\s*\d+\s*(?:회|번)/g,`주 ${a.frequencyPerWeek}회`)
      .replace(/\d+\s*분/g,`${a.durationMinutes}분`)
      .replace(/\d+\s*주\s*(?:동안|간)/g,`${relatedCard.durationWeeks}주 동안`)
    if(a.frequencyPerWeek!==7)relatedCard.outcome=relatedCard.outcome.replace(/매일/g,`주 ${a.frequencyPerWeek}회`)
    // Do not propose merely stylistic rewrites of otherwise matching text.
    const mentionsMismatch=[...before.matchAll(/(?:매주|주당|일주일에|주)\s*(\d+)\s*(?:회|번)/g)].some(m=>Number(m[1])!==a.frequencyPerWeek)||
      [...before.matchAll(/(\d+)\s*분/g)].some(m=>Number(m[1])!==a.durationMinutes)||
      [...before.matchAll(/(\d+)\s*주\s*(?:동안|간)/g)].some(m=>Number(m[1])!==relatedCard.durationWeeks)||
      /매일/.test(before)&&a.frequencyPerWeek!==7
    if(!mentionsMismatch)relatedCard.outcome=before
    else {
      const existing=relatedChanges.find(c=>c.label===labels.outcome)
      if(existing)existing.after=relatedCard.outcome
      else relatedChanges.push({label:labels.outcome,before:card.outcome,after:relatedCard.outcome})
    }
  }
  const related:GoalDraft['related']=relatedChanges.length?{card:relatedCard,changes:relatedChanges,reason:'요청한 항목만 바꾸면 기존 숫자·표현과 맞지 않아요. 아래 조건도 함께 바꿀지는 따로 확인할게요.'}:undefined
  return {card,changes,related}
}

export const relatedApproval = '관련 조건도 함께 조정할게요'
export function draftChoices(draft: GoalDraft) { return draft.related ? [relatedApproval,'기존 조건을 유지하는 다른 방법을 제안해줘'] : ['이 초안으로 시작할게요','조금 더 가볍게 바꿔줘'] }
export const weeklyMinutes = (card:GoalCard) => card.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek*a.durationMinutes,0)
export function draftMessage(draft: GoalDraft) {
  const diff=(changes:GoalChange[])=>changes.map(c=>`- **${c.label}**: ${c.before} → **${c.after}**`).join('\n')
  return [
    draft.changes?.length ? `요청하신 부분을 바꾼 **수정 초안**이에요. 아직 확정하지 않았어요.\n\n**${draft.baseLabel||'직전 계획'} 대비 변경**\n\n${diff(draft.changes)}\n\n여기에 없는 기간·결과 기준·다른 행동은 그대로 유지했어요.` : '',
    `**기본 실행량**: 주 ${weeklyMinutes(draft.card)}분 · ${draft.card.durationWeeks}주 시험`,
    draft.card.execution ? '**바쁜 날 최소 실행**\n\n'+draft.card.execution.actions.map((a,i)=>`- **${draft.card.weeklyActions[i].title}**: ${a.minimumAction} · ${a.minimumMinutes}분`).join('\n') : draft.card.fallbackAction?`**바쁜 날 최소 실행**: ${draft.card.fallbackAction}`:'',
    ...(draft.notes||[]),
    draft.related ? `**함께 확인할 조건**\n\n${draft.related.reason}\n\n${diff(draft.related.changes)}\n\n**이 관련 조건도 함께 조정할까요?**` : '**이 초안으로 시작할까요? 바꾸고 싶은 부분만 말씀해 주세요.**',
  ].filter(Boolean).join('\n\n')
}
