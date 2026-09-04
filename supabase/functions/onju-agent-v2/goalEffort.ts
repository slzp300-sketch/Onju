import type { GoalCard } from './goal.ts'
import { scheduleOpenings, type ScheduleBlock } from './state.ts'
import type { DayBound } from './policy.ts'
import { weeklyMinutes } from './goalRevision.ts'

// Product starting defaults, NOT research-backed optimums or prescribed limits.
export function effortPolicy(messages: string[], bounds:DayBound[], blocks:ScheduleBlock[]) {
  let daily:number|undefined,weekly:number|undefined,session:number|undefined,frequency:number|undefined
  for(const text of messages){
    // Do not interpret a negated time as consent/capacity.
    if(/아니|못\s*해|불가능|취소/.test(text))continue
    const amount=(match:RegExpMatchArray|null)=>match ? Number(match[1])*(match[2]==='시간'?60:1):undefined
    daily=amount(text.match(/(?:하루|매일|일일)\s*(?:에|는|최대|총|약|딱)?\s*(\d+)\s*(분|시간)/))??daily
    weekly=amount(text.match(/(?:주당|일주일에|한\s*주에|주\s*최대)\s*(?:최대|총|약|딱)?\s*(\d+)\s*(분|시간)/))??weekly
    session=amount(text.match(/(?:한\s*번에|회당)\s*(?:최대|약|딱)?\s*(\d+)\s*(분|시간)/))??session
    if(/목표|독서|운동|공부|학습|실천|루틴/.test(text)){
      const weeklyFrequency=text.match(/주\s*(\d+)\s*회/)
      if(weeklyFrequency)frequency=Number(weeklyFrequency[1])
      if(/매일\s*\d+\s*(분|시간)/.test(text))frequency=7
      const explicit=text.match(/주\s*(\d+)\s*회[^.!?\n]{0,20}?(\d+)\s*분/)
      if(explicit){frequency=Number(explicit[1]);session=Number(explicit[2])}
    }
  }
  const days=scheduleOpenings(bounds,blocks)
  const known=days.filter(d=>d.status==='등록된 일정 기준')
  const length=(start:string,end:string)=>Number(end.slice(0,2))*60+Number(end.slice(3))-Number(start.slice(0,2))*60-Number(start.slice(3))
  const capacity=known.reduce((total,d)=>total+Math.min(daily??Infinity,d.slots.reduce((sum,s)=>sum+length(s.start,s.end),0)),0)
  const dailyCapacities=days.map(d=>d.status==='등록된 일정 기준'?Math.min(daily??Infinity,d.slots.reduce((sum,s)=>sum+length(s.start,s.end),0)):known.length?0:daily??90)
  const longest=Math.max(0,...known.flatMap(d=>d.slots.map(s=>length(s.start,s.end))))
  const explicit=weekly!==undefined||daily!==undefined||session!==undefined
  return { perSession:Math.min(session??15,daily??Infinity,longest||Infinity),frequency:frequency??3,weekly:Math.min(weekly??(session?session*(frequency??3):90),daily!==undefined?daily*(known.length||7):Infinity,known.length?capacity:Infinity),
    defaultStart:!explicit,knownDays:known.length,capacity:known.length?capacity:null,dailyCapacities,
    note:known.length===7?'등록된 일정 기준으로 비교했어요. 이동·휴식에 따라 실제 여유는 달라질 수 있어요.':known.length?'확인된 요일의 빈 시간만 기준으로 봤어요. 미정인 요일은 여유 시간에 포함하지 않았어요.':'생활 리듬이 미정이라 시간표에 들어갈지는 아직 확인하지 않았어요.',
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
