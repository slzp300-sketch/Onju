import { Sprout } from '../../icons';

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
        {/* 나이테 링 + 크레파스 언덕 위 아이콘 */}
        <svg
          width="112"
          height="104"
          viewBox="0 0 112 104"
          className="block"
          aria-hidden
        >
          <defs>
            <filter id="empty-crayon" x="-8%" y="-8%" width="116%" height="116%">
              <feTurbulence type="fractalNoise" baseFrequency="0.07 0.11" numOctaves="3" seed="9" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
            </filter>
          </defs>
          <g filter="url(#empty-crayon)">
            <g stroke="#d9c8a6" fill="none" opacity="0.5">
              <circle cx="56" cy="46" r="26" strokeWidth="2" />
              <circle cx="56" cy="46" r="37" strokeWidth="1.6" opacity="0.7" />
              <circle cx="56" cy="46" r="48" strokeWidth="1.3" opacity="0.4" />
            </g>
            {/* 언덕 */}
            <path d="M8 104 Q56 76 104 104 Z" fill="var(--color-primary)" opacity="0.18" />
          </g>
        </svg>
        <div className="absolute inset-x-0 top-4 flex items-center justify-center text-primary/80">
          {icon ?? <Sprout size={34} strokeWidth={2} />}
        </div>
      </div>
      <p className="text-body2 font-medium text-label-alt">{title}</p>
      {description && <p className="text-caption1 text-label-assistive max-w-xs">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
