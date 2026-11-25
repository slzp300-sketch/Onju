import { useState } from 'react'
import { Link } from 'react-router-dom'
import { calendarDateLabel, normalizeRegionalContext, regionalWeekRange, saveRegionalContext, validTimeZone } from './regionalContext'
import { useRegionalContext, useRegionalDate } from './useRegionalContext'
import './regionalSettings.css'

const countries = [
  ['ZZ', '아직 선택하지 않음', 'Not specified', 'XXX'], ['KR', '대한민국', 'South Korea', 'KRW'],
  ['US', '미국', 'United States', 'USD'], ['GB', '영국', 'United Kingdom', 'GBP'],
  ['CA', '캐나다', 'Canada', 'CAD'], ['AU', '호주', 'Australia', 'AUD'],
]
const zones = ['Asia/Seoul', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Australia/Sydney', 'Australia/Perth', 'UTC']

export function RegionalSettingsLink({compact=false}:{compact?:boolean}) {
  const [context] = useRegionalContext()
  const ko=context.locale.startsWith('ko')
  return <Link to="/settings" className="regional-settings-link" aria-label={ko?'언어·지역 설정':'Language & region'}>{compact?(ko?'설정':'Settings'):(ko?'언어·지역 설정':'Language & region')}</Link>
}

export default function RegionalSettings() {
  const [context] = useRegionalContext()
  useRegionalDate(context)
  const range = regionalWeekRange(context)
  const [editing, setEditing] = useState({ source: JSON.stringify(context), value: context, dirty: false })
  const source = JSON.stringify(context)
  const externalChange = editing.dirty && editing.source !== source
  const draft = editing.dirty ? editing.value : context
  const setDraft = (value: typeof context) => setEditing({ source: editing.dirty ? editing.source : source, value, dirty: true })
  const [status, setStatus] = useState<'saved' | 'invalid' | 'failed' | ''>('')
  const ko = context.locale.startsWith('ko')
  const label = (kr: string, en: string) => ko ? kr : en
  return <main className="regional-settings">
    <Link to="/" className="text-link">{label('홈으로', 'Home')}</Link>
    <h1>{label('언어·지역 설정', 'Language & region')}</h1>
    <p>{label('화면 언어와 생활 시간대를 따로 정할 수 있어요. 기존 대화·계획·기록은 바뀌지 않습니다.', 'Choose your display language and local time independently. Existing conversations, plans and dated records stay unchanged.')}</p>
    <p>{label('현재 설정의 이번 주', 'This week with current settings')}: {calendarDateLabel(context, range.start)} – {calendarDateLabel(context, range.end)}</p>
    <form onSubmit={event => {
      event.preventDefault()
      if (externalChange) return
      if (!validTimeZone(draft.timeZone)) { setStatus('invalid'); return }
      try { saveRegionalContext(normalizeRegionalContext(draft)); setEditing({ source: JSON.stringify(draft), value: draft, dirty: false }); setStatus('saved') } catch { setStatus('failed') }
    }}>
      <label>{label('화면 언어', 'Display language')}
        <select value={draft.locale} onChange={event => { setDraft({ ...draft, locale: event.target.value }); setStatus('') }}>
          {[['ko-KR', '한국어'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-CA', 'English (Canada)'], ['en-AU', 'English (Australia)']].map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          {!['ko-KR', 'en-US', 'en-GB', 'en-CA', 'en-AU'].includes(draft.locale) && <option value={draft.locale}>{draft.locale}</option>}
        </select>
      </label>
      <label>{label('국가 (선택 사항)', 'Country (optional)')}
        <select value={draft.countryCode} onChange={event => { const country = countries.find(item => item[0] === event.target.value)!; setDraft({ ...draft, countryCode: country[0], currencyCode: country[3] }); setStatus('') }}>
          {countries.map(([value, kr, en]) => <option key={value} value={value}>{label(kr, en)}</option>)}
          {!countries.some(item => item[0] === draft.countryCode) && <option value={draft.countryCode}>{draft.countryCode}</option>}
        </select>
      </label>
      <label>{label('생활 시간대', 'Time zone')}
        <input list="regional-timezones" value={draft.timeZone} onChange={event => { setDraft({ ...draft, timeZone: event.target.value.trim() }); setStatus('') }} aria-describedby="timezone-help" />
        <datalist id="regional-timezones">{[...new Set([...zones, context.timeZone])].map(zone => <option key={zone} value={zone} />)}</datalist>
      </label>
      <p id="timezone-help">{label('목록에서 고르거나 IANA 시간대 이름을 입력해 주세요. 예: America/Los_Angeles. 알림의 시각은 그대로 유지됩니다.', 'Choose a time zone or enter an IANA name, e.g. America/Los_Angeles. Reminder clock times stay unchanged.')}</p>
      <label>{label('주 시작일', 'Week starts on')}
        <select value={draft.weekStartsOn} onChange={event => { setDraft({ ...draft, weekStartsOn: Number(event.target.value) as 0 | 1 }); setStatus('') }}>
          <option value={1}>{label('월요일', 'Monday')}</option><option value={0}>{label('일요일', 'Sunday')}</option>
        </select>
      </label>
      <p>{label('이 브라우저에 저장되며 다음 요청부터 적용됩니다. 국가·언어 선택은 거주지 확인이나 해외 결제 지원을 의미하지 않아요.', 'Saved in this browser and used for subsequent requests. Country and language choices do not verify residence or enable international payments.')}</p>
      {externalChange && <p role="alert">{label('다른 화면에서 설정이 바뀌었어요. 입력 중인 내용은 보존했습니다. 최신 설정을 확인한 뒤 다시 저장해 주세요.', 'Settings changed in another tab. Your unsaved input is kept. Review the latest settings before saving.')} <button type="button" onClick={() => { setEditing({ source, value: context, dirty: false }); setStatus('') }}>{label('최신 설정 불러오기', 'Load latest settings')}</button></p>}
      <button className="button" type="submit" disabled={externalChange}>{label('설정 저장', 'Save settings')}</button>
      <p role="status">{status === 'saved' ? label('저장했어요. 다음 대화부터 이 설정을 사용합니다.', 'Saved. Subsequent requests use these settings.') : status === 'invalid' ? label('올바른 시간대를 골라 주세요. 입력한 내용은 남겨뒀어요.', 'Choose a valid time zone. Your input has been kept.') : status === 'failed' ? label('이 브라우저에서 저장하지 못했어요. 저장 권한을 확인하고 다시 시도해 주세요.', 'Could not save in this browser. Check storage permissions and try again.') : ''}</p>
    </form>
    <nav className="data-links" aria-label={label('도움말', 'Help')}>
      <Link to="/about">{label('베타 안내·문의', 'Beta info & feedback')}</Link>
      <Link to="/data">{label('내 데이터 관리', 'Manage my data')}</Link>
      <Link to="/setup">{label('대화로 돌아가기', 'Back to conversation')}</Link>
    </nav>
  </main>
}
