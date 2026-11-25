import { sessionFailureMessage } from './agentSession'
import { loadRegionalContext } from './regionalContext'

export async function agentRequestFailure(error: unknown, fallback: string, locale = loadRegionalContext().locale): Promise<Error> {
  let code = error instanceof Error ? error.message : ''
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try { code = (await error.context.clone().json())?.error ?? code } catch { /* Keep a safe fallback, never raw server details. */ }
  }
  return new Error(sessionFailureMessage(code, locale) || fallback)
}
