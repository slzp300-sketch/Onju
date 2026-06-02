/** "HH:mm" → { ampmIdx, hourIdx, minuteIdx } */
export function to12h(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return {
    ampmIdx: h < 12 ? 0 : 1,
    hourIdx: (h % 12 || 12) - 1, // 1→0, ..., 12→11
    minuteIdx: m,
  };
}

/** { ampmIdx, hourIdx, minuteIdx } → "HH:mm" */
export function to24h(ampmIdx: number, hourIdx: number, minuteIdx: number): string {
  let h = hourIdx + 1; // 0-based → 1~12
  if (ampmIdx === 0) { if (h === 12) h = 0; }
  else { if (h !== 12) h += 12; }
  return `${String(h).padStart(2, '0')}:${String(minuteIdx).padStart(2, '0')}`;
}
