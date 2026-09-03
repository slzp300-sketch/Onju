export const ONJU_TIME_ZONE = 'Asia/Seoul'

export function koreaTodayLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: ONJU_TIME_ZONE,
    month: 'long', day: 'numeric', weekday: 'short',
  }).format(date)
}

export function koreaWeekKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ONJU_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}
