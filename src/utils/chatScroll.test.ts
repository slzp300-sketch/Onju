import { act, createElement, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatScroll } from '../../web-mvp/src/useChatScroll'
import { canGenerateGoalPlan, emptyGoalCard } from '../../web-mvp/src/goalAgent'

let root: Root
let host: HTMLDivElement
let hook: ReturnType<typeof useChatScroll>
let resize: () => void
function Harness({ revision, ready = true }: { revision: string; ready?: boolean }) {
  const value = useChatScroll(revision, ready)
  const { historyRef, contentRef, onScroll } = value
  useLayoutEffect(() => { hook = value })
  return createElement('div', { ref: historyRef, onScroll }, createElement('div', { ref: contentRef }, revision))
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect() {}
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

describe('conversation scroll', () => {
  async function mount() {
    await act(() => root.render(createElement(Harness, { revision: '1' })))
    const history = host.firstElementChild as HTMLDivElement
    Object.defineProperties(history, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { value: 400 } })
    await act(() => resize())
    return history
  }
  it('follows incoming replies and content resize', async () => {
    const history = await mount()
    expect(history.scrollTop).toBe(1000)
    Object.defineProperty(history, 'scrollHeight', { value: 1300 })
    await act(() => root.render(createElement(Harness, { revision: '2' })))
    expect(history.scrollTop).toBe(1300)
  })
  it('keeps the reading position and allows an explicit return to latest', async () => {
    const history = await mount()
    history.scrollTop = 100
    await act(() => history.dispatchEvent(new Event('scroll')))
    await act(() => root.render(createElement(Harness, { revision: '2' })))
    await act(() => resize())
    expect(history.scrollTop).toBe(100)
    expect(hook.showLatest).toBe(true)
    await act(() => hook.scrollToLatest())
    expect(history.scrollTop).toBe(1000)
    expect(hook.showLatest).toBe(false)
  })
  it('follows again after the user scrolls back to the bottom', async () => {
    const history = await mount()
    history.scrollTop = 590
    await act(() => history.dispatchEvent(new Event('scroll')))
    await act(() => root.render(createElement(Harness, { revision: '2' })))
    expect(history.scrollTop).toBe(1000)
    expect(hook.showLatest).toBe(false)
  })
})

describe('minimum planning agreement', () => {
  const agreed = { ...emptyGoalCard, outcome: '꾸준히 읽기', targetMetric: '4주 동안 1권', durationWeeks: 4, weeklyActions: [{ title: '독서', frequencyPerWeek: 3, durationMinutes: 15, preferredDays: [] }] }
  it('does not demand a baseline, identity, cue or environment to start', () => {
    expect(canGenerateGoalPlan(agreed)).toBe(true)
  })
  it('requires a usable weekly routine and a measurable direction', () => {
    expect(canGenerateGoalPlan(emptyGoalCard)).toBe(false)
    expect(canGenerateGoalPlan({ ...agreed, weeklyActions: [] })).toBe(false)
    expect(canGenerateGoalPlan({ ...agreed, targetMetric: '' })).toBe(false)
  })
})
