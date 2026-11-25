import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { useKeyboardInset } from './useKeyboardInset';
function Form() { useKeyboardInset(); return h('div', null, h('input'), h('button', null, '저장')); }
test('키보드 뷰포트 높이 변화에 맞춰 저장 영역을 올리고 정리한다', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(h(Form)));
    host.querySelector('input')!.focus(); viewport.height = window.innerHeight - 300; viewport.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('300px');
    // 입력란 → 저장 버튼 초점 이동만으로 버튼이 키보드 뒤로 내려가면 안 된다.
    host.querySelector('button')!.focus();
    viewport.dispatchEvent(new Event('scroll'));
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('300px');
    expect(document.documentElement.style.getPropertyValue('--visible-viewport-height')).toBe(`${viewport.height}px`);
    viewport.offsetTop = 40; viewport.dispatchEvent(new Event('scroll'));
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('260px');
    expect(document.documentElement.style.getPropertyValue('--visible-viewport-top')).toBe('40px');
    viewport.scale = 2; viewport.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');
    viewport.scale = 1; viewport.offsetTop = 0;
    viewport.height = window.innerHeight; viewport.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');
  } finally {
    await act(async () => root.unmount()); host.remove();
    if (original) Object.defineProperty(window, 'visualViewport', original); else Reflect.deleteProperty(window, 'visualViewport');
  }
  expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('');
  expect(document.documentElement.style.getPropertyValue('--visible-viewport-height')).toBe('');
});

test('Android가 WebView를 줄인 경우 이중 보정하지 않고 회전·복귀 높이를 따른다', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(h(Form)));
    for (const height of [460, 320, 800]) {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      viewport.height = height; window.dispatchEvent(new Event('resize'));
      expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');
      expect(document.documentElement.style.getPropertyValue('--visible-viewport-height')).toBe(`${height}px`);
    }
  } finally {
    await act(async () => root.unmount()); host.remove();
    Object.defineProperty(window, 'innerHeight', originalHeight);
    if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport); else Reflect.deleteProperty(window, 'visualViewport');
  }
});
