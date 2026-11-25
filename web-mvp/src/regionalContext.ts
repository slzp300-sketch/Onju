export type WeekStart = 0 | 1

export type UserRegionalContext = {
  locale: string
  countryCode: string
  timeZone: string
  currencyCode: string
  weekStartsOn: WeekStart
}

export const DEFAULT_REGIONAL_CONTEXT: UserRegionalContext = {
  locale: 'ko-KR',
  countryCode: 'KR',
  timeZone: 'Asia/Seoul',
  currencyCode: 'KRW',
  weekStartsOn: 1,
}

const storageKey = 'onju-regional-context-v1'
export const REGIONAL_SETTINGS_KEY = 'onju-regional-settings-v2'
export const REGIONAL_CHANGE_EVENT = 'onju:regional-change'
const localePattern = /^[A-Za-z0-9-]{2,35}$/
const countryPattern = /^[A-Z]{2}$/
const currencyPattern = /^[A-Z]{3}$/

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function validLocale(value: unknown): value is string {
  if (typeof value !== 'string' || !localePattern.test(value)) return false
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

export function normalizeRegionalContext(
  value: Partial<UserRegionalContext> | null | undefined,
  fallback: UserRegionalContext = DEFAULT_REGIONAL_CONTEXT,
): UserRegionalContext {
  const locale = validLocale(value?.locale) ? Intl.getCanonicalLocales(value.locale)[0] : fallback.locale
  const countryCode = countryPattern.test(value?.countryCode ?? '') ? String(value?.countryCode) : fallback.countryCode
  const currencyCode = currencyPattern.test(value?.currencyCode ?? '') ? String(value?.currencyCode) : fallback.currencyCode
  const timeZone = validTimeZone(value?.timeZone) ? value.timeZone : fallback.timeZone
  const weekStartsOn = value?.weekStartsOn === 0 || value?.weekStartsOn === 1 ? value.weekStartsOn : fallback.weekStartsOn
  return { locale, countryCode, timeZone, currencyCode, weekStartsOn }
}

export function detectedDefaults(): UserRegionalContext {
  if (typeof navigator === 'undefined') return DEFAULT_REGIONAL_CONTEXT
  const locale = validLocale(navigator.language) ? Intl.getCanonicalLocales(navigator.language)[0] : DEFAULT_REGIONAL_CONTEXT.locale
  const timeZone = validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC'
  return {
    locale: locale.startsWith('ko') ? 'ko-KR' : locale.startsWith('en') ? locale : 'en-US',
    // Language and time zone are preferences, not evidence of residence.
    countryCode: 'ZZ',
    timeZone,
    currencyCode: 'XXX',
    weekStartsOn: 1,
  }
}

export function loadRegionalContext(): UserRegionalContext {
  const detected = detectedDefaults()
  if (typeof localStorage === 'undefined') return detected
  try {
    const saved = localStorage.getItem(REGIONAL_SETTINGS_KEY) ?? localStorage.getItem(storageKey)
    return saved ? normalizeRegionalContext(JSON.parse(saved), detected) : detected
  } catch {
    return detected
  }
}

export function saveRegionalContext(value: UserRegionalContext) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(REGIONAL_SETTINGS_KEY, JSON.stringify(normalizeRegionalContext(value)))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REGIONAL_CHANGE_EVENT))
}

// These indices are display positions only. Stored dayIndex stays Monday=0.
export function orderedWeekdayIndices(context: Pick<UserRegionalContext, 'weekStartsOn'>) {
  return context.weekStartsOn === 0 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]
}

export function calendarDateLabel(context: UserRegionalContext, dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  const date = new Date(`${dateKey}T12:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) return dateKey
  // A recorded calendar date is not an instant: never shift it when travelling.
  return new Intl.DateTimeFormat(context.locale, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

export function regionalWeekRange(context: UserRegionalContext, instant = new Date()) {
  const localDate = regionalDateKey(context, instant)
  const cursor = new Date(`${localDate}T12:00:00Z`)
  cursor.setUTCDate(cursor.getUTCDate() - (cursor.getUTCDay() - context.weekStartsOn + 7) % 7)
  const start = cursor.toISOString().slice(0, 10)
  cursor.setUTCDate(cursor.getUTCDate() + 6)
  return { start, end: cursor.toISOString().slice(0, 10) }
}

/** Order a weekly plan without mutating it or reordering dated/progressive weeks. */
export function orderWeeklyItems<T extends { dayIndex?: number; day?: string; weekStart?: string; weekIndex?: number }>(items: T[], context: UserRegionalContext): T[] {
  const indices = orderedWeekdayIndices(context)
  const legacyDays = ['월', '화', '수', '목', '금', '토', '일']
  const englishDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const dayIndex = (item: T) => item.dayIndex ?? legacyDays.indexOf(item.day?.replace('요일', '') ?? '')
  const rank = (item: T) => {
    const index = dayIndex(item) >= 0 ? dayIndex(item) : englishDays.indexOf(item.day?.slice(0, 3).toLowerCase() ?? '')
    return index >= 0 ? indices.indexOf(index) : 7
  }
  return [...items].sort((a, b) => (a.weekStart ?? '').localeCompare(b.weekStart ?? '') || (a.weekIndex ?? 0) - (b.weekIndex ?? 0) || rank(a) - rank(b))
}

export function regionalDateKey(context: UserRegionalContext, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: context.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function regionalTodayLabel(context: UserRegionalContext, date = new Date()) {
  return new Intl.DateTimeFormat(context.locale, {
    timeZone: context.timeZone,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

export function regionalTimeZoneLabel(context: UserRegionalContext, date = new Date()) {
  if (context.locale === 'ko-KR' && context.timeZone === 'Asia/Seoul') return '한국시간(KST)'
  const part = new Intl.DateTimeFormat(context.locale, {
    timeZone: context.timeZone,
    timeZoneName: 'short',
  }).formatToParts(date).find(item => item.type === 'timeZoneName')?.value
  return context.locale.startsWith('ko') ? `현지시간(${part || context.timeZone})` : `Local time (${part || context.timeZone})`
}
