import { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import SegmentedControl from './SegmentedControl';
import OverlayDialog from './OverlayDialog';
import ActionMenu from './ActionMenu';

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test('탭은 한 곳만 Tab으로 진입하며 방향키·Home·End로 선택과 초점을 함께 이동한다', async () => {
  function Tabs() { const [value, setValue] = useState('a'); return h(SegmentedControl, { value, onChange: setValue, label: '메뉴', items: ['a', 'b', 'c'].map(value => ({ value, label: value })) }); }
  await act(async () => root.render(h(Tabs)));
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  expect(tabs.map(t => t.tabIndex)).toEqual([0, -1, -1]);
  tabs[0].focus();
  for (const [key, index] of [['ArrowLeft', 2], ['Home', 0], ['End', 2], ['ArrowRight', 0]] as const) {
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(tabs[index]); expect(tabs[index].getAttribute('aria-selected')).toBe('true');
  }
});

test('팝업은 초점을 가두고 재렌더 시 입력 초점을 유지하며 닫으면 원래 버튼으로 돌린다', async () => {
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const render = (open: boolean) => h(OverlayDialog, { isOpen: open, onClose: () => {}, labelledBy: 'title', children: h('div', null, h('h2', { id: 'title' }, '확인'), h('input', { 'aria-label': '입력' }), h('button', null, '저장')) });
  await act(async () => root.render(render(true)));
  expect(document.activeElement).toBe(host.querySelector('[role="dialog"]'));
  const input = host.querySelector('input')!, button = host.querySelector('[role="dialog"] button')!;
  input.focus(); await act(async () => root.render(render(true))); expect(document.activeElement).toBe(input);
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(button);
  await act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(input);
  await act(async () => root.render(render(false)));
  expect(document.activeElement).toBe(trigger); expect(document.body.style.overflow).toBe(''); trigger.remove();
});

test('Escape는 열린 팝업의 현재 취소 동작을 호출한다', async () => {
  const onClose = vi.fn();
  await act(async () => root.render(h(OverlayDialog, { isOpen: true, onClose, labelledBy: 'title', children: h('h2', { id: 'title' }, '안내') })));
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('더보기는 닫기·Escape에서 작업하지 않고 선택한 동작만 한 번 실행한다', async () => {
  const edit = vi.fn(), remove = vi.fn();
  await act(async () => root.render(h(ActionMenu, { title: '아침 습관', actions: [
    { label: '수정', onClick: edit }, { label: '보관', onClick: remove, disabled: true },
  ] })));
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!;
  trigger.focus(); await act(async () => trigger.click());
  expect(document.activeElement?.getAttribute('role')).toBe('dialog');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(edit).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  const editButton = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent === '수정')!;
  await act(async () => editButton.click());
  expect(edit).toHaveBeenCalledOnce(); expect(remove).not.toHaveBeenCalled();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
