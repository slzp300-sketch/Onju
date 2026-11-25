import { useId, useState, type ReactNode } from 'react';
import { MoreHorizontal, X } from '../../icons';
import OverlayDialog from './OverlayDialog';

interface Action {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export default function ActionMenu({ title, actions, disabled = false }: { title: string; actions: Action[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <button type="button" aria-label={`${title} 더보기`} aria-haspopup="dialog" aria-expanded={open}
      disabled={disabled} onClick={() => setOpen(true)} className="icon-button shrink-0 text-label-alt">
      <MoreHorizontal size={20} />
    </button>
    <OverlayDialog isOpen={open} onClose={() => setOpen(false)} labelledBy={id} variant="sheet">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <h2 id={id} className="min-w-0 flex-1 break-words text-headline1 font-bold">{title}</h2>
        <button type="button" aria-label="메뉴 닫기" className="icon-button" onClick={() => setOpen(false)}><X size={20} /></button>
      </div>
      <div className="px-3 pb-5">
        {actions.map(action => <button type="button" key={action.label} disabled={action.disabled}
          onClick={() => { setOpen(false); action.onClick(); }}
          className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-body2 hover:bg-fill disabled:opacity-40 ${action.danger ? 'text-negative' : 'text-label'}`}>
          {action.icon}<span className="min-w-0 break-words">{action.label}</span>
        </button>)}
      </div>
    </OverlayDialog>
  </>;
}
