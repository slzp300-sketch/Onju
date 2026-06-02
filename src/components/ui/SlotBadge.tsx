interface SlotBadgeProps {
  total: number;
  used: number;
}

export default function SlotBadge({ total, used }: SlotBadgeProps) {
  const remaining = total - used;
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={[
            'w-3 h-3 rounded-full transition-colors',
            i < total
              ? i < used
                ? 'bg-primary'
                : 'bg-primary-soft'
              : 'bg-fill',
          ].join(' ')}
        />
      ))}
      <span className="text-caption1 text-label-alt ml-1">{used}/{total} 사용</span>
      {remaining > 0 && (
        <span className="text-caption1 text-primary font-medium">{remaining}개 남음</span>
      )}
    </div>
  );
}
