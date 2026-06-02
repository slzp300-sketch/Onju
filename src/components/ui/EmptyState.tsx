interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      {icon && <div className="text-label-assistive mb-1">{icon}</div>}
      <p className="text-body2 font-medium text-label-alt">{title}</p>
      {description && <p className="text-caption1 text-label-assistive max-w-xs">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
