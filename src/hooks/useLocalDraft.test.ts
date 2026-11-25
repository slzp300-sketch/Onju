import { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../store/authStore', async () => { const { create } = await import('zustand'); return { useAuthStore: create(() => ({ user: { id: 'A' } })) }; });
import { useAuthStore } from '../store/authStore';
import { useLocalDraft } from './useLocalDraft';
import { readDraft, writeDraft, removeOwnerDrafts } from '../lib/localDrafts';
import type { User } from '../types';

const validate = (v: unknown): v is { content: string } => !!v && typeof v === 'object' && 'content' in v && typeof v.content === 'string';
function Editor({ doc = 'diary:2026-10-27', server = '' }: { doc?: string; server?: string }) {
  const [content,setContent] = useState(server);
  const draft = useLocalDraft({ document: doc, values: {content}, validate, restore: v => setContent(v.content) });
  return h('div',null,draft.banner,h('textarea',{value:content,onChange:(e: React.ChangeEvent<HTMLTextAreaElement>)=>setContent(e.target.value)}),
    h('button',{onClick:()=>draft.clear()},'저장 완료'),h('button',{onClick:()=>{draft.clear({content:''});setContent('');}},'기록 삭제'));
}
let root: Root, host: HTMLDivElement;
async function render(doc?: string, server?: string) { await act(async()=>root.render(h(Editor,{doc,server}))); }
async function reopen(doc?: string, server?: string) { await act(async()=>root.unmount()); root=createRoot(host); await render(doc,server); }
async function fill(value: string) { const input=host.querySelector('textarea')!; await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}); }
async function click(text: string) { const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text); expect(button).toBeDefined(); await act(async()=>button!.click()); }
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();useAuthStore.setState({user:{id:'A'} as User});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});

test('재시작 후 서버 본문을 덮지 않고 선택 복원하며 저장 성공 때만 초안을 지운다',async()=>{
  await render();await fill('쓰다 만 일기');
  expect(readDraft('A','diary:2026-10-27',validate)?.values.content).toBe('쓰다 만 일기');
  await reopen(undefined,'서버의 본문');expect(host.querySelector('textarea')?.value).toBe('서버의 본문');
  expect(readDraft('A','diary:2026-10-27',validate)?.values.content).toBe('쓰다 만 일기');
  await click('초안 복원');expect(host.querySelector('textarea')?.value).toBe('쓰다 만 일기');
  await click('저장 완료');expect(readDraft('A','diary:2026-10-27',validate)).toBeNull();
  await reopen();expect(host.textContent).not.toContain('초안 복원');
});

test('계정·날짜별로 격리하며 계정 전환 직후 이전 편집기가 새 계정에 쓰지 않는다',async()=>{
  await render();await fill('A의 일기');
  await act(async()=>useAuthStore.setState({user:{id:'B'} as User}));await fill('늦게 도착한 A 입력');
  expect(readDraft('B','diary:2026-10-27',validate)).toBeNull();
  await reopen();expect(host.textContent).not.toContain('초안 복원');await fill('B의 일기');
  await reopen('diary:2026-10-26');expect(host.textContent).not.toContain('초안 복원');
  removeOwnerDrafts('A');expect(readDraft('A','diary:2026-10-27',validate)).toBeNull();
  expect(readDraft('B','diary:2026-10-27',validate)?.values.content).toBe('B의 일기');
});

test('복원하지 않고 버리기·기록 삭제 후 새 작성도 올바르게 처리한다',async()=>{
  writeDraft('A','diary:2026-10-27',{content:'예전 초안'});await render(undefined,'기존 일기');await click('초안 버리기');
  expect(host.querySelector('textarea')?.value).toBe('기존 일기');await click('기록 삭제');
  expect(readDraft('A','diary:2026-10-27',validate)).toBeNull();await fill('새 일기');
  expect(readDraft('A','diary:2026-10-27',validate)?.values.content).toBe('새 일기');
});

test('손상·버전 불일치 초안은 자동 덮어쓰지 않고 지우기를 제공한다',async()=>{
  writeDraft('A','diary:2026-10-27',{wrong:'형식 오류'});await render();await fill('새 내용');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('초안을 읽거나 저장하지 못했어요');
  expect(()=>readDraft('A','diary:2026-10-27',validate)).toThrow();
  await click('손상된 초안 지우고 다시 작성');
  expect(readDraft('A','diary:2026-10-27',validate)?.values.content).toBe('새 내용');
});

test('기기 저장 공간 오류는 저장 완료로 표시하지 않고 입력 내용을 유지한다',async()=>{
  await render();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});await fill('보존할 내용');
  expect(host.querySelector('textarea')?.value).toBe('보존할 내용');expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.textContent).not.toContain('초안 저장됨');
});
