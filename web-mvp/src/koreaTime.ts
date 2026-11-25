import { DEFAULT_REGIONAL_CONTEXT, regionalDateKey, regionalTodayLabel } from './regionalContext'

export const ONJU_TIME_ZONE = DEFAULT_REGIONAL_CONTEXT.timeZone

export function koreaTodayLabel(date = new Date()) {
  return regionalTodayLabel(DEFAULT_REGIONAL_CONTEXT, date)
}

export function koreaWeekKey(date = new Date()) {
  return regionalDateKey(DEFAULT_REGIONAL_CONTEXT, date)
}
