import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getAgentSessionId } from './agentSession'
import { useSessionStatus } from './useSessionStatus'
import { useRegionalContext } from './useRegionalContext'
import './dataControls.css'

export default function SessionDataBoundary({ children }: { children: ReactNode }) {
  const [sessionId] = useState(getAgentSessionId)
  const status = useSessionStatus(sessionId)
  const [context] = useRegionalContext()
  const { pathname } = useLocation()
  if (['/about', '/data', '/settings'].includes(pathname) || status === 'active') return children
  const ko = context.locale.startsWith('ko')
  return <main className="data-page">
    <h1>{ko ? '대화 저장을 중지했어요' : 'Conversation writes are paused'}</h1>
    <p>{ko ? '대화가 삭제 중이거나 다른 탭에서 변경됐어요. 이전 화면에서 자료가 다시 저장되지 않도록 잠시 멈췄습니다.' : 'The conversation is being deleted or changed in another tab. The previous screen has been stopped to prevent stale data from being saved.'}</p>
    <Link className="button" to="/data">{ko ? '데이터 관리로 이동' : 'Open data controls'}</Link>
    <button type="button" onClick={() => window.location.reload()}>{ko ? '새로고침' : 'Reload'}</button>
  </main>
}
