import { supabase } from './supabaseClient'
import { getAgentSessionId, sessionControlState, withAgentSession } from './agentSession'
import { readLocalSessionData, sessionExportFile } from './sessionData'

async function requestError(error: unknown): Promise<Error> {
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try { return new Error((await error.context.clone().json())?.error ?? 'data_unavailable') } catch { /* Safe generic error. */ }
  }
  return new Error('data_unavailable')
}
export async function exportCurrentSession(sessionId: string) {
  if (!supabase) throw new Error('data_unavailable')
  const local = readLocalSessionData(sessionId)
  const { data, error } = await supabase.functions.invoke('onju-memory', {
    body: withAgentSession(sessionId, { action: 'export_session' }, true),
  })
  if (error) throw await requestError(error)
  if (getAgentSessionId() !== sessionId) throw new Error('session_changed')
  if (sessionControlState(sessionId) === 'deleted') throw new Error('session_revoked')
  const snapshot = data?.snapshot
  if (snapshot?.version !== 1 || snapshot.sessionId !== sessionId || !snapshot.session || !snapshot.collections) throw new Error('data_unavailable')
  return sessionExportFile(sessionId, local, snapshot)
}
export function exportLocalSession(sessionId: string) {
  return sessionExportFile(sessionId, readLocalSessionData(sessionId), null)
}
export function downloadSessionData(value: ReturnType<typeof sessionExportFile>) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = 'onju-data-' + value.exportedAt.slice(0, 10) + '.json'
    document.body.appendChild(link)
    link.click()
  } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
export function dataErrorMessage(error: unknown, ko: boolean, action = 'export') {
  const code = error instanceof Error ? error.message : ''
  const copy: Record<string, [string, string]> = {
    session_changed: ['다른 탭에서 대화가 바뀌었어요. 새로고침 후 다시 확인해 주세요.', 'The conversation changed in another tab. Reload before continuing.'],
    session_forbidden: ['소유 확인에 실패했어요. 이 대화를 시작한 브라우저에서 다시 확인해 주세요.', 'Ownership could not be verified. Use the browser where this conversation started.'],
    session_recovery_required: ['소유 확인 키가 없어 서버 자료에 접근할 수 없어요. 이 기기의 자료만 내보낼 수 있습니다.', 'The ownership key is unavailable. Only this browser’s local data can be exported.'],
    invalid_session_token: ['소유 확인 키가 올바르지 않아요. 원래 브라우저에서 확인해 주세요.', 'The ownership key is invalid. Use the original browser.'],
    session_revoked: ['이미 삭제된 대화예요. 남아 있는 이 기기의 자료만 확인할 수 있어요.', 'This conversation has been deleted. Only remaining local data is available.'],
    session_not_found: ['서버에 이 대화의 기록이 없어요. 이 기기의 자료만 따로 내보낼 수 있어요.', 'No server record was found. You can export this browser’s data separately.'],
    export_too_large: ['자료가 다운로드 한도를 넘었어요. 일부만 잘라서 내보내지 않았습니다. 운영자에게 문의해 주세요.', 'The export exceeds the download limit. Nothing was silently truncated. Please contact the operator.'],
    export_schema_changed: ['새 데이터 항목의 내보내기 준비가 필요해요. 파일을 만들지 않았습니다.', 'Export support needs updating for a new data collection. No file was created.'],
    local_cleanup_incomplete: ['서버 삭제는 완료됐지만 이 브라우저의 정리가 끝나지 않았어요. 저장 권한을 확인하고 삭제를 다시 시도해 주세요.', 'Server deletion succeeded, but browser cleanup is incomplete. Check storage permissions and retry deletion.'],
  }
  const fallback: Record<string, [string, string]> = {
    export: ['서버 자료를 내려받지 못했어요. 연결을 확인하고 다시 시도하거나, 아래에서 이 기기의 자료만 따로 받을 수 있어요.', 'Server data could not be downloaded. Check the connection and retry, or separately download this browser’s data below.'],
    local: ['이 기기의 자료를 파일로 만들지 못했어요. 저장·다운로드 권한을 확인하고 다시 시도해 주세요.', 'Could not prepare the local file. Check storage and download permissions, then retry.'],
    delete: ['삭제 완료를 확인하지 못했어요. 원래 브라우저에서 연결·저장 권한을 확인한 뒤 같은 삭제 요청을 다시 시도해 주세요.', 'Deletion could not be confirmed. Check connection and storage permissions in the original browser, then retry the same deletion.'],
    feedback: ['의견을 저장하지 못했어요. 입력한 내용은 남겨뒀어요. 연결을 확인하고 다시 시도해 주세요.', 'Feedback could not be saved. Your input is kept. Check the connection and retry.'],
  }
  return (copy[code] ?? fallback[action] ?? fallback.export)[ko ? 0 : 1]
}
