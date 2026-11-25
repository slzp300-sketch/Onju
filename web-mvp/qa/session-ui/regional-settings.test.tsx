import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import RegionalSettings from '../../src/RegionalSettings'
import { useRegionalContext, useRegionalDate } from '../../src/useRegionalContext'
import { DEFAULT_REGIONAL_CONTEXT, REGIONAL_SETTINGS_KEY, loadRegionalContext, saveRegionalContext } from '../../src/regionalContext'
import { applyDocumentLocale } from '../../src/i18n'

let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T06:59:59Z'))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  localStorage.clear()
  saveRegionalContext(DEFAULT_REGIONAL_CONTEXT)
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host)
})
afterEach(async()=>{ await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks() })
function Observer() {
  const [context]=useRegionalContext()
  const date=useRegionalDate(context)
  React.useEffect(()=>applyDocumentLocale(context),[context])
  return <output data-testid="region">{JSON.stringify({context,date})}</output>
}
async function render() { await act(async()=>root.render(<MemoryRouter><Observer/><RegionalSettings/></MemoryRouter>)) }
function input(node: HTMLInputElement | HTMLSelectElement,value:string) {
  Object.getOwnPropertyDescriptor(node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value')!.set!.call(node,value)
  node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true}))
}
const state=()=>JSON.parse(host.querySelector('output')!.textContent!)
async function submit() { await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))) }

test('settings change independently, updates subscribers and document, persists on remount with no backend',async()=>{
  localStorage.setItem('onju-week-map:test','existing Monday plan')
  await render()
  const selects=host.querySelectorAll('select')
  await act(async()=>input(selects[0],'en-GB'))
  await act(async()=>input(selects[1],'CA'))
  await act(async()=>input(host.querySelector('input')!,'America/Los_Angeles'))
  await act(async()=>input(selects[2],'0'))
  await submit()
  const expected={...DEFAULT_REGIONAL_CONTEXT,locale:'en-GB',countryCode:'CA',currencyCode:'CAD',timeZone:'America/Los_Angeles',weekStartsOn:0}
  expect(state().context).toEqual(expected)
  expect(state().date).toBe('2026-09-14')
  expect(document.documentElement.lang).toBe('en-GB')
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Saved')
  expect(host.querySelector('h1')?.textContent).toBe('Language & region')
  expect(localStorage.getItem('onju-week-map:test')).toBe('existing Monday plan')
  await act(async()=>root.unmount());root=createRoot(host);await render()
  expect(loadRegionalContext()).toEqual(expected)
  expect(host.querySelector('select')?.value).toBe('en-GB')
})

test('a second tab updates open screens and local midnight advances without a page reload',async()=>{
  await render()
  const next={...DEFAULT_REGIONAL_CONTEXT,locale:'en-US',timeZone:'America/Los_Angeles'}
  await act(async()=>{
    localStorage.setItem(REGIONAL_SETTINGS_KEY,JSON.stringify(next))
    window.dispatchEvent(new StorageEvent('storage',{key:REGIONAL_SETTINGS_KEY}))
  })
  expect(state().date).toBe('2026-09-14')
  await act(async()=>vi.advanceTimersByTimeAsync(1000))
  expect(state().date).toBe('2026-09-15')
  expect(state().context.timeZone).toBe('America/Los_Angeles')
  expect(host.querySelector('input')?.value).toBe('America/Los_Angeles')
})

test('an unsaved settings form cannot overwrite a newer choice from another tab',async()=>{
  await render()
  await act(async()=>input(host.querySelector('input')!,'Europe/London'))
  const newer={...DEFAULT_REGIONAL_CONTEXT,locale:'en-GB',timeZone:'Australia/Sydney'}
  await act(async()=>{
    localStorage.setItem(REGIONAL_SETTINGS_KEY,JSON.stringify(newer))
    window.dispatchEvent(new StorageEvent('storage',{key:REGIONAL_SETTINGS_KEY}))
  })
  expect(host.querySelector('input')?.value).toBe('Europe/London')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('another tab')
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
  await submit()
  expect(loadRegionalContext()).toEqual(newer)
  await act(async()=>host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click())
  expect(host.querySelector('input')?.value).toBe('Australia/Sydney')
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
})

test('invalid timezone and denied storage preserve draft and never report success',async()=>{
  await render()
  await act(async()=>input(host.querySelector('input')!,'Mars/Olympus'))
  await submit()
  expect(host.querySelector('[role="status"]')?.textContent).toContain('올바른 시간대')
  expect(loadRegionalContext()).toEqual(DEFAULT_REGIONAL_CONTEXT)
  expect(host.querySelector('input')?.value).toBe('Mars/Olympus')
  await act(async()=>input(host.querySelector('input')!,'Europe/London'))
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')})
  await submit()
  expect(host.querySelector('[role="status"]')?.textContent).toContain('저장하지 못했어요')
  expect(host.querySelector('input')?.value).toBe('Europe/London')
  expect(state().context).toEqual(DEFAULT_REGIONAL_CONTEXT)
})
