import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAgentSessionId, resetAgentSession } from './agentSession'
import { deleteAgentSession } from './agentMemory'
import { exportCurrentSession, exportLocalSession, downloadSessionData, dataErrorMessage } from './dataControlsApi'
import { useSessionStatus } from './useSessionStatus'
import { useRegionalContext } from './useRegionalContext'
import './dataControls.css'

export default function DataControls() {
  const [context] = useRegionalContext()
  const ko = context.locale.startsWith('ko')
  const t = (kr: string, en: string) => ko ? kr : en
  const [sessionId] = useState(getAgentSessionId)
  const status = useSessionStatus(sessionId)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [checked, setChecked] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (notice || error) resultRef.current?.focus() }, [notice, error])
  const run = async (kind: string, task: () => Promise<void>) => {
    if (busyRef.current || status === 'changed') return
    busyRef.current = true; setBusy(kind); setError(''); setNotice('')
    try { await task() } catch (cause) { setError(dataErrorMessage(cause, ko, kind)) }
    finally { busyRef.current = false; setBusy('') }
  }
  return <main className="data-page">
    <nav className="data-links"><Link to="/about">{t('베타 안내·문의', 'Beta info & feedback')}</Link><Link to="/settings">{t('언어·지역 설정', 'Language & region')}</Link><Link to="/">{t('홈', 'Home')}</Link></nav>
    <h1>{t('내 데이터 관리', 'Manage my data')}</h1>
    <p>{t('이 브라우저의 현재 대화만 관리합니다. 다른 기기·브라우저에서 만든 대화에는 적용되지 않아요.', 'These controls apply only to the current conversation in this browser, not conversations created on other devices or browsers.')}</p>
    {status === 'changed' && <p role="alert">{t('다른 탭에서 대화가 바뀌었어요. 새로고침 후 관리해 주세요.', 'The conversation changed in another tab. Reload before managing it.')} <button onClick={() => window.location.reload()}>{t('새로고침', 'Reload')}</button></p>}
    {status === 'deleting' && <p role="status">{t('삭제 요청 후 저장을 멈춘 상태예요. 삭제가 끝났는지 확인하려면 아래에서 다시 시도해 주세요.', 'Writes are paused after a deletion request. Retry below to confirm completion.')}</p>}
    <div ref={resultRef} tabIndex={-1}>
      <p role="status" aria-live="polite">{busy ? t('처리 중이에요. 이 화면에서 잠시 기다려 주세요.', 'Processing. Please keep this page open.') : notice}</p>
      {error && <p role="alert">{error}</p>}
    </div>
    <section>
      <h2>{t('자료 내려받기', 'Download your data')}</h2>
      <p>{t('서버에 남아 있는 대화·목표·계획·점검·회고·피드백·기억과 이 기기의 임시 자료를 JSON 파일로 받습니다. 접속 키와 내부 AI 처리 기록은 제외됩니다.', 'Download a JSON file containing available server conversations, goals, plans, check-ins, reviews, feedback and memory, plus temporary data in this browser. Access keys and internal AI processing records are excluded.')}</p>
      <button className="button" disabled={!!busy || status === 'changed' || status === 'deleted'} onClick={() => void run('export', async () => {
        downloadSessionData(await exportCurrentSession(sessionId))
        setNotice(t('파일 다운로드를 요청했어요. 브라우저의 다운로드 목록에서 저장 여부를 확인해 주세요.', 'Download requested. Check your browser’s downloads to confirm it was saved.'))
      })}>{t('서버 + 이 기기 자료 받기', 'Download server + browser data')}</button>
      <details><summary>{t('서버에 연결할 수 없나요?', 'Cannot reach the server?')}</summary>
        <p>{t('아래 파일은 이 기기에 남은 자료만 담습니다. 서버 기록이 빠진 부분 백업임이 파일에 표시돼요.', 'The file below contains only data remaining in this browser. It is explicitly marked as a partial, local-only backup.')}</p>
        <button disabled={!!busy || status === 'changed'} onClick={() => void run('local', async () => { downloadSessionData(exportLocalSession(sessionId)); setNotice(t('이 기기 자료만 다운로드를 요청했어요. 서버 백업은 포함되지 않습니다.', 'Local-only download requested. Server records are not included.')) })}>{t('이 기기 자료만 받기', 'Download browser data only')}</button>
      </details>
      <p>{t('파일에 개인적인 대화가 담길 수 있어요. 공용 기기에 저장하거나 그대로 공유하지 마세요. 내려받은 파일은 대화를 삭제해도 남습니다.', 'The file may contain private conversations. Avoid shared devices and unreviewed sharing. Downloaded files remain after deleting a conversation.')}</p>
    </section>
    <section>
      <h2>{t('현재 대화 삭제', 'Delete this conversation')}</h2>
      <p>{t('삭제 재시도에 필요한 브라우저 세션 키는 빈 대화로 새로 시작할 때 교체됩니다.', 'The browser session key needed to retry deletion is replaced when you start a new empty conversation.')}</p>
      <p>{t('서버의 현재 대화와 연결된 계획·기록·피드백·기억 및 이 기기의 해당 대화 임시 저장·전송 대기를 삭제합니다. 되돌릴 수 없으니 필요하면 먼저 내려받으세요.', 'Deletes this server conversation and linked plans, records, feedback and memory, plus its local drafts and pending events in this browser. This cannot be undone. Export first if needed.')}</p>
      <p>{t('삭제 후 재저장을 막는 식별자·해시와 합산 비용 기록은 남습니다. 다른 기기의 로컬 복사본, 내려받은 파일, 외부 AI 업체 기록·운영 로그·백업의 즉시 삭제는 이 기능으로 보장하지 않습니다. 언어·지역 설정은 유지됩니다.', 'Deletion-prevention identifiers/hashes and aggregate cost records remain. This control does not guarantee immediate removal of other-device copies, downloaded files, external AI provider records, operational logs or backups. Language and region preferences are kept.')}</p>
      {status === 'deleted' ? <>
        <p role="status">{t('서버 삭제와 이 브라우저의 정리를 완료했어요.', 'Server deletion and cleanup in this browser are complete.')}</p>
        <button className="button" onClick={() => { resetAgentSession(); window.location.assign('/setup') }}>{t('빈 대화로 새로 시작', 'Start a new empty conversation')}</button>
      </> : confirm ? <div>
        <label><input type="checkbox" checked={checked} disabled={!!busy} onChange={event => setChecked(event.target.checked)} />{t('삭제 범위와 복구할 수 없다는 점을 확인했어요.', 'I understand the scope and that deletion cannot be undone.')}</label>
        <button className="data-danger" disabled={!checked || !!busy || status === 'changed'} onClick={() => void run('delete', async () => { await deleteAgentSession(sessionId); setConfirm(false); setChecked(false) })}>{t('확인, 현재 대화 삭제', 'Confirm deletion')}</button>
        <button disabled={!!busy} onClick={() => { setConfirm(false); setChecked(false) }}>{t('취소', 'Cancel')}</button>
      </div> : <button className="data-danger" disabled={!!busy || status === 'changed'} onClick={() => setConfirm(true)}>{status === 'deleting' ? t('삭제 다시 시도', 'Retry deletion') : t('삭제 범위 확인', 'Review deletion')}</button>}
    </section>
  </main>
}
