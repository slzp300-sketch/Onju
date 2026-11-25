import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import RouteBoundary, { RouteErrorBoundary } from '../../../logs/sites/onju-web-mvp/web-mvp/src/RouteBoundary'
import { DEFAULT_REGIONAL_CONTEXT, saveRegionalContext } from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext'

let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.clear(); saveRegionalContext(DEFAULT_REGIONAL_CONTEXT)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function Broken(): React.ReactNode { throw Error('simulated chunk unavailable') }

for (const korean of [true, false]) test(`failed route shows localized recovery and preserves saved data (${korean ? 'KO' : 'EN'})`, async () => {
  localStorage.setItem('fixture-saved-plan', 'must remain')
  await act(async () => root.render(<RouteErrorBoundary korean={korean}><Broken /></RouteErrorBoundary>))
  expect(host.querySelector('[role=alert]')).not.toBeNull()
  expect(host.textContent).toContain(korean ? '다시 불러오기' : 'Reload page')
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/')
  expect(localStorage.getItem('fixture-saved-plan')).toBe('must remain')
})
test('changing route resets the failed screen instead of trapping navigation', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/broken']}>
    <Link to="/">test-home</Link>
    <RouteBoundary><Routes><Route path="/broken" element={<Broken />} /><Route path="/" element={<h1>working home</h1>} /></Routes></RouteBoundary>
  </MemoryRouter>))
  expect(host.querySelector('[role=alert]')).not.toBeNull()
  await act(async () => host.querySelector('a')!.click())
  expect(host.querySelector('[role=alert]')).toBeNull()
  expect(host.querySelector('h1')?.textContent).toBe('working home')
})
