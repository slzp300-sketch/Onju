import type { GoalCard } from './goal.ts'
import { scheduleOpenings, type ScheduleBlock } from './state.ts'
import type { DayBound } from './policy.ts'
import { weeklyMinutes } from './goalRevision.ts'
import { isKoreanAgentLocale } from './promptLanguage.ts'

// Product starting defaults, NOT research-backed optimums or prescribed limits.
export function effortPolicy(messages: string[], bounds:DayBound[], blocks:ScheduleBlock[], locale = 'ko-KR') {
  let daily:number|undefined,weekly:number|undefined,session:number|undefined,frequency:number|undefined
  for(const text of messages){
    // Do not interpret a negated time as consent/capacity.
    if(/아니|못\s*해|불가능|취소|\b(?:cannot|can't|not\s+possible|cancel|do\s+not)\b/i.test(text))continue
    const amount=(match:RegExpMatchArray|null)=>match ? Number(match[1])*(/시간|hours?/i.test(match[2])?60:1):undefined
    const firstAmount=(patterns:RegExp[])=>patterns.map(pattern=>amount(text.match(pattern))).find(value=>value!==undefined)
    daily=firstAmount([
      /(?:하루|매일|일일)\s*(?:에|는|최대|총|약|딱)?\s*(\d+)\s*(분|시간)/,
      /\b(?:per\s+day|daily|each\s+day)\s*(?:maximum|total|about|only)?\s*(\d+)\s*(minutes?|hours?)/i,
      /\b(\d+)\s*(minutes?|hours?)\s*(?:per|a|each)\s*day\b/i,
    ])??daily
    weekly=firstAmount([
      /(?:주당|일주일에|한\s*주에|주\s*최대)\s*(?:최대|총|약|딱)?\s*(\d+)\s*(분|시간)/,
      /\b(?:per\s+week|weekly|each\s+week)\s*(?:maximum|total|about|only)?\s*(\d+)\s*(minutes?|hours?)/i,
      /\b(\d+)\s*(minutes?|hours?)\s*(?:per|a|each)\s*week\b/i,
    ])??weekly
    session=firstAmount([
      /(?:한\s*번에|회당)\s*(?:최대|약|딱)?\s*(\d+)\s*(분|시간)/,
      /\b(?:per\s+session|each\s+session|at\s+a\s+time)\s*(?:maximum|about|only)?\s*(\d+)\s*(minutes?|hours?)/i,
      /\b(\d+)\s*(minutes?|hours?)\s*(?:per|each)\s*session\b/i,
    ])??session
    if(/목표|독서|운동|공부|학습|실천|루틴|\b(?:goal|read|workout|exercise|study|learn|practice|routine)\b/i.test(text)){
      const weeklyFrequency=text.match(/주\s*(\d+)\s*회|\b(\d+)\s*(?:times?|sessions?)\s*(?:a|per)\s*week\b/i)
      if(weeklyFrequency)frequency=Number(weeklyFrequency[1])
      if(weeklyFrequency)frequency=Number(weeklyFrequency[1]??weeklyFrequency[2])
      if(/매일\s*\d+\s*(분|시간)|\b(?:daily|every\s+day)\b[^.!?\n]{0,20}\d+\s*(?:minutes?|hours?)/i.test(text))frequency=7
      const explicit=text.match(/주\s*(\d+)\s*회[^.!?\n]{0,20}?(\d+)\s*분|\b(\d+)\s*(?:times?|sessions?)\s*(?:a|per)\s*week[^.!?\n]{0,24}?(\d+)\s*minutes?/i)
      if(explicit){frequency=Number(explicit[1]??explicit[3]);session=Number(explicit[2]??explicit[4])}
    }
  }
  const days=scheduleOpenings(bounds,blocks)
  const known=days.filter(d=>d.status==='등록된 일정 기준')
  const length=(start:string,end:string)=>Number(end.slice(0,2))*60+Number(end.slice(3))-Number(start.slice(0,2))*60-Number(start.slice(3))
  const capacity=known.reduce((total,d)=>total+Math.min(daily??Infinity,d.slots.reduce((sum,s)=>sum+length(s.start,s.end),0)),0)
  const dailyCapacities=days.map(d=>d.status==='등록된 일정 기준'?Math.min(daily??Infinity,d.slots.reduce((sum,s)=>sum+length(s.start,s.end),0)):known.length?0:daily??90)
  const longest=Math.max(0,...known.flatMap(d=>d.slots.map(s=>length(s.start,s.end))))
  const explicit=weekly!==undefined||daily!==undefined||session!==undefined
  const korean=isKoreanAgentLocale(locale)
  return { perSession:Math.min(session??15,daily??Infinity,longest||Infinity),frequency:frequency??3,weekly:Math.min(weekly??(session?session*(frequency??3):90),daily!==undefined?daily*(known.length||7):Infinity,known.length?capacity:Infinity),
    defaultStart:!explicit,knownDays:known.length,capacity:known.length?capacity:null,dailyCapacities,
    note:korean
      ? known.length===7?'등록된 일정 기준으로 비교했어요. 이동·휴식에 따라 실제 여유는 달라질 수 있어요.':known.length?'확인된 요일의 빈 시간만 기준으로 봤어요. 미정인 요일은 여유 시간에 포함하지 않았어요.':'생활 리듬이 미정이라 일정에 들어갈지는 아직 확인하지 않았어요.'
      : known.length===7?'I compared this with the schedule entered so far. Travel and rest may reduce the actual capacity.':known.length?'I used only the open time on confirmed days. Unspecified days were not counted as available.':'Your daily rhythm is not set yet, so I have not confirmed where this fits in the schedule.',
  }
}
// Capacity feasibility only: actual clock-time placement remains the next stage.
// A bounded search returns unknown rather than claiming feasibility on timeout.
export function fitsDailyCapacity(card:GoalCard, capacities:number[]):boolean|null {
  const sessions=card.weeklyActions.flatMap((a,index)=>Array.from({length:a.frequencyPerWeek},()=>({index,minutes:a.durationMinutes,days:a.preferredDays}))).sort((a,b)=>b.minutes-a.minutes)
  const left=[...capacities],used=card.weeklyActions.map(()=>0)
  let visits=0
  function place(index:number):boolean|null {
    if(index===sessions.length)return true
    if(++visits>20000)return null
    const task=sessions[index],seen=new Set<string>()
    for(let day=0;day<7;day++){
      if(left[day]<task.minutes||(used[task.index]&(1<<day))||(task.days.length&&!task.days.includes(day)))continue
      // Only merge equivalent days when no action has a weekday preference.
      const key=`${left[day]}:${used.map(mask=>(mask>>day)&1).join('')}`
      if(card.weeklyActions.every(a=>!a.preferredDays.length)&&seen.has(key))continue
      seen.add(key);left[day]-=task.minutes;used[task.index]|=1<<day
      const result=place(index+1)
      left[day]+=task.minutes;used[task.index]&=~(1<<day)
      if(result!==false)return result
    }
    return false
  }
  return place(0)
}
export function effortIssue(card:GoalCard, policy:ReturnType<typeof effortPolicy>) {
  if(card.weeklyActions.some(a=>a.durationMinutes>policy.perSession))return `lighter_draft_needed: 한 번 ${policy.perSession}분 이내로 제안하세요.`
  if(card.weeklyActions.some(a=>a.frequencyPerWeek>policy.frequency))return `lighter_draft_needed: 행동별 주 ${policy.frequency}회 이내로 시작하세요.`
  if(policy.weekly>0&&weeklyMinutes(card)>policy.weekly)return `lighter_draft_needed: 모든 행동을 합해 주 ${policy.weekly}분 이내로 줄이세요.`
  if(policy.weekly>0&&fitsDailyCapacity(card,policy.dailyCapacities)===false)return 'daily_capacity_exceeded: 주간 합계만 맞추지 말고 하루 한도에 나눠 실행 가능하도록 회당 시간/횟수를 더 줄이세요. 예: 하루 10분이면 8분 행동 6개는 5일에 들어가지 않습니다.'
  if(!card.fallbackAction.trim())return 'fallback_needed: 바쁜 날 1~2분으로 할 수 있는 구체적인 최소 실행을 fallbackAction에 적으세요.'
  return null
}
