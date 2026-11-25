import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentText from '../../web-mvp/src/AgentText'

let root: Root
let host: HTMLDivElement
let frames: Map<number, FrameRequestCallback>
let nextFrame: number
let now: number
let motion: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  now = 0
  nextFrame = 0
  frames = new Map()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', vi.fn(() => motion))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function tick(time: number) {
  now = time
  const callbacks = [...frames.values()]
  frames.clear()
  await act(() => callbacks.forEach(callback => callback(time)))
}
async function render(text: string, animate = true, onRevealComplete = vi.fn()) {
  await act(() => root.render(createElement(AgentText, { text, animate, onRevealComplete })))
  return onRevealComplete
}

describe('fast AI reply reveal', () => {
  it('reveals progressively, preserves Markdown structure, and finishes within 2.2 seconds', async () => {
    const text = '**평일 생활리듬**을 먼저 정리했어요.\n\n- 기상 **05:30**\n- 취침 **22:30**\n\n이동 시간은 언제인가요?'
    const done = await render(text)
    expect(host.textContent).toBe('')
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
    await tick(80)
    expect(host.textContent!.length).toBeGreaterThan(0)
    expect(host.textContent).not.toContain('이동 시간은')
    expect(host.textContent).not.toContain('**')
    expect(host.querySelector('strong')?.textContent).toBe('평일 생활리듬')
    await tick(2200)
    expect(host.querySelectorAll('li')).toHaveLength(2)
    expect(host.querySelectorAll('p')).toHaveLength(2)
    expect(host.textContent).toContain('이동 시간은 언제인가요?')
    expect(host.querySelector('[aria-busy]')).toBeNull()
    expect(done).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
  })
  it('keeps Korean syllables, combined accents, and emoji families intact', async () => {
    const symbols = ['한', '👨‍👩‍👧‍👦', '👍🏽', 'e\u0301', '🌱']
    await render(symbols.join(''))
    for (let i = 1; i <= 5; i++) {
      await tick(i * 48)
      expect(host.textContent).toBe(symbols.slice(0, i).join(''))
    }
  })
  it('does not animate restored or static messages on rerender', async () => {
    await render('이전 **대화**는 그대로 보여요.', false)
    expect(host.textContent).toBe('이전 대화는 그대로 보여요.')
    await render('이전 **대화**는 그대로 보여요.', false)
    expect(frames.size).toBe(0)
    expect(host.querySelector('.is-revealing')).toBeNull()
  })
  it('shows everything and cancels pending frames when skipped', async () => {
    const text = '새로 도착한 답변을 빠르게 보여 드릴게요.'
    const done = await render(text)
    await tick(50)
    await render(text, false, done)
    expect(host.textContent).toBe(text)
    expect(frames.size).toBe(0)
    expect(done).not.toHaveBeenCalled()
  })
  it('respects reduced motion and changes to that preference mid-reply', async () => {
    motion.matches = true
    const done = await render('바로 보이는 답변')
    expect(host.textContent).toBe('바로 보이는 답변')
    expect(frames.size).toBe(0)
    expect(done).toHaveBeenCalledTimes(1)
    motion.matches = false
    await render('다음 답변은 처음부터')
    await tick(32)
    motion.matches = true
    await act(() => motion.addEventListener.mock.calls.at(-1)![1]())
    expect(host.textContent).toBe('다음 답변은 처음부터')
    expect(frames.size).toBe(0)
  })
  it('does not restart on a rerender and cleans up under Strict Mode', async () => {
    const text = '긴 답변 '.repeat(100)
    const done = vi.fn()
    await act(() => root.render(createElement(StrictMode, null, createElement(AgentText, { text, animate: true, onRevealComplete: done }))))
    await tick(900)
    const shown = host.textContent
    await act(() => root.render(createElement(StrictMode, null, createElement(AgentText, { text, animate: true, onRevealComplete: done }))))
    expect(host.textContent).toBe(shown)
    await tick(2200)
    expect(done).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe(text.trim())
    await act(() => root.render(null))
    expect(frames.size).toBe(0)
  })
  it('cancels an old reply when replaced and keeps model HTML inert', async () => {
    const oldDone = await render('기존 답변 '.repeat(100))
    await tick(80)
    await render('새 답변 <script>alert(1)</script>')
    expect(host.textContent).toBe('')
    await tick(2400)
    expect(host.textContent).toBe('새 답변 <script>alert(1)</script>')
    expect(host.querySelector('script')).toBeNull()
    expect(oldDone).not.toHaveBeenCalled()
  })
})
