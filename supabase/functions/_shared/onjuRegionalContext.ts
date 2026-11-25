export type UserRegionalContext = {
  locale: string
  countryCode: string
  timeZone: string
  currencyCode: string
  weekStartsOn: 0 | 1
}

export const defaultRegionalContext: UserRegionalContext = {
  locale: 'ko-KR',
  countryCode: 'KR',
  timeZone: 'Asia/Seoul',
  currencyCode: 'KRW',
  weekStartsOn: 1,
}

const validTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 80) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

const validLocale = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{2,35}$/.test(value)) return false
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

export function cleanRegionalContext(value: unknown, fallback: UserRegionalContext = defaultRegionalContext): UserRegionalContext {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const locale = validLocale(input.locale) ? Intl.getCanonicalLocales(input.locale)[0] : fallback.locale
  const countryCode = typeof input.countryCode === 'string' && /^[A-Z]{2}$/.test(input.countryCode) ? input.countryCode : fallback.countryCode
  const currencyCode = typeof input.currencyCode === 'string' && /^[A-Z]{3}$/.test(input.currencyCode) ? input.currencyCode : fallback.currencyCode
  const timeZone = validTimeZone(input.timeZone) ? input.timeZone : fallback.timeZone
  const weekStartsOn = input.weekStartsOn === 0 || input.weekStartsOn === 1 ? input.weekStartsOn : fallback.weekStartsOn
  return { locale, countryCode, timeZone, currencyCode, weekStartsOn }
}

export function regionalContextFromRow(row: Record<string, unknown> | null | undefined) {
  return cleanRegionalContext({
    locale: row?.locale,
    countryCode: row?.country_code,
    timeZone: row?.time_zone,
    currencyCode: row?.currency_code,
    weekStartsOn: row?.week_starts_on,
  })
}

export function regionalColumns(context: UserRegionalContext) {
  return {
    locale: context.locale,
    country_code: context.countryCode,
    time_zone: context.timeZone,
    currency_code: context.currencyCode,
    week_starts_on: context.weekStartsOn,
  }
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

export function regionalNowLabel(context: UserRegionalContext, date = new Date()) {
  return new Intl.DateTimeFormat(context.locale, {
    timeZone: context.timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date)
}

