import { useId, useState } from 'react';
import { Plus, X } from '../../icons';
import OverlayDialog from './OverlayDialog';
interface FABOption { icon: React.ReactNode; label: string; sub?: string; onClick: () => void; color?: string; }
export default function FAB({ options }: { options: FABOption[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="flex justify-end px-3 py-3">
    <button type="button" onClick={() => options.length === 1 ? options[0].onClick() : setOpen(true)}
      aria-haspopup={options.length > 1 ? 'dialog' : undefined} aria-expanded={options.length > 1 ? open : undefined}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-label1 font-bold text-accent-ink">
      <Plus size={18} />{options.length === 1 ? options[0].label : '실천 추가'}
    </button>
    <OverlayDialog isOpen={open} onClose={() => setOpen(false)} labelledBy={id} variant="sheet">
      <div className="flex items-center justify-between px-5 pt-4"><h2 id={id} className="font-bold text-headline1">실천 추가</h2>
        <button type="button" className="icon-button" aria-label="추가 메뉴 닫기" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <div className="p-3 pb-6">{options.map(option => <button key={option.label} type="button" onClick={() => { setOpen(false); option.onClick(); }}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-fill">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{option.icon}</span>
        <span><span className="block font-bold text-body2">{option.label}</span>{option.sub && <span className="text-caption1 text-label-alt">{option.sub}</span>}</span>
      </button>)}</div>
    </OverlayDialog>
  </div>;
}
