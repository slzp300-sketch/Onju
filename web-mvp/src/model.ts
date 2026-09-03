export type Profile = { goal: string; reason: string; obstacle: string; availableTime: string; checkinTime: string }
export type PlanItem = { id: string; day: string; dayIndex?: number; start?: string; end?: string; title: string; tinyStart?: string; fallback: string; rationale?: string }
export type OnjuState = { profile: Profile; plan: PlanItem[]; approved: boolean }
export const emptyProfile: Profile = { goal: '', reason: '', obstacle: '', availableTime: '', checkinTime: '' }
const key = 'onju-web-alpha'
export function loadState(): OnjuState { try { const saved=localStorage.getItem(key); if(saved) return JSON.parse(saved) as OnjuState } catch { /* 새 상태 */ } return {profile:emptyProfile,plan:[],approved:false} }
export function saveState(state: OnjuState) { localStorage.setItem(key,JSON.stringify(state)) }
export function makePlan(profile: Profile): PlanItem[] { const minutes=profile.availableTime.match(/\d+/)?.[0]??'10'; const action=profile.goal.trim()||'내가 바꾸고 싶은 일 시작하기'; const short=action.length>24?`${action.slice(0,24)}…`:action; return ['월','화','수','목','금','토','일'].map((day,index)=>({id:`${Date.now()}-${index}`,day,title:index===2?'의도적으로 쉬고 상태만 확인하기':`${short} · ${minutes}분`,fallback:index===2?'쉬는 날도 계획의 일부예요':'여유가 없으면 2분만 시작해도 완료'})) }
