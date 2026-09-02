import OverlayDialog from './OverlayDialog';
import Button from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen, title, message,
  confirmLabel = '삭제', cancelLabel = '취소',
  onConfirm, onCancel, danger = true,
}: ConfirmModalProps) {
  return (
    <OverlayDialog isOpen={isOpen} onClose={onCancel} labelledBy="confirm-modal-title" className="p-6">
            <h3 id="confirm-modal-title" className="text-headline1 font-bold text-label-strong mb-2 text-center">{title}</h3>
            {message && (
              <p className="text-body2 text-label-alt text-center leading-relaxed mb-5">{message}</p>
            )}
            {!message && <div className="mb-5" />}
            <div className="flex gap-2">
              <Button size="md" variant="assistive" className="flex-1" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button size="md" variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
    </OverlayDialog>
  );
}
