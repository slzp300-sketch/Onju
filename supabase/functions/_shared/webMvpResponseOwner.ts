// A client-provided provider response ID is a pointer to private conversation
// data, not proof of ownership. Only server-recorded IDs may be continued.
type Database = {
  from(table: string): {
    select(fields: string): { eq(field: string, value: string): { eq(field: string, value: string): { maybeSingle(): PromiseLike<{data: unknown; error: unknown}> } } }
    insert(values: Record<string, string>): PromiseLike<{error: unknown}>
  }
}
export async function ownedPreviousResponse(db: Database, sessionId: string, responseId: unknown) {
  if (responseId === undefined || responseId === null || responseId === '') return undefined
  if (typeof responseId !== 'string' || !/^(?:resp|msg)_[A-Za-z0-9_-]{1,195}$/.test(responseId)) throw new Error('response_not_owned')
  const { data, error } = await db.from('web_mvp_provider_responses').select('response_id')
    .eq('session_id', sessionId).eq('response_id', responseId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('response_not_owned')
  return responseId
}
export async function recordOwnedResponse(db: Database, sessionId: string, responseId: string) {
  if (!/^(?:resp|msg)_[A-Za-z0-9_-]{1,195}$/.test(responseId)) throw new Error('invalid_provider_response')
  const { error } = await db.from('web_mvp_provider_responses').insert({ session_id: sessionId, response_id: responseId })
  if (error) throw error
}
