import { Sprout } from '../../icons';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-6 gap-3 text-center">
      <div className="mb-1 flex size-16 items-center justify-center rounded-full bg-accent-soft text-primary" aria-hidden="true">
        {icon ?? <Sprout size={28} strokeWidth={1.8} />}
      </div>
      <p className="text-body2 font-semibold text-label-strong break-words">{title}</p>
      {description && <p className="text-caption1 text-label-alt max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
