/** 초 → "X시간 Y분 Z초" 표시 */
export function fmtDuration(secs: number): string {
  if (secs <= 0) return '0초';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h > 0 && `${h}시간`, m > 0 && `${m}분`, s > 0 && `${s}초`]
    .filter(Boolean)
    .join(' ');
}
