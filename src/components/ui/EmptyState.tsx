import { Sprout } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="relative mb-1">
        <div className="w-20 h-20 rounded-full bg-primary-soft/60 flex items-center justify-center text-primary/70">
          {icon ?? <Sprout size={30} strokeWidth={1.7} />}
        </div>
        {/* 흙 위 새싹 느낌의 받침 */}
        <svg width="64" height="10" viewBox="0 0 64 10" className="absolute -bottom-1.5 left-1/2 -translate-x-1/2" aria-hidden>
          <ellipse cx="32" cy="5" rx="30" ry="4" fill="var(--color-primary)" opacity="0.1" />
        </svg>
      </div>
      <p className="text-body2 font-medium text-label-alt">{title}</p>
      {description && <p className="text-caption1 text-label-assistive max-w-xs">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
