import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DiaryEntry, DiaryMood } from '../types';

interface DiaryState {
  entries: DiaryEntry[];
  getEntry: (date: string) => DiaryEntry | undefined;
  saveEntry: (date: string, mood: DiaryMood | null, content: string) => void;
  removeEntry: (date: string) => void;
}

export const useDiaryStore = create<DiaryState>()(
  persist(
    (set, get) => ({
      entries: [],

      getEntry: (date) => get().entries.find(e => e.date === date),

      saveEntry: (date, mood, content) => {
        const entry: DiaryEntry = { date, mood, content, updatedAt: new Date().toISOString() };
        set(s =>
          s.entries.some(e => e.date === date)
            ? { entries: s.entries.map(e => e.date === date ? entry : e) }
            : { entries: [...s.entries, entry] }
        );
      },

      removeEntry: (date) => set(s => ({ entries: s.entries.filter(e => e.date !== date) })),
    }),
    { name: 'diary-store' }
  )
);
