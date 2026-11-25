import { newId } from '../utils/id';
import { isOutboxOwner } from '../lib/sync/outbox';
import { diaryFromRow } from '../data/mappers';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DiaryEntry, DiaryMood } from '../types';
import { upsertDiaryEntry, deleteDiaryEntry } from '../data/repos';

interface DiaryState {
  entries: DiaryEntry[];
  getEntry: (date: string) => DiaryEntry | undefined;
  saveEntry: (date: string, mood: DiaryMood | null, content: string, base?: DiaryEntry | null) => void;
  removeEntry: (date: string, base?: DiaryEntry) => void;
}

export const useDiaryStore = create<DiaryState>()(
  persist(
    (set, get) => ({
      entries: [],

      getEntry: (date) => get().entries.find(e => e.date === date),

      saveEntry: (date, mood, content, base) => {
        const previous=base===undefined?get().getEntry(date):base;
        if(previous && previous.date!==date)throw new Error("일기 날짜를 다시 확인해주세요.");
        const entry: DiaryEntry = { revision:newId(), date, mood, content, updatedAt: new Date().toISOString() };
        upsertDiaryEntry(entry,previous?.revision??null,!previous);
        set(s =>
          s.entries.some(e => e.date === date)
            ? { entries: s.entries.map(e => e.date === date ? entry : e) }
            : { entries: [...s.entries, entry] }
        );
      },

      removeEntry: (date, base) => {
        const current=get().getEntry(date),previous=base??current;
        if(!previous || previous.date!==date || JSON.stringify(previous)!==JSON.stringify(current))throw new Error("일기가 바뀌었어요. 다시 확인해주세요.");
        deleteDiaryEntry(previous);
      },
    }),
    { name: 'diary-store' }
  )
);

if(typeof window!=='undefined')window.addEventListener('onju-record-saved',event=>{
  const {ownerId,kind,id,revision,current}=(event as CustomEvent).detail;
  if(kind!=='diary' || !isOutboxOwner(ownerId))return;
  useDiaryStore.setState(s=>({entries:s.entries.flatMap(e=>e.date!==id || e.revision!==revision?[e]:current?[diaryFromRow(current)]:[])}));
});
