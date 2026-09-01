/**
 * 신앙 루틴 기록 — 체크 로그의 memo 필드에 JSON으로 직렬화된다.
 * (BibleInput·PrayerMemo가 만드는 형태 그대로 — 스펙 §memo 원안)
 */
export interface BibleMemoData {
  type: 'bible';
  book: string;
  chapter: number;
  verse: number;
  reflection: string;
}

export type PrayerCategory = '개인' | '직장' | '가족' | '중보';

export interface PrayerMemoData {
  type: 'prayer';
  category: PrayerCategory;
  content: string;
  answered: boolean;
}

export type FaithMemoData = BibleMemoData | PrayerMemoData;

export function parseFaithMemo(memo?: string): FaithMemoData | null {
  if (!memo) return null;
  try {
    const parsed = JSON.parse(memo);
    if (parsed?.type === 'bible' || parsed?.type === 'prayer') return parsed as FaithMemoData;
    return null;
  } catch {
    return null;
  }
}

/** 루틴 제목으로 기록 유형 추론 — 추론 불가한 루틴은 기록을 유도하지 않는다 */
export function inferFaithKind(title: string): 'bible' | 'prayer' | null {
  if (/기도/.test(title)) return 'prayer';
  if (/말씀|묵상|성경|큐티|QT/i.test(title)) return 'bible';
  return null;
}

/** 루틴 행 아래 붙는 한 줄 요약 */
export function faithMemoSummary(m: FaithMemoData): string {
  if (m.type === 'bible') {
    const ref = `${m.book} ${m.chapter}:${m.verse}`;
    return m.reflection ? `${ref} — ${m.reflection}` : ref;
  }
  return `[${m.category}] ${m.content}`;
}
