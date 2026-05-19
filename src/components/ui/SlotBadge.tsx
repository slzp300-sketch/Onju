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
                ? 'bg-indigo-500'
                : 'bg-indigo-200'
              : 'bg-gray-100',
          ].join(' ')}
        />
      ))}
      <span className="text-xs text-gray-500 ml-1">{used}/{total} 사용</span>
      {remaining > 0 && (
        <span className="text-xs text-indigo-600 font-medium">{remaining}개 남음</span>
      )}
    </div>
  );
}
