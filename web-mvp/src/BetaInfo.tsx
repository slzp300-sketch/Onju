import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAgentSessionId } from './agentSession'
import { saveAgentFeedback } from './agentMemory'
import { supabase } from './supabaseClient'
import { useRegionalContext } from './useRegionalContext'
import { dataErrorMessage } from './dataControlsApi'
import './dataControls.css'

export default function BetaInfo() {
  const [context] = useRegionalContext()
  const t = (kr: string, en: string) => context.locale.startsWith('ko') ? kr : en
  const [sessionId] = useState(getAgentSessionId)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const messageId = useRef(crypto.randomUUID())
  return <main className="data-page">
    <nav className="data-links"><Link to="/">{t('홈', 'Home')}</Link><Link to="/settings">{t('언어·지역 설정', 'Language & region')}</Link><Link to="/data">{t('내 데이터 관리', 'Manage my data')}</Link></nav>
    <h1>{t('온주 베타 안내', 'About the Onju beta')}</h1>
    <p>{t('한국어·영어로 목표를 정리하고 첫 실행 계획을 만드는 무료 베타입니다. 이용 한도가 있으며, 기능 변경이나 일시 중단이 있을 수 있어요. 지금 결제나 구독이 시작되지는 않습니다.', 'A free Korean/English beta for clarifying goals and planning your first actions. Usage limits, changes and interruptions may apply. No payment or subscription starts here.')}</p>
    <section><h2>{t('AI와 함께 판단해 주세요', 'Use your judgment alongside AI')}</h2>
      <p>{t('AI 답변은 틀리거나 상황을 놓칠 수 있습니다. 목표 달성이나 답변의 정확성을 보장하지 않아요. 의료·법률·재정의 중요한 결정은 적절한 전문가와 확인해 주세요.', 'AI can make mistakes or miss context. Goal achievement and answer accuracy are not guaranteed. Check important medical, legal or financial decisions with an appropriate professional.')}</p>
      <p>{t('본인에게 맞는 계획인지 확인한 뒤 사용해 주세요. 다른 사람의 권리를 침해하거나 서비스를 방해하는 용도로 사용할 수 없습니다.', 'Review whether a plan fits your circumstances before using it. Do not use the service to infringe others’ rights or disrupt the service.')}</p>
    </section>
    <section><h2>{t('어떤 자료를 처리하나요?', 'What data is processed?')}</h2>
      <p>{t('대화, 목표·계획, 실행·점검 기록, 피드백과 선택한 지역 설정을 저장합니다. AI 답변을 만들 때 관련 대화와 계획이 연결된 AI 제공사로 전송될 수 있습니다. 주민번호·카드번호·비밀번호·상세 건강 기록은 입력하지 마세요.', 'Conversations, goals, plans, activity/check-in records, feedback and regional preferences are stored. Relevant conversations and plans may be sent to the connected AI provider to generate replies. Do not enter government IDs, card numbers, passwords or detailed health records.')}</p>
      <p>{t('현재 대화는 브라우저의 세션 키로 구분합니다. 브라우저 자료를 지우거나 다른 기기로 이동하면 기존 대화에 접근하지 못할 수 있어요. 접속 키는 공유하지 마세요.', 'A session key in your browser identifies the conversation. Clearing browser data or switching devices can prevent access to it. Do not share the access key.')}</p>
      <p>{t('현재 코드상 서버 대화는 마지막 유효 사용 후 30일에 만료 대상으로 표시됩니다. 실제 삭제 작업 시점과 외부 업체·백업의 보관은 별도 확인이 필요합니다. 브라우저 사본은 직접 정리하기 전까지 남을 수 있어요.', 'The current code marks server conversations for expiry 30 days after the last valid use. Actual cleanup timing and external provider/backup retention require separate confirmation. Browser copies can remain until you clear them.')}</p>
      <p>{t('품질 지표는 원문 대신 단계·사용량 같은 정보를 사용합니다. 피드백에 직접 적은 내용은 저장되며, 최근 대화 첨부는 해당 화면에서 별도로 선택할 때만 포함합니다.', 'Quality metrics use information such as steps and usage rather than message text. Text you submit as feedback is stored. Recent conversation excerpts are attached only when separately selected on that feedback screen.')}</p>
      <Link to="/data">{t('내보내기와 삭제 범위 확인', 'Review export and deletion controls')}</Link>
    </section>
    <section><h2>{t('운영자·공식 문의', 'Operator & official contact')}</h2>
      <p>{t('운영자: ', 'Operator: ')}<span lang="ko">김재현</span>{t(' (개인 운영)', ' (individual operator)')}</p>
      <p>{t('오류나 데이터 접근·삭제에 관한 문의는 아래 이메일로 보내 주세요.', 'For errors or questions about data access or deletion, use the email below.')}<br />
        <a href="mailto:slzp300@gmail.com">slzp300@gmail.com</a>
      </p>
      <p>{t('이메일 앱이 열리며, 대화 내용이나 접속 키는 자동 첨부되지 않습니다. 비밀번호·API 키·대화 접속 키 등 민감한 정보는 보내지 마세요.', 'This opens your email app without attaching conversation content or access keys. Do not send sensitive information such as passwords, API keys or conversation access keys.')}</p>
    </section>
    <section><h2>{t('운영 정책 검토 중', 'Operating policies under review')}</h2>
      <p>{t('운영자와 공식 문의 이메일은 확인되었습니다. 이 안내는 게시 전 검토용 초안이며, 대상 국가·이용 연령, 처리 업체·국외 처리 지역, 실제 로그·백업 보관 기간과 요청 처리 절차는 아직 검토 중입니다. 해외 정식 출시 준비가 끝났다는 의미는 아닙니다.', 'The operator and official contact email have been confirmed. This notice remains a pre-publication draft. Target countries and user ages, processors/international processing locations, actual log/backup retention and request handling procedures are still under review. This does not mean readiness for a full international launch.')}</p>
      <p>{t('문의 확인 주기와 답변 기한은 아직 정해지지 않았으며, 즉시 답변을 보장하지 않습니다.', 'The support review schedule and response timeframe have not yet been set. An immediate reply is not guaranteed.')}</p>
    </section>
    <section><h2>{t('서비스 의견 남기기', 'Leave product feedback')}</h2>
      <p>{t('이 양식은 아래에 직접 적은 내용만 현재 대화에 연결해 저장합니다. 전체 대화나 진단 자료를 자동 첨부하지 않아요. 실시간 상담이나 답변을 보장하는 문의 채널은 아닙니다.', 'This form saves only what you type below, linked to the current conversation. It does not automatically attach conversation excerpts or diagnostics. It is not a live support channel or a guarantee of a reply.')}</p>
      <form onSubmit={async event => {
        event.preventDefault()
        if (!note.trim() || lock.current) return
        lock.current = true; setBusy(true); setError(''); setStatus('')
        try {
          if (!supabase) throw new Error('data_unavailable')
          await saveAgentFeedback(sessionId, messageId.current, -1, note.trim())
          setNote(''); messageId.current = crypto.randomUUID()
          setStatus(t('의견을 저장했어요.', 'Feedback saved.'))
        } catch (cause) { setError(dataErrorMessage(cause, context.locale.startsWith('ko'), 'feedback')) }
        finally { lock.current = false; setBusy(false) }
      }}>
        <label htmlFor="beta-feedback">{t('남길 내용 (개인정보 제외)', 'Your message (no sensitive information)')}</label>
        <p>{t('240자 이내로 남겨 주세요. 오류가 나면 입력한 내용을 유지합니다.', 'Up to 240 characters. Your input is kept if sending fails.')}</p>
        <textarea id="beta-feedback" rows={4} value={note} maxLength={240} disabled={busy} onChange={event => setNote(event.target.value)} required />
        <button className="button" disabled={busy || !note.trim()}>{busy ? t('저장 중…', 'Saving…') : t('의견 보내기', 'Send feedback')}</button>
      </form>
      <p role="status">{status}</p>{error && <p role="alert">{error}</p>}
    </section>
  </main>
}
