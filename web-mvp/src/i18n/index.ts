import type { UserRegionalContext } from '../regionalContext'
import { enUS } from './catalog.en-US'
import { koKR, type MessageKey } from './catalog.ko-KR'

export type UiLocale = 'ko-KR' | 'en-US'
export type TranslationValues = Record<string, string | number>

const catalogs: Record<UiLocale, Record<MessageKey, string>> = {
  'ko-KR': koKR,
  'en-US': enUS,
}

export function uiLocale(value: UserRegionalContext | string): UiLocale {
  const locale = typeof value === 'string' ? value : value.locale
  return locale.toLowerCase().startsWith('ko') ? 'ko-KR' : 'en-US'
}

export function translate(
  locale: UserRegionalContext | string,
  key: MessageKey,
  values: TranslationValues = {},
) {
  return catalogs[uiLocale(locale)][key].replace(/\{([a-zA-Z]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  )
}

export function translator(locale: UserRegionalContext | string) {
  return (key: MessageKey, values?: TranslationValues) => translate(locale, key, values)
}

export function weekdayLabels(locale: UserRegionalContext | string, width: 'short' | 'long' = 'short') {
  const selected = uiLocale(locale)
  if (selected === 'ko-KR') return width === 'short'
    ? ['월', '화', '수', '목', '금', '토', '일']
    : ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
  return width === 'short'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
}

export function goalCategoryLabel(locale: UserRegionalContext | string, category: string) {
  const t = translator(locale)
  const keys: Record<string, MessageKey> = {
    '일·커리어': 'goal.category.work',
    '자기계발·공부': 'goal.category.learning',
    '건강·운동': 'goal.category.health',
    '신앙': 'goal.category.faith',
    '생활관리': 'goal.category.life',
    '관계·가족': 'goal.category.relationships',
    '취미·창작': 'goal.category.creative',
    '기타': 'goal.category.other',
  }
  return keys[category] ? t(keys[category]) : category
}

export function applyDocumentLocale(context: UserRegionalContext) {
  if (typeof document === 'undefined') return
  const t = translator(context)
  document.documentElement.lang = context.locale
  document.title = t('app.title')
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (description) description.content = t('app.description')
}
