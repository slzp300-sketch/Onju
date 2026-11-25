import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import ScheduleSetup from '../../src/ScheduleSetup'
import { sessionFailureMessage } from '../../src/agentSession'
import { DEFAULT_REGIONAL_CONTEXT, saveRegionalContext, loadRegionalContext } from '../../src/regionalContext'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), talk: vi.fn() }))
const id = '77777777-7777-4777-8777-777777777777'
vi.mock('../../src/agentMemory', () => ({
  getAgentSessionId: () => '77777777-7777-4777-8777-777777777777',
  loadAgentState: mocks.load, saveAgentState: mocks.save, deleteAgentSession: mocks.remove,
  savePlanRevision: vi.fn(), saveAgentFeedback: vi.fn(), forgetAgentMemory: vi.fn(),
}))
vi.mock('../../src/unifiedAgent', () => ({ talkToOnju: mocks.talk }))
vi.mock('../../src/planAgent', () => ({ generateWeeklyPlan: vi.fn() }))
vi.mock('../../src/AgentText', () => ({ default: ({ text }: {text:string}) => <p>{text}</p> }))
vi.mock('../../src/supabaseClient', () => ({ supabase: null }))

let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  HTMLElement.prototype.scrollTo = vi.fn()
  localStorage.clear()
  localStorage.setItem('onju-web-mvp-session-v2', JSON.stringify({ id, token:'a'.repeat(64) }))
  localStorage.setItem('onju-chat-input:' + id, '입력한 목표를 보존해 주세요')
  vi.clearAllMocks()
  mocks.save.mockResolvedValue(undefined)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); vi.useRealTimers(); vi.unstubAllGlobals()
})
async function render() {
  await act(async () => { root.render(<MemoryRouter><ScheduleSetup onComplete={vi.fn()} /></MemoryRouter>) })
}

test('server defaults cannot replace a manual choice and subsequent sends use the current settings', async () => {
  const selected = { ...DEFAULT_REGIONAL_CONTEXT, locale:'en-GB', countryCode:'CA', timeZone:'America/Vancouver', weekStartsOn:0 as const }
  saveRegionalContext(selected)
  mocks.load.mockResolvedValue({ regionalContext:DEFAULT_REGIONAL_CONTEXT, stage:0, messages:[], blocks:[], pendingBlocks:[], dayBounds:[], goal:'', reason:'', obstacle:'', goalCard:{} })
  mocks.talk.mockRejectedValue(Object.assign(new Error('budget'),{code:'public_budget_exhausted'}))
  await render()
  expect(loadRegionalContext()).toEqual(selected)
  await act(async()=>host.querySelector('textarea')!.parentElement!.querySelector('button')!.click())
  expect(mocks.talk.mock.calls[0][3].regionalContext).toEqual(selected)
})
function button(text: RegExp) {
  const found=[...host.querySelectorAll('button')].find(node=>text.test(node.textContent ?? ''))
  expect(found).toBeTruthy()
  return found!
}

test('failed hydration exposes retry and new-conversation actions, preserves input and prevents auto-save', async () => {
  mocks.load.mockRejectedValueOnce(new Error('session_expired')).mockResolvedValueOnce(null)
  await render()
  expect(host.querySelector('[role="alert"]')).not.toBeNull()
  expect(host.querySelector('textarea')?.value).toBe('입력한 목표를 보존해 주세요')
  button(/새 대화로 시작|Start new conversation/)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(mocks.save).not.toHaveBeenCalled()
  await act(async () => button(/다시 불러오기|Retry loading/).click())
  expect(mocks.load).toHaveBeenCalledTimes(2)
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.querySelector('textarea')?.value).toBe('입력한 목표를 보존해 주세요')
})
test('an unconfirmed deletion leaves a visible error and enables retry instead of hiding the screen', async () => {
  mocks.load.mockResolvedValue(null)
  mocks.remove.mockRejectedValue(new Error('network_unknown'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await render()
  await act(async () => button(/이 대화 삭제|Delete this conversation/).click())
  expect(mocks.remove).toHaveBeenCalledWith(id)
  expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/삭제 완료를 확인하지|Deletion was not confirmed/)
  expect(button(/이 대화 삭제|Delete this conversation/).disabled).toBe(false)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(mocks.save).not.toHaveBeenCalled()
})

test('a budget error preserves input, shows the real reason and retries with the same turn ID', async () => {
  mocks.load.mockResolvedValue(null)
  const message=sessionFailureMessage('public_budget_exhausted')
  mocks.talk.mockRejectedValue(Object.assign(new Error(message),{code:'public_budget_exhausted'}))
  await render()
  const send=host.querySelector('textarea')?.parentElement?.querySelector('button')
  expect(send).not.toBeNull()
  await act(async()=>{ send!.click(); send!.click() })
  expect(mocks.talk).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain(sessionFailureMessage('public_budget_exhausted',mocks.talk.mock.calls[0][3].regionalContext.locale))
  expect(host.querySelector('textarea')?.value).toBe('입력한 목표를 보존해 주세요')
  const turn=mocks.talk.mock.calls[0][3].turnId
  const originalContext=mocks.talk.mock.calls[0][3].regionalContext
  await act(async()=>saveRegionalContext({...originalContext,timeZone:'Australia/Sydney',locale:'en-AU'}))
  await act(async()=>button(/같은 내용으로 다시|Try the same|Retry/).click())
  expect(mocks.talk).toHaveBeenCalledTimes(2)
  expect(mocks.talk.mock.calls[1][3].turnId).toBe(turn)
  expect(mocks.talk.mock.calls[1][3].regionalContext).toEqual(originalContext)
  expect(loadRegionalContext().timeZone).toBe('Australia/Sydney')
})
