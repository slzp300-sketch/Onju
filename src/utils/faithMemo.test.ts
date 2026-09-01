import { describe, it, expect } from 'vitest';
import { parseFaithMemo, inferFaithKind, faithMemoSummary } from './faithMemo';

describe('parseFaithMemo', () => {
  it('bible/prayer JSON만 파싱한다', () => {
    const bible = JSON.stringify({ type: 'bible', book: '빌립보서', chapter: 4, verse: 13, reflection: '' });
    expect(parseFaithMemo(bible)?.type).toBe('bible');
    const prayer = JSON.stringify({ type: 'prayer', category: '직장', content: '팀 회복', answered: false });
    expect(parseFaithMemo(prayer)?.type).toBe('prayer');
  });

  it('일반 텍스트·잘못된 JSON·빈 값은 null', () => {
    expect(parseFaithMemo('그냥 메모')).toBeNull();
    expect(parseFaithMemo('{"type":"etc"}')).toBeNull();
    expect(parseFaithMemo(undefined)).toBeNull();
  });
});

describe('inferFaithKind', () => {
  it('제목 키워드로 유형을 추론한다', () => {
    expect(inferFaithKind('아침 기도')).toBe('prayer');
    expect(inferFaithKind('중보기도 메모')).toBe('prayer');
    expect(inferFaithKind('말씀 묵상')).toBe('bible');
    expect(inferFaithKind('저녁 큐티')).toBe('bible');
    expect(inferFaithKind('감사 한 가지 떠올리기')).toBeNull();
  });
});

describe('faithMemoSummary', () => {
  it('말씀은 구절+묵상, 기도는 카테고리+내용', () => {
    expect(faithMemoSummary({ type: 'bible', book: '시편', chapter: 23, verse: 1, reflection: '맡기자' }))
      .toBe('시편 23:1 — 맡기자');
    expect(faithMemoSummary({ type: 'bible', book: '시편', chapter: 23, verse: 1, reflection: '' }))
      .toBe('시편 23:1');
    expect(faithMemoSummary({ type: 'prayer', category: '가족', content: '건강 회복', answered: true }))
      .toBe('[가족] 건강 회복');
  });
});
