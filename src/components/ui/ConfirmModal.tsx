import OverlayDialog from './OverlayDialog';
import Button from './Button';
import { useId } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  confirmDisabled?: boolean;
}

export default function ConfirmModal({
  isOpen, title, message,
  confirmLabel = '삭제', cancelLabel = '취소',
  onConfirm, onCancel, danger = true, confirmDisabled = false,
}: ConfirmModalProps) {
  const titleId = useId();
  return (
    <OverlayDialog isOpen={isOpen} onClose={onCancel} labelledBy={titleId} className="p-6">
            <h3 id={titleId} className="break-words text-headline1 font-bold text-label-strong mb-2 text-center">{title}</h3>
            {message && (
              <p className="text-body2 text-label-alt text-center leading-relaxed mb-5">{message}</p>
            )}
            {!message && <div className="mb-5" />}
            <div className="flex gap-2">
              <Button size="md" variant="assistive" className="flex-1" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button size="md" variant={danger ? 'danger' : 'primary'} className="flex-1" disabled={confirmDisabled} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
    </OverlayDialog>
  );
}
