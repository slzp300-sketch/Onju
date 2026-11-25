import { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../../store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: { id: 'preview-user' } })) };
});
import PrayerMemo from './PrayerMemo';
import BibleInput from './BibleInput';

let root: Root, host: HTMLDivElement;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test.each([['기도', PrayerMemo, '기도 내용'], ['말씀', BibleInput, '말씀 묵상']] as const)('%s 메모를 닫아도 취소하면 내용이 남고 저장은 한 번만 한다', async (_, Editor, label) => {
  const onSave = vi.fn();
  function Screen() { const [open, setOpen] = useState(true); return h(Editor, { isOpen: open, onClose: () => setOpen(false), onSave }); }
  await act(async () => root.render(h(Screen)));
  const textarea = host.querySelector<HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '작성 중인 기록');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(host.textContent).toContain('저장하지 않고 이동할까요?');
  const cancel = [...host.querySelectorAll('button')].find(b => b.textContent === '취소')!;
  await act(async () => cancel.click());
  expect(textarea.value).toBe('작성 중인 기록');
  const save = [...host.querySelectorAll('button')].find(b => b.textContent === '저장')!;
  await act(async () => { save.click(); save.click(); });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toContain('작성 중인 기록');
});
