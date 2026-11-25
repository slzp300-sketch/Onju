import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import DataControls from '../../src/DataControls'
import BetaInfo from '../../src/BetaInfo'
import SiteBetaInfo from '../../../logs/sites/onju-web-mvp/web-mvp/src/BetaInfo'
import SessionDataBoundary from '../../src/SessionDataBoundary'
import SiteDataControls from '../../../logs/sites/onju-web-mvp/web-mvp/src/DataControls'
import { getAgentSessionId, resetAgentSession, sessionControlState, writeSessionLocalState } from '../../src/agentSession'
import { DEFAULT_REGIONAL_CONTEXT, saveRegionalContext } from '../../src/regionalContext'
import * as api from '../../src/dataControlsApi'
import * as siteApi from '../../../logs/sites/onju-web-mvp/web-mvp/src/dataControlsApi'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../src/supabaseClient',()=>({supabase:{functions:{invoke}}}))
vi.mock('../../../logs/sites/onju-web-mvp/web-mvp/src/supabaseClient',()=>({supabase:{functions:{invoke}}}))

let root: Root, host: HTMLDivElement
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  localStorage.clear(); resetAgentSession()
  saveRegionalContext({...DEFAULT_REGIONAL_CONTEXT,locale:'en-US'})
  invoke.mockReset()
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals()})
const button=(label:string)=>[...host.querySelectorAll('button')].find(node=>node.textContent===label)!
async function click(label:string) { await act(async()=>button(label).click()) }
async function render(Component=DataControls){await act(async()=>root.render(<MemoryRouter><Component/></MemoryRouter>))}
async function confirm() {
  await click('Review deletion')
  await act(async()=>(host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
}

for(const [name,Component,controls] of [['root',DataControls,api],['site',SiteDataControls,siteApi]] as const) {
  test(name+': deletion requires review; cancel sends no request',async()=>{
    await render(Component);await confirm();await click('Cancel')
    expect(invoke).not.toHaveBeenCalled()
    expect(sessionControlState(getAgentSessionId())).toBe('active')
    expect(host.textContent).not.toMatch(/[가-힣]/)
  })
  test(name+': failed deletion retains input/owner, pauses writes, then same-identity retry cleans up',async()=>{
    const id=getAgentSessionId();writeSessionLocalState('onju-week-map',id,'private draft')
    invoke.mockResolvedValueOnce({data:null,error:new Error('offline')}).mockResolvedValueOnce({data:{deleted:true},error:null})
    await render(Component);await confirm();await click('Confirm deletion')
    expect(host.querySelector('[role=alert]')).not.toBeNull()
    expect(localStorage.getItem('onju-week-map:'+id)).toBe('private draft')
    expect(sessionControlState(id)).toBe('deleting')
    await click('Confirm deletion')
    expect(invoke.mock.calls[0][1].body).toEqual(invoke.mock.calls[1][1].body)
    expect(sessionControlState(id)).toBe('deleted')
    expect(localStorage.getItem('onju-week-map:'+id)).toBeNull()
    expect(host.textContent).toContain('Server deletion and cleanup in this browser are complete.')
    expect(host.textContent).not.toMatch(/[가-힣]/)
  })
  test(name+': double-click deletion sends once and waits for server confirmation',async()=>{
    let resolve!: (value: unknown)=>void
    invoke.mockImplementation(()=>new Promise(done=>{resolve=done}))
    const id=getAgentSessionId()
    await render(Component);await confirm()
    await act(async()=>{button('Confirm deletion').click();button('Confirm deletion').click()})
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(sessionControlState(id)).toBe('deleting')
    expect(host.textContent).not.toContain('cleanup in this browser are complete')
    await act(async()=>resolve({data:{deleted:true},error:null}))
    expect(sessionControlState(id)).toBe('deleted')
  })
  test(name+': export failure does not silently download a partial file; local export is explicit',async()=>{
    const download=vi.spyOn(controls,'downloadSessionData').mockImplementation(()=>{})
    invoke.mockResolvedValue({data:null,error:{context:new Response(JSON.stringify({error:'session_not_found'}),{status:404})}})
    await render(Component);await click('Download server + browser data')
    expect(download).not.toHaveBeenCalled()
    expect(host.textContent).toContain('No server record was found')
    await click('Download browser data only')
    expect(download).toHaveBeenCalledTimes(1)
    expect(download.mock.calls[0][0].scope).toBe('this-browser-only')
    expect(invoke).toHaveBeenCalledTimes(1)
  })
  test(name+': verified server snapshot downloads and strips credentials',async()=>{
    const download=vi.spyOn(controls,'downloadSessionData').mockImplementation(()=>{})
    invoke.mockResolvedValue({data:{snapshot:{version:1,sessionId:getAgentSessionId(),session:{messages:['owned'],access_token_hash:'hidden'},collections:{}}},error:null})
    await render(Component);await click('Download server + browser data')
    expect(download).toHaveBeenCalledTimes(1)
    expect(download.mock.calls[0][0].scope).toBe('server-and-this-browser')
    expect(JSON.stringify(download.mock.calls)).not.toContain('hidden')
  })
}
test('cross-tab deletion unmounts stale product screens but leaves data controls available',async()=>{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/setup']}><SessionDataBoundary><div data-testid="product">old conversation</div></SessionDataBoundary></MemoryRouter>))
  expect(host.querySelector('[data-testid=product]')).not.toBeNull()
  await act(async()=>{localStorage.setItem('onju-session-control:'+getAgentSessionId(),'deleting');window.dispatchEvent(new StorageEvent('storage'))})
  expect(host.querySelector('[data-testid=product]')).toBeNull()
  expect(host.querySelector('a[href="/data"]')).not.toBeNull()
})
test('changing session mid-export discards response instead of exposing old conversation',async()=>{
  const download=vi.spyOn(api,'downloadSessionData').mockImplementation(()=>{})
  const id=getAgentSessionId()
  let resolve!: (value:unknown)=>void
  invoke.mockImplementation(()=>new Promise(done=>{resolve=done}))
  await render();await click('Download server + browser data')
  await act(async()=>{resetAgentSession();window.dispatchEvent(new StorageEvent('storage'));resolve({data:{snapshot:{version:1,sessionId:id,session:{messages:['old']},collections:{}}},error:null})})
  expect(download).not.toHaveBeenCalled()
  expect(host.textContent).toContain('conversation changed')
})
for (const [name, Component] of [['root', BetaInfo], ['site', SiteBetaInfo]] as const) {
  for (const locale of ['ko-KR', 'en-US'] as const) {
    test(name + ': confirmed contact and pending policies are distinct in ' + locale, async () => {
      saveRegionalContext({...DEFAULT_REGIONAL_CONTEXT, locale})
      await act(async()=>root.render(<MemoryRouter><Component/></MemoryRouter>))
      const contact = host.querySelector('a[href^="mailto:"]')!
      expect(contact.getAttribute('href')).toBe('mailto:slzp300@gmail.com')
      expect(contact.textContent).toBe('slzp300@gmail.com')
      expect(host.querySelector('[lang="ko"]')?.textContent).toBe('김재현')
      expect(host.textContent).toContain(locale === 'ko-KR' ? '개인 운영' : 'individual operator')
      expect(host.textContent).toContain(locale === 'ko-KR' ? '대상 국가·이용 연령' : 'Target countries and user ages')
      expect(host.textContent).toContain(locale === 'ko-KR' ? '즉시 답변을 보장하지 않습니다' : 'An immediate reply is not guaranteed')
      expect(host.textContent).not.toContain('Operator information pending')
      expect(host.textContent).not.toContain('운영 안내 확인 중')
      expect(host.querySelector('a[href="/data"]')).not.toBeNull()
      expect(host.textContent).toContain(locale === 'ko-KR' ? '서비스 의견 남기기' : 'Leave product feedback')
      if (locale === 'en-US') expect(host.textContent?.replaceAll('김재현', '')).not.toMatch(/[가-힣]/)
      expect(invoke).not.toHaveBeenCalled()
    })
  }
}
test('feedback needs explicit text, keeps failed input and never attaches diagnostics',async()=>{
  invoke.mockResolvedValueOnce({error:new Error('offline')}).mockResolvedValueOnce({data:{},error:null})
  await act(async()=>root.render(<MemoryRouter><BetaInfo/></MemoryRouter>))
  expect(invoke).not.toHaveBeenCalled()
  const textarea=host.querySelector('textarea')!
  expect(textarea.maxLength).toBe(240)
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'A question about my data');textarea.dispatchEvent(new Event('input',{bubbles:true}))})
  await click('Send feedback')
  expect(textarea.value).toBe('A question about my data')
  expect(host.querySelector('[role=alert]')).not.toBeNull()
  await click('Send feedback')
  expect(textarea.value).toBe('')
  expect(invoke.mock.calls[0][1].body.messageId).toBe(invoke.mock.calls[1][1].body.messageId)
  expect(invoke.mock.calls[1][1].body.diagnostic).toBeUndefined()
  expect(host.textContent).toContain('Feedback saved.')
})
