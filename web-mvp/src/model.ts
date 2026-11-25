import { getAgentSessionId, readSessionLocalState, writeSessionLocalState } from './agentSession.ts'
import { loadRegionalContext, type UserRegionalContext } from './regionalContext'
import { translator, weekdayLabels } from './i18n'

export type Profile = { goal: string; reason: string; obstacle: string; availableTime: string; checkinTime: string }
export type PlanItem = { id: string; day: string; dayIndex?: number; start?: string; end?: string; title: string; tinyStart?: string; fallback: string; rationale?: string }
export type OnjuState = { profile: Profile; plan: PlanItem[]; approved: boolean; regionalContext: UserRegionalContext }
export const emptyProfile: Profile = { goal: '', reason: '', obstacle: '', availableTime: '', checkinTime: '' }
const key = 'onju-web-alpha'
let stateSessionId = ''
export function loadState(): OnjuState {
  stateSessionId = getAgentSessionId()
  const regionalContext = loadRegionalContext()
  try {
    const saved = readSessionLocalState(key, stateSessionId)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<OnjuState>
      return {
        profile: parsed.profile ?? emptyProfile,
        plan: parsed.plan ?? [],
        approved: parsed.approved === true,
        regionalContext,
      }
    }
  } catch { /* 새 상태 */ }
  return { profile: emptyProfile, plan: [], approved: false, regionalContext }
}
export function saveState(state: OnjuState) { writeSessionLocalState(key, stateSessionId,JSON.stringify(state)) }
export function makePlan(profile: Profile, regionalContext = loadRegionalContext()): PlanItem[] {
  const t = translator(regionalContext)
  const minutes = profile.availableTime.match(/\d+/)?.[0] ?? '10'
  const action = profile.goal.trim() || t('model.defaultAction')
  const short = action.length > 24 ? `${action.slice(0, 24)}…` : action
  return weekdayLabels(regionalContext).map((day, index) => ({
    id: `${Date.now()}-${index}`,
    day,
    dayIndex: index,
    title: index === 2 ? t('model.restTitle') : `${short} · ${t('model.minutes', { value: minutes })}`,
    fallback: index === 2 ? t('model.restFallback') : t('model.actionFallback'),
  }))
}
